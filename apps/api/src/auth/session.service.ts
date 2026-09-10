import { Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { DbService } from "../db/db.service";
import { sessions, users } from "../db/schema";

/** Sessions last 7 days from creation (not sliding/renewed on activity). */
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  locale: string;
  isActive: boolean;
  mustChangePassword: boolean;
}

/**
 * Server-side session store. The session cookie only ever carries an
 * opaque random token (this service's primary key) — no user data is
 * embedded client-side, so a session can be immediately and completely
 * revoked server-side (e.g. on logout, or by an admin deactivating the
 * account) without waiting for a client-held token to expire on its own.
 */
@Injectable()
export class SessionService {
  constructor(private readonly dbService: DbService) {}

  private get db() {
    return this.dbService.db;
  }

  getMaxAgeMs(): number {
    return SESSION_MAX_AGE_MS;
  }

  createSession(userId: string): { token: string; expiresAt: Date } {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_MS);
    this.db.insert(sessions).values({ id: token, userId, expiresAt }).run();
    return { token, expiresAt };
  }

  /**
   * Resolves a session token to its user, or `null` if the token is
   * missing, unknown, or expired. Expired sessions are opportunistically
   * deleted here rather than requiring a separate cleanup job.
   */
  getUserForToken(token: string): SessionUser | null {
    const row = this.db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        role: users.role,
        locale: users.locale,
        isActive: users.isActive,
        mustChangePassword: users.mustChangePassword,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(eq(sessions.id, token))
      .get();

    if (!row) return null;

    if (row.expiresAt.getTime() < Date.now()) {
      this.db.delete(sessions).where(eq(sessions.id, token)).run();
      return null;
    }

    const { expiresAt: _expiresAt, ...user } = row;
    return user;
  }

  destroySession(token: string): void {
    this.db.delete(sessions).where(eq(sessions.id, token)).run();
  }
}
