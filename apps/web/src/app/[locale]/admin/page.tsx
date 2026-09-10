"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/i18n/use-translation";
import { getAdminDashboard, type AdminDashboard } from "@/lib/api-client";

export default function AdminDashboardPage() {
  const { t } = useTranslation("admin");
  const { t: tCommon } = useTranslation("common");
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);

  useEffect(() => {
    getAdminDashboard()
      .then(setDashboard)
      .catch(() => setDashboard(null));
  }, []);

  return (
    <div className="admin-panel">
      <h1>{t("dashboardTitle")}</h1>

      {!dashboard ? (
        <p>{tCommon("loading")}</p>
      ) : (
        <div className="admin-dashboard__grid">
          <div className="admin-dashboard__card">
            <span className="admin-dashboard__label">{t("dashboardUsers")}</span>
            <span className="admin-dashboard__value">{dashboard.userCount}</span>
          </div>
          <div className="admin-dashboard__card">
            <span className="admin-dashboard__label">{t("dashboardNotebooks")}</span>
            <span className="admin-dashboard__value">{dashboard.notebookCount}</span>
          </div>
          <div className="admin-dashboard__card">
            <span className="admin-dashboard__label">{t("dashboardFiles")}</span>
            <span className="admin-dashboard__value">{dashboard.fileCount}</span>
          </div>
          <div className="admin-dashboard__card">
            <span className="admin-dashboard__label">{t("dashboardRagRuns")}</span>
            <span className="admin-dashboard__value">{dashboard.ragRunCount}</span>
          </div>
          <div className="admin-dashboard__card">
            <span className="admin-dashboard__label">{t("dashboardOllamaStatus")}</span>
            <span
              className={
                dashboard.ollamaStatus.connected
                  ? "admin-dashboard__badge admin-dashboard__badge--ok"
                  : "admin-dashboard__badge admin-dashboard__badge--down"
              }
            >
              {dashboard.ollamaStatus.connected ? t("connected") : t("notConnected")}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
