import { Module } from "@nestjs/common";
import { SystemSettingsService } from "./system-settings.service";
import { UsageGuideController } from "./usage-guide.controller";

@Module({
  controllers: [UsageGuideController],
  providers: [SystemSettingsService],
  exports: [SystemSettingsService],
})
export class SystemSettingsModule {}
