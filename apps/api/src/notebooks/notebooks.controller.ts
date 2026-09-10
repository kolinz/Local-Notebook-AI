import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import type { Request } from "express";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { OwnershipGuard } from "../common/authorization/ownership.guard";
import { CheckOwnership } from "../common/authorization/check-ownership.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AppException } from "../common/app-exception";
import { AuditLogService } from "../audit-log/audit-log.service";
import { createNotebookSchema, type CreateNotebookDto } from "./dto/create-notebook.dto";
import { updateNotebookSchema, type UpdateNotebookDto } from "./dto/update-notebook.dto";
import { NotebooksService } from "./notebooks.service";

/**
 * Phase 6: full CRUD for the caller's own notebooks. Extends the
 * minimal Phase 4 implementation (create / list-own / get-one, built
 * to exercise `OwnershipGuard`) with update and soft-delete, rather
 * than replacing it.
 *
 * Ownership is enforced identically on every id-scoped route
 * (GET/PUT/DELETE :id) via the same `OwnershipGuard` — including for
 * admins, per SDD section 13.6: an admin's cross-user visibility comes
 * from separate `/api/admin/...` endpoints (Phase 14), not from
 * bypassing this check.
 */
@Controller("notebooks")
@UseGuards(SessionAuthGuard)
export class NotebooksController {
  constructor(
    private readonly notebooksService: NotebooksService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Post()
  @HttpCode(201)
  @UsePipes(new ZodValidationPipe(createNotebookSchema))
  create(@Req() req: Request, @Body() body: CreateNotebookDto) {
    const notebook = this.notebooksService.create(req.user!.id, body);

    this.auditLogService.record({
      actorUserId: req.user!.id,
      action: "notebook.created",
      resourceType: "notebook",
      resourceId: notebook.id,
      metadata: { title: notebook.title },
      ipAddress: req.ip,
      userAgent: req.header("user-agent"),
    });

    return { notebook };
  }

  /** Lists only the caller's own, non-deleted notebooks — never another user's. */
  @Get()
  list(@Req() req: Request) {
    return { notebooks: this.notebooksService.listForOwner(req.user!.id) };
  }

  /**
   * Ownership-checked: a caller specifying another user's notebook id
   * gets a 403, not the notebook (see OwnershipGuard).
   */
  @Get(":id")
  @UseGuards(OwnershipGuard)
  @CheckOwnership({ resource: "notebook", paramName: "id" })
  getOne(@Param("id") id: string) {
    const notebook = this.notebooksService.findById(id);
    if (!notebook) {
      // A deleted notebook (owner requesting it) or a race with a
      // concurrent delete between the guard and this line — either
      // way, "not found" rather than "forbidden" is the right answer
      // for the resource's own owner.
      throw new AppException(404, "NOT_FOUND", "Notebook not found.");
    }
    return { notebook };
  }

  /**
   * Ownership-checked update. At least one of title/description is
   * required. The Zod pipe is applied to the `@Body()` parameter
   * specifically (not via a method-level `@UsePipes()`), since a
   * method-level pipe would also run on `@Param("id")` — a plain
   * string — and fail validation against an object schema.
   */
  @Put(":id")
  @UseGuards(OwnershipGuard)
  @CheckOwnership({ resource: "notebook", paramName: "id" })
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateNotebookSchema)) body: UpdateNotebookDto,
  ) {
    const notebook = this.notebooksService.update(id, body);
    if (!notebook) {
      throw new AppException(404, "NOT_FOUND", "Notebook not found.");
    }
    return { notebook };
  }

  /** Ownership-checked soft delete (sets deleted_at; the row itself is kept). */
  @Delete(":id")
  @HttpCode(204)
  @UseGuards(OwnershipGuard)
  @CheckOwnership({ resource: "notebook", paramName: "id" })
  remove(@Param("id") id: string, @Req() req: Request): void {
    const deleted = this.notebooksService.softDelete(id);
    if (!deleted) {
      throw new AppException(404, "NOT_FOUND", "Notebook not found.");
    }

    this.auditLogService.record({
      actorUserId: req.user!.id,
      action: "notebook.deleted",
      resourceType: "notebook",
      resourceId: id,
      ipAddress: req.ip,
      userAgent: req.header("user-agent"),
    });
  }
}
