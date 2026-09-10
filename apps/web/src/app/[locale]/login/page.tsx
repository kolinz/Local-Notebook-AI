"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "@/i18n/use-translation";
import { ApiError, fetchCsrfToken, login, reportClientIssue } from "@/lib/api-client";

export default function LoginPage() {
  const router = useRouter();
  const params = useParams<{ locale: string }>();
  const searchParams = useSearchParams();
  const { t } = useTranslation("auth");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Warm the CSRF cookie/token as soon as the login page loads, so the
    // first submit doesn't have to wait on an extra round trip. If this
    // fails, apiFetch() will simply retry it on submit.
    fetchCsrfToken().catch(() => {
      /* retried transparently on submit */
    });
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await login(email, password);
      const next = searchParams.get("next");

      let destination: string;
      if (next && next.startsWith("/")) {
        // The user was sent here by middleware from a specific locale-
        // prefixed URL — honor that exact destination.
        destination = next;
      } else {
        // No explicit destination: honor the user's own stored locale
        // preference (users.locale) rather than whichever locale segment
        // the login page itself happened to be under.
        const destinationLocale = user.locale || params.locale;
        destination = user.mustChangePassword
          ? `/${destinationLocale}/change-password`
          : `/${destinationLocale}/notebooks`;
      }

      router.push(destination);

      // Safety net: a login response of 200 with a valid user means the
      // server-side part of this succeeded — if the page is somehow
      // still sitting on /login shortly after, `router.push()` itself
      // silently failed to navigate (a real, if rare, occurrence this
      // app has seen). A plain hard navigation always works, and
      // reporting it means a recurrence is visible on the admin "Audit
      // Logs" screen instead of only in a browser console.
      setTimeout(() => {
        if (window.location.pathname === `/${params.locale}/login`) {
          reportClientIssue("Login succeeded but router.push() did not navigate away from /login.", {
            destination,
            // Captured directly from the browser at the moment of
            // detection — more trustworthy than the server-observed
            // `Referer` header on the report request itself, which can
            // reflect a DIFFERENT (already-changed) URL if navigation
            // started between this check and the report being sent.
            actualUrlAtDetection: window.location.href,
            documentReferrer: document.referrer,
            searchAtDetection: window.location.search,
          });
          window.location.href = destination;
        }
      }, 1200);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
      setSubmitting(false);
    }
  }

  return (
    <main className="page">
      <h1>{t("title")}</h1>
      <form onSubmit={handleSubmit} className="login-form">
        <label>
          {t("emailLabel")}
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            required
            autoFocus
          />
        </label>
        <label>
          {t("passwordLabel")}
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? t("submitting") : t("submit")}
        </button>
      </form>
    </main>
  );
}
