import { z } from "zod";

/**
 * (System-info secret reveal feature.) Only these two keys exist —
 * every other `.env` value is already shown in plain form by
 * `GET /api/admin/system-info` itself, since none of them are secrets.
 * Adding a new secret to `.env` in the future means adding it here
 * explicitly, not silently reusing this endpoint for arbitrary keys.
 */
export const revealSecretSchema = z.object({
  key: z.enum(["sessionSecret", "initialAdminPassword"]),
});

export type RevealSecretDto = z.infer<typeof revealSecretSchema>;
