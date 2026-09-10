import { notFound } from "next/navigation";
import { publicEnv, type Locale } from "@/config/public-env";
import { AppHeader } from "@/components/app-header";

/**
 * Validates the `[locale]` route param (404s on an unsupported locale)
 * and wraps every locale-scoped page with the shared `<AppHeader>`
 * (Phase 5: app name, language switcher, login status) so individual
 * pages don't each need to render their own header.
 */
export default function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  if (!publicEnv.supportedLocales.includes(params.locale as Locale)) {
    notFound();
  }

  return (
    <>
      <AppHeader />
      {children}
    </>
  );
}
