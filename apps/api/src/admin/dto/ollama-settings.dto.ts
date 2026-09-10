import { z } from "zod";

export const ollamaSettingsSchema = z
  .object({
    defaultGenerationModelId: z.string().uuid().optional(),
    defaultEmbeddingModelId: z.string().uuid().optional(),
    hydeGenerationModelId: z.string().uuid().optional(),
  })
  .refine(
    (data) =>
      data.defaultGenerationModelId !== undefined ||
      data.defaultEmbeddingModelId !== undefined ||
      data.hydeGenerationModelId !== undefined,
    {
      message:
        "At least one of defaultGenerationModelId, defaultEmbeddingModelId, hydeGenerationModelId must be provided.",
    },
  );

export type OllamaSettingsDto = z.infer<typeof ollamaSettingsSchema>;
