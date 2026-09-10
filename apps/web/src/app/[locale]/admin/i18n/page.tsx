"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/i18n/use-translation";
import { getAdminSystemInfo, type AdminSystemInfo } from "@/lib/api-client";

export default function AdminI18nPage() {
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
        <h1>{t("i18nTitle")}</h1>
        <p>{tCommon("loading")}</p>
      </div>
    );
  }

  return (
    <div className="admin-panel">
      <h1>{t("i18nTitle")}</h1>

      <dl className="admin-kv">
        <dt>{t("i18nDefaultLocale")}</dt>
        <dd>{info.i18n.defaultLocale}</dd>
        <dt>{t("i18nSupportedLocales")}</dt>
        <dd>{info.i18n.supportedLocales.join(", ")}</dd>
      </dl>

      <p className="admin-readonly-block__note">{t("i18nNote")}</p>
    </div>
  );
}
