import { Injectable, Logger } from "@nestjs/common";
import { AppConfigService } from "../config/app-config.service";

const REQUEST_TIMEOUT_MS = 5000;
/** Embedding generation can take longer, especially on first call (model load into memory). */
const EMBEDDING_TIMEOUT_MS = 30000;
/** Text generation on typical consumer hardware (local LLM) can take well over a minute for a full response. */
const GENERATION_TIMEOUT_MS = 120000;

export interface OllamaModelInfo {
  name: string;
  sizeBytes: number;
  digest: string;
  modifiedAt: string;
  parameterSize?: string;
  family?: string;
}

export interface OllamaStatus {
  connected: boolean;
  baseUrl: string;
  error?: string;
}

export interface GenerateCompletionOptions {
  /** Passed through as Ollama's `options.temperature`. Callers typically source this from `AppConfigService.config.ollama.generationTemperature` (`.env`'s `OLLAMA_GENERATION_TEMPERATURE`) rather than hardcoding a value. */
  temperature?: number;
  /**
   * Passed through as Ollama's `options.num_predict` (max output
   * tokens) — a runaway-generation guard, not a length target. Without
   * this, a model can (observed with a "thinking"-style model) emit
   * thousands of characters of internal reasoning instead of the
   * requested short output, which then fails downstream (e.g.
   * embedding the result exceeds the embedding model's context
   * length). Callers source this from `AppConfigService.config.ollama`
   * (`OLLAMA_HYDE_MAX_OUTPUT_TOKENS` / `OLLAMA_ANSWER_MAX_OUTPUT_TOKENS`).
   */
  maxOutputTokens?: number;
  /**
   * When true, sent as the request's top-level `think: false` (NOT
   * inside `options` — see `generateCompletion`'s implementation).
   * Callers source this from `AppConfigService.config.ollama.disableThinking`
   * (`.env`'s `OLLAMA_DISABLE_THINKING`).
   */
  disableThinking?: boolean;
}

interface RawOllamaModel {
  name: string;
  size: number;
  digest: string;
  modified_at: string;
  details?: { parameter_size?: string; family?: string };
}

interface RawOllamaTagsResponse {
  models?: RawOllamaModel[];
}

interface RawOllamaEmbeddingsResponse {
  embedding?: number[];
}

interface RawOllamaGenerateResponse {
  response?: string;
}

/**
 * Thin HTTP client for Ollama's REST API (SDD section 14). This service
 * lives entirely in apps/api — apps/web never has, and must never gain,
 * a way to reach Ollama directly (SDD 14.3 / 23): every model listing,
 * connection check, embedding, or (in later phases) generation call
 * goes through this backend first.
 *
 * Uses Node's built-in `fetch` (no HTTP client dependency needed).
 */
@Injectable()
export class OllamaService {
  private readonly logger = new Logger(OllamaService.name);

  constructor(private readonly appConfig: AppConfigService) {}

  private get baseUrl(): string {
    return this.appConfig.config.ollama.baseUrl;
  }

  /**
   * Never throws — a down/unreachable Ollama is a normal, expected
   * condition to report to the admin UI, not an application error.
   */
  async checkStatus(): Promise<OllamaStatus> {
    try {
      await this.fetchTags();
      return { connected: true, baseUrl: this.baseUrl };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Ollama connection check failed: ${message}`);
      return { connected: false, baseUrl: this.baseUrl, error: message };
    }
  }

  /** Throws if Ollama is unreachable or returns an error — callers (ModelsService) decide how to surface that. */
  async listAvailableModels(): Promise<OllamaModelInfo[]> {
    const data = await this.fetchTags();
    return (data.models ?? []).map((model) => ({
      name: model.name,
      sizeBytes: model.size,
      digest: model.digest,
      modifiedAt: model.modified_at,
      parameterSize: model.details?.parameter_size,
      family: model.details?.family,
    }));
  }

  /**
   * Generates an embedding vector for `prompt` using `model` (Ollama's
   * `POST /api/embeddings`, per Ollama's REST API). Throws if Ollama is
   * unreachable, the model doesn't exist, or the response is malformed
   * — callers (EmbeddingsService, VectorSearchService) decide how to
   * surface that (e.g. marking a file `status = "failed"`).
   */
  async generateEmbedding(model: string, prompt: string): Promise<number[]> {
    // TEMPORARY DEBUG LOGGING — remove after diagnosing the
    // "context length exceeded" issue.
    this.logger.warn(
      `[DEBUG] generateEmbedding called: model="${model}" promptJsLength=${prompt.length} promptUtf8Bytes=${Buffer.byteLength(prompt, "utf-8")}`,
    );
    this.logger.warn(`[DEBUG] prompt first 80 chars: ${JSON.stringify(prompt.slice(0, 80))}`);
    this.logger.warn(`[DEBUG] prompt last 80 chars: ${JSON.stringify(prompt.slice(-80))}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), EMBEDDING_TIMEOUT_MS);
    try {
      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const bodyText = await response.text().catch(() => "");
        throw new Error(`Ollama embeddings request failed with HTTP ${response.status}${bodyText ? `: ${bodyText}` : ""}`);
      }
      const data = (await response.json()) as RawOllamaEmbeddingsResponse;
      if (!Array.isArray(data.embedding)) {
        throw new Error("Ollama embeddings response did not include an embedding array.");
      }
      return data.embedding;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Timed out generating embedding via Ollama (model "${model}") after ${EMBEDDING_TIMEOUT_MS}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Generates a non-streaming text completion for `prompt` using
   * `model` (Ollama's `POST /api/generate` with `stream: false`).
   * Throws if Ollama is unreachable, the model doesn't exist, or the
   * response is malformed — the caller (RagService) decides how to
   * surface that.
   *
   * `options.temperature` / `options.maxOutputTokens`, when passed, are
   * forwarded as Ollama's `options.temperature` / `options.num_predict`
   * (see `GenerateCompletionOptions`). `options.disableThinking`, when
   * true, is forwarded as the request's own top-level `think: false`
   * — Ollama's `think` field is a sibling of `model`/`prompt`, not
   * nested inside `options` like the other two. When all three are
   * omitted/false, the request body is unchanged from before these
   * parameters were added.
   */
  async generateCompletion(model: string, prompt: string, options?: GenerateCompletionOptions): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);
    const ollamaOptions: Record<string, number> = {};
    if (options?.temperature !== undefined) {
      ollamaOptions.temperature = options.temperature;
    }
    if (options?.maxOutputTokens !== undefined) {
      ollamaOptions.num_predict = options.maxOutputTokens;
    }
    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          ...(options?.disableThinking ? { think: false } : {}),
          ...(Object.keys(ollamaOptions).length > 0 ? { options: ollamaOptions } : {}),
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const bodyText = await response.text().catch(() => "");
        throw new Error(`Ollama generate request failed with HTTP ${response.status}${bodyText ? `: ${bodyText}` : ""}`);
      }
      const data = (await response.json()) as RawOllamaGenerateResponse;
      if (typeof data.response !== "string") {
        throw new Error("Ollama generate response did not include a response string.");
      }
      return data.response;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Timed out generating a completion via Ollama (model "${model}") after ${GENERATION_TIMEOUT_MS}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchTags(): Promise<RawOllamaTagsResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Ollama responded with HTTP ${response.status}`);
      }
      return (await response.json()) as RawOllamaTagsResponse;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Timed out connecting to Ollama at ${this.baseUrl} after ${REQUEST_TIMEOUT_MS}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
