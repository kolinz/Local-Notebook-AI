import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { DbService } from "../db/db.service";
import { users } from "../db/schema";
import { AppException } from "../common/app-exception";
import { AuditLogService } from "../audit-log/audit-log.service";
import { SessionService, type SessionUser } from "./session.service";

export interface LoginResult {
  token: string;
  maxAgeMs: number;
  user: SessionUser;
}

export interface RequestContext {
  ipAddress?: string;
  userAgent?: string;
}

const BCRYPT_SALT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly dbService: DbService,
    private readonly sessionService: SessionService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async login(email: string, password: string, context: RequestContext = {}): Promise<LoginResult> {
    const row = this.dbService.db.select().from(users).where(eq(users.email, email)).get();

    // The same generic error for "no such user", "wrong password", and
    // "account disabled" — the response must never reveal which case it
    // was (this Phase's requirement; also SDD 16.1's spirit of not
    // leaking account existence/state to an unauthenticated caller).
    // The audit log (server-side only, never returned to the caller)
    // does record which case it was, for admin security monitoring.
    const invalidCredentials = () =>
      new AppException(401, "INVALID_CREDENTIALS", "Invalid email or password.");

    if (!row) {
      // Still run a bcrypt comparison against a dummy hash so a
      // nonexistent-email request takes roughly the same time as a
      // wrong-password one, avoiding a timing side-channel that could
      // otherwise be used to enumerate valid email addresses.
      await bcrypt.compare(password, DUMMY_HASH);
      this.auditLogService.record({
        action: "auth.login.failure",
        metadata: { email, reason: "no_such_user" },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
      throw invalidCredentials();
    }
    if (!row.isActive) {
      await bcrypt.compare(password, row.passwordHash);
      this.auditLogService.record({
        actorUserId: row.id,
        action: "auth.login.failure",
        metadata: { email, reason: "inactive" },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
      throw invalidCredentials();
    }

    const passwordOk = await bcrypt.compare(password, row.passwordHash);
    if (!passwordOk) {
      this.auditLogService.record({
        actorUserId: row.id,
        action: "auth.login.failure",
        metadata: { email, reason: "bad_password" },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
      throw invalidCredentials();
    }

    const { token, expiresAt } = this.sessionService.createSession(row.id);

    // Best-effort bookkeeping; not critical to the login flow itself.
    this.dbService.db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, row.id))
      .run();

    this.auditLogService.record({
      actorUserId: row.id,
      action: "auth.login.success",
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    const user: SessionUser = {
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      role: row.role,
      locale: row.locale,
      isActive: row.isActive,
      mustChangePassword: row.mustChangePassword,
    };

    return { token, maxAgeMs: expiresAt.getTime() - Date.now(), user };
  }

  logout(token: string, actorUserId: string, context: RequestContext = {}): void {
    this.sessionService.destroySession(token);
    this.auditLogService.record({
      actorUserId,
      action: "auth.logout",
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }

  /**
   * Verifies `currentPassword` before setting `newPassword`, and clears
   * `mustChangePassword` on success — this is the API the placeholder
   * `/change-password` page was always meant to be backed by (see that
   * page's own header comment: "Phase 5 adds translation only").
   * Requiring the current password (rather than trusting the session
   * alone) matches ordinary practice for a security-sensitive action
   * even when the session is already authenticated — it also means a
   * hijacked, still-valid session cookie can't silently lock the real
   * owner out by changing their password.
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string, context: RequestContext = {}): Promise<void> {
    const row = this.dbService.db.select().from(users).where(eq(users.id, userId)).get();
    if (!row) {
      // Shouldn't happen for an authenticated session, but fail closed.
      throw new AppException(404, "NOT_FOUND", "User not found.");
    }

    const currentOk = await bcrypt.compare(currentPassword, row.passwordHash);
    if (!currentOk) {
      this.auditLogService.record({
        actorUserId: userId,
        action: "auth.change_password.failure",
        metadata: { reason: "bad_current_password" },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
      throw new AppException(401, "INVALID_CREDENTIALS", "Current password is incorrect.");
    }

    const newPasswordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);

    this.dbService.db
      .update(users)
      .set({ passwordHash: newPasswordHash, mustChangePassword: false, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .run();

    this.auditLogService.record({
      actorUserId: userId,
      action: "auth.change_password.success",
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }
}

/**
 * A syntactically valid bcrypt hash of an unrelated, unguessable value.
 * Used only to burn roughly the same CPU time as a real comparison when
 * the looked-up user doesn't exist (see the timing note above) — it is
 * never compared against anything meaningful and matches no real
 * password.
 */
const DUMMY_HASH = "$2b$12$CwTycUXWue0Thq9StjUM0uJ8xW5X.qKz9k2E7GZaHUZjPOo9uWfqu";
