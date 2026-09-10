import { Module } from "@nestjs/common";
import { OllamaModule } from "../ollama/ollama.module";
import { ModelsService } from "./models.service";

@Module({
  imports: [OllamaModule],
  providers: [ModelsService],
  exports: [ModelsService],
})
export class ModelsModule {}
