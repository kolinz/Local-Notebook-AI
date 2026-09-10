"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/i18n/use-translation";
import { getAdminSystemInfo, type AdminSystemInfo } from "@/lib/api-client";

export default function AdminSecurityPage() {
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
        <h1>{t("securityTitle")}</h1>
        <p>{tCommon("loading")}</p>
      </div>
    );
  }

  return (
    <div className="admin-panel">
      <h1>{t("securityTitle")}</h1>

      <dl className="admin-kv">
        <dt>{t("securityCsrf")}</dt>
        <dd>{info.security.csrfEnabled ? t("securityCsrfEnabled") : "—"}</dd>
        <dt>{t("securityCookieName")}</dt>
        <dd><code>{info.security.cookieName}</code></dd>
        <dt>{t("securityCookieSecure")}</dt>
        <dd>{info.security.cookieSecure ? "✓" : "—"}</dd>
        <dt>{t("securityCookieSameSite")}</dt>
        <dd>{info.security.cookieSameSite}</dd>
        <dt>{t("securityUploadRestrictions")}</dt>
        <dd>{info.security.allowedExtensions.join(", ")}</dd>
      </dl>

      <p className="admin-readonly-block__note">{t("securityCspNote")}</p>
    </div>
  );
}
