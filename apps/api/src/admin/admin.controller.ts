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
import { isPlaceholderAdminPassword, isPlaceholderSessionSecret } from "../config/configuration";
import { OllamaService } from "../ollama/ollama.service";
import { createUserSchema, type CreateUserDto } from "./dto/create-user.dto";
import { updateUserSchema, type UpdateUserDto } from "./dto/update-user.dto";
import { revealSecretSchema, type RevealSecretDto } from "./dto/reveal-secret.dto";

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
 * runtime in this Phase, so there is no matching PUT).
 *
 * (System-info secret reveal feature.) `system-info` was extended to show
 * effectively the entire non-secret `.env`-derived config (Kohei wanted
 * this checkable from the admin screen without needing a terminal — a
 * real need for non-technical operators, e.g. municipal staff, who can
 * find a terminal intimidating). The two genuinely dangerous values
 * (`SESSION_SECRET`, `INITIAL_ADMIN_PASSWORD`) are the deliberate
 * exception: `system-info` reports only their placeholder/configured
 * *status*, never the raw value. `POST /api/admin/system-info/reveal-secret`
 * exists so an admin can still see either raw value on demand (a
 * reveal-behind-a-click UI, like a password field's eye icon) — every
 * call is recorded to the audit log (key name only, never the secret
 * itself) so there's a record of who viewed it and when, matching this
 * codebase's "log everything" audit philosophy.
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
   * i18n Settings / System Health screens, PLUS (as of the system-info
   * secret reveal feature) effectively every other `.env`-derived value
   * — Ollama connection/model defaults, the new generation-tuning knobs
   * (temperature, output-token caps, thinking-mode toggle), RAG defaults,
   * app URLs/ports, and the resolved database path. None of this is
   * admin-editable at runtime, so there is no matching PUT.
   *
   * `SESSION_SECRET` and `INITIAL_ADMIN_PASSWORD` are the deliberate
   * exception: only a status (`isPlaceholder`, and length for the
   * session secret) is reported here — never the raw value. Use
   * `POST /api/admin/system-info/reveal-secret` to see either raw value
   * on demand.
   */
  @Get("system-info")
  @AdminOnly()
  systemInfo() {
    const config = this.appConfig.config;
    return {
      // --- unchanged from before the system-info secret reveal feature ---
      storage: {
        driver: config.storage.driver,
        localRoot: config.storage.localRoot,
        maxUploadSizeMb: config.storage.maxUploadSizeMb,
      },
      security: {
        csrfEnabled: true,
        cookieName: config.session.cookieName,
        cookieSecure: config.session.cookieSecure,
        cookieSameSite: config.session.cookieSameSite,
        allowedExtensions: [".pdf", ".txt", ".md", ".markdown", ".docx"],
        // Additive: the existing shape (cookieName/cookieSecure/
        // cookieSameSite/allowedExtensions) is untouched — these are
        // new keys alongside them, not a replacement.
        csrfCookieName: config.csrf.cookieName,
        csrfHeaderName: config.csrf.headerName,
      },
      i18n: {
        defaultLocale: config.i18n.defaultLocale,
        supportedLocales: config.i18n.supportedLocales,
      },
      system: {
        nodeEnv: config.app.nodeEnv,
        uptimeSeconds: Math.round(process.uptime()),
      },
      // --- new sections (system-info secret reveal feature) ---
      app: {
        appBaseUrl: config.app.appBaseUrl,
        apiBaseUrl: config.app.apiBaseUrl,
        portWeb: config.app.portWeb,
        portApi: config.app.portApi,
      },
      database: {
        url: config.database.url,
      },
      ollama: {
        baseUrl: config.ollama.baseUrl,
        defaultGenerationModel: config.ollama.defaultGenerationModel,
        defaultEmbeddingModel: config.ollama.defaultEmbeddingModel,
        generationTemperature: config.ollama.generationTemperature,
        hydeMaxOutputTokens: config.ollama.hydeMaxOutputTokens,
        answerMaxOutputTokens: config.ollama.answerMaxOutputTokens,
        disableThinking: config.ollama.disableThinking,
      },
      rag: {
        defaultStrategy: config.rag.defaultStrategy,
        topK: config.rag.topK,
        similarityThreshold: config.rag.similarityThreshold,
        allowNotebookOverride: config.rag.allowNotebookOverride,
        showRetrievalDebug: config.rag.showRetrievalDebug,
        allowHydeDocumentPreview: config.rag.allowHydeDocumentPreview,
      },
      // A new top-level key — "session" wasn't used by the previous
      // response shape, so this can't collide with anything an
      // existing screen already reads.
      session: {
        secretStatus: {
          isPlaceholder: isPlaceholderSessionSecret(config.session.secret),
          length: config.session.secret.length,
        },
      },
      initialAdmin: {
        email: config.initialAdmin.email,
        locale: config.initialAdmin.locale,
        passwordStatus: {
          isPlaceholder: isPlaceholderAdminPassword(config.initialAdmin.password),
        },
      },
    };
  }

  /**
   * (System-info secret reveal feature.) Returns the raw value of
   * exactly one secret, chosen by `key` — never both, and never as part
   * of the general `system-info` payload. Every call is audit-logged
   * (the key name only; the value itself is never written to the audit
   * log) so there is a record of who revealed which secret, when.
   */
  @Post("system-info/reveal-secret")
  @HttpCode(200)
  @AdminOnly()
  revealSecret(@Body(new ZodValidationPipe(revealSecretSchema)) body: RevealSecretDto, @Req() req: Request) {
    const value =
      body.key === "sessionSecret"
        ? this.appConfig.config.session.secret
        : this.appConfig.config.initialAdmin.password;

    this.auditLogService.record({
      actorUserId: req.user!.id,
      action: "admin.secret_revealed",
      resourceType: "config_secret",
      resourceId: body.key,
      ipAddress: req.ip,
      userAgent: req.header("user-agent"),
    });

    return { key: body.key, value };
  }
}
