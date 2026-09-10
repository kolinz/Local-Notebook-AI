import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { AppException } from "../app-exception";
import { AuditLogService } from "../../audit-log/audit-log.service";
import { ROLES_KEY } from "./roles.decorator";

/**
 * Enforces `@Roles(...)` metadata on a route handler. Requires
 * `SessionAuthGuard` to have already run (so `request.user` is set) —
 * apply both together, e.g. via `@AdminOnly()` (./admin-only.decorator.ts).
 *
 * A route with no `@Roles()` metadata is allowed through unconditionally
 * (role-checking is opt-in per route, matching SDD section 10 — most
 * routes are for any authenticated user, not admin-restricted).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditLogService: AuditLogService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.get<string[] | undefined>(ROLES_KEY, context.getHandler());
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;

    if (!user || !requiredRoles.includes(user.role)) {
      this.auditLogService.record({
        actorUserId: user?.id ?? null,
        action: "authz.role_denied",
        resourceType: "route",
        resourceId: `${request.method} ${request.path}`,
        metadata: { requiredRoles, actualRole: user?.role ?? null },
        ipAddress: request.ip,
        userAgent: request.header("user-agent"),
      });
      throw new AppException(403, "FORBIDDEN", "You do not have permission to perform this action.");
    }

    return true;
  }
}
