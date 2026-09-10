import { z } from "zod";

export const usageGuideSchema = z.object({
  content: z.string().min(1, "content must not be empty.").max(5000),
});

export type UsageGuideDto = z.infer<typeof usageGuideSchema>;
