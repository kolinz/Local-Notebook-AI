import { z } from "zod";

export const reportClientIssueSchema = z.object({
  level: z.enum(["error", "warn", "info"]).default("error"),
  message: z.string().min(1).max(500),
  context: z.record(z.unknown()).optional(),
});

export type ReportClientIssueDto = z.infer<typeof reportClientIssueSchema>;
