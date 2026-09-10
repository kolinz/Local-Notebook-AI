"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/i18n/use-translation";
import {
  ApiError,
  deleteFile,
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
  const [summaryNoticeFor, setSummaryNoticeFor] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounterRef = useRef(0);

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
          {files.map((file) => (
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
                <button type="button" onClick={() => setSummaryNoticeFor(file.id)}>
                  <SparkleIcon className="notebook-sources__action-icon" />
                  {t("summaryButton")}
                </button>
                <button type="button" onClick={() => handleDeleteFile(file.id)}>
                  <TrashIcon className="notebook-sources__action-icon" />
                </button>
              </div>
              {summaryNoticeFor === file.id && (
                <p className="notebook-sources__summary-notice">
                  {t("summaryNotAvailable")}{" "}
                  <button type="button" onClick={() => setSummaryNoticeFor(null)}>
                    {t("previewClose")}
                  </button>
                </p>
              )}
            </li>
          ))}
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
