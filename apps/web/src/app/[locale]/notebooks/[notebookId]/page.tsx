"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslation } from "@/i18n/use-translation";
import { ApiError, deleteNotebook, getNotebook, updateNotebook, type Notebook } from "@/lib/api-client";
import { NotebookChatPanel } from "@/components/notebook-chat-panel";
import { NotebookSourcesPanel } from "@/components/notebook-sources-panel";

type LoadState = "loading" | "ready" | "not_found" | "error";

/**
 * Phase 13: the full 3-column notebook screen (SDD section 7.2).
 * Left column (My Notebooks list + New Notebook button) lives in the
 * parent layout (notebooks/layout.tsx via NotebookSidebar) and is
 * shared across every page under /notebooks. This page renders the
 * center (chat, via NotebookChatPanel) and right (Sources, via
 * NotebookSourcesPanel) columns side by side, plus a compact edit/
 * delete row for the notebook itself (carried over from Phase 6).
 */
export default function NotebookDetailPage() {
  const params = useParams<{ locale: string; notebookId: string }>();
  const router = useRouter();
  const { t } = useTranslation("notebook");
  const { t: tCommon } = useTranslation("common");

  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [state, setState] = useState<LoadState>("loading");

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState("loading");

    getNotebook(params.notebookId)
      .then((nb) => {
        if (cancelled) return;
        setNotebook(nb);
        setTitle(nb.title);
        setDescription(nb.description ?? "");
        setState("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // A 403 (belongs to someone else) and a 404 (doesn't exist) are
        // shown identically — the UI never reveals which case it was,
        // matching the API's own "don't leak other users' resources"
        // behavior (see OwnershipGuard).
        if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
          setState("not_found");
        } else {
          setState("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [params.notebookId]);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError(null);
    setSaving(true);
    try {
      const updated = await updateNotebook(params.notebookId, { title, description });
      setNotebook(updated);
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(t("deleteConfirm"))) return;
    await deleteNotebook(params.notebookId);
    router.push(`/${params.locale}/notebooks`);
  }

  if (state === "loading") {
    return <p>{tCommon("loading")}</p>;
  }

  if (state === "not_found") {
    return (
      <div className="notebook-detail">
        <h2>{t("notFoundTitle")}</h2>
        <p>{t("notFoundBody")}</p>
      </div>
    );
  }

  if (state === "error" || !notebook) {
    return (
      <div className="notebook-detail">
        <p className="error-text">{t("notFoundBody")}</p>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="notebook-detail">
        <form onSubmit={handleSave} className="notebook-detail__form">
          <label>
            {t("titleLabel")}
            <input value={title} onChange={(event) => setTitle(event.target.value)} required />
          </label>
          <label>
            {t("descriptionLabel")}
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
          </label>
          {saveError && <p className="error-text">{saveError}</p>}
          <div className="notebook-detail__actions">
            <button type="submit" disabled={saving}>
              {saving ? tCommon("loading") : tCommon("save")}
            </button>
            <button type="button" onClick={() => setEditing(false)}>
              {tCommon("cancel")}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="notebook-columns">
      <div className="notebook-columns__center">
        <div className="notebook-detail__meta-row">
          {notebook.description && <p className="notebook-detail__description">{notebook.description}</p>}
          <div className="notebook-detail__actions notebook-detail__actions--compact">
            <button type="button" onClick={() => setEditing(true)}>
              {t("editButton")}
            </button>
            <button type="button" onClick={handleDelete}>
              {t("deleteButton")}
            </button>
          </div>
        </div>
        <NotebookChatPanel notebook={notebook} onNotebookUpdated={setNotebook} />
      </div>
      <div className="notebook-columns__right">
        <NotebookSourcesPanel notebookId={notebook.id} />
      </div>
    </div>
  );
}
