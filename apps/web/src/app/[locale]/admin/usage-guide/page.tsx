"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/i18n/use-translation";
import { ApiError, getUsageGuide, updateUsageGuide } from "@/lib/api-client";

export default function AdminUsageGuidePage() {
  const { t } = useTranslation("admin");
  const { t: tCommon } = useTranslation("common");

  const [content, setContent] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getUsageGuide()
      .then(setContent)
      .catch(() => setContent(""));
  }, []);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (content === null) return;
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const updated = await updateUsageGuide(content);
      setContent(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-panel">
      <h1>{t("usageGuideTitle")}</h1>
      <p className="admin-readonly-block__note">{t("usageGuideNote")}</p>

      {content === null ? (
        <p>{tCommon("loading")}</p>
      ) : (
        <form onSubmit={handleSave} className="admin-form" style={{ maxWidth: 640 }}>
          <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={16} maxLength={5000} />
          {error && <p className="error-text">{error}</p>}
          {saved && <p className="admin-panel__notice">{t("settingsSaved")}</p>}
          <button type="submit" disabled={saving}>
            {saving ? t("ragSaving") : t("ragSaveButton")}
          </button>
        </form>
      )}
    </div>
  );
}
