"use client";

import { useCurrentUser } from "@/hooks/use-current-user";
import { useTranslation } from "@/i18n/use-translation";
import { NotebookSidebar } from "@/components/notebook-sidebar";

export default function NotebooksLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useCurrentUser();
  const { t } = useTranslation("common");

  if (loading) {
    return (
      <main className="page">
        <p>{t("loading")}</p>
      </main>
    );
  }
  if (!user) return null;

  return (
    <div className="notebooks-layout">
      <NotebookSidebar />
      <div className="notebooks-layout__main">{children}</div>
    </div>
  );
}
