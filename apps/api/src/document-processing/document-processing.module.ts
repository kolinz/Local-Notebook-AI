import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module";
import { EmbeddingsModule } from "../embeddings/embeddings.module";
import { DocumentProcessingService } from "./document-processing.service";

@Module({
  imports: [StorageModule, EmbeddingsModule],
  providers: [DocumentProcessingService],
  exports: [DocumentProcessingService],
})
export class DocumentProcessingModule {}
