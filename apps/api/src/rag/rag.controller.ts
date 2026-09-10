import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { OwnershipGuard } from "../common/authorization/ownership.guard";
import { CheckOwnership } from "../common/authorization/check-ownership.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AppConfigService } from "../config/app-config.service";
import { chatMessageSchema, type ChatMessageDto } from "./dto/chat-message.dto";
import { RagService } from "./rag.service";

/**
 * `POST /api/notebooks/:notebookId/chat` — Standard RAG (Phase 11) and
 * HyDE RAG (Phase 12), whichever `RagStrategyResolver` picks for this
 * notebook. Ownership-checked identically to every other notebook-
 * scoped route: the caller must own `:notebookId`, with no exception
 * for admins.
 */
@Controller("notebooks/:notebookId/chat")
@UseGuards(SessionAuthGuard, OwnershipGuard)
@CheckOwnership({ resource: "notebook", paramName: "notebookId" })
export class RagController {
  constructor(
    private readonly ragService: RagService,
    private readonly appConfig: AppConfigService,
  ) {}

  @Post()
  @HttpCode(200)
  async chat(
    @Param("notebookId") notebookId: string,
    @Body(new ZodValidationPipe(chatMessageSchema)) body: ChatMessageDto,
    @Req() req: Request,
  ) {
    const result = await this.ragService.chat({
      ownerUserId: req.user!.id,
      notebookId,
      sessionId: body.sessionId,
      message: body.message,
    });

    // ALLOW_HYDE_DOCUMENT_PREVIEW gates whether general users see the
    // HyDE hypothetical document's raw text in the response — this
    // Phase's own requirement ("一般ユーザーに仮想文書本文を見せない").
    // Admins can always see it regardless of the setting, matching
    // this codebase's general "admin sees more" pattern. Persistence
    // to rag_runs.hyde_document (already done inside RagService.chat)
    // is unaffected either way.
    const canPreviewHyde = this.appConfig.config.rag.allowHydeDocumentPreview || req.user!.role === "admin";

    return {
      sessionId: result.sessionId,
      answer: result.answer,
      citations: result.citations,
      ragRunId: result.ragRunId,
      strategyName: result.strategyName,
      hydeDocument: canPreviewHyde ? result.hydeDocument : undefined,
    };
  }

  /**
   * The full chat history for this notebook, across every session ever
   * created in it — not just the current browser tab's in-memory log
   * (per SDD section 15.4's originally-planned
   * `GET /api/notebooks/{id}/chat/history`).
   */
  @Get("history")
  history(@Param("notebookId") notebookId: string, @Req() req: Request) {
    const canPreviewHyde = this.appConfig.config.rag.allowHydeDocumentPreview || req.user!.role === "admin";
    const messages = this.ragService.getHistory(notebookId, req.user!.id).map((message) => ({
      ...message,
      hydeDocument: canPreviewHyde ? message.hydeDocument : undefined,
    }));
    return { messages };
  }
}
