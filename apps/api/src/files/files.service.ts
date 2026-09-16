import { Inject, Injectable, Logger } from "@nestjs/common";
import { randomUUID, createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { StorageAdapter } from "@local-notebook-ai/storage";
import { DbService } from "../db/db.service";
import { documentChunks, files } from "../db/schema";
import { STORAGE_ADAPTER } from "../storage/storage.tokens";
import { mimeTypeForKind, validateUpload } from "./file-validation";
import { OllamaService } from "../ollama/ollama.service";
import { ModelsService } from "../models/models.service";
import { AppConfigService } from "../config/app-config.service";
import { EmbeddingModelResolver } from "../embeddings/embedding-model-resolver.service";

export interface UploadFileInput {
  ownerUserId: string;
  notebookId: string;
  originalFilename: string;
  buffer: Buffer;
}

/**
 * (Phase 19: chunk viewer/editor.) A single chunk as shown to/edited by
 * the frontend. `charCount` and `embedded` are derived here rather than
 * sent as raw DB columns — `embeddingVectorRef`'s actual JSON content
 * is an internal representation, never something the frontend needs or
 * should see.
 */
export interface ChunkDetail {
  id: string;
  chunkIndex: number;
  content: string;
  charCount: number;
  embedded: boolean;
}

/**
 * (File summary feature.) A conservative character budget for the
 * concatenated chunk text fed into the summarization prompt — well
 * under a typical local model's context window even after the prompt
 * wrapper text is added. Content beyond this is simply dropped, not
 * map-reduced (a deliberate MVP choice — see `generateSummary`'s doc
 * comment); `summaryTruncated` records that it happened so the caller
 * can say so rather than presenting a partial summary as complete.
 */
const MAX_SUMMARY_INPUT_CHARS = 12000;

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly dbService: DbService,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
    private readonly ollamaService: OllamaService,
    private readonly modelsService: ModelsService,
    private readonly appConfig: AppConfigService,
    private readonly embeddingModelResolver: EmbeddingModelResolver,
  ) {}

  private get db() {
    return this.dbService.db;
  }

  /**
   * Validates, stores, and records an uploaded file. The storage key
   * (`{ownerUserId}/{notebookId}/original/{uuid}{ext}`) is built
   * entirely from server-generated/authenticated values — never from
   * `originalFilename` — so path traversal via a crafted filename is
   * structurally impossible regardless of what file-validation.ts
   * additionally rejects.
   */
  async uploadFile(input: UploadFileInput) {
    const { kind, extension } = validateUpload(input.originalFilename, input.buffer);

    const fileId = randomUUID();
    // Matches the SDD's storage layout: storage/uploads/{user_id}/{notebook_id}/original/...
    // (LOCAL_STORAGE_ROOT is the "storage/" part; "uploads/" is added here.)
    const storedObjectKey = `uploads/${input.ownerUserId}/${input.notebookId}/original/${fileId}${extension}`;
    const mimeType = mimeTypeForKind(kind);

    await this.storage.putObject({
      key: storedObjectKey,
      contentType: mimeType,
      data: input.buffer,
    });

    const sha256 = createHash("sha256").update(input.buffer).digest("hex");

    const [row] = this.db
      .insert(files)
      .values({
        id: fileId,
        ownerUserId: input.ownerUserId,
        notebookId: input.notebookId,
        originalFilename: input.originalFilename,
        storedObjectKey,
        mimeType,
        sizeBytes: input.buffer.byteLength,
        // Text extraction / chunking (Phase 8) will progress this
        // through extracting -> chunking -> ready (or failed). Nothing
        // beyond the upload itself has happened yet in this Phase.
        status: "uploaded",
        sha256,
      })
      .returning()
      .all();

    return row;
  }

  /** Lists only non-deleted files for a notebook. Ownership of the notebook itself is the caller's job (see OwnershipGuard on the route). */
  listForNotebook(notebookId: string) {
    return this.db
      .select()
      .from(files)
      .where(and(eq(files.notebookId, notebookId), isNull(files.deletedAt)))
      .all();
  }

  /** Excludes soft-deleted files — a deleted file looks gone (404), even to its own owner. */
  findById(id: string) {
    return this.db.select().from(files).where(and(eq(files.id, id), isNull(files.deletedAt))).get() ?? null;
  }

  /**
   * Extracted chunks for a file, in order — used by the Phase 13
   * "Preview" button in the Sources panel to show what was actually
   * extracted from the file, without needing a separate raw-file-
   * serving endpoint. Ownership of the file itself is the caller's job
   * (see OwnershipGuard on the route).
   */
  getChunksForFile(fileId: string) {
    return this.db
      .select({
        chunkIndex: documentChunks.chunkIndex,
        content: documentChunks.content,
        metadataJson: documentChunks.metadataJson,
      })
      .from(documentChunks)
      .where(eq(documentChunks.fileId, fileId))
      .orderBy(documentChunks.chunkIndex)
      .all();
  }

  /**
   * (Phase 19: chunk viewer/editor.) Same underlying rows as
   * `getChunksForFile`, but including each chunk's `id` (needed to
   * target a single chunk for editing) and a derived `charCount` /
   * `embedded` view instead of the raw `embeddingVectorRef` JSON blob.
   * Ownership of the file itself is the caller's job (see OwnershipGuard
   * on the route).
   */
  getChunksDetailedForFile(fileId: string): ChunkDetail[] {
    const rows = this.db
      .select({
        id: documentChunks.id,
        chunkIndex: documentChunks.chunkIndex,
        content: documentChunks.content,
        embeddingVectorRef: documentChunks.embeddingVectorRef,
      })
      .from(documentChunks)
      .where(eq(documentChunks.fileId, fileId))
      .orderBy(documentChunks.chunkIndex)
      .all();

    return rows.map((row) => ({
      id: row.id,
      chunkIndex: row.chunkIndex,
      content: row.content,
      charCount: row.content.length,
      embedded: row.embeddingVectorRef !== null,
    }));
  }

  /**
   * (Phase 19: chunk viewer/editor.) Overwrites a single chunk's text
   * (the primary motivating use case is fixing a pdfjs-dist extraction
   * artifact) and immediately attempts to re-embed it with the current
   * default embedding model, so the chunk's vector never silently
   * drifts out of sync with its own text.
   *
   * The content update is unconditional — even if the subsequent
   * re-embed attempt fails (Ollama unreachable, model missing, etc.),
   * the edited text is kept. `embeddingVectorRef` is cleared *before*
   * the re-embed attempt, not just left holding the stale old vector —
   * a failed re-embed therefore leaves the chunk in an honestly
   * "not embedded" state (`embedded: false`) rather than quietly
   * keeping a vector that no longer matches the text. The caller can
   * simply call this again (with the same or further-edited content)
   * to retry; no separate "retry embedding" endpoint is needed.
   *
   * Returns `null` if `chunkId` doesn't exist or doesn't belong to
   * `fileId` — the controller turns that into a 404. Ownership of the
   * file itself is the caller's job (see OwnershipGuard on the route).
   *
   * Deliberately does NOT touch `files.summary_text` / the summary
   * cache (Phase 17) — chunk edits do not implicitly invalidate or
   * regenerate a file's cached summary.
   */
  async updateChunkContent(fileId: string, chunkId: string, content: string): Promise<ChunkDetail | null> {
    const existing = this.db
      .select({ id: documentChunks.id })
      .from(documentChunks)
      .where(and(eq(documentChunks.id, chunkId), eq(documentChunks.fileId, fileId)))
      .get();
    if (!existing) return null;

    // Clear the (now-stale) embedding up front, then persist the new
    // text — see the doc comment above for why this ordering matters.
    this.db
      .update(documentChunks)
      .set({ content, embeddingVectorRef: null })
      .where(eq(documentChunks.id, chunkId))
      .run();

    let embedded = false;
    try {
      const model = this.embeddingModelResolver.resolve();
      const vector = await this.ollamaService.generateEmbedding(model, content);
      this.db
        .update(documentChunks)
        .set({ embeddingVectorRef: JSON.stringify(vector) })
        .where(eq(documentChunks.id, chunkId))
        .run();
      embedded = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Re-embedding failed for chunk ${chunkId} (file ${fileId}): ${message}`);
      // embeddingVectorRef is already null from the update above —
      // nothing further to do here. Not rethrown: the edit itself
      // succeeded, only the embedding refresh did not.
    }

    const row = this.db
      .select({ chunkIndex: documentChunks.chunkIndex, content: documentChunks.content })
      .from(documentChunks)
      .where(eq(documentChunks.id, chunkId))
      .get()!;

    return {
      id: chunkId,
      chunkIndex: row.chunkIndex,
      content: row.content,
      charCount: row.content.length,
      embedded,
    };
  }

  /**
   * (File summary feature.) Generates (or regenerates) a one-shot
   * summary of a file from its already-extracted `document_chunks` —
   * never re-extracts from the original bytes, and never re-runs
   * embedding/chunking. The caller (FilesController) is responsible for
   * confirming the file exists and is owned by the requester before
   * calling this — this method assumes both are already true.
   *
   * Chunks are concatenated in file order up to
   * `MAX_SUMMARY_INPUT_CHARS`; anything beyond that is simply dropped
   * rather than map-reduced (summarize-each-chunk-then-summarize-the-
   * summaries) — a deliberate MVP simplicity choice made together with
   * Kohei. `summaryTruncated` is persisted alongside the summary so the
   * frontend can show "一部のみを要約しています" instead of silently
   * presenting a partial summary as if it covered the whole document —
   * matching this codebase's existing preference for honest
   * placeholders over pretending a feature is more complete than it is
   * (see the Phase 13 "Summary: not implemented yet" placeholder this
   * feature replaces).
   *
   * Reuses the same default generation model as RAG answers
   * (`ModelsService.resolveDefaultGenerationModel()`) rather than
   * introducing a separate summary-model admin setting.
   *
   * Throws if Ollama is unreachable or the model call otherwise fails —
   * the controller decides how to surface that (no fabricated summary
   * is ever returned on failure).
   */
  async generateSummary(fileId: string) {
    const chunks = this.getChunksForFile(fileId);
    const fullText = chunks.map((chunk) => chunk.content).join("\n\n");
    const truncated = fullText.length > MAX_SUMMARY_INPUT_CHARS;
    const inputText = truncated ? fullText.slice(0, MAX_SUMMARY_INPUT_CHARS) : fullText;

    const model = this.modelsService.resolveDefaultGenerationModel();
    const prompt = buildSummaryPrompt(inputText, truncated);

    let summaryText: string;
    try {
      summaryText = (
        await this.ollamaService.generateCompletion(model, prompt, {
          temperature: this.appConfig.config.ollama.generationTemperature,
          maxOutputTokens: this.appConfig.config.ollama.answerMaxOutputTokens,
          disableThinking: this.appConfig.config.ollama.disableThinking,
        })
      ).trim();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Summary generation failed for file ${fileId}: ${message}`);
      throw error;
    }

    this.db
      .update(files)
      .set({
        summaryText,
        summaryGeneratedAt: new Date(),
        summaryModel: model,
        summaryTruncated: truncated,
        updatedAt: new Date(),
      })
      .where(eq(files.id, fileId))
      .run();

    // Re-fetch so the caller gets the persisted row back (consistent
    // with the upload-then-processFile pattern in
    // NotebookFilesController#upload), not a hand-assembled partial.
    return this.findById(fileId)!;
  }

  /**
   * Soft-deletes the DB row (deleted_at + status="deleted", matching
   * notebooks' pattern and keeping an audit trail) and best-effort
   * removes the physical object from storage — an already-missing
   * object is not treated as an error, since the DB row should still
   * end up marked deleted either way.
   */
  async softDelete(id: string): Promise<boolean> {
    const existing = this.findById(id);
    if (!existing) return false;

    try {
      await this.storage.deleteObject(existing.storedObjectKey);
    } catch {
      // Best-effort — proceed to mark the row deleted regardless.
    }

    this.db
      .update(files)
      .set({ deletedAt: new Date(), updatedAt: new Date(), status: "deleted" })
      .where(eq(files.id, id))
      .run();
    return true;
  }
}

/**
 * (File summary feature.) Mirrors `AnswerGenerator`'s prompt style (SDD
 * 13.5) — Japanese output, don't assert beyond the given text — but for
 * whole-document summarization rather than question-answering, so
 * there are no citations/context chunks with scores to format, just the
 * concatenated document text. When `truncated` is true, the model is
 * told the text is a partial excerpt so its own summary doesn't imply
 * completeness that isn't there.
 */
function buildSummaryPrompt(content: string, truncated: boolean): string {
  const truncationNote = truncated
    ? "\n\n注記: 以下は資料全体ではなく、先頭部分の抜粋です。この点を踏まえて要約してください。"
    : "";

  return `以下の資料の内容を、日本語で簡潔に要約してください。資料に書かれていないことを断定しないでください。${truncationNote}

資料:
${content}

要約:`;
}
