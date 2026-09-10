import { z } from "zod";

export const chatMessageSchema = z.object({
  message: z.string().min(1, "message must not be empty."),
  sessionId: z.string().uuid().optional(),
});

export type ChatMessageDto = z.infer<typeof chatMessageSchema>;
