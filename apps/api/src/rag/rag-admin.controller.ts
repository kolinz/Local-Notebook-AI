import { Body, Controller, Get, Put, Req } from "@nestjs/common";
import type { Request } from "express";
import { AdminOnly } from "../common/authorization/admin-only.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AppConfigService } from "../config/app-config.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { SystemSettingsService } from "../system-settings/system-settings.service";
import { RAG_DEFAULT_STRATEGY_KEY } from "./rag-strategy-resolver.service";
import { HYDE_PROMPT_TEMPLATE_KEY, DEFAULT_HYDE_PROMPT_TEMPLATE } from "./strategies/hyde-rag.strategy";
import { ragSettingsSchema, type RagSettingsDto } from "./dto/rag-settings.dto";

/**
 * Admin-only global RAG settings (this Phase's completion criterion 6:
 * "管理設定によりStandard/HyDEを切り替えられる"). This is the
 * system-wide default, resolved by `RagStrategyResolver` when a
 * notebook has no override of its own (or `ALLOW_NOTEBOOK_RAG_OVERRIDE`
 * is false) — see that class's header comment for the full priority
 * order.
 */
@Controller("admin/rag")
export class RagAdminController {
  constructor(
    private readonly systemSettingsService: SystemSettingsService,
    private readonly appConfig: AppConfigService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get("settings")
  @AdminOnly()
  getSettings() {
    return this.currentSettings();
  }

  @Put("settings")
  @AdminOnly()
  updateSettings(@Body(new ZodValidationPipe(ragSettingsSchema)) body: RagSettingsDto, @Req() req: Request) {
    if (body.defaultStrategy !== undefined) {
      this.systemSettingsService.set(RAG_DEFAULT_STRATEGY_KEY, body.defaultStrategy);
    }
    if (body.hydePromptTemplate !== undefined) {
      this.systemSettingsService.set(HYDE_PROMPT_TEMPLATE_KEY, body.hydePromptTemplate);
    }

    this.auditLogService.record({
      actorUserId: req.user!.id,
      action: "admin.rag_settings.updated",
      resourceType: "rag_settings",
      metadata: {
        defaultStrategy: body.defaultStrategy,
        hydePromptTemplateChanged: body.hydePromptTemplate !== undefined,
      },
      ipAddress: req.ip,
      userAgent: req.header("user-agent"),
    });

    return this.currentSettings();
  }

  private currentSettings() {
    return {
      defaultStrategy: this.systemSettingsService.get(RAG_DEFAULT_STRATEGY_KEY) ?? this.appConfig.config.rag.defaultStrategy,
      hydePromptTemplate: this.systemSettingsService.get(HYDE_PROMPT_TEMPLATE_KEY) ?? DEFAULT_HYDE_PROMPT_TEMPLATE,
      allowNotebookOverride: this.appConfig.config.rag.allowNotebookOverride,
      allowHydeDocumentPreview: this.appConfig.config.rag.allowHydeDocumentPreview,
      topK: this.appConfig.config.rag.topK,
      similarityThreshold: this.appConfig.config.rag.similarityThreshold,
    };
  }
}
