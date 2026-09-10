import type { Config } from "drizzle-kit";

/**
 * Read by `drizzle-kit generate` / `drizzle-kit migrate`, always invoked
 * through `node scripts/db-env.js drizzle-kit ...` (see package.json's
 * db:generate / db:migrate scripts), which loads the repo-root `.env`
 * and resolves DATABASE_URL to an absolute path before this file is
 * evaluated. Running `drizzle-kit` directly (bypassing that wrapper)
 * will fail fast with a clear message instead of silently using the
 * wrong database file.
 */
const FILE_PREFIX = "file:";
const rawUrl = process.env.DATABASE_URL;

if (!rawUrl) {
  throw new Error(
    "DATABASE_URL is not set. Run this via `pnpm db:generate` / " +
      "`pnpm db:migrate` (which load the repo-root .env via " +
      "scripts/db-env.js) rather than invoking drizzle-kit directly.",
  );
}

const dbPath = rawUrl.startsWith(FILE_PREFIX)
  ? rawUrl.slice(FILE_PREFIX.length)
  : rawUrl;

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: dbPath,
  },
} satisfies Config;
