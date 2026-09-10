import { Global, Module } from "@nestjs/common";
import { AuditLogService } from "./audit-log.service";

/**
 * Global module exposing `AuditLogService` app-wide (matching the SDD's
 * "audit-logs" module, section 6.1). Marked `@Global()` so any feature
 * module can inject it without importing this module directly.
 */
@Global()
@Module({
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditLogModule {}
