import { Injectable } from "@nestjs/common";
import { DbService } from "../db/db.service";
import { auditLogs } from "../db/schema";

export interface AuditLogEntry {
  /** Who performed the action. `null`/omitted for unauthenticated attempts (e.g. a failed login). */
  actorUserId?: string | null;
  /** Machine-readable action name, e.g. "auth.login.success", "authz.role_denied". */
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  /** Arbitrary structured detail; stored as JSON text. Never include secrets (passwords, tokens). */
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Foundation for audit logging (SDD section 16.9).
 *
 * Phase 4 wires this into the places that already exist and are
 * security-relevant: login (success/failure), logout, and authorization
 * denials (role and ownership checks). The full event catalog (file
 * upload/delete, notebook create/delete, admin setting changes, ...) is
 * Phase 15's job, once those actions exist to log — this service is the
 * reusable foundation later phases write into rather than
 * reimplementing.
 *
 * Writes are best-effort: a logging failure must never break the
 * request it's describing, so failures are caught and printed here
 * rather than propagated to the caller.
 */
@Injectable()
export class AuditLogService {
  constructor(private readonly dbService: DbService) {}

  record(entry: AuditLogEntry): void {
    try {
      this.dbService.db
        .insert(auditLogs)
        .values({
          actorUserId: entry.actorUserId ?? null,
          action: entry.action,
          resourceType: entry.resourceType ?? null,
          resourceId: entry.resourceId ?? null,
          metadataJson: entry.metadata ? JSON.stringify(entry.metadata) : null,
          ipAddress: entry.ipAddress ?? null,
          userAgent: entry.userAgent ?? null,
        })
        .run();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`[audit-log] Failed to record "${entry.action}":`, error);
    }
  }
}
