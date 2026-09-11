"use client";

import { useState } from "react";
import { useEffect } from "react";
import { useTranslation } from "@/i18n/use-translation";
import {
  ApiError,
  getAdminSystemInfo,
  getOllamaStatus,
  revealAdminSecret,
  type AdminSystemInfo,
  type OllamaStatus,
} from "@/lib/api-client";

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

/**
 * (System-info secret reveal feature.) One secret's reveal state:
 * hidden by default (only a status string is ever shown until the
 * admin explicitly clicks "Show"), loading while the request is in
 * flight, or revealed with the raw value once fetched. Never fetched
 * automatically — see `RevealField` below.
 */
type RevealState =
  | { kind: "hidden" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "revealed"; value: string };

interface RevealFieldProps {
  label: string;
  statusText: string;
  secretKey: "sessionSecret" | "initialAdminPassword";
  showLabel: string;
  hideLabel: string;
  errorFallback: string;
}

/**
 * Renders one secret's status text plus a "Show" button — the raw
 * value is only fetched (and only ever held in this component's local
 * state, never cached elsewhere) after an explicit click, matching a
 * password field's eye-icon pattern. Every successful reveal is
 * recorded server-side in the audit log by `revealAdminSecret()`'s
 * backend endpoint; this component doesn't need to do anything extra
 * for that.
 */
function RevealField({ label, statusText, secretKey, showLabel, hideLabel, errorFallback }: RevealFieldProps) {
  const [state, setState] = useState<RevealState>({ kind: "hidden" });

  async function handleShow() {
    setState({ kind: "loading" });
    try {
      const value = await revealAdminSecret(secretKey);
      setState({ kind: "revealed", value });
    } catch (err) {
      setState({ kind: "error", message: err instanceof ApiError ? err.message : errorFallback });
    }
  }

  return (
    <>
      <dt>{label}</dt>
      <dd>
        <span className="admin-kv__secret-status">{statusText}</span>{" "}
        {state.kind === "hidden" && (
          <button type="button" onClick={handleShow}>
            {showLabel}
          </button>
        )}
        {state.kind === "loading" && <span>…</span>}
        {state.kind === "error" && <span className="error-text">{state.message}</span>}
        {state.kind === "revealed" && (
          <>
            <code className="admin-kv__secret-value">{state.value}</code>{" "}
            <button type="button" onClick={() => setState({ kind: "hidden" })}>
              {hideLabel}
            </button>
          </>
        )}
      </dd>
    </>
  );
}

/**
 * This screen intentionally does NOT repeat Storage Settings / Security
 * Settings (cookie name, cookieSecure, cookieSameSite, allowed
 * extensions) / RAG Settings / i18n Settings / the Ollama connection
 * URL — all of those already have their own dedicated admin tabs (see
 * admin.json's `storage*` / `security*` / `rag*` / `i18n*` /
 * `baseUrlLabel` keys) and default model names are already shown with
 * checkmarks on the Models tab. Everything shown here is `.env`-derived
 * information that has no other home in the admin console yet: app
 * URLs/ports/DB path, the new Ollama generation-tuning knobs
 * (temperature / output-token caps / thinking-mode toggle), CSRF
 * cookie/header names, and the two secrets (status + reveal-on-click).
 */
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
      <p className="admin-panel__note">{t("systemHealthEnvNote")}</p>

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
        <dt>{t("systemHealthAppBaseUrl")}</dt>
        <dd>{info.app.appBaseUrl}</dd>
        <dt>{t("systemHealthApiBaseUrl")}</dt>
        <dd>{info.app.apiBaseUrl}</dd>
        <dt>{t("systemHealthPorts")}</dt>
        <dd>
          {t("systemHealthPortWeb")}: {info.app.portWeb} / {t("systemHealthPortApi")}: {info.app.portApi}
        </dd>
        <dt>{t("systemHealthDatabaseUrl")}</dt>
        <dd>{info.database.url}</dd>
      </dl>

      <h2>{t("systemHealthSectionOllamaTuning")}</h2>
      <p className="admin-panel__note">{t("systemHealthOllamaModelsNote")}</p>
      <dl className="admin-kv">
        <dt>{t("systemHealthGenerationTemperature")}</dt>
        <dd>{info.ollama.generationTemperature}</dd>
        <dt>{t("systemHealthHydeMaxOutputTokens")}</dt>
        <dd>{info.ollama.hydeMaxOutputTokens}</dd>
        <dt>{t("systemHealthAnswerMaxOutputTokens")}</dt>
        <dd>{info.ollama.answerMaxOutputTokens}</dd>
        <dt>{t("systemHealthDisableThinking")}</dt>
        <dd>{String(info.ollama.disableThinking)}</dd>
      </dl>

      <h2>{t("systemHealthSectionCsrf")}</h2>
      <dl className="admin-kv">
        <dt>{t("systemHealthCsrfCookieName")}</dt>
        <dd>{info.security.csrfCookieName}</dd>
        <dt>{t("systemHealthCsrfHeaderName")}</dt>
        <dd>{info.security.csrfHeaderName}</dd>
      </dl>

      <h2>{t("systemHealthSectionSecrets")}</h2>
      <dl className="admin-kv">
        <RevealField
          label={t("systemHealthSessionSecret")}
          statusText={
            info.session.secretStatus.isPlaceholder
              ? t("systemHealthPlaceholderWarning")
              : t("systemHealthConfiguredWithLength", { length: info.session.secretStatus.length })
          }
          secretKey="sessionSecret"
          showLabel={t("systemHealthShowSecret")}
          hideLabel={t("systemHealthHideSecret")}
          errorFallback={t("genericErrorAdmin")}
        />
        <dt>{t("systemHealthInitialAdminEmail")}</dt>
        <dd>{info.initialAdmin.email}</dd>
        <dt>{t("systemHealthInitialAdminLocale")}</dt>
        <dd>{info.initialAdmin.locale}</dd>
        <RevealField
          label={t("systemHealthInitialAdminPassword")}
          statusText={
            info.initialAdmin.passwordStatus.isPlaceholder
              ? t("systemHealthPlaceholderWarning")
              : t("systemHealthConfiguredNoLength")
          }
          secretKey="initialAdminPassword"
          showLabel={t("systemHealthShowSecret")}
          hideLabel={t("systemHealthHideSecret")}
          errorFallback={t("genericErrorAdmin")}
        />
      </dl>
    </div>
  );
}
