/**
 * Thin fetch wrapper for calling apps/api from the browser.
 *
 * Handles the three things every call needs:
 * - `credentials: "include"` so the session cookie is sent (apps/web and
 *   apps/api are different origins in dev — same hostname, different
 *   port — so this isn't automatic).
 * - Attaching the CSRF token header on state-changing requests (SDD
 *   section 16.3 / this Phase's CSRF requirement).
 * - Reshaping error responses (`{ error: { code, message } }`, per SDD
 *   15.6) into a typed `ApiError`.
 */

import { publicEnv } from "@/config/public-env";

let cachedCsrfToken: string | null = null;
let inFlightCsrfRequest: Promise<string> | null = null;

/**
 * Fetches a fresh CSRF token/cookie pair.
 *
 * Concurrent callers share a single in-flight request (via
 * `inFlightCsrfRequest`) rather than each firing their own GET
 * `/api/auth/csrf`. Without this, two near-simultaneous calls — e.g.
 * React 18 StrictMode deliberately double-invoking a mount effect in
 * development — could each set a *different* CSRF cookie value, and
 * whichever response's cookie the browser stores last might not be the
 * same one whichever response's token this module cached last. That
 * mismatch shows up as "Missing or invalid CSRF token." on the very
 * next submit, even though nothing was actually wrong with the request.
 */
export async function fetchCsrfToken(): Promise<string> {
  if (inFlightCsrfRequest) {
    return inFlightCsrfRequest;
  }

  inFlightCsrfRequest = (async () => {
    const res = await fetch(`${publicEnv.apiBaseUrl}/api/auth/csrf`, {
      method: "GET",
      credentials: "include",
    });
    if (!res.ok) {
      throw new Error("Failed to obtain a CSRF token.");
    }
    const data = (await res.json()) as { csrfToken: string };
    cachedCsrfToken = data.csrfToken;
    return data.csrfToken;
  })();

  try {
    return await inFlightCsrfRequest;
  } finally {
    inFlightCsrfRequest = null;
  }
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

interface ApiFetchOptions {
  method?: string;
  body?: unknown;
}

/**
 * Calls `{apiBaseUrl}{path}`, always with credentials included. For
 * mutating methods, fetches (and caches in-memory) a CSRF token first
 * and attaches it via the configured header name.
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (MUTATING_METHODS.has(method)) {
    const token = cachedCsrfToken ?? (await fetchCsrfToken());
    headers[publicEnv.csrfHeaderName] = token;
  }

  const res = await fetch(`${publicEnv.apiBaseUrl}${path}`, {
    method,
    credentials: "include",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    let code = "UNKNOWN_ERROR";
    let message = res.statusText;
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string } };
      if (body?.error?.code) code = body.error.code;
      if (body?.error?.message) message = body.error.message;
    } catch {
      // Response wasn't JSON — fall back to the defaults above.
    }
    throw new ApiError(res.status, code, message);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
  role: "admin" | "user";
  locale: "ja" | "en";
  mustChangePassword: boolean;
}

let inFlightCurrentUserRequest: Promise<CurrentUser | null> | null = null;

/**
 * Returns the current user, or `null` if not logged in (401).
 *
 * Concurrent callers share a single in-flight request (same pattern as
 * `fetchCsrfToken()` above, for the same reason: React 18 StrictMode
 * deliberately double-invokes a mount effect in development, and
 * `AppHeader` calls this once per mount). Without this, two near-
 * simultaneous calls fire two separate GET `/api/auth/me` requests for
 * no benefit — wasted load, and pure noise when reading network logs
 * while diagnosing something else.
 */
export async function fetchCurrentUser(): Promise<CurrentUser | null> {
  if (inFlightCurrentUserRequest) {
    return inFlightCurrentUserRequest;
  }

  inFlightCurrentUserRequest = (async () => {
    const res = await fetch(`${publicEnv.apiBaseUrl}/api/auth/me`, {
      method: "GET",
      credentials: "include",
    });
    if (res.status === 401) return null;
    if (!res.ok) throw new Error("Failed to fetch the current user.");
    const data = (await res.json()) as { user: CurrentUser };
    return data.user;
  })();

  try {
    return await inFlightCurrentUserRequest;
  } finally {
    inFlightCurrentUserRequest = null;
  }
}

export async function login(email: string, password: string): Promise<CurrentUser> {
  const data = await apiFetch<{ user: CurrentUser }>("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
  return data.user;
}

export async function logout(): Promise<void> {
  await apiFetch("/api/auth/logout", { method: "POST" });
  // Not strictly necessary (the token isn't session-bound), but avoids
  // reusing a token from a now-ended session on the next mutating call.
  cachedCsrfToken = null;
}

/**
 * Best-effort report of a client-side-only problem (e.g. "a redirect
 * that should have happened didn't") into the server's audit log, so
 * it's visible on the admin "Audit Logs" screen instead of only in a
 * browser console that closes with the tab. Never throws — a failure
 * to report a problem must never itself become a second, more
 * confusing problem.
 */
export async function reportClientIssue(message: string, context?: Record<string, unknown>): Promise<void> {
  try {
    await apiFetch("/api/client-log", { method: "POST", body: { level: "error", message, context } });
  } catch {
    // Best-effort only — see the doc comment above.
  }
}

/** Verifies `currentPassword` before setting `newPassword`, and clears `mustChangePassword` on success. */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiFetch("/api/auth/change-password", { method: "POST", body: { currentPassword, newPassword } });
}

export interface Notebook {
  id: string;
  ownerUserId: string;
  title: string;
  description: string | null;
  defaultRagStrategy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** Lists only the caller's own, non-deleted notebooks. */
export async function listNotebooks(): Promise<Notebook[]> {
  const data = await apiFetch<{ notebooks: Notebook[] }>("/api/notebooks");
  return data.notebooks;
}

export async function createNotebook(input: { title: string; description?: string }): Promise<Notebook> {
  const data = await apiFetch<{ notebook: Notebook }>("/api/notebooks", {
    method: "POST",
    body: input,
  });
  return data.notebook;
}

/** Throws `ApiError` with status 403 if the notebook belongs to another user, or 404 if it doesn't exist. */
export async function getNotebook(id: string): Promise<Notebook> {
  const data = await apiFetch<{ notebook: Notebook }>(`/api/notebooks/${id}`);
  return data.notebook;
}

export async function updateNotebook(
  id: string,
  input: { title?: string; description?: string; defaultRagStrategy?: "standard" | "hyde" },
): Promise<Notebook> {
  const data = await apiFetch<{ notebook: Notebook }>(`/api/notebooks/${id}`, {
    method: "PUT",
    body: input,
  });
  return data.notebook;
}

/** Soft-delete — the notebook disappears from listings but the row itself is kept server-side. */
export async function deleteNotebook(id: string): Promise<void> {
  await apiFetch<void>(`/api/notebooks/${id}`, { method: "DELETE" });
}

export interface FileRecord {
  id: string;
  ownerUserId: string;
  notebookId: string;
  originalFilename: string;
  storedObjectKey: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  sha256: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** Lists only non-deleted files for the given notebook. */
export async function listNotebookFiles(notebookId: string): Promise<FileRecord[]> {
  const data = await apiFetch<{ files: FileRecord[] }>(`/api/notebooks/${notebookId}/files`);
  return data.files;
}

/**
 * Uploads a file to a notebook. Bypasses `apiFetch` (which always sends
 * JSON) since a `multipart/form-data` body must NOT have its
 * `Content-Type` set manually — the browser needs to add its own
 * boundary parameter, which `fetch` does automatically only when the
 * `Content-Type` header is left unset and a `FormData` body is passed.
 */
export async function uploadFile(notebookId: string, file: File): Promise<FileRecord> {
  const token = cachedCsrfToken ?? (await fetchCsrfToken());
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${publicEnv.apiBaseUrl}/api/notebooks/${notebookId}/files`, {
    method: "POST",
    credentials: "include",
    headers: { [publicEnv.csrfHeaderName]: token },
    body: formData,
  });

  if (!res.ok) {
    let code = "UNKNOWN_ERROR";
    let message = res.statusText;
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string } };
      if (body?.error?.code) code = body.error.code;
      if (body?.error?.message) message = body.error.message;
    } catch {
      // Response wasn't JSON — fall back to the defaults above.
    }
    throw new ApiError(res.status, code, message);
  }

  const data = (await res.json()) as { file: FileRecord };
  return data.file;
}

/** Soft-delete — best-effort removes the physical object server-side too. */
export async function deleteFile(id: string): Promise<void> {
  await apiFetch<void>(`/api/files/${id}`, { method: "DELETE" });
}

export interface OllamaStatus {
  connected: boolean;
  baseUrl: string;
  error?: string;
}

/** Admin-only. Checks whether apps/api can reach Ollama right now. */
export async function getOllamaStatus(): Promise<OllamaStatus> {
  return apiFetch<OllamaStatus>("/api/admin/ollama/status");
}

export interface ModelRow {
  id: string;
  provider: string;
  name: string;
  modelType: string;
  isEnabled: boolean;
  isDefaultGeneration: boolean;
  isDefaultEmbedding: boolean;
  isDefaultHyde: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Admin-only. Lists every model synced into the local registry (not a live Ollama call). */
export async function listModels(): Promise<ModelRow[]> {
  const data = await apiFetch<{ models: ModelRow[] }>("/api/admin/models");
  return data.models;
}

/** Admin-only. Pulls the current model list from Ollama and upserts it into the registry. */
export async function syncModelsFromOllama(): Promise<{
  added: number;
  updated: number;
  total: number;
  models: ModelRow[];
}> {
  return apiFetch("/api/admin/models/sync-ollama", { method: "POST" });
}

/** Admin-only. Sets any combination of the default generation/embedding/HyDE models. */
export async function updateOllamaSettings(input: {
  defaultGenerationModelId?: string;
  defaultEmbeddingModelId?: string;
  hydeGenerationModelId?: string;
}): Promise<{ models: ModelRow[] }> {
  return apiFetch("/api/admin/ollama/settings", { method: "PUT", body: input });
}

/** Admin-only. Toggles a single model's enabled state. */
export async function setModelEnabled(id: string, isEnabled: boolean): Promise<ModelRow> {
  const data = await apiFetch<{ model: ModelRow }>(`/api/admin/models/${id}`, {
    method: "PUT",
    body: { isEnabled },
  });
  return data.model;
}

export interface Citation {
  index: number;
  chunkId: string;
  fileId: string;
  originalFilename: string;
  page?: number;
  score: number;
}

export interface ChatResult {
  sessionId: string;
  answer: string;
  citations: Citation[];
  ragRunId: string;
  strategyName: "standard" | "hyde";
  hydeDocument?: string;
}

/** Standard/HyDE RAG chat — whichever strategy is resolved for this notebook. */
export async function sendChatMessage(
  notebookId: string,
  input: { message: string; sessionId?: string },
): Promise<ChatResult> {
  return apiFetch(`/api/notebooks/${notebookId}/chat`, { method: "POST", body: input });
}

export interface HistoryMessage {
  id: string;
  chatSessionId: string;
  role: string;
  content: string;
  citations: Citation[];
  strategyName: string | null;
  hydeDocument?: string | null;
  createdAt: string;
}

/** The full chat history for a notebook, across every past session — not just the current tab's in-memory log. */
export async function getChatHistory(notebookId: string): Promise<HistoryMessage[]> {
  const data = await apiFetch<{ messages: HistoryMessage[] }>(`/api/notebooks/${notebookId}/chat/history`);
  return data.messages;
}

export interface FilePreviewChunk {
  chunkIndex: number;
  content: string;
  metadataJson: string | null;
}

/** Shows the extracted chunk text for a file (not the raw original bytes). */
export async function getFilePreview(fileId: string): Promise<{ file: FileRecord; chunks: FilePreviewChunk[] }> {
  return apiFetch(`/api/files/${fileId}/preview`);
}

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: "admin" | "user";
  locale: string;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

/** Admin-only. */
export async function listAdminUsers(): Promise<AdminUser[]> {
  const data = await apiFetch<{ users: AdminUser[] }>("/api/admin/users");
  return data.users;
}

/** Admin-only. */
export async function createAdminUser(input: {
  email: string;
  password: string;
  displayName: string;
  role: "admin" | "user";
  locale: "ja" | "en";
}): Promise<AdminUser> {
  const data = await apiFetch<{ user: AdminUser }>("/api/admin/users", { method: "POST", body: input });
  return data.user;
}

/** Admin-only. Updates role and/or active status for a user. */
export async function updateAdminUser(
  id: string,
  input: { role?: "admin" | "user"; isActive?: boolean },
): Promise<AdminUser> {
  const data = await apiFetch<{ user: AdminUser }>(`/api/admin/users/${id}`, { method: "PUT", body: input });
  return data.user;
}

export interface AdminFileRow {
  id: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  ownerEmail: string;
  notebookTitle: string;
  createdAt: string;
}

/** Admin-only. Cross-user file listing. */
export async function listAdminFiles(): Promise<AdminFileRow[]> {
  const data = await apiFetch<{ files: AdminFileRow[] }>("/api/admin/files");
  return data.files;
}

export interface AdminDashboard {
  userCount: number;
  notebookCount: number;
  fileCount: number;
  ragRunCount: number;
  ollamaStatus: OllamaStatus;
}

/** Admin-only. */
export async function getAdminDashboard(): Promise<AdminDashboard> {
  return apiFetch("/api/admin/dashboard");
}

export interface AdminAuditLog {
  id: string;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  metadataJson: string | null;
  ipAddress: string | null;
  createdAt: string;
}

/** Admin-only. Most recent audit log entries, newest first. */
export async function listAdminAuditLogs(): Promise<AdminAuditLog[]> {
  const data = await apiFetch<{ logs: AdminAuditLog[] }>("/api/admin/audit-logs");
  return data.logs;
}

export interface AdminSystemInfo {
  storage: { driver: string; localRoot: string; maxUploadSizeMb: number };
  security: {
    csrfEnabled: boolean;
    cookieName: string;
    cookieSecure: boolean;
    cookieSameSite: string;
    allowedExtensions: string[];
  };
  i18n: { defaultLocale: string; supportedLocales: string[] };
  system: { nodeEnv: string; uptimeSeconds: number };
}

/** Admin-only. Read-only bundle backing Storage/Security/i18n Settings and System Health. */
export async function getAdminSystemInfo(): Promise<AdminSystemInfo> {
  return apiFetch("/api/admin/system-info");
}

export interface RagSettings {
  defaultStrategy: "standard" | "hyde";
  hydePromptTemplate: string;
  allowNotebookOverride: boolean;
  allowHydeDocumentPreview: boolean;
  topK: number;
  similarityThreshold: number;
}

/** Admin-only. */
export async function getRagSettings(): Promise<RagSettings> {
  return apiFetch("/api/admin/rag/settings");
}

/** Admin-only. */
export async function updateRagSettings(input: {
  defaultStrategy?: "standard" | "hyde";
  hydePromptTemplate?: string;
}): Promise<RagSettings> {
  return apiFetch("/api/admin/rag/settings", { method: "PUT", body: input });
}

/**
 * The editable landing-page (`/`) usage guide text. Readable by anyone
 * (including signed-out visitors) — only `updateUsageGuide` is admin-only.
 */
export async function getUsageGuide(): Promise<string> {
  const data = await apiFetch<{ content: string }>("/api/usage-guide");
  return data.content;
}

/** Admin-only. */
export async function updateUsageGuide(content: string): Promise<string> {
  const data = await apiFetch<{ content: string }>("/api/admin/usage-guide", { method: "PUT", body: { content } });
  return data.content;
}
