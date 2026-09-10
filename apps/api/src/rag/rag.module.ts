import { Module } from "@nestjs/common";
import { OllamaModule } from "../ollama/ollama.module";
import { ModelsModule } from "../models/models.module";
import { SearchModule } from "../search/search.module";
import { SystemSettingsModule } from "../system-settings/system-settings.module";
import { RagController } from "./rag.controller";
import { RagAdminController } from "./rag-admin.controller";
import { RagService } from "./rag.service";
import { RagStrategyResolver } from "./rag-strategy-resolver.service";
import { AnswerGenerator } from "./answer-generator.service";
import { StandardRagStrategy } from "./strategies/standard-rag.strategy";
import { HydeRagStrategy } from "./strategies/hyde-rag.strategy";

@Module({
  imports: [OllamaModule, ModelsModule, SearchModule, SystemSettingsModule],
  controllers: [RagController, RagAdminController],
  providers: [RagService, RagStrategyResolver, AnswerGenerator, StandardRagStrategy, HydeRagStrategy],
})
export class RagModule {}
