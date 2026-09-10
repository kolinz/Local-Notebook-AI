import { z } from "zod";

export const updateNotebookSchema = z
  .object({
    title: z.string().min(1, "Title cannot be empty.").max(200).optional(),
    description: z.string().max(2000).optional(),
    /**
     * Phase 12: per-notebook RAG strategy override (SDD section 13.6 /
     * this Phase's "ノートブック単位のoverride設定を考慮する"). Only
     * takes effect when `ALLOW_NOTEBOOK_RAG_OVERRIDE=true` — see
     * RagStrategyResolver.
     */
    defaultRagStrategy: z.enum(["standard", "hyde"]).optional(),
  })
  .refine(
    (data) => data.title !== undefined || data.description !== undefined || data.defaultRagStrategy !== undefined,
    {
      message: "At least one field (title, description, or defaultRagStrategy) must be provided.",
    },
  );

export type UpdateNotebookDto = z.infer<typeof updateNotebookSchema>;
