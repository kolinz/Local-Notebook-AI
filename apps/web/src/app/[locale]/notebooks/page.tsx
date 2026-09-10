import { getServerTranslation } from "@/i18n";

/**
 * Bare `/[locale]/notebooks` — no notebook selected yet. The persistent
 * sidebar (notebook list + "New Notebook") lives in the parent layout
 * (layout.tsx); this page is just the "nothing selected" main-area
 * placeholder. Selecting or creating a notebook navigates to
 * `/[locale]/notebooks/[notebookId]` (see [notebookId]/page.tsx).
 */
export default function NotebooksIndexPage({ params }: { params: { locale: string } }) {
  const { t } = getServerTranslation(params.locale, "notebook");

  return (
    <div className="notebooks-placeholder">
      <p>{t("selectNotebookPrompt")}</p>
    </div>
  );
}
