import { ZodError } from "zod";
import { ENV_FILE_PATH } from "./find-env-file";
import { envSchema, toAppConfig, type AppConfig } from "./env.schema";
import { ConfigValidationError, formatEnvError } from "./config-error";

const PLACEHOLDER_SESSION_SECRET = "change-this-to-a-long-random-string";
const PLACEHOLDER_ADMIN_PASSWORD = "change-me-on-first-login";

/**
 * `validate` function passed to `ConfigModule.forRoot()`. Nest calls this
 * once at bootstrap with the merged `process.env`. Throwing here aborts
 * startup — we throw a `ConfigValidationError` whose `.message` is already
 * formatted for direct console output (see main.ts).
 */
export function validateEnv(rawEnv: Record<string, unknown>): AppConfig {
  const parsed = envSchema.safeParse(rawEnv);

  if (!parsed.success) {
    throw new ConfigValidationError(
      formatEnvError(parsed.error as ZodError, ENV_FILE_PATH),
    );
  }

  const config = toAppConfig(parsed.data);

  // Non-blocking hygiene warnings: still boot (Phase 1.5 has no
  // production deployment yet), but nudge the developer.
  if (config.session.secret === PLACEHOLDER_SESSION_SECRET) {
    // eslint-disable-next-line no-console
    console.warn(
      "[config] WARNING: SESSION_SECRET is still set to the .env.example placeholder value. " +
        "Change it before any real deployment.",
    );
  }
  if (config.initialAdmin.password === PLACEHOLDER_ADMIN_PASSWORD) {
    // eslint-disable-next-line no-console
    console.warn(
      "[config] WARNING: INITIAL_ADMIN_PASSWORD is still set to the .env.example placeholder value. " +
        "Change it before any real deployment.",
    );
  }

  return config;
}

let cachedConfig: AppConfig | null = null;

/**
 * Memoized wrapper around `validateEnv`. Both `main.ts` (which validates
 * *before* constructing the Nest app, so failures never get wrapped in a
 * Nest stack trace) and `AppConfigService` (which validates as part of
 * normal Nest DI, as a safety net for any code path that skips the
 * pre-check) call this — caching means the env is only actually parsed
 * once per process and hygiene warnings are only printed once.
 */
export function getValidatedConfig(
  rawEnv: Record<string, unknown> = process.env,
): AppConfig {
  if (!cachedConfig) {
    cachedConfig = validateEnv(rawEnv);
  }
  return cachedConfig;
}

export type { AppConfig } from "./env.schema";
export { ENV_FILE_PATH } from "./find-env-file";
