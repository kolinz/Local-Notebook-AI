import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * Locates the monorepo root by walking up from `startDir` until a
 * `pnpm-workspace.yaml` is found. This makes `.env` loading independent of
 * whichever working directory apps/api happens to be started from
 * (`pnpm --filter api start:dev` runs with cwd = apps/api; a hypothetical
 * direct `nest start` from the repo root would have cwd = repo root).
 *
 * Falls back to `startDir` itself if no workspace root can be found, so the
 * caller always gets a usable path rather than a thrown error here — actual
 * "no .env / missing vars" reporting is the job of the config validator,
 * not this path resolver.
 */
export function findRepoRoot(startDir: string): string {
  let dir = resolve(startDir);

  // Bounded walk (filesystem root or ~15 levels, whichever comes first) so
  // a misconfigured environment can't loop forever.
  for (let i = 0; i < 15; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }

  return resolve(startDir);
}

/**
 * Absolute path to the repo-root `.env` file, whether or not it actually
 * exists yet. `@nestjs/config` is fine being pointed at a path that does
 * not exist — it simply won't load anything from it, and any required
 * variables missing from `process.env` will then be caught by
 * `validateEnv` (see ./configuration.ts) with a clear error message.
 */
export const ENV_FILE_PATH = join(findRepoRoot(process.cwd()), ".env");
