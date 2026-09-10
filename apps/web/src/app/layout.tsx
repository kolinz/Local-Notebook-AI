import type { Metadata } from "next";
import { publicEnv } from "@/config/public-env";
import "./globals.css";

export const metadata: Metadata = {
  title: "Local Notebook AI",
  description:
    "Self-hosted, multi-user, NotebookLM-style RAG workspace backed by Ollama.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Phase 1.5: locale comes from the validated public config (defaults to
  // "ja"). Full i18n routing / locale switcher UI is planned for Phase 5.
  return (
    <html lang={publicEnv.defaultLocale}>
      <body>{children}</body>
    </html>
  );
}
