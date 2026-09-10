import { z } from "zod";

export const updateUserSchema = z
  .object({
    role: z.enum(["admin", "user"]).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => data.role !== undefined || data.isActive !== undefined, {
    message: "At least one of role, isActive must be provided.",
  });

export type UpdateUserDto = z.infer<typeof updateUserSchema>;
