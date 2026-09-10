import { Module } from "@nestjs/common";
import { OllamaModule } from "../ollama/ollama.module";
import { EmbeddingModelResolver } from "./embedding-model-resolver.service";
import { EmbeddingsService } from "./embeddings.service";

@Module({
  imports: [OllamaModule],
  providers: [EmbeddingModelResolver, EmbeddingsService],
  exports: [EmbeddingModelResolver, EmbeddingsService],
})
export class EmbeddingsModule {}
