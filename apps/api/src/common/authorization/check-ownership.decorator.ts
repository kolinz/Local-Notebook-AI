import { SetMetadata } from "@nestjs/common";

export const OWNERSHIP_KEY = "ownership";

/**
 * Resource types `OwnershipGuard` knows how to look up. Extend this
 * (and `OwnershipGuard#resolveOwnerUserId`) as new owned resources are
 * added in later phases (chat_sessions, chat_messages, rag_runs, ...).
 */
export type OwnedResourceType = "notebook" | "file";

export interface OwnershipOptions {
  resource: OwnedResourceType;
  /** Name of the route param holding the resource's id, e.g. "id". */
  paramName: string;
}

/**
 * Marks a route handler as requiring the caller to own the resource
 * identified by `options.paramName`. Requires `SessionAuthGuard` to have
 * already run. See `OwnershipGuard`.
 */
export const CheckOwnership = (options: OwnershipOptions) => SetMetadata(OWNERSHIP_KEY, options);
