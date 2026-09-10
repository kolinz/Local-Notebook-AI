"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/i18n/use-translation";
import { ApiError, getFilePreview, type FilePreviewChunk } from "@/lib/api-client";

interface Props {
  fileId: string;
  fileName: string;
  onClose: () => void;
}

export function FilePreviewModal({ fileId, fileName, onClose }: Props) {
  const { t } = useTranslation("notebook");
  const { t: tCommon } = useTranslation("common");
  const [chunks, setChunks] = useState<FilePreviewChunk[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getFilePreview(fileId)
      .then((data) => {
        if (!cancelled) setChunks(data.chunks);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load preview.");
      });
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  return (
    <div className="file-preview-modal__overlay" onClick={onClose}>
      <div className="file-preview-modal__panel" onClick={(event) => event.stopPropagation()}>
        <div className="file-preview-modal__header">
          <h2>{t("previewTitle")}</h2>
          <button type="button" onClick={onClose}>
            {t("previewClose")}
          </button>
        </div>
        <p className="file-preview-modal__filename">{fileName}</p>

        {error && <p className="error-text">{error}</p>}
        {!error && chunks === null && <p>{tCommon("loading")}</p>}
        {!error && chunks !== null && chunks.length === 0 && <p>{t("previewEmpty")}</p>}
        {!error && chunks !== null && chunks.length > 0 && (
          <div className="file-preview-modal__chunks">
            {chunks.map((chunk) => (
              // Plain-text rendering only — extracted document text is
              // never interpreted as HTML (no dangerouslySetInnerHTML).
              <p key={chunk.chunkIndex} className="file-preview-modal__chunk">
                {chunk.content}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
