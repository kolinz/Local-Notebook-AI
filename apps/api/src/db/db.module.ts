import { Global, Module } from "@nestjs/common";
import { DbService } from "./db.service";

/**
 * Global module exposing `DbService` app-wide. From Phase 3 onward,
 * feature modules (auth, notebooks, files, ...) will inject `DbService`
 * directly without needing to import `DbModule` themselves, since it's
 * marked `@Global()`.
 */
@Global()
@Module({
  providers: [DbService],
  exports: [DbService],
})
export class DbModule {}
