import { Injectable } from "@nestjs/common";
import { createReadStream, createWriteStream, promises as fsPromises } from "node:fs";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import type { PutObjectInput, StorageAdapter, StoredObject } from "@local-notebook-ai/storage";
import { AppConfigService } from "../config/app-config.service";
import { findRepoRoot } from "../config/find-env-file";

/**
 * Local-disk implementation of `StorageAdapter` (SDD section 12.3).
 * `LOCAL_STORAGE_ROOT` (default `./storage`) is resolved the same way
 * `DATABASE_URL` is (see config/env.schema.ts's `resolveDatabaseUrl`) —
 * relative to the repo root, not the process's cwd — so the app and any
 * CLI tooling always agree on the same directory.
 *
 * `key` is always a value this application builds itself (see
 * FilesService — `{ownerUserId}/{notebookId}/original/{uuid}{ext}`),
 * never anything taken directly from a client request. `resolveKeyPath`
 * still verifies the resolved path stays inside the storage root as
 * defense-in-depth, in case a future caller ever passes something
 * unexpected.
 */
@Injectable()
export class LocalStorageAdapter implements StorageAdapter {
  private readonly root: string;

  constructor(private readonly appConfig: AppConfigService) {
    const configured = this.appConfig.config.storage.localRoot;
    this.root = isAbsolute(configured) ? configured : resolve(findRepoRoot(process.cwd()), configured);
  }

  async putObject(input: PutObjectInput): Promise<StoredObject> {
    const fullPath = this.resolveKeyPath(input.key);
    await fsPromises.mkdir(dirname(fullPath), { recursive: true });

    if (Buffer.isBuffer(input.data)) {
      await fsPromises.writeFile(fullPath, input.data);
      return { key: input.key, sizeBytes: input.data.byteLength };
    }

    await new Promise<void>((resolveWrite, reject) => {
      const writeStream = createWriteStream(fullPath);
      const source = input.data as NodeJS.ReadableStream;
      source.pipe(writeStream);
      writeStream.on("finish", () => resolveWrite());
      writeStream.on("error", reject);
      source.on("error", reject);
    });
    const stat = await fsPromises.stat(fullPath);
    return { key: input.key, sizeBytes: stat.size };
  }

  async getObject(key: string): Promise<NodeJS.ReadableStream> {
    return createReadStream(this.resolveKeyPath(key));
  }

  async deleteObject(key: string): Promise<void> {
    await fsPromises.rm(this.resolveKeyPath(key), { force: true });
  }

  private resolveKeyPath(key: string): string {
    const fullPath = resolve(this.root, key);
    if (fullPath !== this.root && !fullPath.startsWith(this.root + sep)) {
      throw new Error(`Refusing to access a path outside the storage root: ${key}`);
    }
    return fullPath;
  }
}
