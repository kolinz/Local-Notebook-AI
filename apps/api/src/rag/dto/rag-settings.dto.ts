import { z } from "zod";

export const ragSettingsSchema = z
  .object({
    defaultStrategy: z.enum(["standard", "hyde"]).optional(),
    hydePromptTemplate: z.string().min(1, "hydePromptTemplate must not be empty.").optional(),
  })
  .refine((data) => data.defaultStrategy !== undefined || data.hydePromptTemplate !== undefined, {
    message: "At least one of defaultStrategy, hydePromptTemplate must be provided.",
  });

export type RagSettingsDto = z.infer<typeof ragSettingsSchema>;
