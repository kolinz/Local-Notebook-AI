"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/i18n/use-translation";
import {
  ApiError,
  createAdminUser,
  listAdminUsers,
  updateAdminUser,
  type AdminUser,
} from "@/lib/api-client";

export default function AdminUsersPage() {
  const { t } = useTranslation("admin");
  const { t: tCommon } = useTranslation("common");

  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [locale, setLocale] = useState<"ja" | "en">("ja");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setUsers(await listAdminUsers());
    } catch {
      setUsers([]);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await createAdminUser({ email, password, displayName, role, locale });
      setEmail("");
      setPassword("");
      setDisplayName("");
      setRole("user");
      setLocale("ja");
      setShowForm(false);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create user.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleActive(user: AdminUser) {
    const updated = await updateAdminUser(user.id, { isActive: !user.isActive });
    setUsers((prev) => prev?.map((u) => (u.id === updated.id ? updated : u)) ?? null);
  }

  async function handleRoleChange(user: AdminUser, newRole: "admin" | "user") {
    const updated = await updateAdminUser(user.id, { role: newRole });
    setUsers((prev) => prev?.map((u) => (u.id === updated.id ? updated : u)) ?? null);
  }

  return (
    <div className="admin-panel">
      <h1>{t("usersTitle")}</h1>

      <div className="admin-panel__row">
        <button type="button" onClick={() => setShowForm((v) => !v)}>
          {t("usersNewButton")}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="admin-users__form">
          <label>
            {t("usersCreateEmail")}
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            {t("usersCreatePassword")}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </label>
          <label>
            {t("usersCreateDisplayName")}
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          </label>
          <label>
            {t("usersCreateRole")}
            <select value={role} onChange={(e) => setRole(e.target.value as "admin" | "user")}>
              <option value="user">{t("roleUser")}</option>
              <option value="admin">{t("roleAdmin")}</option>
            </select>
          </label>
          <label>
            {t("usersCreateLocale")}
            <select value={locale} onChange={(e) => setLocale(e.target.value as "ja" | "en")}>
              <option value="ja">日本語</option>
              <option value="en">English</option>
            </select>
          </label>
          {error && <p className="error-text">{error}</p>}
          <div className="admin-users__form-actions">
            <button type="submit" disabled={submitting}>
              {submitting ? t("usersCreating") : t("usersCreateSubmit")}
            </button>
            <button type="button" onClick={() => setShowForm(false)}>
              {t("usersCreateCancel")}
            </button>
          </div>
        </form>
      )}

      {users === null ? (
        <p>{tCommon("loading")}</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t("usersColumnEmail")}</th>
              <th>{t("usersColumnName")}</th>
              <th>{t("usersColumnRole")}</th>
              <th>{t("usersColumnLocale")}</th>
              <th>{t("usersColumnActive")}</th>
              <th>{t("usersColumnCreated")}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.email}</td>
                <td>{user.displayName}</td>
                <td>
                  <select
                    value={user.role}
                    onChange={(e) => handleRoleChange(user, e.target.value as "admin" | "user")}
                  >
                    <option value="user">{t("roleUser")}</option>
                    <option value="admin">{t("roleAdmin")}</option>
                  </select>
                </td>
                <td>{user.locale}</td>
                <td>
                  <button type="button" onClick={() => handleToggleActive(user)}>
                    {user.isActive ? t("usersDeactivate") : t("usersActivate")}
                  </button>
                </td>
                <td>{new Date(user.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
