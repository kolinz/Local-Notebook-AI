import { Body, Controller, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { OwnershipGuard } from "../common/authorization/ownership.guard";
import { CheckOwnership } from "../common/authorization/check-ownership.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { searchQuerySchema, type SearchQueryDto } from "./dto/search-query.dto";
import { VectorSearchService } from "./vector-search.service";

/**
 * Phase 10: a minimal, ownership-checked endpoint whose sole purpose is
 * retrieval (finding similar chunks by cosine similarity) — no answer
 * synthesis. This Phase's own API list didn't specify an endpoint, but
 * "質問文から類似チャンクを検索できる" (completion criterion 2) needs
 * something callable to verify — this is that, kept intentionally
 * narrow.
 *
 * Phase 11 (Standard RAG) builds the real `/api/notebooks/{id}/chat`
 * endpoint on top of this exact same `VectorSearchService`; this
 * endpoint doubles as the seed of the "Retrieval Details" UI feature
 * described in the SDD's general-user screen spec.
 *
 * Ownership-checked identically to every other notebook-scoped route
 * in this codebase — the caller must own `:notebookId`, with no
 * exception for admins (see VectorSearchService's own header comment).
 */
@Controller("notebooks/:notebookId/search")
@UseGuards(SessionAuthGuard, OwnershipGuard)
@CheckOwnership({ resource: "notebook", paramName: "notebookId" })
export class SearchController {
  constructor(private readonly vectorSearchService: VectorSearchService) {}

  @Post()
  async search(
    @Param("notebookId") notebookId: string,
    @Body(new ZodValidationPipe(searchQuerySchema)) body: SearchQueryDto,
    @Req() req: Request,
  ) {
    const results = await this.vectorSearchService.search({
      ownerUserId: req.user!.id,
      notebookId,
      textToEmbed: body.query,
      topK: body.topK,
      similarityThreshold: body.similarityThreshold,
    });
    return { results };
  }
}
