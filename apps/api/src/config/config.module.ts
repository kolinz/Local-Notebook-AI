import { Global, Module } from "@nestjs/common";
import { ConfigModule as NestConfigModule } from "@nestjs/config";
import { ENV_FILE_PATH } from "./find-env-file";
import { AppConfigService } from "./app-config.service";

/**
 * Global config module.
 *
 * `NestConfigModule.forRoot` is used purely to load the repo-root `.env`
 * file into `process.env` (it does not need to exist — missing required
 * variables are caught by `AppConfigService`, not here). All typed,
 * validated access to configuration should go through `AppConfigService`.
 *
 * Marked `@Global()` so any feature module (DbModule, and from Phase 3
 * onward auth/notebooks/files/...) can inject `AppConfigService` without
 * having to import `ConfigModule` itself.
 */
@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      envFilePath: ENV_FILE_PATH,
      isGlobal: true,
      ignoreEnvFile: false,
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class ConfigModule {}
