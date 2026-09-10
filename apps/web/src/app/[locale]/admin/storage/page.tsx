"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/i18n/use-translation";
import { getAdminSystemInfo, type AdminSystemInfo } from "@/lib/api-client";

export default function AdminStoragePage() {
  const { t } = useTranslation("admin");
  const { t: tCommon } = useTranslation("common");
  const [info, setInfo] = useState<AdminSystemInfo | null>(null);

  useEffect(() => {
    getAdminSystemInfo()
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);

  if (!info) {
    return (
      <div className="admin-panel">
        <h1>{t("storageTitle")}</h1>
        <p>{tCommon("loading")}</p>
      </div>
    );
  }

  return (
    <div className="admin-panel">
      <h1>{t("storageTitle")}</h1>

      <dl className="admin-kv">
        <dt>{t("storageDriver")}</dt>
        <dd>{info.storage.driver}</dd>
        <dt>{t("storageRoot")}</dt>
        <dd><code>{info.storage.localRoot}</code></dd>
        <dt>{t("storageMaxUpload")}</dt>
        <dd>{info.storage.maxUploadSizeMb} MB</dd>
      </dl>

      <div className="admin-readonly-block">
        <h2>{t("storageFutureS3")}</h2>
        <p className="admin-readonly-block__note">{t("storageFutureS3Note")}</p>
        <dl className="admin-kv admin-kv--disabled">
          <dt>S3 Endpoint</dt>
          <dd>—</dd>
          <dt>S3 Bucket</dt>
          <dd>—</dd>
          <dt>S3 Region</dt>
          <dd>—</dd>
        </dl>
      </div>
    </div>
  );
}
