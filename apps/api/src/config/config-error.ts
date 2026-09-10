import { ZodError } from "zod";

/**
 * Thrown when required environment variables are missing or invalid.
 * `message` is already formatted for direct console output — callers
 * should print `error.message` as-is rather than a raw stack trace.
 */
export class ConfigValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigValidationError";
  }
}

/**
 * Turns a ZodError from parsing `process.env` into a readable, actionable
 * message: one line per offending variable, plus a reminder of how to fix
 * it. Intended for `console.error()` at startup, not for logging
 * frameworks (config isn't loaded yet at this point).
 */
export function formatEnvError(error: ZodError, envFilePath: string): string {
  const lines = error.issues.map((issue) => {
    const varName = issue.path.join(".") || "(unknown variable)";
    return `  - ${varName}: ${issue.message}`;
  });

  return [
    "",
    "========================================================================",
    " Local Notebook AI - configuration error",
    "========================================================================",
    "",
    "The API cannot start because one or more environment variables are",
    "missing or invalid:",
    "",
    ...lines,
    "",
    `Expected env file location: ${envFilePath}`,
    "",
    "How to fix:",
    "  1. Copy .env.example to .env at the repository root, if you have not:",
    "       cp .env.example .env",
    "  2. Fill in / correct the variable(s) listed above.",
    "  3. Restart the API (pnpm dev / pnpm --filter api start:dev).",
    "",
    "========================================================================",
    "",
  ].join("\n");
}
