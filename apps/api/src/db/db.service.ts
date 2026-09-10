import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { AppConfigService } from "../config/app-config.service";
import * as schema from "./schema";

const SQLITE_FILE_PREFIX = "file:";

/**
 * Opens the better-sqlite3 connection and wraps it with drizzle-orm.
 *
 * The path comes from `AppConfigService`'s already-resolved, absolute
 * `DATABASE_URL` — the same one `scripts/db-env.js` resolves to for
 * `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:seed` — so the
 * running app and those CLI commands always agree on exactly which
 * .sqlite file they're using, regardless of working directory.
 */
@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  private sqlite?: Database.Database;

  /** The drizzle query builder, typed against the full schema. */
  db!: BetterSQLite3Database<typeof schema>;

  constructor(private readonly appConfig: AppConfigService) {}

  onModuleInit(): void {
    const url = this.appConfig.config.database.url;
    const fsPath = url.startsWith(SQLITE_FILE_PREFIX)
      ? url.slice(SQLITE_FILE_PREFIX.length)
      : url;

    // Running `pnpm dev` / `pnpm start` fresh, before `pnpm db:migrate`
    // has ever run, would otherwise fail here because the containing
    // directory (e.g. the shared data/ directory at the repo root)
    // doesn't exist yet.
    mkdirSync(dirname(fsPath), { recursive: true });

    this.sqlite = new Database(fsPath);
    this.sqlite.pragma("journal_mode = WAL");
    this.sqlite.pragma("foreign_keys = ON");
    this.db = drizzle(this.sqlite, { schema });
  }

  onModuleDestroy(): void {
    this.sqlite?.close();
  }
}
