import { Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { DbService } from "../db/db.service";
import { models } from "../db/schema";
import { AppConfigService } from "../config/app-config.service";

/**
 * Resolves which Ollama model name to use for embeddings: prefers the
 * admin-configured default embedding model (`models.is_default_embedding`,
 * set via Phase 9's `PUT /api/admin/ollama/settings`), falling back to
 * `DEFAULT_EMBEDDING_MODEL` from `.env` when none is configured yet
 * (e.g. a fresh install where the admin hasn't synced/designated one).
 *
 * Both `EmbeddingsService` (storing chunk vectors at upload time) and
 * `VectorSearchService` (embedding the query text at search time) call
 * this — they MUST resolve to the same model, or their vectors would
 * live in different embedding spaces and similarity scores would be
 * meaningless. Centralizing the resolution here is what guarantees
 * that.
 */
@Injectable()
export class EmbeddingModelResolver {
  constructor(
    private readonly dbService: DbService,
    private readonly appConfig: AppConfigService,
  ) {}

  resolve(): string {
    const row = this.dbService.db
      .select({ name: models.name })
      .from(models)
      .where(and(eq(models.isDefaultEmbedding, true), eq(models.isEnabled, true)))
      .get();

    return row?.name ?? this.appConfig.config.ollama.defaultEmbeddingModel;
  }
}
