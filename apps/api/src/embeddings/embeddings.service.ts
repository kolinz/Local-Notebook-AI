import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DbService } from "../db/db.service";
import { documentChunks } from "../db/schema";
import { OllamaService } from "../ollama/ollama.service";
import { EmbeddingModelResolver } from "./embedding-model-resolver.service";

export interface ChunkToEmbed {
  id: string;
  content: string;
}

/**
 * Generates and stores an embedding vector for each given chunk.
 *
 * Stores the vector as a JSON-encoded array of numbers directly in
 * `document_chunks.embedding_vector_ref` — this Phase's own notes
 * explicitly allow "JSON または別ファイル" for the initial SQLite
 * implementation. `VectorSearchService` reads the same JSON encoding,
 * so migrating to a real vector column/index (e.g. PostgreSQL +
 * pgvector) later only means changing how this value is stored and
 * read in these two places — no caller-facing signature changes
 * anywhere else.
 *
 * Called synchronously from `DocumentProcessingService` right after
 * chunking, per this Phase's own "synchronous MVP is fine" note (same
 * precedent as Phase 8's extraction/chunking step).
 */
@Injectable()
export class EmbeddingsService {
  constructor(
    private readonly dbService: DbService,
    private readonly ollamaService: OllamaService,
    private readonly embeddingModelResolver: EmbeddingModelResolver,
  ) {}

  /**
   * Throws on the first failure (e.g. no embedding model reachable) —
   * the caller (`DocumentProcessingService`) marks the file
   * `status = "failed"` in that case, same as an extraction failure.
   */
  async embedChunks(chunks: ChunkToEmbed[]): Promise<void> {
    if (chunks.length === 0) return;

    const model = this.embeddingModelResolver.resolve();

    for (const chunk of chunks) {
      const vector = await this.ollamaService.generateEmbedding(model, chunk.content);
      this.dbService.db
        .update(documentChunks)
        .set({ embeddingVectorRef: JSON.stringify(vector) })
        .where(eq(documentChunks.id, chunk.id))
        .run();
    }
  }
}
