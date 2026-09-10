"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/i18n/use-translation";
import {
  ApiError,
  deleteFile,
  generateFileSummary,
  listNotebookFiles,
  uploadFile,
  type FileRecord,
} from "@/lib/api-client";
import { FilePreviewModal } from "./file-preview-modal";
import { EyeIcon, FileKindBadge, SparkleIcon, TrashIcon, UploadCloudIcon } from "./icons";

function extensionOf(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx === -1 ? "" : filename.slice(idx);
}

interface Props {
  notebookId: string;
}

export function NotebookSourcesPanel({ notebookId }: Props) {
  const { t } = useTranslation("notebook");
  const { t: tCommon } = useTranslation("common");

  const [files, setFiles] = useState<FileRecord[]>([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<FileRecord | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounterRef = useRef(0);

  // File summary feature: which file's summary panel is expanded, which
  // file (if any) is currently generating, and any per-file error —
  // keyed by fileId since several files' rows are visible at once.
  const [expandedSummaryFor, setExpandedSummaryFor] = useState<string | null>(null);
  const [summaryLoadingFor, setSummaryLoadingFor] = useState<string | null>(null);
  const [summaryErrors, setSummaryErrors] = useState<Record<string, string>>({});

  async function refreshFiles() {
    try {
      setFiles(await listNotebookFiles(notebookId));
    } catch {
      setFiles([]);
    } finally {
      setFilesLoading(false);
    }
  }

  useEffect(() => {
    refreshFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notebookId]);

  /** Shared by both the file picker (<input onChange>) and drag-and-drop. */
  async function uploadOneFile(file: File) {
    setUploadError(null);
    setUploading(true);
    try {
      await uploadFile(notebookId, file);
      await refreshFiles();
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-selecting the same file afterward
    if (!file) return;
    await uploadOneFile(file);
  }

  // Drag-and-drop: `dragCounterRef` tracks nested enter/leave pairs (the
  // dropzone's own icon/text are separate DOM nodes inside it, so the
  // browser fires dragenter/dragleave once per child boundary crossed —
  // without a counter, dragging over the icon would incorrectly look
  // like leaving the dropzone and clear the highlight mid-drag).
  function handleDragEnter(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    dragCounterRef.current += 1;
    setIsDraggingOver(true);
  }

  function handleDragOver(event: React.DragEvent<HTMLLabelElement>) {
    // Required so the browser allows a drop here at all (its default
    // action for dragover is to reject the drop).
    event.preventDefault();
  }

  function handleDragLeave(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setIsDraggingOver(false);
  }

  async function handleDrop(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    dragCounterRef.current = 0;
    setIsDraggingOver(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    await uploadOneFile(file);
  }

  async function handleDeleteFile(fileId: string) {
    if (!window.confirm(t("deleteFileConfirm"))) return;
    await deleteFile(fileId);
    await refreshFiles();
  }

  /**
   * File summary feature. Calls the real `POST /api/files/:id/summary`
   * endpoint (generate on first use, regenerate on later calls) and
   * merges the returned file record back into `files` so
   * `summaryText`/`summaryTruncated` are immediately available without
   * a full `refreshFiles()` round-trip.
   */
  async function handleGenerateSummary(fileId: string) {
    setSummaryErrors((prev) => {
      if (!(fileId in prev)) return prev;
      const next = { ...prev };
      delete next[fileId];
      return next;
    });
    setSummaryLoadingFor(fileId);
    try {
      const updated = await generateFileSummary(fileId);
      setFiles((prev) => prev.map((file) => (file.id === fileId ? updated : file)));
      setExpandedSummaryFor(fileId);
    } catch (err) {
      setSummaryErrors((prev) => ({
        ...prev,
        [fileId]: err instanceof ApiError ? err.message : t("summaryError"),
      }));
    } finally {
      setSummaryLoadingFor(null);
    }
  }

  /**
   * The "Summary" button: if a summary is already cached on the file
   * record, just toggle showing it (no new Ollama call) — regeneration
   * is a separate, explicit button inside the expanded panel. If none
   * is cached yet, clicking generates one.
   */
  function handleSummaryButtonClick(file: FileRecord) {
    if (file.summaryText) {
      setExpandedSummaryFor((current) => (current === file.id ? null : file.id));
      return;
    }
    void handleGenerateSummary(file.id);
  }

  return (
    <div className="notebook-sources">
      <h2>{t("sourcesTitle")}</h2>

      <label
        className={
          isDraggingOver ? "notebook-sources__upload notebook-sources__upload--dragover" : "notebook-sources__upload"
        }
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <UploadCloudIcon className="notebook-sources__upload-icon" />
        <span className="notebook-sources__upload-text">{t("uploadButton")}</span>
        <input
          type="file"
          accept=".pdf,.txt,.md,.markdown,.docx"
          onChange={handleFileChange}
          disabled={uploading}
        />
      </label>
      {uploading && <p className="notebook-sources__uploading">{t("uploading")}</p>}
      {uploadError && <p className="error-text">{uploadError}</p>}

      {filesLoading ? (
        <p>{tCommon("loading")}</p>
      ) : files.length === 0 ? (
        <p className="notebook-sources__empty">{t("noFiles")}</p>
      ) : (
        <ul className="notebook-sources__list">
          {files.map((file) => {
            const isGenerating = summaryLoadingFor === file.id;
            const isExpanded = expandedSummaryFor === file.id;
            const summaryError = summaryErrors[file.id];

            return (
              <li key={file.id} className="notebook-sources__item">
                <div className="notebook-sources__item-main">
                  <FileKindBadge extension={extensionOf(file.originalFilename)} />
                  <div className="notebook-sources__item-text">
                    <span className="notebook-sources__name">{file.originalFilename}</span>
                    <span className="notebook-sources__meta">
                      {(file.sizeBytes / 1024).toFixed(1)} KB ·{" "}
                      <span className="notebook-sources__status">{file.status}</span>
                    </span>
                  </div>
                </div>
                <div className="notebook-sources__item-actions">
                  <button type="button" onClick={() => setPreviewFile(file)}>
                    <EyeIcon className="notebook-sources__action-icon" />
                    {t("previewButton")}
                  </button>
                  <button type="button" onClick={() => handleSummaryButtonClick(file)} disabled={isGenerating}>
                    <SparkleIcon className="notebook-sources__action-icon" />
                    {isGenerating ? t("summaryGenerating") : t("summaryButton")}
                  </button>
                  <button type="button" onClick={() => handleDeleteFile(file.id)}>
                    <TrashIcon className="notebook-sources__action-icon" />
                  </button>
                </div>

                {summaryError && <p className="error-text">{summaryError}</p>}

                {isExpanded && file.summaryText && (
                  <div className="notebook-sources__summary">
                    {file.summaryTruncated && (
                      <p className="notebook-sources__summary-notice">{t("summaryTruncatedNotice")}</p>
                    )}
                    {/* Plain-text rendering only, same as FilePreviewModal's
                        chunk text — LLM output is never interpreted as HTML. */}
                    <p className="notebook-sources__summary-text">{file.summaryText}</p>
                    <div className="notebook-sources__summary-actions">
                      <button
                        type="button"
                        onClick={() => void handleGenerateSummary(file.id)}
                        disabled={isGenerating}
                      >
                        {isGenerating ? t("summaryGenerating") : t("summaryRegenerate")}
                      </button>
                      <button type="button" onClick={() => setExpandedSummaryFor(null)}>
                        {t("previewClose")}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {previewFile && (
        <FilePreviewModal
          fileId={previewFile.id}
          fileName={previewFile.originalFilename}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </div>
  );
}
