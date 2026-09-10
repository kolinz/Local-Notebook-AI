import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DbService } from "../db/db.service";
import { systemSettings } from "../db/schema";

/**
 * Generic key-value store for system-wide, admin-configurable settings
 * (SDD section 11.8's `system_settings` table). Phase 12 is this
 * table's first real user: the admin-overridable RAG default strategy
 * and the editable HyDE prompt template both live here as JSON-encoded
 * string values.
 */
@Injectable()
export class SystemSettingsService {
  constructor(private readonly dbService: DbService) {}

  private get db() {
    return this.dbService.db;
  }

  /** Returns the stored string value for `key`, or `null` if unset or malformed. */
  get(key: string): string | null {
    const row = this.db.select({ valueJson: systemSettings.valueJson }).from(systemSettings).where(eq(systemSettings.key, key)).get();
    if (!row) return null;
    try {
      const parsed = JSON.parse(row.valueJson);
      return typeof parsed === "string" ? parsed : null;
    } catch {
      return null;
    }
  }

  set(key: string, value: string): void {
    const valueJson = JSON.stringify(value);
    const existing = this.db.select({ id: systemSettings.id }).from(systemSettings).where(eq(systemSettings.key, key)).get();

    if (existing) {
      this.db.update(systemSettings).set({ valueJson, updatedAt: new Date() }).where(eq(systemSettings.key, key)).run();
    } else {
      this.db.insert(systemSettings).values({ key, valueJson }).run();
    }
  }
}
