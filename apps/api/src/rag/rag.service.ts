import { Injectable } from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";
import { DbService } from "../db/db.service";
import { chatMessages, chatSessions, ragRuns } from "../db/schema";
import { RagStrategyResolver } from "./rag-strategy-resolver.service";
import type { Citation } from "./strategies/rag-strategy.interface";

export interface ChatInput {
  ownerUserId: string;
  notebookId: string;
  /** If omitted, a new chat session is created for this notebook. */
  sessionId?: string;
  message: string;
}

export interface ChatResult {
  sessionId: string;
  answer: string;
  citations: Citation[];
  ragRunId: string;
  strategyName: "standard" | "hyde";
  /**
   * Only set when the strategy is "hyde". `RagController` decides
   * whether to actually include this in the HTTP response
   * (`ALLOW_HYDE_DOCUMENT_PREVIEW`) — it is always returned here so
   * that decision can be made without a second lookup, and it is
   * always persisted to `rag_runs.hyde_document` regardless of that
   * setting (see `RagService.chat` below).
   */
  hydeDocument?: string;
}

export interface HistoryMessage {
  id: string;
  chatSessionId: string;
  role: string;
  content: string;
  citations: Citation[];
  strategyName: string | null;
  hydeDocument: string | null;
  createdAt: string;
}

/**
 * Orchestrates a single chat turn: resolve which `RagStrategy`
 * (Standard or HyDE — Phase 12) applies to this notebook, run it, and
 * persist the interaction (`chat_messages` for both the user's
 * question and the assistant's answer, `rag_runs` for the
 * retrieval/generation record). Has no opinion of its own about
 * *how* retrieval or generation happens — that's entirely each
 * `RagStrategy`'s job, resolved by `RagStrategyResolver`.
 */
@Injectable()
export class RagService {
  constructor(
    private readonly dbService: DbService,
    private readonly ragStrategyResolver: RagStrategyResolver,
  ) {}

  private get db() {
    return this.dbService.db;
  }

  /**
   * The full chat history for a notebook, across every session ever
   * created in it, in chronological order — not just the current
   * browser tab's in-memory log. Left-joined with `rag_runs` (via
   * `chat_messages.rag_run_id`) so each historical assistant message
   * can show the same "Retrieval Details" (strategy name, HyDE
   * document) a live response would, without a second round trip.
   *
   * Scoped by BOTH notebookId and ownerUserId, as defense in depth —
   * the caller (RagController) is already ownership-checked via
   * `OwnershipGuard`, but this mirrors VectorSearchService's own
   * "never rely on the guard alone" pattern.
   */
  getHistory(notebookId: string, ownerUserId: string): HistoryMessage[] {
    const rows = this.db
      .select({
        id: chatMessages.id,
        chatSessionId: chatMessages.chatSessionId,
        role: chatMessages.role,
        content: chatMessages.content,
        citationsJson: chatMessages.citationsJson,
        strategyName: ragRuns.strategyName,
        hydeDocument: ragRuns.hydeDocument,
        createdAt: chatMessages.createdAt,
      })
      .from(chatMessages)
      .leftJoin(ragRuns, eq(ragRuns.id, chatMessages.ragRunId))
      .where(and(eq(chatMessages.notebookId, notebookId), eq(chatMessages.ownerUserId, ownerUserId)))
      .orderBy(asc(chatMessages.createdAt))
      .all();

    return rows.map((row) => ({
      id: row.id,
      chatSessionId: row.chatSessionId,
      role: row.role,
      content: row.content,
      citations: parseCitations(row.citationsJson),
      strategyName: row.strategyName ?? null,
      hydeDocument: row.hydeDocument ?? null,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    }));
  }

  async chat(input: ChatInput): Promise<ChatResult> {
    const startedAt = Date.now();
    const sessionId = this.resolveSession(input.ownerUserId, input.notebookId, input.sessionId);

    // Store the user's message immediately, so it's recorded even if
    // retrieval/generation subsequently fails.
    this.db
      .insert(chatMessages)
      .values({
        chatSessionId: sessionId,
        ownerUserId: input.ownerUserId,
        notebookId: input.notebookId,
        role: "user",
        content: input.message,
      })
      .run();

    const strategy = this.ragStrategyResolver.resolve(input.notebookId);

    // Retrieval is always scoped by ownerUserId + notebookId — see
    // VectorSearchService's own header comment for why this is never
    // relaxed, not even for admins. Every strategy calls
    // VectorSearchService the same way, so this holds regardless of
    // which strategy is selected.
    const outcome = await strategy.execute({
      ownerUserId: input.ownerUserId,
      notebookId: input.notebookId,
      message: input.message,
    });

    const latencyMs = Date.now() - startedAt;

    const [ragRun] = this.db
      .insert(ragRuns)
      .values({
        userId: input.ownerUserId,
        notebookId: input.notebookId,
        strategyName: strategy.name,
        query: input.message,
        // Saved regardless of ALLOW_HYDE_DOCUMENT_PREVIEW — that
        // setting only governs the API response, not persistence
        // (this Phase's own "rag_runs.hyde_documentに保存してよい").
        hydeDocument: outcome.hydeDocument ?? null,
        retrievedChunkIdsJson: JSON.stringify(outcome.retrievedChunkIds),
        latencyMs,
      })
      .returning({ id: ragRuns.id })
      .all();

    this.db
      .insert(chatMessages)
      .values({
        chatSessionId: sessionId,
        ownerUserId: input.ownerUserId,
        notebookId: input.notebookId,
        role: "assistant",
        content: outcome.answer,
        citationsJson: JSON.stringify(outcome.citations),
        ragRunId: ragRun.id,
      })
      .run();

    return {
      sessionId,
      answer: outcome.answer,
      citations: outcome.citations,
      ragRunId: ragRun.id,
      strategyName: strategy.name,
      hydeDocument: outcome.hydeDocument,
    };
  }

  /** Returns an existing session's id (if it exists) or creates a new one for this notebook. */
  private resolveSession(ownerUserId: string, notebookId: string, sessionId: string | undefined): string {
    if (sessionId) {
      const existing = this.db
        .select({ id: chatSessions.id })
        .from(chatSessions)
        .where(eq(chatSessions.id, sessionId))
        .get();
      if (existing) return existing.id;
      // Falls through to create a new session if the given id doesn't
      // exist — e.g. a stale client-side reference — rather than erroring.
    }

    const [created] = this.db
      .insert(chatSessions)
      .values({ ownerUserId, notebookId })
      .returning({ id: chatSessions.id })
      .all();
    return created.id;
  }
}

function parseCitations(citationsJson: string | null): Citation[] {
  if (!citationsJson) return [];
  try {
    const parsed = JSON.parse(citationsJson);
    return Array.isArray(parsed) ? (parsed as Citation[]) : [];
  } catch {
    return [];
  }
}
