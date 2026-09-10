import { z } from "zod";

export const updateModelSchema = z.object({
  isEnabled: z.boolean(),
});

export type UpdateModelDto = z.infer<typeof updateModelSchema>;
