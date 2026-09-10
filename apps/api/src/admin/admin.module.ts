import { Module } from "@nestjs/common";
import { OllamaModule } from "../ollama/ollama.module";
import { ModelsModule } from "../models/models.module";
import { AdminController } from "./admin.controller";
import { OllamaAdminController } from "./ollama-admin.controller";

@Module({
  imports: [OllamaModule, ModelsModule],
  controllers: [AdminController, OllamaAdminController],
})
export class AdminModule {}
