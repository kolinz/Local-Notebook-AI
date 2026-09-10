import { Injectable } from "@nestjs/common";
import { and, eq, isNotNull } from "drizzle-orm";
import { DbService } from "../db/db.service";
import { documentChunks, files } from "../db/schema";
import { OllamaService } from "../ollama/ollama.service";
import { EmbeddingModelResolver } from "../embeddings/embedding-model-resolver.service";
import { AppConfigService } from "../config/app-config.service";
import { cosineSimilarity } from "../embeddings/vector-math";

export interface SearchInput {
  ownerUserId: string;
  notebookId: string;
  /**
   * The text that gets embedded and compared against stored chunk
   * vectors. For Standard RAG this is the user's question verbatim;
   * for HyDE RAG (Phase 12) this is the generated hypothetical
   * document instead — the caller decides, this service just embeds
   * whatever it's given.
   */
  textToEmbed: string;
  /** Overrides `config.rag.topK` for this call, if provided. */
  topK?: number;
  /** Overrides `config.rag.similarityThreshold` for this call, if provided. */
  similarityThreshold?: number;
}

export interface SearchResultChunk {
  chunkId: string;
  fileId: string;
  /** Joined from `files.original_filename` — Phase 11 needs this for citations (RagService). */
  originalFilename: string;
  content: string;
  score: number;
  metadataJson: string | null;
}

/**
 * Naive brute-force cosine-similarity search over `document_chunks`
 * (per this Phase's own MVP note — "初期SQLite実装ではベクトルはJSON
 * ...で保持してよい"). Every query is scoped by BOTH owner_user_id AND
 * notebook_id, with no exception for admins: an admin's cross-user
 * visibility, if ever needed, would come from a separate
 * `/api/admin/...` endpoint (same principle as OwnershipGuard
 * elsewhere in this codebase, per SDD section 13.6) — never from this
 * service silently widening its own scope.
 *
 * Deliberately hidden behind one narrow public method (`search()`) so
 * a future move to a real vector index (e.g. PostgreSQL + pgvector)
 * only needs to change this class's internals; every caller keeps
 * working unchanged.
 */
@Injectable()
export class VectorSearchService {
  constructor(
    private readonly dbService: DbService,
    private readonly ollamaService: OllamaService,
    private readonly embeddingModelResolver: EmbeddingModelResolver,
    private readonly appConfig: AppConfigService,
  ) {}

  async search(input: SearchInput): Promise<SearchResultChunk[]> {
    const model = this.embeddingModelResolver.resolve();
    const queryVector = await this.ollamaService.generateEmbedding(model, input.textToEmbed);

    const topK = input.topK ?? this.appConfig.config.rag.topK;
    const threshold = input.similarityThreshold ?? this.appConfig.config.rag.similarityThreshold;

    // The owner_user_id + notebook_id filter is the security boundary
    // here — it is never relaxed, and is applied in the SQL query
    // itself rather than filtered after the fact, so a chunk that
    // doesn't match can never even be pulled into this process's memory.
    // Joined with `files` (Phase 11) so each result carries the
    // original filename needed for citations, without a separate
    // per-chunk lookup.
    const candidates = this.dbService.db
      .select({
        id: documentChunks.id,
        fileId: documentChunks.fileId,
        content: documentChunks.content,
        metadataJson: documentChunks.metadataJson,
        embeddingVectorRef: documentChunks.embeddingVectorRef,
        originalFilename: files.originalFilename,
      })
      .from(documentChunks)
      .innerJoin(files, eq(files.id, documentChunks.fileId))
      .where(
        and(
          eq(documentChunks.ownerUserId, input.ownerUserId),
          eq(documentChunks.notebookId, input.notebookId),
          isNotNull(documentChunks.embeddingVectorRef),
        ),
      )
      .all();

    const scored: SearchResultChunk[] = [];
    for (const chunk of candidates) {
      if (!chunk.embeddingVectorRef) continue;

      let vector: number[];
      try {
        vector = JSON.parse(chunk.embeddingVectorRef) as number[];
      } catch {
        continue; // corrupt/legacy value — skip rather than fail the whole search
      }

      let score: number;
      try {
        score = cosineSimilarity(queryVector, vector);
      } catch {
        // Dimension mismatch — e.g. the default embedding model was
        // changed after this chunk was embedded. Skip it rather than
        // fail the whole search over one stale chunk.
        continue;
      }

      if (score >= threshold) {
        scored.push({
          chunkId: chunk.id,
          fileId: chunk.fileId,
          originalFilename: chunk.originalFilename,
          content: chunk.content,
          score,
          metadataJson: chunk.metadataJson,
        });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }
}
