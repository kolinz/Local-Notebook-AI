import { Injectable } from "@nestjs/common";
import { VectorSearchService } from "../../search/vector-search.service";
import { AnswerGenerator } from "../answer-generator.service";
import type { RagStrategy, RagStrategyContext, RagStrategyOutcome } from "./rag-strategy.interface";

/**
 * Standard RAG (SDD section 13.2):
 *
 * ```
 * User query → Embed query → Vector search → Retrieve chunks
 * → Generate answer → Return answer with citations
 * ```
 */
@Injectable()
export class StandardRagStrategy implements RagStrategy {
  readonly name = "standard" as const;

  constructor(
    private readonly vectorSearchService: VectorSearchService,
    private readonly answerGenerator: AnswerGenerator,
  ) {}

  async execute(context: RagStrategyContext): Promise<RagStrategyOutcome> {
    const retrieved = await this.vectorSearchService.search({
      ownerUserId: context.ownerUserId,
      notebookId: context.notebookId,
      textToEmbed: context.message,
    });

    const { answer, citations } = await this.answerGenerator.generate(retrieved, context.message);

    return {
      answer,
      citations,
      retrievedChunkIds: retrieved.map((chunk) => chunk.chunkId),
    };
  }
}
