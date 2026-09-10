import { Injectable } from "@nestjs/common";
import { getValidatedConfig } from "./configuration";
import type { AppConfig } from "./env.schema";

/**
 * Validates and holds the application's typed configuration.
 *
 * Validation runs once, in the constructor, which Nest invokes while
 * building the dependency graph inside `NestFactory.create()` — i.e.
 * before the HTTP server starts listening and before any other provider
 * that depends on config can run. If required variables are missing or
 * invalid, this throws a `ConfigValidationError` with an already-formatted,
 * human-readable message (see ./config-error.ts), which aborts startup.
 *
 * Use `AppConfigService#config` instead of reading `process.env` directly
 * anywhere else in apps/api.
 */
@Injectable()
export class AppConfigService {
  readonly config: AppConfig;

  constructor() {
    this.config = getValidatedConfig(process.env);
  }
}
