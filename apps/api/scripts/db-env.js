#!/usr/bin/env node
/**
 * scripts/db-env.js
 *
 * Wraps a DB-related CLI command (`drizzle-kit generate`, `drizzle-kit
 * migrate`, `tsx src/db/seed.ts`) so that it:
 *
 *   1. Loads the repo-root `.env` (the monorepo keeps a single `.env`,
 *      not one per app — see Phase 1.5).
 *   2. If DATABASE_URL is missing, prints a clear, actionable error and
 *      exits (mirrors the message shape used by apps/api/src/config).
 *   3. If DATABASE_URL is a relative `file:` (SQLite) URL, rewrites it to
 *      an absolute path resolved from the repo root, and ensures the
 *      containing directory exists.
 *   4. Spawns the given command with the adjusted environment.
 *
 * This mirrors the resolution logic in
 * apps/api/src/config/env.schema.ts#resolveDatabaseUrl, so the running
 * app (via `pnpm dev` / `pnpm start`) and these CLI commands (via
 * `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:seed`) always agree
 * on exactly which .sqlite file they are using — regardless of which
 * directory the command happened to be run from. Plain CommonJS (no
 * ts-node/tsx) so it can run before any TypeScript tooling is involved.
 */

const { existsSync, mkdirSync } = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const dotenv = require("dotenv");

function findRepoRoot(startDir) {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 15; i++) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(startDir);
}

const repoRoot = findRepoRoot(__dirname);
const envPath = path.join(repoRoot, ".env");

if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

function fail(message) {
  console.error(
    [
      "",
      "========================================================================",
      " Local Notebook AI - configuration error",
      "========================================================================",
      "",
      message,
      "",
      "How to fix:",
      "  1. Copy .env.example to .env at the repository root, if you have not:",
      "       cp .env.example .env",
      "  2. Restart the command (pnpm db:generate / pnpm db:migrate / pnpm db:seed).",
      "",
      `Expected env file location: ${envPath}`,
      "========================================================================",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  fail("DATABASE_URL is not set.");
}

const FILE_PREFIX = "file:";
if (process.env.DATABASE_URL.startsWith(FILE_PREFIX)) {
  const rawPath = process.env.DATABASE_URL.slice(FILE_PREFIX.length);
  const absolutePath = path.isAbsolute(rawPath)
    ? rawPath
    : path.resolve(repoRoot, rawPath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  process.env.DATABASE_URL = `${FILE_PREFIX}${absolutePath}`;
}

const [, , command, ...commandArgs] = process.argv;
if (!command) {
  fail("No command given. Usage: node scripts/db-env.js <command> [...args]");
}

const result = spawnSync(command, commandArgs, {
  stdio: "inherit",
  env: process.env,
  cwd: path.join(__dirname, ".."), // always run from apps/api, regardless of caller cwd
  // drizzle-kit / tsx ship as .cmd shims on Windows.
  shell: process.platform === "win32",
});

if (result.error) {
  console.error(`[db-env] Failed to run "${command}":`, result.error);
  process.exit(1);
}

process.exit(result.status === null ? 1 : result.status);
