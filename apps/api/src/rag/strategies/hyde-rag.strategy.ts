import { Injectable } from "@nestjs/common";
import { VectorSearchService } from "../../search/vector-search.service";
import { OllamaService } from "../../ollama/ollama.service";
import { ModelsService } from "../../models/models.service";
import { SystemSettingsService } from "../../system-settings/system-settings.service";
import { AnswerGenerator } from "../answer-generator.service";
import type { RagStrategy, RagStrategyContext, RagStrategyOutcome } from "./rag-strategy.interface";

export const HYDE_PROMPT_TEMPLATE_KEY = "hyde_prompt_template";

/**
 * Default HyDE prompt template (SDD section 13.4), used when no admin
 * override exists in `system_settings` (key `hyde_prompt_template` —
 * this Phase's "HyDE用prompt templateをsystem_settingsから取得できる
 * 構造にする" requirement). `{{ query }}` is replaced with the user's
 * actual question.
 */
export const DEFAULT_HYDE_PROMPT_TEMPLATE = `あなたは検索クエリ拡張のための文書生成器です。
以下の質問に答えるために、検索対象文書に含まれていそうな説明文を作成してください。

注意:
- 実際の回答を断定しない
- 固有名詞や数値を捏造しない
- 検索に有用な関連語を含める
- 300〜600文字程度で書く

質問:
{{ query }}

仮想文書:`;

/**
 * HyDE RAG (SDD section 13.3):
 *
 * ```
 * User query → Generate hypothetical document → Embed hypothetical
 * document → Vector search → Retrieve real chunks → Generate answer
 * using only real chunks → Return answer with citations
 * ```
 *
 * The hypothetical document is retrieval-only: it is embedded and used
 * to find real chunks, then discarded for generation purposes — the
 * final answer comes from `AnswerGenerator`, the exact same class
 * `StandardRagStrategy` uses, operating only on the real chunks
 * `VectorSearchService` returns. This is what makes "HyDE仮想文書を
 * 最終回答の根拠にしない" (this Phase's own "重要" constraint)
 * structurally true rather than just a prompt-level instruction: the
 * hypothetical document's text is never passed to `AnswerGenerator` at
 * all.
 */
@Injectable()
export class HydeRagStrategy implements RagStrategy {
  readonly name = "hyde" as const;

  constructor(
    private readonly vectorSearchService: VectorSearchService,
    private readonly ollamaService: OllamaService,
    private readonly modelsService: ModelsService,
    private readonly systemSettingsService: SystemSettingsService,
    private readonly answerGenerator: AnswerGenerator,
  ) {}

  async execute(context: RagStrategyContext): Promise<RagStrategyOutcome> {
    const model = this.modelsService.resolveDefaultGenerationModel();
    const hydePrompt = this.buildHydePrompt(context.message);
    const hydeDocument = (await this.ollamaService.generateCompletion(model, hydePrompt)).trim();

    // Embed the hypothetical document — NOT the original query. If
    // generation somehow produced empty text, fall back to embedding
    // the query directly rather than failing the whole request.
    const retrieved = await this.vectorSearchService.search({
      ownerUserId: context.ownerUserId,
      notebookId: context.notebookId,
      textToEmbed: hydeDocument || context.message,
    });

    // Generation uses ONLY the real retrieved chunks — hydeDocument is
    // never passed here (see class header comment).
    const { answer, citations } = await this.answerGenerator.generate(retrieved, context.message);

    return {
      answer,
      citations,
      retrievedChunkIds: retrieved.map((chunk) => chunk.chunkId),
      hydeDocument,
    };
  }

  private buildHydePrompt(query: string): string {
    const template = this.systemSettingsService.get(HYDE_PROMPT_TEMPLATE_KEY) ?? DEFAULT_HYDE_PROMPT_TEMPLATE;
    return template.replace(/\{\{\s*query\s*\}\}/g, query);
  }
}
