/**
 * @local-notebook-ai/storage
 *
 * StorageAdapter interface (per SDD section 12.3). Implementations live
 * in apps/api (not here), since they need Nest DI / app config:
 * - LocalStorageAdapter (apps/api/src/storage/local-storage.adapter.ts) — Phase 7
 * - S3StorageAdapter / MinioStorageAdapter / IBMCloudObjectStorageAdapter — future
 *
 * This package only ever exports types (no runtime code), so apps/api
 * imports from it exclusively via `import type` — that import is fully
 * erased at compile time, meaning apps/api's build never needs this
 * package to be separately compiled to JS. If a future version of this
 * package needs runtime exports (e.g. a shared constant), a real build
 * step will need to be added then.
 */

export interface PutObjectInput {
  key: string;
  contentType: string;
  data: NodeJS.ReadableStream | Buffer;
}

export interface StoredObject {
  key: string;
  sizeBytes: number;
}

/**
 * Abstraction over file storage so the backend can start with local disk
 * storage and move to S3-compatible storage later without changing callers.
 * Not implemented yet — this is a type-only placeholder for Phase 1.
 */
export interface StorageAdapter {
  putObject(input: PutObjectInput): Promise<StoredObject>;
  getObject(key: string): Promise<NodeJS.ReadableStream>;
  deleteObject(key: string): Promise<void>;
  getSignedUrl?(key: string, expiresInSeconds: number): Promise<string>;
}
