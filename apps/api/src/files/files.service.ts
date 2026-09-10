import { Inject, Injectable } from "@nestjs/common";
import { randomUUID, createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { StorageAdapter } from "@local-notebook-ai/storage";
import { DbService } from "../db/db.service";
import { documentChunks, files } from "../db/schema";
import { STORAGE_ADAPTER } from "../storage/storage.tokens";
import { mimeTypeForKind, validateUpload } from "./file-validation";

export interface UploadFileInput {
  ownerUserId: string;
  notebookId: string;
  originalFilename: string;
  buffer: Buffer;
}

@Injectable()
export class FilesService {
  constructor(
    private readonly dbService: DbService,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
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
