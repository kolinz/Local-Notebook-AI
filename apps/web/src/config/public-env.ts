/**
 * Typed accessor for the handful of environment variables apps/web is
 * allowed to see.
 *
 * The actual allow-listing happens in next.config.mjs (`PUBLIC_ENV_DEFAULTS`
 * / the `env` option) — this module never reads `process.env` beyond the
 * exact keys below, so there is no risk of an unrelated secret (e.g.
 * SESSION_SECRET, DATABASE_URL, INITIAL_ADMIN_PASSWORD, OLLAMA_BASE_URL)
 * accidentally leaking into the frontend just because it exists in the
 * root `.env` file: those keys are never referenced anywhere in apps/web.
 *
 * Application code should import `publicEnv` from here instead of touching
 * `process.env` directly.
 */

const SUPPORTED_LOCALE_VALUES = ["ja", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALE_VALUES)[number];

function isLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALE_VALUES as readonly string[]).includes(value);
}

function parseLocaleList(raw: string | undefined, fallback: Locale[]): Locale[] {
  if (!raw) return fallback;
  const parsed = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(isLocale);
  return parsed.length > 0 ? parsed : fallback;
}

function parseLocale(raw: string | undefined, fallback: Locale): Locale {
  return raw && isLocale(raw) ? raw : fallback;
}

function parseUrl(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  try {
    // eslint-disable-next-line no-new
    new URL(raw);
    return raw;
  } catch {
    return fallback;
  }
}

export interface PublicEnv {
  /** Public base URL of the Next.js frontend itself. */
  appBaseUrl: string;
  /** Public base URL of the NestJS API (apps/api). */
  apiBaseUrl: string;
  /** Default UI locale. */
  defaultLocale: Locale;
  /** Locales the UI is allowed to switch between. */
  supportedLocales: Locale[];
  /** Header name the API expects the CSRF token to be echoed back in. */
  csrfHeaderName: string;
  /** Whether the notebook UI should show a RAG Strategy switcher at all (Phase 13). */
  allowNotebookRagOverride: boolean;
  /** Whether the notebook UI should show the "Retrieval Details" toggle (Phase 13). */
  showRetrievalDebug: boolean;
}

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  return raw.trim().toLowerCase() === "true";
}

export const publicEnv: PublicEnv = {
  appBaseUrl: parseUrl(process.env.APP_BASE_URL, "http://localhost:3000"),
  apiBaseUrl: parseUrl(process.env.API_BASE_URL, "http://localhost:4000"),
  defaultLocale: parseLocale(process.env.DEFAULT_LOCALE, "ja"),
  supportedLocales: parseLocaleList(process.env.SUPPORTED_LOCALES, ["ja", "en"]),
  csrfHeaderName: process.env.CSRF_HEADER_NAME?.trim() || "x-csrf-token",
  allowNotebookRagOverride: parseBoolean(process.env.ALLOW_NOTEBOOK_RAG_OVERRIDE, true),
  showRetrievalDebug: parseBoolean(process.env.SHOW_RETRIEVAL_DEBUG, true),
};
