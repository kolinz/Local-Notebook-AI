import { z } from "zod";

export const createUserSchema = z.object({
  email: z.string().email("A valid email address is required."),
  password: z.string().min(8, "Password must be at least 8 characters long."),
  displayName: z.string().min(1, "Display name is required.").max(200),
  role: z.enum(["admin", "user"]).default("user"),
  locale: z.enum(["ja", "en"]).default("ja"),
});

export type CreateUserDto = z.infer<typeof createUserSchema>;
