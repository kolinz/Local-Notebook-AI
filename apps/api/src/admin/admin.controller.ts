import { Body, Controller, Get, HttpCode, Param, Post, Put, Req, UsePipes } from "@nestjs/common";
import type { Request } from "express";
import { desc, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { AdminOnly } from "../common/authorization/admin-only.decorator";
import { AppException } from "../common/app-exception";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AuditLogService } from "../audit-log/audit-log.service";
import { DbService } from "../db/db.service";
import { auditLogs, files, notebooks, ragRuns, users } from "../db/schema";
import { AppConfigService } from "../config/app-config.service";
import { OllamaService } from "../ollama/ollama.service";
import { createUserSchema, type CreateUserDto } from "./dto/create-user.dto";
import { updateUserSchema, type UpdateUserDto } from "./dto/update-user.dto";

const BCRYPT_SALT_ROUNDS = 12;
const AUDIT_LOG_PAGE_SIZE = 200;

/**
 * Phase 4 note (kept from that Phase, still accurate): `GET /api/admin/users`
 * and `POST /api/admin/users` are a real (if minimal) subset of the admin
 * API planned in SDD sections 10.2 / 15.5.
 *
 * Phase 14 extends this controller with the rest of the admin console's
 * backend surface: user role/active-status updates, a cross-user file
 * listing (admin-only — general users never see this, and it does not
 * replace or weaken `OwnershipGuard` on the general-purpose file routes),
 * dashboard counts, audit log listing, and a read-only system-info bundle
 * (storage/security/i18n settings the Storage/Security/i18n Settings and
 * System Health screens display — none of these are admin-editable at
 * runtime, so there's no corresponding PUT).
 */
@Controller("admin")
export class AdminController {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
    private readonly appConfig: AppConfigService,
    private readonly ollamaService: OllamaService,
  ) {}

  @Get("users")
  @AdminOnly()
  listUsers() {
    const rows = this.dbService.db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        role: users.role,
        locale: users.locale,
        isActive: users.isActive,
        mustChangePassword: users.mustChangePassword,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
        // passwordHash is deliberately never selected here.
      })
      .from(users)
      .all();

    return { users: rows };
  }

  @Post("users")
  @HttpCode(201)
  @AdminOnly()
  @UsePipes(new ZodValidationPipe(createUserSchema))
  createUser(@Body() body: CreateUserDto, @Req() req: Request) {
    const existing = this.dbService.db.select({ id: users.id }).from(users).where(eq(users.email, body.email)).get();
    if (existing) {
      throw new AppException(409, "CONFLICT", "A user with this email already exists.");
    }

    const passwordHash = bcrypt.hashSync(body.password, BCRYPT_SALT_ROUNDS);

    const [row] = this.dbService.db
      .insert(users)
      .values({
        email: body.email,
        passwordHash,
        displayName: body.displayName,
        role: body.role,
        locale: body.locale,
        isActive: true,
        // New accounts must set their own password on first login,
        // matching the initial admin account's behavior (SDD 16.1).
        mustChangePassword: true,
      })
      .returning()
      .all();

    this.auditLogService.record({
      actorUserId: req.user!.id,
      action: "admin.user.created",
      resourceType: "user",
      resourceId: row.id,
      metadata: { email: row.email, role: row.role },
      ipAddress: req.ip,
      userAgent: req.header("user-agent"),
    });

    return {
      user: {
        id: row.id,
        email: row.email,
        displayName: row.displayName,
        role: row.role,
        locale: row.locale,
        isActive: row.isActive,
        mustChangePassword: row.mustChangePassword,
        createdAt: row.createdAt,
      },
    };
  }

  /**
   * Updates a user's role and/or active status (Phase 14's "Users" screen
   * — role change, enable/disable). Deactivating a user only prevents
   * *future* logins/session creation; it does not itself revoke any
   * session already issued (SessionService's own expiry — 7 days — still
   * governs those). Recorded to the audit log either way.
   */
  @Put("users/:id")
  @AdminOnly()
  updateUser(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) body: UpdateUserDto,
    @Req() req: Request,
  ) {
    const existing = this.dbService.db.select({ id: users.id }).from(users).where(eq(users.id, id)).get();
    if (!existing) {
      throw new AppException(404, "NOT_FOUND", "User not found.");
    }

    const patch: { role?: "admin" | "user"; isActive?: boolean; updatedAt: Date } = { updatedAt: new Date() };
    if (body.role !== undefined) patch.role = body.role;
    if (body.isActive !== undefined) patch.isActive = body.isActive;

    const [row] = this.dbService.db.update(users).set(patch).where(eq(users.id, id)).returning().all();

    this.auditLogService.record({
      actorUserId: req.user!.id,
      action: "admin.user.updated",
      resourceType: "user",
      resourceId: id,
      metadata: { role: body.role, isActive: body.isActive },
      ipAddress: req.ip,
      userAgent: req.header("user-agent"),
    });

    return {
      user: {
        id: row.id,
        email: row.email,
        displayName: row.displayName,
        role: row.role,
        locale: row.locale,
        isActive: row.isActive,
        mustChangePassword: row.mustChangePassword,
        createdAt: row.createdAt,
        lastLoginAt: row.lastLoginAt,
      },
    };
  }

  /**
   * Cross-user file listing for the admin "Files" screen — joined with
   * `users` (owner email) and `notebooks` (title) for display. This is
   * intentionally the ONLY place a file's owner_user_id is bypassed in
   * this codebase, and only for admins, only for read access, matching
   * the design already described in `OwnershipGuard`'s / VectorSearchService's
   * own header comments ("cross-user visibility for admins comes from a
   * separate /api/admin/... endpoint, never from widening a general-
   * purpose one").
   */
  @Get("files")
  @AdminOnly()
  listAllFiles() {
    const rows = this.dbService.db
      .select({
        id: files.id,
        originalFilename: files.originalFilename,
        mimeType: files.mimeType,
        sizeBytes: files.sizeBytes,
        status: files.status,
        ownerEmail: users.email,
        notebookTitle: notebooks.title,
        createdAt: files.createdAt,
      })
      .from(files)
      .innerJoin(users, eq(users.id, files.ownerUserId))
      .innerJoin(notebooks, eq(notebooks.id, files.notebookId))
      .orderBy(desc(files.createdAt))
      .all();

    return { files: rows };
  }

  /** Dashboard counts + live Ollama connection status. */
  @Get("dashboard")
  @AdminOnly()
  async dashboard() {
    const ollamaStatus = await this.ollamaService.checkStatus();

    return {
      userCount: this.dbService.db.select().from(users).all().length,
      notebookCount: this.dbService.db.select().from(notebooks).all().length,
      fileCount: this.dbService.db.select().from(files).all().length,
      ragRunCount: this.dbService.db.select().from(ragRuns).all().length,
      ollamaStatus,
    };
  }

  /**
   * Most recent audit log entries, newest first (capped at
   * `AUDIT_LOG_PAGE_SIZE` — this Phase's "Audit Logs" screen doesn't yet
   * need pagination beyond a single reasonably-sized page).
   */
  @Get("audit-logs")
  @AdminOnly()
  listAuditLogs() {
    const rows = this.dbService.db
      .select({
        id: auditLogs.id,
        actorUserId: auditLogs.actorUserId,
        actorEmail: users.email,
        action: auditLogs.action,
        resourceType: auditLogs.resourceType,
        resourceId: auditLogs.resourceId,
        metadataJson: auditLogs.metadataJson,
        ipAddress: auditLogs.ipAddress,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorUserId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(AUDIT_LOG_PAGE_SIZE)
      .all();

    return { logs: rows };
  }

  /**
   * Read-only bundle backing the Storage Settings / Security Settings /
   * i18n Settings / System Health screens. Every value here comes
   * straight from `.env` (via `AppConfigService`) — none of it is
   * admin-editable at runtime in this Phase, so there is no matching PUT.
   * Secrets (SESSION_SECRET, DB path internals) are deliberately never
   * included.
   */
  @Get("system-info")
  @AdminOnly()
  systemInfo() {
    return {
      storage: {
        driver: this.appConfig.config.storage.driver,
        localRoot: this.appConfig.config.storage.localRoot,
        maxUploadSizeMb: this.appConfig.config.storage.maxUploadSizeMb,
      },
      security: {
        csrfEnabled: true,
        cookieName: this.appConfig.config.session.cookieName,
        cookieSecure: this.appConfig.config.session.cookieSecure,
        cookieSameSite: this.appConfig.config.session.cookieSameSite,
        allowedExtensions: [".pdf", ".txt", ".md", ".markdown", ".docx"],
      },
      i18n: {
        defaultLocale: this.appConfig.config.i18n.defaultLocale,
        supportedLocales: this.appConfig.config.i18n.supportedLocales,
      },
      system: {
        nodeEnv: this.appConfig.config.app.nodeEnv,
        uptimeSeconds: Math.round(process.uptime()),
      },
    };
  }
}
