/**
 * DI token for the active `StorageAdapter` implementation (see
 * @local-notebook-ai/storage). Injected via `@Inject(STORAGE_ADAPTER)`
 * since interfaces have no runtime representation for Nest to key on.
 */
export const STORAGE_ADAPTER = Symbol("STORAGE_ADAPTER");
