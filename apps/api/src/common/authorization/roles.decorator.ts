import { SetMetadata } from "@nestjs/common";

export const ROLES_KEY = "roles";

/** Marks a route handler as requiring the caller's role to be one of `roles`. */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
