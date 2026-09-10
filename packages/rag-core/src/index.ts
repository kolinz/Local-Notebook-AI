/**
 * @local-notebook-ai/rag-core
 *
 * Phase 1 placeholder.
 *
 * This package will hold the RagStrategy interface (per SDD section 13.x)
 * and its implementations:
 * - StandardRagStrategy (Phase 11)
 * - HydeRagStrategy (Phase 12)
 *
 * Reminder for later phases: a HyDE hypothetical document is for retrieval
 * only and must never be used as grounding for the final answer.
 *
 * No retrieval or generation logic is implemented yet in Phase 1
 * (monorepo foundation).
 */

export interface RetrievedChunk {
  chunkId: string;
  fileId: string;
  content: string;
  score: number;
}

export interface RagQueryInput {
  ownerUserId: string;
  notebookId: string;
  query: string;
}

export interface RagAnswer {
  answer: string;
  citations: RetrievedChunk[];
  strategyName: "standard" | "hyde";
}

/**
 * Strategy Pattern interface for RAG execution. Not implemented yet —
 * this is a type-only placeholder for Phase 1.
 */
export interface RagStrategy {
  readonly name: "standard" | "hyde";
  run(input: RagQueryInput): Promise<RagAnswer>;
}
