import {
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import type { Request } from "express";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { OwnershipGuard } from "../common/authorization/ownership.guard";
import { CheckOwnership } from "../common/authorization/check-ownership.decorator";
import { AppException } from "../common/app-exception";
import { AppConfigService } from "../config/app-config.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { DocumentProcessingService } from "../document-processing/document-processing.service";
import { FilesService } from "./files.service";

/**
 * An absolute ceiling multer enforces while buffering the upload into
 * memory, independent of the configured `MAX_UPLOAD_SIZE_MB` — a safety
 * net against extreme payloads regardless of config. The actual,
 * configured limit is enforced afterward against `file.size` (see
 * `upload()` below), since multer's own per-request limit is set once
 * at decoration time and can't easily read async config.
 */
const HARD_UPLOAD_CAP_BYTES = 100 * 1024 * 1024;

/**
 * Both routes here require the caller to own `:notebookId` — enforced
 * once at the class level rather than duplicated per-method.
 */
@Controller("notebooks/:notebookId/files")
@UseGuards(SessionAuthGuard, OwnershipGuard)
@CheckOwnership({ resource: "notebook", paramName: "notebookId" })
export class NotebookFilesController {
  constructor(
    private readonly filesService: FilesService,
    private readonly documentProcessingService: DocumentProcessingService,
    private readonly appConfig: AppConfigService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Post()
  @HttpCode(201)
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: HARD_UPLOAD_CAP_BYTES },
    }),
  )
  async upload(
    @Param("notebookId") notebookId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
  ) {
    if (!file) {
      throw new AppException(400, "FILE_REQUIRED", 'No file was uploaded (expected multipart field "file").');
    }

    const maxBytes = this.appConfig.config.storage.maxUploadSizeMb * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new AppException(
        413,
        "FILE_TOO_LARGE",
        `File exceeds the maximum upload size of ${this.appConfig.config.storage.maxUploadSizeMb} MB.`,
      );
    }

    const uploaded = await this.filesService.uploadFile({
      ownerUserId: req.user!.id,
      notebookId,
      originalFilename: decodeMultipartFilename(file.originalname),
      buffer: file.buffer,
    });

    // Recorded at upload time (not after processing) — the upload
    // itself is the security/audit-relevant event (a new file entered
    // the system, under this owner/notebook); whether extraction later
    // succeeds or fails is a processing detail already visible via the
    // file's own `status`, not something that needs a second log entry.
    this.auditLogService.record({
      actorUserId: req.user!.id,
      action: "file.uploaded",
      resourceType: "file",
      resourceId: uploaded.id,
      metadata: { notebookId, originalFilename: uploaded.originalFilename, sizeBytes: uploaded.sizeBytes },
      ipAddress: req.ip,
      userAgent: req.header("user-agent"),
    });

    // Phase 8: synchronous MVP processing (per that Phase's own notes —
    // a future job queue would await this same method from a consumer
    // instead, with no other change needed here). Never throws — any
    // extraction/chunking failure is caught internally and reflected as
    // files.status = "failed" instead.
    await this.documentProcessingService.processFile(uploaded.id);

    // Re-fetch so the response reflects the post-processing status
    // ("ready"/"failed") rather than the stale "uploaded" snapshot.
    const current = this.filesService.findById(uploaded.id) ?? uploaded;

    return { file: current };
  }

  /** Lists only non-deleted files for this notebook. */
  @Get()
  list(@Param("notebookId") notebookId: string) {
    return { files: this.filesService.listForNotebook(notebookId) };
  }
}

/**
 * Works around a well-known multer/busboy behavior: the filename in a
 * multipart `Content-Disposition` header is decoded as `latin1` by
 * default, but modern browsers actually send the raw UTF-8 bytes of the
 * filename (not percent-encoded) — so a non-ASCII filename like a
 * Japanese one arrives mojibake'd (each UTF-8 byte reinterpreted as one
 * latin1 character). Re-encoding those characters back to raw bytes as
 * `latin1`, then decoding *that* as `utf8`, recovers the original
 * string. This is a no-op for pure-ASCII filenames (the common case),
 * since ASCII is a subset of both encodings.
 */
function decodeMultipartFilename(rawFilename: string): string {
  return Buffer.from(rawFilename, "latin1").toString("utf8");
}
