import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import cookieParser from "cookie-parser";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { ConfigModule } from "./config/config.module";
import { AppConfigService } from "./config/app-config.service";
import { DbModule } from "./db/db.module";
import { AuthModule } from "./auth/auth.module";
import { SessionMiddleware } from "./auth/middleware/session.middleware";
import { CsrfGuard } from "./auth/guards/csrf.guard";
import { AuditLogModule } from "./audit-log/audit-log.module";
import { NotebooksModule } from "./notebooks/notebooks.module";
import { FilesModule } from "./files/files.module";
import { AdminModule } from "./admin/admin.module";
import { SearchModule } from "./search/search.module";
import { RagModule } from "./rag/rag.module";
import { ClientLogModule } from "./client-log/client-log.module";

/**
 * Root module.
 *
 * - ConfigModule (Phase 1.5) loads and validates `.env` at startup and
 *   exposes a typed `AppConfigService` app-wide.
 * - DbModule (Phase 2) exposes `DbService` (SQLite persistence via
 *   drizzle-orm + better-sqlite3) app-wide.
 * - AuthModule (Phase 3) implements login/logout/me/csrf. SessionMiddleware
 *   (attaches req.user for every request) and CsrfGuard (rejects
 *   state-changing requests without a valid CSRF token, app-wide) are
 *   registered here rather than in AuthModule itself, since they apply
 *   globally rather than just to auth's own routes.
 * - AuditLogModule (Phase 4) exposes `AuditLogService` app-wide — the
 *   foundation for SDD section 16.9's audit log, wired into login/
 *   logout and authorization denials so far.
 * - NotebooksModule / FilesModule (Phase 4, minimal subset; extended in
 *   Phase 6/7) and AdminModule (Phase 4, minimal subset) exist here to
 *   exercise `RolesGuard` / `OwnershipGuard` (see
 *   src/common/authorization/) against real resources.
 * - DocumentProcessingModule (Phase 8) is imported by FilesModule (not
 *   listed directly here) — it extracts text, builds
 *   `document_chunks`, and (Phase 10) generates embeddings,
 *   synchronously right after a file upload completes.
 * - OllamaModule / ModelsModule (Phase 9) are imported by AdminModule
 *   (not listed directly here) — Ollama connection status and the
 *   model registry are admin-only concerns for now.
 * - EmbeddingsModule (Phase 10) is imported by DocumentProcessingModule
 *   and SearchModule (not listed directly here) — it's where the
 *   default-embedding-model resolution logic lives, shared by both the
 *   "store a chunk's vector" and "embed a search query" code paths so
 *   they always agree on which model produced their vectors.
 * - SearchModule (Phase 10) exposes the retrieval-only
 *   `POST /api/notebooks/:notebookId/search` endpoint, ownership-
 *   checked like every other notebook-scoped route.
 * - RagModule (Phase 11/12) exposes `POST /api/notebooks/:notebookId/chat`
 *   (Standard RAG in Phase 11, extended to also support HyDE RAG via a
 *   `RagStrategy` interface in Phase 12) and the admin-only
 *   `GET/PUT /api/admin/rag/settings` for the global default strategy
 *   and the HyDE prompt template. Imports SystemSettingsModule (not
 *   listed directly here) — the first real user of the
 *   `system_settings` table.
 *
 * From Phase 13 onward this will grow to import further feature
 * modules such as i18n and full RAG settings UI wiring (per SDD
 * section 6.1). None of those exist yet.
 */
@Module({
  imports: [
    ConfigModule,
    DbModule,
    AuditLogModule,
    AuthModule,
    NotebooksModule,
    FilesModule,
    AdminModule,
    SearchModule,
    RagModule,
    ClientLogModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    SessionMiddleware,
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
})
export class AppModule implements NestModule {
  constructor(private readonly appConfig: AppConfigService) {}

  configure(consumer: MiddlewareConsumer): void {
    // cookie-parser must run before SessionMiddleware on every request,
    // so both are registered together here (see file header note on why
    // this isn't done via a plain `app.use()` in main.ts: ordering
    // relative to Nest's own module-configured middleware would not be
    // guaranteed there).
    consumer
      .apply(cookieParser(this.appConfig.config.session.secret), SessionMiddleware)
      .forRoutes("*");
  }
}
