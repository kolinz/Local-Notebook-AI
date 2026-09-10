export interface Citation {
  /** 1-based index, matching the "[n]" markers the answer-generation prompt asks the model to use. */
  index: number;
  chunkId: string;
  fileId: string;
  originalFilename: string;
  /** From the chunk's metadata_json (PDF page number), when available. */
  page?: number;
  score: number;
}

export interface RagStrategyContext {
  ownerUserId: string;
  notebookId: string;
  message: string;
}

export interface RagStrategyOutcome {
  answer: string;
  citations: Citation[];
  retrievedChunkIds: string[];
  /**
   * Only set by `HydeRagStrategy` — the generated hypothetical
   * document. Retrieval-only (used to embed and search); never the
   * basis for `answer` itself (SDD section 13.3 / this Phase's own
   * "重要" constraints). `RagService` persists this into
   * `rag_runs.hyde_document` regardless of the
   * `ALLOW_HYDE_DOCUMENT_PREVIEW` setting — that setting only gates
   * whether `RagController` includes it in the API response.
   */
  hydeDocument?: string;
}

/**
 * Common contract for a RAG retrieval+generation strategy (SDD section
 * 13.1: Standard RAG and HyDE RAG). `RagService` doesn't know or care
 * which concrete strategy it's running — `RagStrategyResolver` decides
 * that per notebook/system settings, and everything downstream (session
 * handling, rag_runs/chat_messages persistence) is identical either way.
 */
export interface RagStrategy {
  readonly name: "standard" | "hyde";
  execute(context: RagStrategyContext): Promise<RagStrategyOutcome>;
}
