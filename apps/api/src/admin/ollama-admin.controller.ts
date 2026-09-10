import { Body, Controller, Get, HttpCode, Param, Post, Put, Req } from "@nestjs/common";
import type { Request } from "express";
import { AdminOnly } from "../common/authorization/admin-only.decorator";
import { AppException } from "../common/app-exception";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AuditLogService } from "../audit-log/audit-log.service";
import { OllamaService } from "../ollama/ollama.service";
import { ModelsService } from "../models/models.service";
import { ollamaSettingsSchema, type OllamaSettingsDto } from "./dto/ollama-settings.dto";
import { updateModelSchema, type UpdateModelDto } from "./dto/update-model.dto";

/**
 * Phase 9: Ollama connection status + model registry management.
 *
 * All routes are `@AdminOnly()` — a general user calling any of these
 * gets the same uniform 403 `FORBIDDEN` response as elsewhere in the
 * admin API (this Phase's own completion criterion 6).
 *
 * `PUT /api/admin/models/:id` (enable/disable toggle) is a small
 * addition beyond this Phase's literally-listed API endpoints — the
 * four listed endpoints (status, settings, models list, sync) don't
 * otherwise provide a way to satisfy the stated requirement "モデルの
 * 有効/無効を管理できる" (manage each model's enabled state), so this
 * follows the same "minimal, clearly-justified addition" precedent as
 * `POST /api/admin/users` in Phase 4.
 */
@Controller("admin")
export class OllamaAdminController {
  constructor(
    private readonly ollamaService: OllamaService,
    private readonly modelsService: ModelsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get("ollama/status")
  @AdminOnly()
  async getStatus() {
    return this.ollamaService.checkStatus();
  }

  /**
   * Sets any combination of the default generation model, default
   * embedding model, and HyDE generation model. Each id (if provided)
   * must reference an existing row in `models` — otherwise this
   * responds 404 rather than silently accepting a dangling reference.
   */
  @Put("ollama/settings")
  @AdminOnly()
  updateSettings(@Body(new ZodValidationPipe(ollamaSettingsSchema)) body: OllamaSettingsDto, @Req() req: Request) {
    if (body.defaultGenerationModelId !== undefined) {
      this.assertModelExists(body.defaultGenerationModelId, "defaultGenerationModelId");
      this.modelsService.setDefaultGeneration(body.defaultGenerationModelId);
    }
    if (body.defaultEmbeddingModelId !== undefined) {
      this.assertModelExists(body.defaultEmbeddingModelId, "defaultEmbeddingModelId");
      this.modelsService.setDefaultEmbedding(body.defaultEmbeddingModelId);
    }
    if (body.hydeGenerationModelId !== undefined) {
      this.assertModelExists(body.hydeGenerationModelId, "hydeGenerationModelId");
      this.modelsService.setDefaultHyde(body.hydeGenerationModelId);
    }

    this.auditLogService.record({
      actorUserId: req.user!.id,
      action: "admin.ollama_settings.updated",
      resourceType: "ollama_settings",
      metadata: { ...body },
      ipAddress: req.ip,
      userAgent: req.header("user-agent"),
    });

    return { models: this.modelsService.listAll() };
  }

  @Get("models")
  @AdminOnly()
  listModels() {
    return { models: this.modelsService.listAll() };
  }

  /**
   * Pulls the current model list from Ollama and upserts it into the
   * `models` table. If Ollama is unreachable, this responds 502 (the
   * failure is Ollama's, not this API's) rather than silently
   * "succeeding" with zero models.
   */
  @Post("models/sync-ollama")
  @AdminOnly()
  @HttpCode(200)
  async syncModels() {
    try {
      const summary = await this.modelsService.syncFromOllama();
      return { ...summary, models: this.modelsService.listAll() };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new AppException(502, "OLLAMA_UNREACHABLE", `Failed to sync models from Ollama: ${message}`);
    }
  }

  @Put("models/:id")
  @AdminOnly()
  updateModel(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateModelSchema)) body: UpdateModelDto,
    @Req() req: Request,
  ) {
    const updated = this.modelsService.setEnabled(id, body.isEnabled);
    if (!updated) {
      throw new AppException(404, "NOT_FOUND", "Model not found.");
    }

    this.auditLogService.record({
      actorUserId: req.user!.id,
      action: "admin.model.updated",
      resourceType: "model",
      resourceId: id,
      metadata: { isEnabled: body.isEnabled },
      ipAddress: req.ip,
      userAgent: req.header("user-agent"),
    });

    return { model: this.modelsService.findById(id) };
  }

  private assertModelExists(modelId: string, fieldName: string): void {
    if (!this.modelsService.findById(modelId)) {
      throw new AppException(404, "NOT_FOUND", `${fieldName} does not reference an existing model.`);
    }
  }
}
