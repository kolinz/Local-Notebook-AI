import { Injectable } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { DbService } from "../db/db.service";
import { notebooks } from "../db/schema";

@Injectable()
export class NotebooksService {
  constructor(private readonly dbService: DbService) {}

  private get db() {
    return this.dbService.db;
  }

  create(ownerUserId: string, data: { title: string; description?: string }) {
    const [row] = this.db
      .insert(notebooks)
      .values({
        ownerUserId,
        title: data.title,
        description: data.description ?? null,
      })
      .returning()
      .all();
    return row;
  }

  listForOwner(ownerUserId: string) {
    return this.db
      .select()
      .from(notebooks)
      .where(and(eq(notebooks.ownerUserId, ownerUserId), isNull(notebooks.deletedAt)))
      .all();
  }

  /**
   * Excludes soft-deleted notebooks. A caller who owns a deleted
   * notebook (passes OwnershipGuard, which doesn't look at deleted_at)
   * still gets a 404 from the controller once this returns null — a
   * deleted notebook should look gone, not "forbidden", to its own
   * owner.
   */
  findById(id: string) {
    return (
      this.db
        .select()
        .from(notebooks)
        .where(and(eq(notebooks.id, id), isNull(notebooks.deletedAt)))
        .get() ?? null
    );
  }

  /** Returns the updated row, or `null` if the notebook doesn't exist (or is already deleted). */
  update(id: string, data: { title?: string; description?: string; defaultRagStrategy?: "standard" | "hyde" }) {
    const existing = this.findById(id);
    if (!existing) return null;

    const patch: {
      updatedAt: Date;
      title?: string;
      description?: string;
      defaultRagStrategy?: "standard" | "hyde";
    } = {
      updatedAt: new Date(),
    };
    if (data.title !== undefined) patch.title = data.title;
    if (data.description !== undefined) patch.description = data.description;
    if (data.defaultRagStrategy !== undefined) patch.defaultRagStrategy = data.defaultRagStrategy;

    const [row] = this.db.update(notebooks).set(patch).where(eq(notebooks.id, id)).returning().all();
    return row;
  }

  /** Returns `false` if the notebook doesn't exist (or is already deleted). */
  softDelete(id: string): boolean {
    const existing = this.findById(id);
    if (!existing) return false;

    this.db
      .update(notebooks)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(notebooks.id, id))
      .run();
    return true;
  }
}
