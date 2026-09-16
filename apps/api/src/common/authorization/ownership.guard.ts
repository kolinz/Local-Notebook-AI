import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { DbService } from "../../db/db.service";
import { files, notebooks } from "../../db/schema";
import { AppException } from "../app-exception";
import { AuditLogService } from "../../audit-log/audit-log.service";
import { OWNERSHIP_KEY, type OwnedResourceType, type OwnershipOptions } from "./check-ownership.decorator";

/**
 * Enforces `@CheckOwnership(...)` metadata: the resource identified by
 * the named route param must belong to `request.user`, or the request
 * is rejected with a uniform 403 — the same response whether the
 * resource belongs to someone else OR doesn't exist at all, so a
 * non-owner can't use this endpoint to probe which ids are valid (SDD
 * 20.3 / this Phase's "don't leak other users' resources" requirement).
 *
 * Deliberately has NO admin bypass: per SDD section 13.6, even
 * administrators are scoped to resources they own on these
 * general-purpose endpoints. Cross-user visibility for admins is
 * provided through separate `/api/admin/...` endpoints instead (e.g.
 * the admin file listing planned for Phase 14), not by widening what
 * this guard allows.
 *
 * Requires `SessionAuthGuard` to have already run, so `request.user` is
 * set — apply both together: `@UseGuards(SessionAuthGuard, OwnershipGuard)`.
 *
 * BUGFIX (found while auditing the delete-and-reupload workflow for
 * Phase 19 — see files.service.ts's own soft-delete doc comment for the
 * house rule this restores): `resolveOwnerUserId` previously ignored
 * `deleted_at` entirely for both "notebook" and "file", so a
 * soft-deleted resource's owner was still resolved normally and the
 * ownership check still passed. That's harmless on routes whose
 * downstream service ALSO excludes soft-deleted rows (e.g.
 * `FilesService.findById()` already does, so a deleted file just ends
 * up as a 404 either way) — but on routes with no such second check
 * (e.g. `RagController`'s chat/search path, which never re-checks a
 * notebook's `deleted_at` once past this guard), a soft-deleted
 * notebook remained fully usable for chat and search. Treating a
 * soft-deleted resource as if it doesn't exist — consistently, at the
 * guard itself, for every resource type it protects — is both simpler
 * to reason about and matches this codebase's existing rule that a
 * deleted file "looks gone, even to its own owner".
 */
@Injectable()
export class OwnershipGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    // IMPORTANT: checks both the handler (method) AND the class here.
    // `@CheckOwnership(...)` applied at the class level (e.g.
    // NotebookFilesController, SearchController — one declaration
    // covering every route in that controller) stores its metadata on
    // the class constructor, not on any individual method; a version
    // of this guard that only called
    // `this.reflector.get(OWNERSHIP_KEY, context.getHandler())` would
    // silently find nothing for a class-level declaration and return
    // `true` unconditionally — i.e. skip the ownership check entirely
    // for every route in that controller. `getAllAndOverride` checks
    // the handler first, then falls back to the class, so both
    // placements work correctly.
    const options = this.reflector.getAllAndOverride<OwnershipOptions | undefined>(OWNERSHIP_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!options) {
      // No ownership requirement declared on this handler or class — nothing to check.
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const resourceId = request.params[options.paramName];

    if (!resourceId) {
      throw new AppException(400, "BAD_REQUEST", `Missing route parameter: ${options.paramName}`);
    }

    const ownerUserId = this.resolveOwnerUserId(options.resource, resourceId);
    const actorId = request.user?.id;

    if (ownerUserId === null || ownerUserId !== actorId) {
      this.auditLogService.record({
        actorUserId: actorId ?? null,
        action: "authz.ownership_denied",
        resourceType: options.resource,
        resourceId,
        metadata: { exists: ownerUserId !== null },
        ipAddress: request.ip,
        userAgent: request.header("user-agent"),
      });
      throw new AppException(403, "FORBIDDEN", "You do not have permission to access this resource.");
    }

    return true;
  }

  /**
   * Returns the resource's owner_user_id, or `null` if the resource
   * doesn't exist — and, as of the bugfix above, a soft-deleted
   * resource is treated identically to a nonexistent one here (both
   * branches now filter on `isNull(deletedAt)`).
   */
  private resolveOwnerUserId(resource: OwnedResourceType, id: string): string | null {
    if (resource === "notebook") {
      const row = this.dbService.db
        .select({ ownerUserId: notebooks.ownerUserId })
        .from(notebooks)
        .where(and(eq(notebooks.id, id), isNull(notebooks.deletedAt)))
        .get();
      return row?.ownerUserId ?? null;
    }

    if (resource === "file") {
      const row = this.dbService.db
        .select({ ownerUserId: files.ownerUserId })
        .from(files)
        .where(and(eq(files.id, id), isNull(files.deletedAt)))
        .get();
      return row?.ownerUserId ?? null;
    }

    return null;
  }
}
