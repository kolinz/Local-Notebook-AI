"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/i18n/use-translation";
import {
  ApiError,
  listModels,
  setModelEnabled,
  syncModelsFromOllama,
  updateOllamaSettings,
  type ModelRow,
} from "@/lib/api-client";

export default function ModelsPage() {
  const { t } = useTranslation("admin");

  const [models, setModels] = useState<ModelRow[] | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setModels(await listModels());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load models.");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleSync() {
    setSyncing(true);
    setError(null);
    setSyncMessage(null);
    try {
      const result = await syncModelsFromOllama();
      setModels(result.models);
      setSyncMessage(
        t("syncResult", { added: result.added, updated: result.updated, total: result.total }),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  async function handleSetDefault(
    modelId: string,
    field: "defaultGenerationModelId" | "defaultEmbeddingModelId" | "hydeGenerationModelId",
  ) {
    setError(null);
    try {
      const result = await updateOllamaSettings({ [field]: modelId });
      setModels(result.models);
      setSyncMessage(t("settingsSaved"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save settings.");
    }
  }

  async function handleToggleEnabled(model: ModelRow) {
    setError(null);
    try {
      const updated = await setModelEnabled(model.id, !model.isEnabled);
      setModels((prev) => prev?.map((m) => (m.id === updated.id ? updated : m)) ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update model.");
    }
  }

  return (
    <div className="admin-panel">
      <h1>{t("modelsTitle")}</h1>

      <div className="admin-panel__row">
        <button type="button" onClick={handleSync} disabled={syncing}>
          {syncing ? t("syncing") : t("syncButton")}
        </button>
      </div>

      {syncMessage && <p className="admin-panel__notice">{syncMessage}</p>}
      {error && <p className="error-text">{error}</p>}

      {models === null ? null : models.length === 0 ? (
        <p className="notebook-sidebar__empty">{t("noModels")}</p>
      ) : (
        <table className="models-table">
          <thead>
            <tr>
              <th>{t("columnName")}</th>
              <th>{t("columnType")}</th>
              <th>{t("columnEnabled")}</th>
              <th>{t("columnDefaultGeneration")}</th>
              <th>{t("columnDefaultEmbedding")}</th>
              <th>{t("columnDefaultHyde")}</th>
            </tr>
          </thead>
          <tbody>
            {models.map((model) => (
              <tr key={model.id}>
                <td>{model.name}</td>
                <td>{model.modelType}</td>
                <td>
                  <button type="button" onClick={() => handleToggleEnabled(model)}>
                    {model.isEnabled ? t("disable") : t("enable")}
                  </button>
                </td>
                <td>
                  {model.isDefaultGeneration ? (
                    "✓"
                  ) : (
                    <button type="button" onClick={() => handleSetDefault(model.id, "defaultGenerationModelId")}>
                      {t("setDefault")}
                    </button>
                  )}
                </td>
                <td>
                  {model.isDefaultEmbedding ? (
                    "✓"
                  ) : (
                    <button type="button" onClick={() => handleSetDefault(model.id, "defaultEmbeddingModelId")}>
                      {t("setDefault")}
                    </button>
                  )}
                </td>
                <td>
                  {model.isDefaultHyde ? (
                    "✓"
                  ) : (
                    <button type="button" onClick={() => handleSetDefault(model.id, "hydeGenerationModelId")}>
                      {t("setDefault")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
