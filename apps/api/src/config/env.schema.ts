import { isAbsolute, resolve as resolvePath } from "node:path";
import { z } from "zod";
import { findRepoRoot } from "./find-env-file";

/**
 * `.env` values arrive as strings (or are absent). This turns common
 * "boolean-ish" string values into real booleans instead of relying on
 * zod's default coercion, which treats *any* non-empty string (including
 * the string "false") as truthy.
 */
function booleanFromEnv(defaultValue: boolean) {
  return z.preprocess((value) => {
    if (typeof value === "boolean") return value;
    if (value === undefined || value === "") return defaultValue;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "1", "yes", "on"].includes(normalized)) return true;
      if (["false", "0", "no", "off"].includes(normalized)) return false;
    }
    // Let zod produce a clear "invalid" error for anything unrecognized
    // rather than silently guessing.
    return value;
  }, z.boolean());
}

/** Comma-separated locale list, e.g. "ja,en" -> ["ja", "en"]. */
const localeListFromEnv = z
  .string()
  .default("ja,en")
  .transform((value) =>
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  )
  .pipe(z.array(z.enum(["ja", "en"])).min(1));

export const envSchema = z.object({
  // --------------------------------------------------------------
  // App
  // --------------------------------------------------------------
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  API_BASE_URL: z.string().url().default("http://localhost:4000"),
  PORT_WEB: z.coerce.number().int().min(1).max(65535).default(3000),
  PORT_API: z.coerce.number().int().min(1).max(65535).default(4000),

  // --------------------------------------------------------------
  // Database (Prisma + SQLite from Phase 2 onward; PostgreSQL later)
  // --------------------------------------------------------------
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL must not be empty")
    .default("file:./data/local-notebook-ai.sqlite"),

  // --------------------------------------------------------------
  // Session / Cookie — SESSION_SECRET is required, never has a default,
  // and is never read by apps/web.
  // --------------------------------------------------------------
  SESSION_SECRET: z
    .string()
    .min(16, "SESSION_SECRET must be at least 16 characters long"),
  SESSION_COOKIE_NAME: z.string().min(1).default("lna_session"),
  COOKIE_SECURE: booleanFromEnv(false),
  COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),

  // --------------------------------------------------------------
  // CSRF
  // --------------------------------------------------------------
  CSRF_COOKIE_NAME: z.string().min(1).default("lna_csrf"),
  CSRF_HEADER_NAME: z.string().min(1).default("x-csrf-token"),

  // --------------------------------------------------------------
  // Ollama (not wired up to a real connection until Phase 9)
  // --------------------------------------------------------------
  OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434"),
  DEFAULT_GENERATION_MODEL: z.string().min(1).default("llama3.1:8b"),
  DEFAULT_EMBEDDING_MODEL: z.string().min(1).default("nomic-embed-text"),

  // --------------------------------------------------------------
  // Storage (not wired up to a real StorageAdapter until Phase 7)
  // --------------------------------------------------------------
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  LOCAL_STORAGE_ROOT: z.string().min(1).default("./storage"),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().positive().default(50),

  // --------------------------------------------------------------
  // i18n — safe for apps/web to read directly.
  // --------------------------------------------------------------
  DEFAULT_LOCALE: z.enum(["ja", "en"]).default("ja"),
  SUPPORTED_LOCALES: localeListFromEnv,

  // --------------------------------------------------------------
  // RAG (not wired up to Standard/HyDE execution until Phase 11/12)
  // --------------------------------------------------------------
  RAG_DEFAULT_STRATEGY: z.enum(["standard", "hyde"]).default("hyde"),
  RAG_TOP_K: z.coerce.number().int().positive().default(8),
  RAG_SIMILARITY_THRESHOLD: z.coerce.number().min(0).max(1).default(0.68),
  ALLOW_NOTEBOOK_RAG_OVERRIDE: booleanFromEnv(true),
  SHOW_RETRIEVAL_DEBUG: booleanFromEnv(true),
  /**
   * Not in the original SDD .env.example excerpt shown at Phase 1.5,
   * but referenced by SDD section 13.3's HyDE flow and this Phase's
   * (Phase 12) requirement text — added here now that it's needed.
   * When false, general users never see the HyDE hypothetical
   * document's text (see RagController).
   */
  ALLOW_HYDE_DOCUMENT_PREVIEW: booleanFromEnv(false),

  // --------------------------------------------------------------
  // Initial Admin — email/password required. Used by src/db/seed.ts
  // (Phase 2) to create the first administrator account.
  // --------------------------------------------------------------
  INITIAL_ADMIN_EMAIL: z.string().email("INITIAL_ADMIN_EMAIL must be a valid email address"),
  INITIAL_ADMIN_PASSWORD: z
    .string()
    .min(8, "INITIAL_ADMIN_PASSWORD must be at least 8 characters long"),
  INITIAL_ADMIN_LOCALE: z.enum(["ja", "en"]).default("ja"),
}).refine(
  (data) => !(data.COOKIE_SAME_SITE === "none" && !data.COOKIE_SECURE),
  {
    message:
      "COOKIE_SAME_SITE=none requires COOKIE_SECURE=true — browsers reject " +
      "SameSite=None cookies that aren't also marked Secure.",
    path: ["COOKIE_SECURE"],
  },
);

export type RawEnv = z.infer<typeof envSchema>;

const SQLITE_FILE_PREFIX = "file:";

/**
 * Prisma's CLI resolves relative `file:` SQLite URLs relative to
 * `prisma/schema.prisma`'s own directory (apps/api/prisma/), not the
 * repo root — which would put the database inside apps/api/prisma/data/
 * instead of the shared data/ directory described in the SDD's monorepo
 * layout (section 5). To keep the running app and the Prisma CLI
 * (via scripts/db-env.js, which applies the same rule) pointed at
 * the exact same file, relative `file:` URLs are rewritten here to an
 * absolute path resolved from the repo root. Absolute paths and
 * non-sqlite URLs (e.g. a future `postgresql://...`) pass through
 * unchanged.
 */
function resolveDatabaseUrl(rawUrl: string): string {
  if (!rawUrl.startsWith(SQLITE_FILE_PREFIX)) {
    return rawUrl;
  }
  const rawPath = rawUrl.slice(SQLITE_FILE_PREFIX.length);
  if (isAbsolute(rawPath)) {
    return rawUrl;
  }
  const repoRoot = findRepoRoot(process.cwd());
  const absolutePath = resolvePath(repoRoot, rawPath);
  return `${SQLITE_FILE_PREFIX}${absolutePath}`;
}

/**
 * Typed, structured application configuration derived from `RawEnv`.
 * Consumers (e.g. via `ConfigService<AppConfig>`) should use this shape
 * instead of reaching into `process.env` directly.
 */
export interface AppConfig {
  app: {
    nodeEnv: RawEnv["NODE_ENV"];
    appBaseUrl: string;
    apiBaseUrl: string;
    portWeb: number;
    portApi: number;
  };
  database: {
    /** Always absolute for `file:` (sqlite) URLs — see resolveDatabaseUrl. */
    url: string;
  };
  session: {
    secret: string;
    cookieName: string;
    cookieSecure: boolean;
    cookieSameSite: RawEnv["COOKIE_SAME_SITE"];
  };
  csrf: {
    cookieName: string;
    headerName: string;
  };
  ollama: {
    baseUrl: string;
    defaultGenerationModel: string;
    defaultEmbeddingModel: string;
  };
  storage: {
    driver: RawEnv["STORAGE_DRIVER"];
    localRoot: string;
    maxUploadSizeMb: number;
  };
  i18n: {
    defaultLocale: RawEnv["DEFAULT_LOCALE"];
    supportedLocales: RawEnv["SUPPORTED_LOCALES"];
  };
  rag: {
    defaultStrategy: RawEnv["RAG_DEFAULT_STRATEGY"];
    topK: number;
    similarityThreshold: number;
    allowNotebookOverride: boolean;
    showRetrievalDebug: boolean;
    allowHydeDocumentPreview: boolean;
  };
  initialAdmin: {
    email: string;
    password: string;
    locale: RawEnv["INITIAL_ADMIN_LOCALE"];
  };
}

export function toAppConfig(env: RawEnv): AppConfig {
  return {
    app: {
      nodeEnv: env.NODE_ENV,
      appBaseUrl: env.APP_BASE_URL,
      apiBaseUrl: env.API_BASE_URL,
      portWeb: env.PORT_WEB,
      portApi: env.PORT_API,
    },
    database: {
      url: resolveDatabaseUrl(env.DATABASE_URL),
    },
    session: {
      secret: env.SESSION_SECRET,
      cookieName: env.SESSION_COOKIE_NAME,
      cookieSecure: env.COOKIE_SECURE,
      cookieSameSite: env.COOKIE_SAME_SITE,
    },
    csrf: {
      cookieName: env.CSRF_COOKIE_NAME,
      headerName: env.CSRF_HEADER_NAME,
    },
    ollama: {
      baseUrl: env.OLLAMA_BASE_URL,
      defaultGenerationModel: env.DEFAULT_GENERATION_MODEL,
      defaultEmbeddingModel: env.DEFAULT_EMBEDDING_MODEL,
    },
    storage: {
      driver: env.STORAGE_DRIVER,
      localRoot: env.LOCAL_STORAGE_ROOT,
      maxUploadSizeMb: env.MAX_UPLOAD_SIZE_MB,
    },
    i18n: {
      defaultLocale: env.DEFAULT_LOCALE,
      supportedLocales: env.SUPPORTED_LOCALES,
    },
    rag: {
      defaultStrategy: env.RAG_DEFAULT_STRATEGY,
      topK: env.RAG_TOP_K,
      similarityThreshold: env.RAG_SIMILARITY_THRESHOLD,
      allowNotebookOverride: env.ALLOW_NOTEBOOK_RAG_OVERRIDE,
      showRetrievalDebug: env.SHOW_RETRIEVAL_DEBUG,
      allowHydeDocumentPreview: env.ALLOW_HYDE_DOCUMENT_PREVIEW,
    },
    initialAdmin: {
      email: env.INITIAL_ADMIN_EMAIL,
      password: env.INITIAL_ADMIN_PASSWORD,
      locale: env.INITIAL_ADMIN_LOCALE,
    },
  };
}
