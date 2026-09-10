import { Module } from "@nestjs/common";
import { NotebooksController } from "./notebooks.controller";
import { NotebooksService } from "./notebooks.service";

@Module({
  controllers: [NotebooksController],
  providers: [NotebooksService],
})
export class NotebooksModule {}
