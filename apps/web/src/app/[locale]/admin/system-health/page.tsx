"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/i18n/use-translation";
import { getAdminSystemInfo, getOllamaStatus, type AdminSystemInfo, type OllamaStatus } from "@/lib/api-client";

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

export default function AdminSystemHealthPage() {
  const { t } = useTranslation("admin");
  const { t: tCommon } = useTranslation("common");
  const [info, setInfo] = useState<AdminSystemInfo | null>(null);
  const [ollama, setOllama] = useState<OllamaStatus | null>(null);

  useEffect(() => {
    getAdminSystemInfo()
      .then(setInfo)
      .catch(() => setInfo(null));
    getOllamaStatus()
      .then(setOllama)
      .catch(() => setOllama(null));
  }, []);

  if (!info) {
    return (
      <div className="admin-panel">
        <h1>{t("systemHealthTitle")}</h1>
        <p>{tCommon("loading")}</p>
      </div>
    );
  }

  return (
    <div className="admin-panel">
      <h1>{t("systemHealthTitle")}</h1>

      <dl className="admin-kv">
        <dt>{t("systemHealthNodeEnv")}</dt>
        <dd>{info.system.nodeEnv}</dd>
        <dt>{t("systemHealthUptime")}</dt>
        <dd>{formatUptime(info.system.uptimeSeconds)}</dd>
        <dt>{t("systemHealthOllama")}</dt>
        <dd>
          {ollama ? (
            <span
              className={
                ollama.connected
                  ? "admin-dashboard__badge admin-dashboard__badge--ok"
                  : "admin-dashboard__badge admin-dashboard__badge--down"
              }
            >
              {ollama.connected ? t("connected") : t("notConnected")}
            </span>
          ) : (
            "—"
          )}
        </dd>
      </dl>
    </div>
  );
}
