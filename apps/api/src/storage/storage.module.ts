import { Module } from "@nestjs/common";
import { AppConfigService } from "../config/app-config.service";
import { LocalStorageAdapter } from "./local-storage.adapter";
import { STORAGE_ADAPTER } from "./storage.tokens";

/**
 * Only `STORAGE_DRIVER=local` is wired to a real adapter in Phase 7.
 * `STORAGE_DRIVER=s3` is already validated by env.schema.ts but has no
 * implementation yet — adding an `S3StorageAdapter` that also
 * implements `StorageAdapter` (from @local-notebook-ai/storage) and
 * branching on `appConfig.config.storage.driver` here is the intended
 * extension point for that future work.
 */
@Module({
  providers: [
    {
      provide: STORAGE_ADAPTER,
      useFactory: (appConfig: AppConfigService) => new LocalStorageAdapter(appConfig),
      inject: [AppConfigService],
    },
  ],
  exports: [STORAGE_ADAPTER],
})
export class StorageModule {}
