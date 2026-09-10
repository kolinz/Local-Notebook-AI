/**
 * Cosine similarity between two equal-length vectors, in [-1, 1] for
 * real embeddings (in practice usually [0, 1] for typical text
 * embedding models). Throws on a dimension mismatch — callers should
 * treat that as "skip this comparison" (e.g. a chunk embedded with a
 * since-changed embedding model), not a hard failure of the whole
 * search.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
