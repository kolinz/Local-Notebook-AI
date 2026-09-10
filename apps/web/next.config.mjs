import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The monorepo keeps a single .env at the repository root (two levels up
// from apps/web). Next.js only auto-loads .env files from apps/web itself,
// so we load the root file explicitly here, at config-evaluation time.
const repoRootEnvPath = path.resolve(__dirname, "../../.env");
if (existsSync(repoRootEnvPath)) {
  loadDotenv({ path: repoRootEnvPath });
}

/**
 * Explicit allow-list of environment variables considered safe/public for
 * apps/web. This is the ONLY place allowed to widen what apps/web can see
 * from the root .env — do not add SESSION_SECRET, DATABASE_URL,
 * INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_PASSWORD, OLLAMA_BASE_URL, or any
 * other secret/server-only setting here. Values listed in Next.js' `env`
 * option below are inlined into both the server AND the client bundle, so
 * only ever list values that are safe to appear in browser-visible code.
 *
 * apps/web/src/config/public-env.ts is the typed accessor for these values
 * — application code should read that module, not process.env directly.
 */
const PUBLIC_ENV_DEFAULTS = {
  APP_BASE_URL: "http://localhost:3000",
  API_BASE_URL: "http://localhost:4000",
  DEFAULT_LOCALE: "ja",
  SUPPORTED_LOCALES: "ja,en",
  // Not a secret — just the header name the API expects a CSRF token
  // echoed back in (see src/lib/api-client.ts).
  CSRF_HEADER_NAME: "x-csrf-token",
  // Phase 13: plain boolean feature flags (not admin-changeable at
  // runtime via any API — purely .env-controlled per Phase 12's
  // design), safe to expose so the notebook UI knows whether to show
  // the RAG Strategy switcher / Retrieval Details toggle at all.
  ALLOW_NOTEBOOK_RAG_OVERRIDE: "true",
  SHOW_RETRIEVAL_DEBUG: "true",
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  env: Object.fromEntries(
    Object.entries(PUBLIC_ENV_DEFAULTS).map(([key, fallback]) => [
      key,
      process.env[key] ?? fallback,
    ]),
  ),

  // apps/web still never calls Ollama directly and never talks to the DB
  // directly — all of that goes through apps/api (per SDD section 14.3 / 23).
  // Auth/DB/RAG remain unimplemented; this Phase only adds config plumbing.
};

export default nextConfig;
