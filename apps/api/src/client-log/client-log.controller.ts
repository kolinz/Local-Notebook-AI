import { Body, Controller, HttpCode, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { AuditLogService } from "../audit-log/audit-log.service";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { reportClientIssueSchema, type ReportClientIssueDto } from "./dto/report-client-issue.dto";

/**
 * Some problems only exist in the browser: a `router.push()` that never
 * actually navigates, a client-side exception that gets swallowed by a
 * try/catch, etc. Server-side audit logs (SDD 16.9) can't see those on
 * their own — the server did its job correctly and has nothing to
 * report. This endpoint lets the frontend explicitly say "something
 * looked wrong here" so it lands in the exact same `audit_logs` table
 * (and therefore the same admin "Audit Logs" screen, Phase 14) as every
 * server-side event, instead of being visible only in a browser console
 * that closes the moment the tab does.
 *
 * Deliberately NOT `@AdminOnly()` or behind `SessionAuthGuard` — a
 * logged-out user on the login page (exactly the scenario that
 * motivated this) still needs to be able to report an issue. `req.user`
 * (set by `SessionMiddleware` for every request, session or not) is
 * used opportunistically when present; `actorUserId` is left `null`
 * otherwise, same as any other unauthenticated audit event (e.g.
 * `auth.login.failure`).
 *
 * Still goes through the global `CsrfGuard` like every other POST in
 * this app — no route-level exemption (this codebase's own stated
 * design principle for that guard) — so the frontend must have a CSRF
 * token first, exactly as for any other state-changing call.
 */
@Controller("client-log")
export class ClientLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Post()
  @HttpCode(204)
  report(@Body(new ZodValidationPipe(reportClientIssueSchema)) body: ReportClientIssueDto, @Req() req: Request): void {
    this.auditLogService.record({
      actorUserId: req.user?.id ?? null,
      action: `client.${body.level}`,
      resourceType: "client_report",
      metadata: { message: body.message, context: body.context, path: req.header("referer") },
      ipAddress: req.ip,
      userAgent: req.header("user-agent"),
    });
  }
}
