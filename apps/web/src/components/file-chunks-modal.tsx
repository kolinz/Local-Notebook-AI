"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/i18n/use-translation";
import { ApiError, getFileChunks, updateFileChunk, type FileChunk } from "@/lib/api-client";

interface Props {
  fileId: string;
  fileName: string;
  onClose: () => void;
}

/**
 * Phase 19: chunk viewer/editor.
 *
 * Deliberately modeled on `FilePreviewModal` (same overlay/panel
 * structure, same "plain-text only, never dangerouslySetInnerHTML"
 * rule for chunk content) rather than a new "tab" inside the Sources
 * panel — this codebase's Sources panel has no tab concept; each file
 * action (preview, summary, delete) already opens its own modal or
 * inline panel from a row of buttons, so this follows that existing
 * pattern instead of introducing a new one.
 *
 * Editing is inline, one chunk at a time: clicking a chunk's edit
 * button turns just that chunk's card into a textarea + save/cancel:
 * saving calls `updateFileChunk`, which overwrites the chunk's text and
 * triggers server-side re-embedding. `chunk.embedded` on the response
 * reflects whether that re-embedding actually succeeded — a failed
 * re-embed is not treated as an error (the edit itself did succeed);
 * the chunk simply shows an "unprocessed / retryable" status, and
 * saving again (even with the same text) retries it.
 */
export function FileChunksModal({ fileId, fileName, onClose }: Props) {
  const { t } = useTranslation("notebook");
  const { t: tCommon } = useTranslation("common");

  const [chunks, setChunks] = useState<FileChunk[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    getFileChunks(fileId)
      .then((data) => {
        if (!cancelled) setChunks(data);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : "Failed to load chunks.");
      });
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  function startEdit(chunk: FileChunk) {
    setEditingId(chunk.id);
    setDraft(chunk.content);
    setSaveErrors((prev) => {
      if (!(chunk.id in prev)) return prev;
      const next = { ...prev };
      delete next[chunk.id];
      return next;
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft("");
  }

  async function saveEdit(chunkId: string) {
    setSavingId(chunkId);
    try {
      const updated = await updateFileChunk(fileId, chunkId, draft);
      setChunks((prev) => (prev ? prev.map((chunk) => (chunk.id === chunkId ? updated : chunk)) : prev));
      setEditingId(null);
      setDraft("");
    } catch (err) {
      setSaveErrors((prev) => ({
        ...prev,
        [chunkId]: err instanceof ApiError ? err.message : t("chunkSaveError"),
      }));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="file-preview-modal__overlay" onClick={onClose}>
      <div className="file-preview-modal__panel" onClick={(event) => event.stopPropagation()}>
        <div className="file-preview-modal__header">
          <h2>{t("chunksTitle")}</h2>
          <button type="button" onClick={onClose}>
            {t("previewClose")}
          </button>
        </div>
        <p className="file-preview-modal__filename">{fileName}</p>

        {loadError && <p className="error-text">{loadError}</p>}
        {!loadError && chunks === null && <p>{tCommon("loading")}</p>}
        {!loadError && chunks !== null && chunks.length === 0 && <p>{t("previewEmpty")}</p>}

        {!loadError && chunks !== null && chunks.length > 0 && (
          <div className="file-preview-modal__chunks">
            {chunks.map((chunk) => {
              const isEditing = editingId === chunk.id;
              const isSaving = savingId === chunk.id;
              const saveError = saveErrors[chunk.id];

              return (
                <div key={chunk.id} className="file-chunks-modal__chunk">
                  <div className="file-chunks-modal__chunk-header">
                    <span className="file-chunks-modal__index">#{chunk.chunkIndex + 1}</span>
                    <span className="file-chunks-modal__char-count">{chunk.charCount}文字</span>
                    {!isEditing && (
                      <span
                        className={
                          chunk.embedded
                            ? "file-chunks-modal__status file-chunks-modal__status--ok"
                            : "file-chunks-modal__status file-chunks-modal__status--pending"
                        }
                      >
                        {chunk.embedded ? t("chunkEmbedded") : t("chunkUnprocessed")}
                      </span>
                    )}
                    {!isEditing && (
                      <button
                        type="button"
                        className="file-chunks-modal__edit-button"
                        onClick={() => startEdit(chunk)}
                      >
                        {t("chunkEditButton")}
                      </button>
                    )}
                  </div>

                  {isEditing ? (
                    <>
                      <textarea
                        className="file-chunks-modal__textarea"
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        rows={5}
                        disabled={isSaving}
                      />
                      {saveError && <p className="error-text">{saveError}</p>}
                      <div className="file-chunks-modal__edit-actions">
                        <button type="button" onClick={cancelEdit} disabled={isSaving}>
                          {t("chunkCancelButton")}
                        </button>
                        <button type="button" onClick={() => void saveEdit(chunk.id)} disabled={isSaving}>
                          {isSaving ? tCommon("loading") : t("chunkSaveButton")}
                        </button>
                        <span className="file-chunks-modal__save-hint">{t("chunkSaveHint")}</span>
                      </div>
                    </>
                  ) : (
                    // Plain-text rendering only, same as FilePreviewModal's
                    // chunk text — extracted (or user-edited) document
                    // text is never interpreted as HTML.
                    <p className="file-preview-modal__chunk">{chunk.content}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
