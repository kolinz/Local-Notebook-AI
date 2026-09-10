"use client";

import { useState } from "react";
import { useEffect } from "react";
import { useTranslation } from "@/i18n/use-translation";
import { listAdminAuditLogs, type AdminAuditLog } from "@/lib/api-client";

function formatMetadata(metadataJson: string | null): string | null {
  if (!metadataJson) return null;
  try {
    return JSON.stringify(JSON.parse(metadataJson), null, 2);
  } catch {
    return metadataJson;
  }
}

export default function AdminAuditLogsPage() {
  const { t } = useTranslation("admin");
  const { t: tCommon } = useTranslation("common");
  const [logs, setLogs] = useState<AdminAuditLog[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    listAdminAuditLogs()
      .then(setLogs)
      .catch(() => setLogs([]));
  }, []);

  return (
    <div className="admin-panel">
      <h1>{t("auditLogsTitle")}</h1>

      {logs === null ? (
        <p>{tCommon("loading")}</p>
      ) : logs.length === 0 ? (
        <p>{t("auditLogsEmpty")}</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t("auditLogsColumnTime")}</th>
              <th>{t("auditLogsColumnActor")}</th>
              <th>{t("auditLogsColumnAction")}</th>
              <th>{t("auditLogsColumnResource")}</th>
              <th>{t("auditLogsColumnIp")}</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => {
              const metadata = formatMetadata(log.metadataJson);
              const isExpanded = expandedId === log.id;
              return (
                <>
                  <tr
                    key={log.id}
                    onClick={() => metadata && setExpandedId(isExpanded ? null : log.id)}
                    className={metadata ? "admin-table__row--clickable" : undefined}
                  >
                    <td>{new Date(log.createdAt).toLocaleString()}</td>
                    <td>{log.actorEmail ?? t("auditLogsSystem")}</td>
                    <td>
                      {log.action}
                      {metadata && <span className="admin-table__detail-hint"> {isExpanded ? "▲" : "▼"}</span>}
                    </td>
                    <td>
                      {log.resourceType ?? "—"}
                      {log.resourceId ? ` (${log.resourceId.slice(0, 8)}…)` : ""}
                    </td>
                    <td>{log.ipAddress ?? "—"}</td>
                  </tr>
                  {isExpanded && metadata && (
                    <tr key={`${log.id}-detail`}>
                      <td colSpan={5}>
                        <pre className="admin-table__detail-pre">{metadata}</pre>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
