"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslation } from "@/i18n/use-translation";
import { ApiError, changePassword } from "@/lib/api-client";

/**
 * Real form + API call, backed by `POST /api/auth/change-password`.
 * Users with `mustChangePassword: true` are redirected here after
 * login (see [locale]/login/page.tsx). Requires the current password
 * (defense against a hijacked-but-still-valid session locking out the
 * real owner) — on success, `mustChangePassword` is cleared server-side
 * and the user can continue to their notebooks.
 */
export default function ChangePasswordPage() {
  const { t } = useTranslation("auth");
  const params = useParams<{ locale: string }>();
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page">
      <h1>{t("changePasswordTitle")}</h1>
      <section className="status-card">
        <p>{t("changePasswordBody")}</p>

        {success ? (
          <>
            <p className="admin-panel__notice">{t("changePasswordSuccess")}</p>
            <button type="button" onClick={() => router.push(`/${params.locale}/notebooks`)}>
              {t("changePasswordContinue")}
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="admin-form" style={{ maxWidth: 360 }}>
            <label>
              {t("changePasswordCurrentLabel")}
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoFocus
              />
            </label>
            <label>
              {t("changePasswordNewLabel")}
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                required
              />
            </label>
            {error && <p className="error-text">{error}</p>}
            <button type="submit" disabled={submitting}>
              {submitting ? t("changePasswordSubmitting") : t("changePasswordSubmit")}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
