import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module";
import { DocumentProcessingModule } from "../document-processing/document-processing.module";
import { OllamaModule } from "../ollama/ollama.module";
import { ModelsModule } from "../models/models.module";
import { EmbeddingsModule } from "../embeddings/embeddings.module";
import { FilesController } from "./files.controller";
import { NotebookFilesController } from "./notebook-files.controller";
import { FilesService } from "./files.service";

/**
 * File summary feature: OllamaModule / ModelsModule are added here so
 * FilesService can call the same default-generation-model resolution
 * and Ollama completion call that AnswerGenerator (in RagModule) uses —
 * both modules already export their service (see ollama.module.ts /
 * the models module), so this is a plain import, no new provider setup.
 *
 * Phase 19 (chunk viewer/editor): EmbeddingsModule is added the same
 * way, so FilesService can inject EmbeddingModelResolver to re-embed a
 * chunk after it's edited — using the exact same model-resolution logic
 * EmbeddingsService/VectorSearchService already use, rather than
 * duplicating it.
 */
@Module({
  imports: [StorageModule, DocumentProcessingModule, OllamaModule, ModelsModule, EmbeddingsModule],
  controllers: [FilesController, NotebookFilesController],
  providers: [FilesService],
})
export class FilesModule {}
