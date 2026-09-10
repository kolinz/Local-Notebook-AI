"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/i18n/use-translation";
import { listAdminFiles, type AdminFileRow } from "@/lib/api-client";

export default function AdminFilesPage() {
  const { t } = useTranslation("admin");
  const { t: tCommon } = useTranslation("common");
  const [files, setFiles] = useState<AdminFileRow[] | null>(null);

  useEffect(() => {
    listAdminFiles()
      .then(setFiles)
      .catch(() => setFiles([]));
  }, []);

  return (
    <div className="admin-panel">
      <h1>{t("filesTitle")}</h1>

      {files === null ? (
        <p>{tCommon("loading")}</p>
      ) : files.length === 0 ? (
        <p>{t("noFiles")}</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t("filesColumnName")}</th>
              <th>{t("filesColumnOwner")}</th>
              <th>{t("filesColumnNotebook")}</th>
              <th>{t("filesColumnStatus")}</th>
              <th>{t("filesColumnSize")}</th>
              <th>{t("filesColumnCreated")}</th>
            </tr>
          </thead>
          <tbody>
            {files.map((file) => (
              <tr key={file.id}>
                <td>{file.originalFilename}</td>
                <td>{file.ownerEmail}</td>
                <td>{file.notebookTitle}</td>
                <td>{file.status}</td>
                <td>{(file.sizeBytes / 1024).toFixed(1)} KB</td>
                <td>{new Date(file.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
