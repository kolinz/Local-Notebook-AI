const DEFAULT_MAX_CHUNK_CHARS = 1000;

/**
 * Naive, dependency-free paragraph-aware chunker for the MVP RAG
 * pipeline (Phase 8). Splits on blank lines into paragraphs, then
 * greedily accumulates paragraphs into chunks up to `maxChars`; a
 * single paragraph longer than `maxChars` is hard-split at word
 * boundaries.
 *
 * This is intentionally simple (no semantic/sentence-aware splitting,
 * no overlap between chunks) — good enough to get real chunks with
 * real citations into `document_chunks` for Phase 8's own completion
 * criteria. A more sophisticated strategy can replace this later
 * (Phase 10+) without changing anything that calls it, since the
 * signature (text in, chunk strings out) stays the same either way.
 *
 * Returns non-empty, trimmed chunk strings, in order.
 */
export function chunkText(text: string, maxChars: number = DEFAULT_MAX_CHUNK_CHARS): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const paragraphs = normalized
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
      current = "";
    }

    if (paragraph.length <= maxChars) {
      current = paragraph;
    } else {
      chunks.push(...splitLongText(paragraph, maxChars));
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

/** Hard-splits an overly long paragraph at word boundaries. */
function splitLongText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const pieces: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current) {
      pieces.push(current);
    }
    // A single word longer than maxChars (rare — e.g. a URL) is hard-cut.
    current = word.length > maxChars ? word.slice(0, maxChars) : word;
  }

  if (current) {
    pieces.push(current);
  }

  return pieces;
}
