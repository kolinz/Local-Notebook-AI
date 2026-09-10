"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/i18n/use-translation";
import { getOllamaStatus, type OllamaStatus } from "@/lib/api-client";

export default function OllamaConnectionPage() {
  const { t } = useTranslation("admin");
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [checking, setChecking] = useState(true);

  async function check() {
    setChecking(true);
    try {
      setStatus(await getOllamaStatus());
    } catch {
      setStatus(null);
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    check();
  }, []);

  return (
    <div className="admin-panel">
      <h1>{t("ollamaTitle")}</h1>

      <div className="admin-panel__row">
        <button type="button" onClick={check} disabled={checking}>
          {checking ? t("checking") : t("checkConnection")}
        </button>
      </div>

      {status && (
        <div className="ollama-status">
          <p>
            <span
              className={
                status.connected ? "ollama-status__badge ollama-status__badge--ok" : "ollama-status__badge ollama-status__badge--down"
              }
            >
              {status.connected ? t("connected") : t("notConnected")}
            </span>
          </p>
          <p>
            {t("baseUrlLabel")}: <code>{status.baseUrl}</code>
          </p>
          {status.error && <p className="error-text">{status.error}</p>}
        </div>
      )}
    </div>
  );
}
