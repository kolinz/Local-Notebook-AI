import { Controller, Delete, Get, HttpCode, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { OwnershipGuard } from "../common/authorization/ownership.guard";
import { CheckOwnership } from "../common/authorization/check-ownership.decorator";
import { AppException } from "../common/app-exception";
import { AuditLogService } from "../audit-log/audit-log.service";
import { FilesService } from "./files.service";

/**
 * Phase 7: adds DELETE to the Phase 4 read-only GET :id endpoint.
 * Upload/list (POST/GET on the notebook-scoped path) live in
 * NotebookFilesController instead — see notebook-files.controller.ts.
 *
 * File summary feature: adds POST :id/summary here rather than a new
 * controller, since it's ownership-checked and structured identically
 * to the existing GET :id/preview route just above it.
 */
@Controller("files")
@UseGuards(SessionAuthGuard)
export class FilesController {
  constructor(
    private readonly filesService: FilesService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Ownership-checked: a caller specifying another user's file id gets
   * a 403, not the file (see OwnershipGuard).
   */
  @Get(":id")
  @UseGuards(OwnershipGuard)
  @CheckOwnership({ resource: "file", paramName: "id" })
  getOne(@Param("id") id: string) {
    const file = this.filesService.findById(id);
    if (!file) {
      throw new AppException(404, "NOT_FOUND", "File not found.");
    }
    return { file };
  }

  /**
   * Phase 13's "Preview" button: shows the extracted chunk text for a
   * file rather than serving the raw original bytes — avoids needing a
   * separate raw-file-download endpoint (with its own MIME/Content-
   * Disposition considerations) just for this. Ownership-checked
   * identically to the other file routes.
   */
  @Get(":id/preview")
  @UseGuards(OwnershipGuard)
  @CheckOwnership({ resource: "file", paramName: "id" })
  preview(@Param("id") id: string) {
    const file = this.filesService.findById(id);
    if (!file) {
      throw new AppException(404, "NOT_FOUND", "File not found.");
    }
    return { file, chunks: this.filesService.getChunksForFile(id) };
  }

  /**
   * File summary feature: the "Summary" button in the Sources panel,
   * previously a Phase 13 "not implemented yet" placeholder. Generates
   * on first call; a later call regenerates and overwrites the cached
   * summary (there is no separate "read the cached summary" endpoint —
   * the file itself, returned by GET :id / GET :id/preview and by the
   * notebook file listing, already carries `summaryText` /
   * `summaryGeneratedAt` / `summaryTruncated` once generated).
   *
   * Ownership-checked identically to the other file routes. A 502 here
   * means Ollama itself failed or is unreachable — never a fabricated
   * summary.
   */
  @Post(":id/summary")
  @HttpCode(200)
  @UseGuards(OwnershipGuard)
  @CheckOwnership({ resource: "file", paramName: "id" })
  async generateSummary(@Param("id") id: string, @Req() req: Request) {
    const file = this.filesService.findById(id);
    if (!file) {
      throw new AppException(404, "NOT_FOUND", "File not found.");
    }

    let updated: NonNullable<ReturnType<FilesService["findById"]>>;
    try {
      updated = await this.filesService.generateSummary(id);
    } catch {
      throw new AppException(
        502,
        "SUMMARY_GENERATION_FAILED",
        "Failed to generate a summary. Ollama may be unreachable — please try again shortly.",
      );
    }

    this.auditLogService.record({
      actorUserId: req.user!.id,
      action: "file.summary_generated",
      resourceType: "file",
      resourceId: id,
      metadata: {
        originalFilename: updated.originalFilename,
        model: updated.summaryModel,
        truncated: updated.summaryTruncated,
      },
      ipAddress: req.ip,
      userAgent: req.header("user-agent"),
    });

    return { file: updated };
  }

  /** Ownership-checked soft delete (sets deleted_at; best-effort removes the physical object). */
  @Delete(":id")
  @HttpCode(204)
  @UseGuards(OwnershipGuard)
  @CheckOwnership({ resource: "file", paramName: "id" })
  async remove(@Param("id") id: string, @Req() req: Request): Promise<void> {
    // Fetched before deleting — softDelete() itself only returns a
    // boolean, and the filename is worth having in the log entry.
    const file = this.filesService.findById(id);
    const deleted = await this.filesService.softDelete(id);
    if (!deleted) {
      throw new AppException(404, "NOT_FOUND", "File not found.");
    }

    this.auditLogService.record({
      actorUserId: req.user!.id,
      action: "file.deleted",
      resourceType: "file",
      resourceId: id,
      metadata: file ? { originalFilename: file.originalFilename, notebookId: file.notebookId } : undefined,
      ipAddress: req.ip,
      userAgent: req.header("user-agent"),
    });
  }
}
