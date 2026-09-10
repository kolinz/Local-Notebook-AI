import { Module } from "@nestjs/common";
import { OllamaModule } from "../ollama/ollama.module";
import { EmbeddingsModule } from "../embeddings/embeddings.module";
import { SearchController } from "./search.controller";
import { VectorSearchService } from "./vector-search.service";

@Module({
  imports: [OllamaModule, EmbeddingsModule],
  controllers: [SearchController],
  providers: [VectorSearchService],
  exports: [VectorSearchService],
})
export class SearchModule {}
