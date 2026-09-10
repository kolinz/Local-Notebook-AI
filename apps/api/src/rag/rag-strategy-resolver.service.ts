import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DbService } from "../db/db.service";
import { notebooks } from "../db/schema";
import { AppConfigService } from "../config/app-config.service";
import { SystemSettingsService } from "../system-settings/system-settings.service";
import { StandardRagStrategy } from "./strategies/standard-rag.strategy";
import { HydeRagStrategy } from "./strategies/hyde-rag.strategy";
import type { RagStrategy } from "./strategies/rag-strategy.interface";

export const RAG_DEFAULT_STRATEGY_KEY = "rag_default_strategy";

type StrategyName = "standard" | "hyde";

function isStrategyName(value: string | null | undefined): value is StrategyName {
  return value === "standard" || value === "hyde";
}

/**
 * Resolves which `RagStrategy` to run for a given notebook, per this
 * Phase's requirement ("ノートブック単位のoverride設定を考慮する"),
 * in priority order:
 *
 * 1. The notebook's own `default_rag_strategy` column, if
 *    `ALLOW_NOTEBOOK_RAG_OVERRIDE` is true (the config flag governs
 *    whether per-notebook overrides are honored at all).
 * 2. The admin-configured global default (`system_settings` key
 *    `rag_default_strategy`, set via `PUT /api/admin/rag/settings` —
 *    this Phase's completion criterion 6: "管理設定によりStandard/
 *    HyDEを切り替えられる").
 * 3. `RAG_DEFAULT_STRATEGY` from `.env`, as the final fallback.
 */
@Injectable()
export class RagStrategyResolver {
  constructor(
    private readonly dbService: DbService,
    private readonly appConfig: AppConfigService,
    private readonly systemSettingsService: SystemSettingsService,
    private readonly standardStrategy: StandardRagStrategy,
    private readonly hydeStrategy: HydeRagStrategy,
  ) {}

  resolve(notebookId: string): RagStrategy {
    return this.resolveName(notebookId) === "hyde" ? this.hydeStrategy : this.standardStrategy;
  }

  private resolveName(notebookId: string): StrategyName {
    if (this.appConfig.config.rag.allowNotebookOverride) {
      const notebook = this.dbService.db
        .select({ strategy: notebooks.defaultRagStrategy })
        .from(notebooks)
        .where(eq(notebooks.id, notebookId))
        .get();
      if (isStrategyName(notebook?.strategy)) {
        return notebook.strategy;
      }
    }

    const globalOverride = this.systemSettingsService.get(RAG_DEFAULT_STRATEGY_KEY);
    if (isStrategyName(globalOverride)) {
      return globalOverride;
    }

    return this.appConfig.config.rag.defaultStrategy;
  }
}
