"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/i18n/use-translation";
import { ApiError, getRagSettings, updateRagSettings, type RagSettings } from "@/lib/api-client";

export default function AdminRagSettingsPage() {
  const { t } = useTranslation("admin");
  const { t: tCommon } = useTranslation("common");

  const [settings, setSettings] = useState<RagSettings | null>(null);
  const [strategy, setStrategy] = useState<"standard" | "hyde">("hyde");
  const [promptTemplate, setPromptTemplate] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getRagSettings()
      .then((data) => {
        setSettings(data);
        setStrategy(data.defaultStrategy);
        setPromptTemplate(data.hydePromptTemplate);
      })
      .catch(() => setSettings(null));
  }, []);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const updated = await updateRagSettings({ defaultStrategy: strategy, hydePromptTemplate: promptTemplate });
      setSettings(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return (
      <div className="admin-panel">
        <h1>{t("ragSettingsTitle")}</h1>
        <p>{tCommon("loading")}</p>
      </div>
    );
  }

  return (
    <div className="admin-panel">
      <h1>{t("ragSettingsTitle")}</h1>

      <form onSubmit={handleSave} className="admin-form">
        <label>
          {t("ragDefaultStrategy")}
          <select value={strategy} onChange={(e) => setStrategy(e.target.value as "standard" | "hyde")}>
            <option value="standard">{t("ragStandard")}</option>
            <option value="hyde">{t("ragHyde")}</option>
          </select>
        </label>

        <label>
          {t("ragHydePromptTemplate")}
          <textarea value={promptTemplate} onChange={(e) => setPromptTemplate(e.target.value)} rows={8} />
        </label>

        {error && <p className="error-text">{error}</p>}
        {saved && <p className="admin-panel__notice">{t("settingsSaved")}</p>}

        <button type="submit" disabled={saving}>
          {saving ? t("ragSaving") : t("ragSaveButton")}
        </button>
      </form>

      <div className="admin-readonly-block">
        <p className="admin-readonly-block__note">{t("ragReadOnlyNote")}</p>
        <dl className="admin-kv">
          <dt>{t("ragTopK")}</dt>
          <dd>{settings.topK}</dd>
          <dt>{t("ragSimilarityThreshold")}</dt>
          <dd>{settings.similarityThreshold}</dd>
          <dt>{t("ragAllowNotebookOverride")}</dt>
          <dd>{settings.allowNotebookOverride ? "✓" : "—"}</dd>
          <dt>{t("ragAllowHydePreview")}</dt>
          <dd>{settings.allowHydeDocumentPreview ? "✓" : "—"}</dd>
        </dl>
      </div>
    </div>
  );
}
