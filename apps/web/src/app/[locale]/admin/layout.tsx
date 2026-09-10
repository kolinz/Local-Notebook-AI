"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useTranslation } from "@/i18n/use-translation";

/**
 * Route protection (logged in + admin) happens server-side in
 * middleware.ts; `useCurrentUser({ requireAdmin: true })` here is a
 * harmless client-side backstop, moved from each individual admin page
 * into this shared layout so the sub-nav and the auth check only need
 * to exist once.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation("admin");
  const { t: tCommon } = useTranslation("common");
  const { user, loading } = useCurrentUser({ requireAdmin: true });
  const params = useParams<{ locale: string }>();
  const pathname = usePathname();

  if (loading) {
    return (
      <main className="page">
        <p>{tCommon("loading")}</p>
      </main>
    );
  }
  if (!user) return null;

  const base = `/${params.locale}/admin`;
  const tabs = [
    { href: base, label: t("navDashboard") },
    { href: `${base}/usage-guide`, label: t("navUsageGuide") },
    { href: `${base}/users`, label: t("navUsers") },
    { href: `${base}/files`, label: t("navFiles") },
    { href: `${base}/models`, label: t("navModels") },
    { href: `${base}/rag-settings`, label: t("navRagSettings") },
    { href: `${base}/ollama`, label: t("navOllama") },
    { href: `${base}/i18n`, label: t("navI18n") },
    { href: `${base}/storage`, label: t("navStorage") },
    { href: `${base}/security`, label: t("navSecurity") },
    { href: `${base}/audit-logs`, label: t("navAuditLogs") },
    { href: `${base}/system-health`, label: t("navSystemHealth") },
  ];

  return (
    <div className="admin-layout">
      <nav className="admin-nav">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={pathname === tab.href ? "admin-nav__item admin-nav__item--active" : "admin-nav__item"}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <div className="admin-layout__main">{children}</div>
    </div>
  );
}
