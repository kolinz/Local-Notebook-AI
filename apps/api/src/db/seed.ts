/**
 * src/db/seed.ts
 *
 * Creates the initial administrator account from INITIAL_ADMIN_EMAIL /
 * INITIAL_ADMIN_PASSWORD / INITIAL_ADMIN_LOCALE (see .env.example).
 *
 * Run via `pnpm db:seed`, which wraps this with scripts/db-env.js so the
 * repo-root .env is loaded and DATABASE_URL is resolved consistently
 * with the running app.
 *
 * Idempotent: if a user with INITIAL_ADMIN_EMAIL already exists, seeding
 * is skipped rather than erroring or creating a duplicate.
 *
 * Password hashing uses bcryptjs (pure JavaScript, no native compilation
 * step for the hashing itself) rather than native bcrypt/argon2 bindings
 * — this project targets plain `npm`/`pnpm` script execution across
 * whatever machines students, faculty, and IT staff happen to have (no
 * Docker requirement, no guaranteed build toolchain for password
 * hashing specifically), so avoiding a native addon here removes one
 * common source of "works on my machine" install failures.
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getValidatedConfig } from "../config/configuration";
import { ConfigValidationError } from "../config/config-error";
import { users } from "./schema";

const SQLITE_FILE_PREFIX = "file:";
const BCRYPT_SALT_ROUNDS = 12;

function toFsPath(databaseUrl: string): string {
  return databaseUrl.startsWith(SQLITE_FILE_PREFIX)
    ? databaseUrl.slice(SQLITE_FILE_PREFIX.length)
    : databaseUrl;
}

async function main(): Promise<void> {
  let config;
  try {
    config = getValidatedConfig(process.env);
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }

  const fsPath = toFsPath(config.database.url);
  mkdirSync(dirname(fsPath), { recursive: true });
  const sqlite = new Database(fsPath);

  try {
    sqlite.pragma("foreign_keys = ON");
    const db = drizzle(sqlite);

    const { email, password, locale } = config.initialAdmin;

    const existing = db.select().from(users).where(eq(users.email, email)).get();
    if (existing) {
      console.log(
        `[seed] Admin user already exists (${email}, id: ${existing.id}). Skipping.`,
      );
      return;
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    const [admin] = db
      .insert(users)
      .values({
        email,
        passwordHash,
        displayName: "Administrator",
        role: "admin",
        locale,
        isActive: true,
        // Force a password change on first login (per SDD section 16.1).
        mustChangePassword: true,
      })
      .returning()
      .all();

    console.log(
      `[seed] Created initial admin user: ${admin.email} (id: ${admin.id}, locale: ${admin.locale})`,
    );
  } finally {
    sqlite.close();
  }
}

main().catch((error: unknown) => {
  console.error("[seed] Failed:", error);
  process.exit(1);
});
