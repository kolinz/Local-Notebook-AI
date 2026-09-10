"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import { useTranslation } from "@/i18n/use-translation";
import { publicEnv, type Locale } from "@/config/public-env";
import { fetchCurrentUser, logout, type CurrentUser } from "@/lib/api-client";
import { BookIcon, UserIcon } from "./icons";

/** Swaps the `[locale]` segment of the current path, preserving the rest. */
function withLocale(pathname: string, locale: Locale): string {
  const segments = pathname.split("/");
  if (segments.length > 1) {
    segments[1] = locale;
  }
  return segments.join("/") || "/";
}

/**
 * Whether we know the caller's login state at all yet.
 * - "loading": the initial (or a retry) request is in flight.
 * - "known": `fetchCurrentUser()` completed normally — `user` is
 *   either the real user object, or `null` for a genuine 401 (not
 *   logged in). Only in this state does the header show either the
 *   "signed in" UI or the "サインイン" link.
 * - "unreachable": the request itself failed (network error, a
 *   non-401 HTTP error, the API mid-restart, etc.) — this is NOT the
 *   same thing as "not logged in", and must never be displayed as
 *   such. A user who is actually logged in must never see a
 *   confident "you are signed out" message just because one request
 *   to the API happened to fail.
 */
type AuthStatus = "loading" | "known" | "unreachable";

const RETRY_DELAY_MS = 2000;
const MAX_RETRIES = 3;

export function AppHeader() {
  const { t } = useTranslation("common");
  const params = useParams<{ locale: string }>();
  const pathname = usePathname();
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<CurrentUser | null>(null);

  const checkAuth = useCallback(async (attempt = 0) => {
    try {
      const current = await fetchCurrentUser();
      // A resolved value (including `null` for a genuine 401) means the
      // API actually answered — we now KNOW the login state, whichever
      // way it goes.
      setUser(current);
      setStatus("known");
    } catch {
      // The request itself failed — we do NOT know the login state.
      // Retry a few times (e.g. the API mid-restart in dev, or a
      // momentary network blip) before settling on "unreachable"
      // rather than ever guessing "not logged in".
      if (attempt < MAX_RETRIES) {
        setTimeout(() => checkAuth(attempt + 1), RETRY_DELAY_MS);
      } else {
        setStatus("unreachable");
      }
    }
  }, []);

  useEffect(() => {
    checkAuth();
    // Re-checks on every route change, not just on mount. Without
    // this, navigating from /login to /change-password (or any other
    // client-side transition within the same [locale] layout — which
    // does NOT remount AppHeader) would leave the header showing
    // whatever login state it fetched when it first mounted, forever
    // — even after a successful login or logout, since nothing else
    // would ever trigger a re-check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkAuth, pathname]);

  async function handleLogout() {
    await logout();
    setUser(null);
    setStatus("known");
  }

  return (
    <header className="app-header">
      <span className="app-header__brand">
        <span className="app-header__logo">
          <BookIcon className="app-header__logo-icon" />
        </span>
        {t("appName")}
      </span>

      <nav className="app-header__nav">
        <span className="app-header__locales">
          {publicEnv.supportedLocales.map((loc) => (
            <Link
              key={loc}
              href={withLocale(pathname, loc)}
              className={
                loc === params.locale
                  ? "app-header__locale app-header__locale--active"
                  : "app-header__locale"
              }
            >
              {loc.toUpperCase()}
            </Link>
          ))}
        </span>

        {status === "loading" && null}

        {status === "unreachable" && (
          <span className="app-header__unreachable">{t("connectionUnreachable")}</span>
        )}

        {status === "known" &&
          (user ? (
            <>
              <Link href={`/${params.locale}/notebooks`}>{t("myNotebooks")}</Link>
              {user.role === "admin" && (
                <Link href={`/${params.locale}/admin`}>{t("admin")}</Link>
              )}
              <span className="app-header__user">{t("signedInAs", { name: user.displayName })}</span>
              <span className="app-header__role">{t(user.role === "admin" ? "roleAdmin" : "roleUser")}</span>
              <span className="app-header__avatar">
                <UserIcon className="app-header__avatar-icon" />
              </span>
              <button onClick={handleLogout}>{t("signOut")}</button>
            </>
          ) : (
            <Link href={`/${params.locale}/login`}>{t("signIn")}</Link>
          ))}
      </nav>
    </header>
  );
}
