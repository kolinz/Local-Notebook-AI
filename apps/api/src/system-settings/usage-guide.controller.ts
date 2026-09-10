import { Body, Controller, Get, Put, Req } from "@nestjs/common";
import type { Request } from "express";
import { AdminOnly } from "../common/authorization/admin-only.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AuditLogService } from "../audit-log/audit-log.service";
import { SystemSettingsService } from "./system-settings.service";
import { usageGuideSchema, type UsageGuideDto } from "./dto/usage-guide.dto";

export const USAGE_GUIDE_KEY = "usage_guide_content";

/**
 * Default text shown on the landing page (`/`) until an admin edits it
 * via `PUT /api/admin/usage-guide`. Replaces the Phase 3 developer
 * status checklist that page originally shipped with.
 */
export const DEFAULT_USAGE_GUIDE = `Local Notebook AI は、組織内の複数ユーザーで使えるNotebookLM風のRAGワークスペースです。

【使い方】
1. ヘッダーの「マイノートブック」から、資料をまとめる単位となるノートブックを作成します。
2. ノートブック内の「ソース」欄から、PDF・TXT・Markdown・DOCXファイルをアップロードします。
3. アップロードした資料の内容について、チャット欄から質問できます。回答には引用元が表示されます。
4. RAG方式（標準RAG / HyDE RAG）はノートブックごとに切り替えられます。

このガイドの文章は、管理者が管理画面の「使い方ガイド」から編集できます。`;

/**
 * `GET` has no `@AdminOnly()` — every signed-in user (and the
 * unauthenticated landing page itself) needs to read this, since it's
 * shown on `/` regardless of role. Only `PUT` is admin-gated.
 */
@Controller()
export class UsageGuideController {
  constructor(
    private readonly systemSettingsService: SystemSettingsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get("usage-guide")
  getUsageGuide() {
    return { content: this.systemSettingsService.get(USAGE_GUIDE_KEY) ?? DEFAULT_USAGE_GUIDE };
  }

  @Put("admin/usage-guide")
  @AdminOnly()
  updateUsageGuide(@Body(new ZodValidationPipe(usageGuideSchema)) body: UsageGuideDto, @Req() req: Request) {
    this.systemSettingsService.set(USAGE_GUIDE_KEY, body.content);

    this.auditLogService.record({
      actorUserId: req.user!.id,
      action: "admin.usage_guide.updated",
      resourceType: "usage_guide",
      ipAddress: req.ip,
      userAgent: req.header("user-agent"),
    });

    return { content: body.content };
  }
}
