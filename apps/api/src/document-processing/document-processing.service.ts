import { Inject, Injectable, Logger } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { StorageAdapter } from "@local-notebook-ai/storage";
import { DbService } from "../db/db.service";
import { documentChunks, files } from "../db/schema";
import { STORAGE_ADAPTER } from "../storage/storage.tokens";
import { kindFromExtension } from "../files/file-validation";
import { extractSegments } from "./extraction";
import { chunkText } from "./chunking";
import { EmbeddingsService } from "../embeddings/embeddings.service";

/**
 * Extracts text from an already-uploaded file, stores it as rows in
 * `document_chunks`, and (Phase 10) generates an embedding vector for
 * each chunk — progressing `files.status` through
 * uploaded -> extracting -> chunking -> embedding -> ready, or ->
 * failed on any error (the full status flow from the `files` schema
 * comment; Phase 8 implemented the first three stages, this Phase adds
 * "embedding").
 *
 * `processFile()` is the single entrypoint, called synchronously
 * (awaited) right after upload completes — Phase 8's own notes
 * explicitly allowed a synchronous MVP implementation, and this Phase's
 * notes do too for embedding generation. The method itself has no
 * knowledge of *how* it's invoked, though: a future move to a job
 * queue would mean a queue consumer calls this exact same method
 * instead of the controller awaiting it inline, with no change to the
 * extraction/chunking/embedding/persistence logic below.
 *
 * Depends only on `DbService`, the storage adapter, and
 * `EmbeddingsService` — not on `FilesService` — so `FilesModule` can
 * depend on `DocumentProcessingModule` without a circular import.
 */
@Injectable()
export class DocumentProcessingService {
  private readonly logger = new Logger(DocumentProcessingService.name);

  constructor(
    private readonly dbService: DbService,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
    private readonly embeddingsService: EmbeddingsService,
  ) {}

  private get db() {
    return this.dbService.db;
  }

  async processFile(fileId: string): Promise<void> {
    const file = this.db.select().from(files).where(eq(files.id, fileId)).get();
    if (!file) {
      this.logger.warn(`processFile: file ${fileId} not found`);
      return;
    }

    try {
      this.setStatus(fileId, "extracting");

      const buffer = await this.readFileBuffer(file.storedObjectKey);
      const extension = extensionOf(file.storedObjectKey);
      const kind = kindFromExtension(extension);
      if (!kind) {
        throw new Error(`Cannot determine file kind for extension "${extension}"`);
      }

      const segments = await extractSegments(kind, buffer);

      this.setStatus(fileId, "chunking");

      // Idempotent: replace any previous chunks before inserting new
      // ones, so re-processing (e.g. a manual retry) doesn't duplicate rows.
      this.db.delete(documentChunks).where(eq(documentChunks.fileId, fileId)).run();

      const rows: (typeof documentChunks.$inferInsert)[] = [];
      let chunkIndex = 0;
      for (const segment of segments) {
        for (const content of chunkText(segment.text)) {
          rows.push({
            ownerUserId: file.ownerUserId,
            notebookId: file.notebookId,
            fileId: file.id,
            chunkIndex: chunkIndex++,
            content,
            metadataJson: JSON.stringify(
              segment.pageNumber !== undefined ? { page: segment.pageNumber } : {},
            ),
          });
        }
      }

      let insertedChunks: { id: string; content: string }[] = [];
      if (rows.length > 0) {
        insertedChunks = this.db
          .insert(documentChunks)
          .values(rows)
          .returning({ id: documentChunks.id, content: documentChunks.content })
          .all();
      }

      this.setStatus(fileId, "embedding");
      await this.embeddingsService.embedChunks(insertedChunks);

      this.setStatus(fileId, "ready");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`processFile failed for file ${fileId}: ${message}`);
      this.setStatus(fileId, "failed");
    }
  }

  private setStatus(fileId: string, status: string): void {
    this.db.update(files).set({ status, updatedAt: new Date() }).where(eq(files.id, fileId)).run();
  }

  private async readFileBuffer(key: string): Promise<Buffer> {
    const stream = await this.storage.getObject(key);
    const parts: Buffer[] = [];
    return new Promise<Buffer>((resolve, reject) => {
      stream.on("data", (chunk: Buffer | string) => {
        parts.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      stream.on("end", () => resolve(Buffer.concat(parts)));
      stream.on("error", reject);
    });
  }
}

function extensionOf(key: string): string {
  const idx = key.lastIndexOf(".");
  return idx === -1 ? "" : key.slice(idx).toLowerCase();
}
