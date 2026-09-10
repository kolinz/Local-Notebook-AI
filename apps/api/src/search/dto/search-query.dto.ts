import { z } from "zod";

export const searchQuerySchema = z.object({
  query: z.string().min(1, "query must not be empty."),
  topK: z.number().int().positive().max(50).optional(),
  similarityThreshold: z.number().min(0).max(1).optional(),
});

export type SearchQueryDto = z.infer<typeof searchQuerySchema>;
