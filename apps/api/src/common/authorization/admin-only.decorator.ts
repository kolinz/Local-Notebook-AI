import { applyDecorators, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../auth/guards/session-auth.guard";
import { RolesGuard } from "./roles.guard";
import { Roles } from "./roles.decorator";

/**
 * Shorthand for `@UseGuards(SessionAuthGuard, RolesGuard) @Roles("admin")`.
 * Apply to any route that only administrators may call — e.g.
 * `GET /api/admin/users`. A non-admin (including an unauthenticated
 * caller) gets the same uniform 403 `FORBIDDEN` response either way.
 */
export function AdminOnly(): ReturnType<typeof applyDecorators> {
  return applyDecorators(UseGuards(SessionAuthGuard, RolesGuard), Roles("admin"));
}
