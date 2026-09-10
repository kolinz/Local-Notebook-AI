/**
 * Local Notebook AI - i18n core (resources + lookup).
 *
 * Phase 5 note: this is a deliberately small, dependency-free
 * implementation rather than pulling in `i18next` / `react-i18next` as
 * runtime dependencies — consistent with this project's general
 * preference for minimal custom implementations over framework
 * libraries (custom session store instead of NextAuth, custom CSRF
 * instead of a CSRF middleware package, etc.). The JSON *format* is
 * i18next-compatible (flat `{ key: "template with {{vars}}" }` per
 * namespace/locale), so swapping in real i18next later, if ever
 * needed, would mean pointing it at these same files rather than
 * rewriting them.
 *
 * No "use client" here and no `next/navigation` import — this module
 * is safe to import from both Server and Client Components. The
 * `useParams()`-based hook lives in ./use-translation.ts instead, kept
 * separate specifically so Server Components (like
 * [locale]/change-password/page.tsx) can use `getServerTranslation()`
 * from here without pulling in a client-only hook.
 */

import { publicEnv, type Locale } from "@/config/public-env";

import jaCommon from "./locales/ja/common.json";
import jaAuth from "./locales/ja/auth.json";
import jaNotebook from "./locales/ja/notebook.json";
import jaAdmin from "./locales/ja/admin.json";
import enCommon from "./locales/en/common.json";
import enAuth from "./locales/en/auth.json";
import enNotebook from "./locales/en/notebook.json";
import enAdmin from "./locales/en/admin.json";

export type Namespace = "common" | "auth" | "notebook" | "admin";

type TranslationDict = Record<string, string>;

const RESOURCES: Record<Locale, Record<Namespace, TranslationDict>> = {
  ja: { common: jaCommon, auth: jaAuth, notebook: jaNotebook, admin: jaAdmin },
  en: { common: enCommon, auth: enAuth, notebook: enNotebook, admin: enAdmin },
};

/** `{{var}}` interpolation, matching i18next's default syntax. */
function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

export function resolveLocale(candidate: string | undefined): Locale {
  if (candidate && (publicEnv.supportedLocales as readonly string[]).includes(candidate)) {
    return candidate as Locale;
  }
  return publicEnv.defaultLocale;
}

/**
 * Looks up `key` in `namespace` for `locale`. Falls back to returning
 * the key itself (not a blank string) when a translation is missing,
 * so gaps are visible in the UI during development rather than silent.
 */
export function translate(
  locale: Locale,
  namespace: Namespace,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const template = RESOURCES[locale]?.[namespace]?.[key];
  if (template === undefined) {
    return key;
  }
  return interpolate(template, vars);
}

/**
 * Server-side / non-hook helper — e.g. for use in Server Components
 * like `[locale]/layout.tsx` or `[locale]/change-password/page.tsx`,
 * which receive `params.locale` directly rather than reading it via
 * the `useParams()` hook (Client Components only).
 */
export function getServerTranslation(locale: string | undefined, namespace: Namespace) {
  const resolved = resolveLocale(locale);
  return {
    t: (key: string, vars?: Record<string, string | number>) => translate(resolved, namespace, key, vars),
    locale: resolved,
  };
}
