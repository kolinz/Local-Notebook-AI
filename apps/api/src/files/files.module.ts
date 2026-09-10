import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module";
import { DocumentProcessingModule } from "../document-processing/document-processing.module";
import { FilesController } from "./files.controller";
import { NotebookFilesController } from "./notebook-files.controller";
import { FilesService } from "./files.service";

@Module({
  imports: [StorageModule, DocumentProcessingModule],
  controllers: [FilesController, NotebookFilesController],
  providers: [FilesService],
})
export class FilesModule {}
