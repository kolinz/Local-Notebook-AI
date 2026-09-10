import { z } from "zod";

export const createNotebookSchema = z.object({
  title: z.string().min(1, "Title is required.").max(200),
  description: z.string().max(2000).optional(),
});

export type CreateNotebookDto = z.infer<typeof createNotebookSchema>;
