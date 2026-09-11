import { Injectable, Logger } from "@nestjs/common";
import { OllamaService } from "../ollama/ollama.service";
import { ModelsService } from "../models/models.service";
import { AppConfigService } from "../config/app-config.service";
import type { SearchResultChunk } from "../search/vector-search.service";
import type { Citation } from "./strategies/rag-strategy.interface";

export const NO_GROUNDING_ANSWER = "資料からは確認できません。";

export interface GeneratedAnswer {
  answer: string;
  citations: Citation[];
}

/**
 * Generates an answer strictly grounded in `chunks` — real, retrieved
 * `document_chunks` rows, never a HyDE hypothetical document. Both
 * `StandardRagStrategy` and `HydeRagStrategy` call this exact same
 * class for the "Generate answer" step of their pipelines (SDD 13.2 /
 * 13.3's flow diagrams both end the same way) — this is what
 * structurally guarantees "最終回答は検索された実文書チャンクだけを
 * 根拠にする" (this Phase's own constraint) regardless of which
 * strategy retrieved those chunks or how.
 *
 * If `chunks` is empty, returns the fixed fallback answer without
 * calling the generation model at all — this guarantees the exact
 * required wording (SDD 13.5) rather than hoping the model produces it
 * verbatim, and saves an unnecessary Ollama call.
 *
 * Uses `.env`'s `OLLAMA_GENERATION_TEMPERATURE` (via `AppConfigService`),
 * not Ollama's own, more open-ended default — observed with a small
 * (~3.8B) local model: given borderline-relevant retrieved chunks, the
 * default temperature made it inconsistently add unrequested preamble
 * before the required fixed "no grounding" wording across otherwise-
 * identical calls. This doesn't change *what* is grounded (retrieval
 * itself was already correct), only how consistently the model follows
 * the "answer only with the fixed wording when appropriate" instruction
 * in `buildPrompt`.
 */
@Injectable()
export class AnswerGenerator {
  private readonly logger = new Logger(AnswerGenerator.name);

  constructor(
    private readonly ollamaService: OllamaService,
    private readonly modelsService: ModelsService,
    private readonly appConfig: AppConfigService,
  ) {}

  async generate(chunks: SearchResultChunk[], question: string): Promise<GeneratedAnswer> {
    if (chunks.length === 0) {
      return { answer: NO_GROUNDING_ANSWER, citations: [] };
    }

    const citations: Citation[] = chunks.map((chunk, index) => ({
      index: index + 1,
      chunkId: chunk.chunkId,
      fileId: chunk.fileId,
      originalFilename: chunk.originalFilename,
      page: extractPageNumber(chunk.metadataJson),
      score: chunk.score,
    }));

    const model = this.modelsService.resolveDefaultGenerationModel();
    const prompt = buildPrompt(chunks, question);

    let answer: string;
    try {
      answer = (
        await this.ollamaService.generateCompletion(model, prompt, {
          temperature: this.appConfig.config.ollama.generationTemperature,
          maxOutputTokens: this.appConfig.config.ollama.answerMaxOutputTokens,
          disableThinking: this.appConfig.config.ollama.disableThinking,
        })
      ).trim();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Generation failed: ${message}`);
      return { answer: NO_GROUNDING_ANSWER, citations: [] };
    }

    if (!answer) {
      // A model returning an empty string is not useful — fall back to
      // the same honest "no grounding" wording rather than showing the
      // user a blank reply.
      return { answer: NO_GROUNDING_ANSWER, citations: [] };
    }

    return { answer, citations };
  }
}

function extractPageNumber(metadataJson: string | null): number | undefined {
  if (!metadataJson) return undefined;
  try {
    const parsed = JSON.parse(metadataJson) as { page?: number };
    return typeof parsed.page === "number" ? parsed.page : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Builds the answer-generation prompt per SDD section 13.5's
 * constraints: ground strictly in the retrieved context, never assert
 * beyond it, cite sources with "[n]" markers, and fall back to the
 * fixed "no grounding" wording when the context doesn't support an
 * answer (reinforced in the prompt itself as a second line of defense,
 * even though `generate()` already short-circuits entirely when there
 * are zero retrieved chunks).
 */
function buildPrompt(chunks: SearchResultChunk[], question: string): string {
  const contextBlock = chunks
    .map((chunk, index) => {
      const page = extractPageNumber(chunk.metadataJson);
      const source = page !== undefined ? `${chunk.originalFilename} (p.${page})` : chunk.originalFilename;
      return `[${index + 1}] (出典: ${source})\n${chunk.content}`;
    })
    .join("\n\n");

  return `以下の検索コンテキストだけを根拠に、質問に日本語で回答してください。

制約:
- 検索コンテキストにない内容を断定しないでください
- 検索コンテキストから根拠が得られない場合は「${NO_GROUNDING_ANSWER}」とだけ回答してください
- 回答の該当箇所には、対応する引用元番号を [1] [2] のように付けてください

検索コンテキスト:
${contextBlock}

質問: ${question}

回答:`;
}
