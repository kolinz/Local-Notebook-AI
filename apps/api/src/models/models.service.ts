import { Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { DbService } from "../db/db.service";
import { models } from "../db/schema";
import { OllamaService } from "../ollama/ollama.service";
import { AppConfigService } from "../config/app-config.service";

export interface SyncResult {
  added: number;
  updated: number;
  total: number;
}

/**
 * Best-effort heuristic: Ollama's `/api/tags` doesn't distinguish
 * "chat/generation" models from "embedding" models — most well-known
 * embedding models include "embed" in their name (nomic-embed-text,
 * mxbai-embed-large, ...), with "minilm" (all-minilm) as a common
 * exception. Anything else is treated as a generation model. This is
 * only used to pre-fill `models.model_type` for display purposes in
 * the admin UI — it does NOT gate which model can be assigned to which
 * "default" slot (see setDefaultGeneration/setDefaultEmbedding/
 * setDefaultHyde below): an admin can designate any synced model for
 * any slot, since Ollama itself is the actual authority on what a
 * given model can be used for.
 */
function guessModelType(name: string): "generation" | "embedding" {
  const lower = name.toLowerCase();
  if (lower.includes("embed") || lower.includes("minilm")) {
    return "embedding";
  }
  return "generation";
}

@Injectable()
export class ModelsService {
  constructor(
    private readonly dbService: DbService,
    private readonly ollamaService: OllamaService,
    private readonly appConfig: AppConfigService,
  ) {}

  private get db() {
    return this.dbService.db;
  }

  /**
   * Resolves which Ollama model name to use for generation (chat
   * completion / RAG answer synthesis): prefers the admin-configured
   * default generation model (`models.is_default_generation`, set via
   * `PUT /api/admin/ollama/settings`), falling back to
   * `DEFAULT_GENERATION_MODEL` from `.env` when none is configured yet.
   * Mirrors `EmbeddingModelResolver`'s resolution logic (Phase 10) for
   * the generation side, used by `RagService` (Phase 11).
   */
  resolveDefaultGenerationModel(): string {
    const row = this.db
      .select({ name: models.name })
      .from(models)
      .where(and(eq(models.isDefaultGeneration, true), eq(models.isEnabled, true)))
      .get();
    return row?.name ?? this.appConfig.config.ollama.defaultGenerationModel;
  }

  listAll() {
    return this.db.select().from(models).all();
  }

  findById(id: string) {
    return this.db.select().from(models).where(eq(models.id, id)).get() ?? null;
  }

  /**
   * Pulls the current model list from Ollama and upserts it into the
   * `models` table (matched by name). Existing rows keep their
   * `is_enabled` / `is_default_*` flags untouched — only `model_type`
   * and `updated_at` are refreshed for models that already exist.
   *
   * Propagates any error from `OllamaService` (e.g. Ollama unreachable)
   * — the caller (OllamaAdminController) surfaces that as a 502-style
   * error rather than silently reporting an empty sync.
   */
  async syncFromOllama(): Promise<SyncResult> {
    const available = await this.ollamaService.listAvailableModels();

    let added = 0;
    let updated = 0;

    for (const info of available) {
      const existing = this.db.select().from(models).where(eq(models.name, info.name)).get();
      const modelType = guessModelType(info.name);

      if (existing) {
        this.db
          .update(models)
          .set({ modelType, updatedAt: new Date() })
          .where(eq(models.id, existing.id))
          .run();
        updated++;
      } else {
        this.db
          .insert(models)
          .values({
            provider: "ollama",
            name: info.name,
            modelType,
            isEnabled: true,
          })
          .run();
        added++;
      }
    }

    return { added, updated, total: available.length };
  }

  /** Unsets the flag on every other row first, so at most one model is ever the default generation model. */
  setDefaultGeneration(modelId: string): void {
    this.db.update(models).set({ isDefaultGeneration: false }).run();
    this.db
      .update(models)
      .set({ isDefaultGeneration: true, updatedAt: new Date() })
      .where(eq(models.id, modelId))
      .run();
  }

  /** Unsets the flag on every other row first, so at most one model is ever the default embedding model. */
  setDefaultEmbedding(modelId: string): void {
    this.db.update(models).set({ isDefaultEmbedding: false }).run();
    this.db
      .update(models)
      .set({ isDefaultEmbedding: true, updatedAt: new Date() })
      .where(eq(models.id, modelId))
      .run();
  }

  /** Unsets the flag on every other row first, so at most one model is ever the HyDE generation model. */
  setDefaultHyde(modelId: string): void {
    this.db.update(models).set({ isDefaultHyde: false }).run();
    this.db
      .update(models)
      .set({ isDefaultHyde: true, updatedAt: new Date() })
      .where(eq(models.id, modelId))
      .run();
  }

  /** Returns `false` if the model doesn't exist. */
  setEnabled(modelId: string, isEnabled: boolean): boolean {
    const existing = this.findById(modelId);
    if (!existing) return false;
    this.db.update(models).set({ isEnabled, updatedAt: new Date() }).where(eq(models.id, modelId)).run();
    return true;
  }
}
