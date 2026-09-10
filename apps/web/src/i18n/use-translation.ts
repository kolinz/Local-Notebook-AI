"use client";

import { useParams } from "next/navigation";
import { resolveLocale, translate, type Namespace } from "./index";

/**
 * Client-side translation hook. Reads the current locale from the
 * `[locale]` route param automatically, so callers don't need to pass
 * it explicitly — matching the ergonomics of `react-i18next`'s
 * `useTranslation(ns)`.
 *
 * Kept in its own file (rather than i18n/index.ts) specifically
 * because it imports `useParams` from `next/navigation`, which
 * requires "use client" — importing it from a Server Component (e.g.
 * [locale]/change-password/page.tsx, which only needs
 * `getServerTranslation`) would otherwise force that whole component
 * to become a Client Component too.
 */
export function useTranslation(namespace: Namespace) {
  const params = useParams<{ locale?: string }>();
  const locale = resolveLocale(params?.locale);

  return {
    t: (key: string, vars?: Record<string, string | number>) => translate(locale, namespace, key, vars),
    locale,
  };
}
