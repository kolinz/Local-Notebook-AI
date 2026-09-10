/**
 * Local Notebook AI - Drizzle schema (SQLite)
 *
 * Phase 2: SQLite persistence + DB schema.
 *
 * Column names match the exact snake_case names given in the SDD
 * (section 11) — the JS/TS property names use idiomatic camelCase, but
 * every `text(...)`/`integer(...)` call passes the literal DB column
 * name as its first argument.
 *
 * Design notes (per SDD section 11 + Phase 2 requirements):
 * - notebooks, files, document_chunks, chat_sessions, chat_messages,
 *   rag_runs all carry an owner_user_id (rag_runs uses user_id, per SDD
 *   11.9) so every RAG-relevant row can be scoped to its owner.
 * - deleted_at (soft delete) is present only where the SDD data model
 *   lists it: notebooks and files.
 * - document_chunks.embedding_vector_ref is a plain text column (JSON or
 *   a reference), not a native vector type — SQLite has no vector type,
 *   and the SDD explicitly allows JSON/file-based storage for the
 *   initial SQLite implementation (section 11.4) while keeping the door
 *   open for a PostgreSQL + pgvector migration later.
 * - notebook_members (SDD 11.11) is intentionally NOT implemented:
 *   sharing is out of MVP scope.
 * - SQLite has no boolean/timestamp types; booleans are stored as
 *   integer 0/1 (`{ mode: "boolean" }`) and timestamps as integer unix
 *   seconds (`{ mode: "timestamp" }`), both handled transparently by
 *   drizzle-orm.
 */

import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { randomUUID } from "node:crypto";

/** Shared UUID primary key column, generated client-side at insert time. */
function idColumn() {
  return text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID());
}

/** Shared created_at column, defaulting to the current unix timestamp. */
function createdAtColumn() {
  return integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`);
}

/**
 * Shared updated_at column. Drizzle has no automatic "touch on update"
 * behavior (unlike Prisma's @updatedAt) — application code updating a
 * row should explicitly set `updatedAt: new Date()` when that lands in
 * a later phase.
 */
function updatedAtColumn() {
  return integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`);
}

// ------------------------------------------------------------------
// 11.1 users
// ------------------------------------------------------------------
export const users = sqliteTable("users", {
  id: idColumn(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  /** "admin" | "user" */
  role: text("role").notNull().default("user"),
  locale: text("locale").notNull().default("ja"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  mustChangePassword: integer("must_change_password", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
  lastLoginAt: integer("last_login_at", { mode: "timestamp" }),
});

// ------------------------------------------------------------------
// sessions
//
// Not part of the SDD's section 11 table list (which predates the
// Phase 3 auth implementation) — added here to back "Cookie-based
// session" auth (SDD section 10.1 / this Phase's requirements) with a
// server-side, revocable session store rather than a stateless JWT.
// The cookie only carries an opaque random token (this table's id);
// no user data is embedded client-side.
// ------------------------------------------------------------------
export const sessions = sqliteTable(
  "sessions",
  {
    /** Opaque random session token (also the cookie value). */
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    createdAt: createdAtColumn(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

// ------------------------------------------------------------------
// 11.2 notebooks
// ------------------------------------------------------------------
export const notebooks = sqliteTable(
  "notebooks",
  {
    id: idColumn(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    description: text("description"),
    defaultRagStrategy: text("default_rag_strategy").notNull().default("hyde"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    deletedAt: integer("deleted_at", { mode: "timestamp" }),
  },
  (table) => [index("notebooks_owner_user_id_idx").on(table.ownerUserId)],
);

// ------------------------------------------------------------------
// 11.3 files
// ------------------------------------------------------------------
export const files = sqliteTable(
  "files",
  {
    id: idColumn(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id),
    notebookId: text("notebook_id")
      .notNull()
      .references(() => notebooks.id),
    originalFilename: text("original_filename").notNull(),
    storedObjectKey: text("stored_object_key").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    /** uploaded | extracting | chunking | embedding | ready | failed | deleted */
    status: text("status").notNull().default("uploaded"),
    sha256: text("sha256").notNull(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    deletedAt: integer("deleted_at", { mode: "timestamp" }),
  },
  (table) => [
    index("files_owner_user_id_idx").on(table.ownerUserId),
    index("files_notebook_id_idx").on(table.notebookId),
  ],
);

// ------------------------------------------------------------------
// 11.4 document_chunks
// ------------------------------------------------------------------
export const documentChunks = sqliteTable(
  "document_chunks",
  {
    id: idColumn(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id),
    notebookId: text("notebook_id")
      .notNull()
      .references(() => notebooks.id),
    fileId: text("file_id")
      .notNull()
      .references(() => files.id),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    /** Arbitrary JSON (e.g. page number), serialized as text. */
    metadataJson: text("metadata_json"),
    /**
     * JSON-encoded vector or a reference to where the embedding is
     * stored. Not a native vector type in SQLite — see file header note.
     */
    embeddingVectorRef: text("embedding_vector_ref"),
    createdAt: createdAtColumn(),
  },
  (table) => [
    index("document_chunks_owner_user_id_idx").on(table.ownerUserId),
    index("document_chunks_notebook_id_idx").on(table.notebookId),
    index("document_chunks_file_id_idx").on(table.fileId),
  ],
);

// ------------------------------------------------------------------
// 11.5 chat_sessions
// ------------------------------------------------------------------
export const chatSessions = sqliteTable(
  "chat_sessions",
  {
    id: idColumn(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id),
    notebookId: text("notebook_id")
      .notNull()
      .references(() => notebooks.id),
    title: text("title"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    index("chat_sessions_owner_user_id_idx").on(table.ownerUserId),
    index("chat_sessions_notebook_id_idx").on(table.notebookId),
  ],
);

// ------------------------------------------------------------------
// 11.6 chat_messages
// ------------------------------------------------------------------
export const chatMessages = sqliteTable(
  "chat_messages",
  {
    id: idColumn(),
    chatSessionId: text("chat_session_id")
      .notNull()
      .references(() => chatSessions.id),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id),
    notebookId: text("notebook_id")
      .notNull()
      .references(() => notebooks.id),
    /** user | assistant | system */
    role: text("role").notNull(),
    content: text("content").notNull(),
    /** JSON array of citations, serialized as text. */
    citationsJson: text("citations_json"),
    ragRunId: text("rag_run_id"),
    createdAt: createdAtColumn(),
  },
  (table) => [
    index("chat_messages_owner_user_id_idx").on(table.ownerUserId),
    index("chat_messages_notebook_id_idx").on(table.notebookId),
    index("chat_messages_chat_session_id_idx").on(table.chatSessionId),
  ],
);

// ------------------------------------------------------------------
// 11.7 models (LLM/embedding model registry)
// ------------------------------------------------------------------
export const models = sqliteTable("models", {
  id: idColumn(),
  provider: text("provider").notNull(),
  name: text("name").notNull(),
  /** generation | embedding | hyde_generation | reranker */
  modelType: text("model_type").notNull(),
  isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
  isDefaultGeneration: integer("is_default_generation", { mode: "boolean" })
    .notNull()
    .default(false),
  isDefaultEmbedding: integer("is_default_embedding", { mode: "boolean" })
    .notNull()
    .default(false),
  /**
   * Not in the original SDD section 11.7 column list — added in Phase 9
   * so the HyDE generation model (SDD section 14's "Models" admin
   * screen lists it alongside the default generation/embedding model)
   * can be selected the same way as the other two defaults, via a
   * boolean flag on the model row rather than a free-text system
   * setting.
   */
  isDefaultHyde: integer("is_default_hyde", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
});

// ------------------------------------------------------------------
// 11.8 system_settings
// ------------------------------------------------------------------
export const systemSettings = sqliteTable("system_settings", {
  id: idColumn(),
  key: text("key").notNull().unique(),
  /** Arbitrary JSON value, serialized as text. */
  valueJson: text("value_json").notNull(),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
});

// ------------------------------------------------------------------
// 11.9 rag_runs (uses user_id, per SDD 11.9 — not owner_user_id)
// ------------------------------------------------------------------
export const ragRuns = sqliteTable(
  "rag_runs",
  {
    id: idColumn(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    notebookId: text("notebook_id")
      .notNull()
      .references(() => notebooks.id),
    strategyName: text("strategy_name").notNull(),
    query: text("query").notNull(),
    /**
     * HyDE's hypothetical document. Retrieval-only — never the basis for
     * the final answer (see SDD 13.3 / 13.5).
     */
    hydeDocument: text("hyde_document"),
    /** JSON array of retrieved document_chunks.id values, serialized as text. */
    retrievedChunkIdsJson: text("retrieved_chunk_ids_json"),
    latencyMs: integer("latency_ms"),
    createdAt: createdAtColumn(),
  },
  (table) => [
    index("rag_runs_user_id_idx").on(table.userId),
    index("rag_runs_notebook_id_idx").on(table.notebookId),
  ],
);

// ------------------------------------------------------------------
// 11.10 audit_logs
// ------------------------------------------------------------------
export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: idColumn(),
    actorUserId: text("actor_user_id").references(() => users.id),
    action: text("action").notNull(),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    /** Arbitrary JSON, serialized as text. */
    metadataJson: text("metadata_json"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: createdAtColumn(),
  },
  (table) => [index("audit_logs_actor_user_id_idx").on(table.actorUserId)],
);
