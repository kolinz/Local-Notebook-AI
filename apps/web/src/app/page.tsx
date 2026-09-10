"use client";

import { useEffect, useState } from "react";
import { AuthStatus } from "@/components/auth-status";
import { getUsageGuide } from "@/lib/api-client";

/**
 * The landing page. Originally shipped (Phase 3) as a developer-facing
 * status checklist ("Phase 3: Authentication, Session, CSRF ✅ ...") —
 * replaced here with an actual usage guide for people using the app,
 * editable by admins from the "使い方ガイド" admin screen
 * (`PUT /api/admin/usage-guide`) without needing a code change.
 */
export default function HomePage() {
  const [guide, setGuide] = useState<string | null>(null);

  useEffect(() => {
    getUsageGuide()
      .then(setGuide)
      .catch(() => setGuide(null));
  }, []);

  return (
    <main className="page">
      <h1>Local Notebook AI</h1>
      <p className="tagline">
        Self-hosted, multi-user, NotebookLM-style RAG workspace backed by Ollama.
      </p>

      <AuthStatus />

      <section className="status-card">
        {/* Plain-text rendering only (white-space: pre-wrap in CSS) — this
            content is admin-authored, not code, but the same
            no-dangerouslySetInnerHTML rule applies uniformly across the
            app regardless of who wrote the text. */}
        <p className="usage-guide__content">{guide ?? "…"}</p>
      </section>
    </main>
  );
}
