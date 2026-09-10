"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useTranslation } from "@/i18n/use-translation";
import { ApiError, createNotebook, listNotebooks, type Notebook } from "@/lib/api-client";
import { NotebookIcon } from "./icons";

export function NotebookSidebar() {
  const { t } = useTranslation("notebook");
  const { t: tCommon } = useTranslation("common");
  const params = useParams<{ locale: string }>();
  const pathname = usePathname();
  const router = useRouter();

  const [notebooks, setNotebooks] = useState<Notebook[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function refresh() {
    try {
      setNotebooks(await listNotebooks());
    } catch {
      setNotebooks([]);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const notebook = await createNotebook({
        title,
        description: description.trim() ? description : undefined,
      });
      setTitle("");
      setDescription("");
      setShowForm(false);
      await refresh();
      router.push(`/${params.locale}/notebooks/${notebook.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create notebook.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <aside className="notebook-sidebar">
      <div className="notebook-sidebar__header">
        <h2>{t("myNotebooksTitle")}</h2>
      </div>

      <ul className="notebook-sidebar__list">
        {notebooks === null && <li className="notebook-sidebar__empty">{t("loadingNotebooks")}</li>}
        {notebooks?.length === 0 && <li className="notebook-sidebar__empty">{t("noNotebooks")}</li>}
        {notebooks?.map((notebook) => {
          const href = `/${params.locale}/notebooks/${notebook.id}`;
          const active = pathname === href;
          return (
            <li key={notebook.id}>
              <Link
                href={href}
                className={
                  active ? "notebook-sidebar__item notebook-sidebar__item--active" : "notebook-sidebar__item"
                }
              >
                <NotebookIcon className="notebook-sidebar__item-icon" />
                <span className="notebook-sidebar__item-title">{notebook.title}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      {showForm && (
        <form onSubmit={handleCreate} className="notebook-sidebar__form">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("titlePlaceholder")}
            required
            autoFocus
          />
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t("descriptionPlaceholder")}
            rows={2}
          />
          {error && <p className="error-text">{error}</p>}
          <div className="notebook-sidebar__form-actions">
            <button type="submit" disabled={submitting}>
              {submitting ? t("creating") : t("create")}
            </button>
            <button type="button" onClick={() => setShowForm(false)}>
              {tCommon("cancel")}
            </button>
          </div>
        </form>
      )}

      <button type="button" className="notebook-sidebar__new-button" onClick={() => setShowForm((v) => !v)}>
        {t("newNotebook")}
      </button>
    </aside>
  );
}
