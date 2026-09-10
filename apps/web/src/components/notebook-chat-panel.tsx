"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/i18n/use-translation";
import { publicEnv } from "@/config/public-env";
import {
  ApiError,
  getChatHistory,
  sendChatMessage,
  updateNotebook,
  type Citation,
  type Notebook,
} from "@/lib/api-client";
import { BotIcon, SendIcon, UserIcon } from "./icons";

interface ChatEntry {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  strategyName?: string | null;
  hydeDocument?: string | null;
  createdAt?: string;
}

interface Props {
  notebook: Notebook;
  onNotebookUpdated: (notebook: Notebook) => void;
}

/** Groups consecutive entries under the same calendar day, for the date-divider display. */
function dateKey(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

/**
 * The center column's chat area. On mount, loads the notebook's full
 * chat history (every past session, not just this browser tab's own
 * in-memory log) via `GET /api/notebooks/:id/chat/history`, so
 * conversations from earlier visits — even days or weeks ago — are
 * visible again. New messages continue the most recent session found
 * in that history (if any), so the server-side conversation stays
 * one continuous thread rather than fragmenting into a new session
 * every time the page is reloaded.
 */
export function NotebookChatPanel({ notebook, onNotebookUpdated }: Props) {
  const { t } = useTranslation("notebook");

  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedDetails, setExpandedDetails] = useState<Set<number>>(new Set());
  const [savingStrategy, setSavingStrategy] = useState(false);

  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true);

    getChatHistory(notebook.id)
      .then((messages) => {
        if (cancelled) return;
        setEntries(
          messages.map((message) => ({
            role: message.role === "assistant" ? "assistant" : "user",
            content: message.content,
            citations: message.citations,
            strategyName: message.strategyName,
            hydeDocument: message.hydeDocument,
            createdAt: message.createdAt,
          })),
        );
        // Continue the most recent session, so new messages stay part
        // of the same ongoing conversation instead of starting a fresh
        // one on every page visit.
        const last = messages[messages.length - 1];
        if (last) setSessionId(last.chatSessionId);
      })
      .catch(() => {
        // No history to show is not fatal — the chat still works,
        // it just starts from an empty log for this visit.
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notebook.id]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [entries]);

  async function handleSend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = input.trim();
    if (!message || sending) return;

    setError(null);
    setSending(true);
    setEntries((prev) => [...prev, { role: "user", content: message, createdAt: new Date().toISOString() }]);
    setInput("");

    try {
      const result = await sendChatMessage(notebook.id, { message, sessionId });
      setSessionId(result.sessionId);
      setEntries((prev) => [
        ...prev,
        {
          role: "assistant",
          content: result.answer,
          citations: result.citations,
          strategyName: result.strategyName,
          hydeDocument: result.hydeDocument,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to send message.");
    } finally {
      setSending(false);
    }
  }

  async function handleStrategyChange(strategy: "standard" | "hyde") {
    setSavingStrategy(true);
    try {
      const updated = await updateNotebook(notebook.id, { defaultRagStrategy: strategy });
      onNotebookUpdated(updated);
    } catch {
      // Leave the select showing the previous value on failure — the
      // notebook prop itself won't have changed, so a re-render
      // naturally reflects that.
    } finally {
      setSavingStrategy(false);
    }
  }

  function toggleDetails(index: number) {
    setExpandedDetails((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  return (
    <div className="notebook-chat">
      <div className="notebook-chat__header">
        <h1 className="notebook-chat__title">{notebook.title}</h1>

        <div className="notebook-chat__strategy">
          <span className="notebook-chat__strategy-label">{t("ragStrategyLabel")}:</span>
          {publicEnv.allowNotebookRagOverride ? (
            <select
              value={notebook.defaultRagStrategy === "standard" ? "standard" : "hyde"}
              onChange={(event) => handleStrategyChange(event.target.value as "standard" | "hyde")}
              disabled={savingStrategy}
              className="notebook-chat__strategy-select"
            >
              <option value="standard">{t("ragStrategyStandard")}</option>
              <option value="hyde">{t("ragStrategyHyde")}</option>
            </select>
          ) : (
            <span className="notebook-chat__strategy-badge">
              {notebook.defaultRagStrategy === "standard" ? t("ragStrategyStandard") : t("ragStrategyHyde")}
            </span>
          )}
        </div>
        <p className="notebook-chat__strategy-note">{t("ragStrategyNote")}</p>
      </div>

      <div ref={logRef} className="notebook-chat__log">
        {historyLoading && <p className="notebook-chat__empty">{t("chatHistoryLoading")}</p>}
        {!historyLoading && entries.length === 0 && <p className="notebook-chat__empty">{t("chatEmpty")}</p>}

        {entries.map((entry, index) => {
          const previousKey = index > 0 ? dateKey(entries[index - 1].createdAt) : "";
          const currentKey = dateKey(entry.createdAt);
          const showDateDivider = currentKey && currentKey !== previousKey;

          return (
            <div key={index}>
              {showDateDivider && <div className="notebook-chat__date-divider">{currentKey}</div>}
              <div
                className={
                  entry.role === "user"
                    ? "notebook-chat__row notebook-chat__row--user"
                    : "notebook-chat__row notebook-chat__row--assistant"
                }
              >
                {entry.role === "assistant" && (
                  <span className="notebook-chat__avatar notebook-chat__avatar--bot">
                    <BotIcon className="notebook-chat__avatar-icon" />
                  </span>
                )}
                <div
                  className={
                    entry.role === "user"
                      ? "notebook-chat__message notebook-chat__message--user"
                      : "notebook-chat__message notebook-chat__message--assistant"
                  }
                >
                {/* Plain-text rendering only — React escapes `{entry.content}` by
                    default, so LLM output is never interpreted as HTML/script.
                    No dangerouslySetInnerHTML anywhere in this component. */}
                <p className="notebook-chat__message-content">{entry.content}</p>

                {entry.role === "assistant" && entry.citations && entry.citations.length > 0 && (
                  <div className="notebook-chat__citations">
                    <span className="notebook-chat__citations-label">{t("citationsLabel")}:</span>
                    {entry.citations.map((citation) => (
                      <span key={citation.chunkId} className="notebook-chat__citation-badge">
                        [{citation.index}] {citation.originalFilename}
                        {citation.page !== undefined ? ` (p.${citation.page})` : ""}
                      </span>
                    ))}
                  </div>
                )}

                {entry.role === "assistant" && publicEnv.showRetrievalDebug && (
                  <div className="notebook-chat__retrieval">
                    <button type="button" className="notebook-chat__retrieval-toggle" onClick={() => toggleDetails(index)}>
                      {t("retrievalDetailsLabel")} {expandedDetails.has(index) ? "▲" : "▼"}
                    </button>
                    {expandedDetails.has(index) && (
                      <div className="notebook-chat__retrieval-body">
                        <p className="notebook-chat__retrieval-strategy">
                          {t("strategyUsedLabel")}:{" "}
                          {entry.strategyName === "standard" ? t("ragStrategyStandard") : t("ragStrategyHyde")}
                        </p>
                        {entry.hydeDocument && (
                          <p className="notebook-chat__hyde-document">
                            <strong>{t("hydeDocumentLabel")}:</strong> {entry.hydeDocument}
                          </p>
                        )}
                        {!entry.citations || entry.citations.length === 0 ? (
                          <p>{t("retrievalDetailsEmpty")}</p>
                        ) : (
                          <table className="notebook-chat__retrieval-table">
                            <thead>
                              <tr>
                                <th>#</th>
                                <th>{t("citationsLabel")}</th>
                                <th>{t("retrievalDetailsScore")}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {entry.citations.map((citation) => (
                                <tr key={citation.chunkId}>
                                  <td>[{citation.index}]</td>
                                  <td>
                                    {citation.originalFilename}
                                    {citation.page !== undefined ? ` (${t("retrievalDetailsPage")} ${citation.page})` : ""}
                                  </td>
                                  <td>{citation.score.toFixed(3)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </div>
                )}
                </div>
                {entry.role === "user" && (
                  <span className="notebook-chat__avatar notebook-chat__avatar--user">
                    <UserIcon className="notebook-chat__avatar-icon" />
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {error && <p className="error-text">{error}</p>}

      <form onSubmit={handleSend} className="notebook-chat__input-form">
        <input
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={t("chatInputPlaceholder")}
          disabled={sending}
          className="notebook-chat__input"
        />
        <button type="submit" disabled={sending || !input.trim()} aria-label={t("chatSendButton")}>
          <SendIcon className="notebook-chat__send-icon" />
        </button>
      </form>
    </div>
  );
}
