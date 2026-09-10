"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchCurrentUser, type CurrentUser } from "@/lib/api-client";

/**
 * Client-side "am I logged in (and, optionally, am I an admin)?" check,
 * used by pages under `/[locale]/notebooks` and `/[locale]/admin`.
 *
 * This is a backstop, not the primary defense — actual route protection
 * happens server-side in middleware.ts, which redirects before these
 * pages ever render for an unauthenticated/unauthorized request. This
 * hook additionally gives client components the current user to
 * display, and covers the case where a session expires mid-visit.
 */
export function useCurrentUser(options: { requireAdmin?: boolean } = {}): {
  user: CurrentUser | null;
  loading: boolean;
} {
  const router = useRouter();
  const params = useParams<{ locale: string }>();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const requireAdmin = options.requireAdmin ?? false;

  useEffect(() => {
    let cancelled = false;

    fetchCurrentUser()
      .then((current) => {
        if (cancelled) return;
        if (!current) {
          router.replace(`/${params.locale}/login`);
        } else if (requireAdmin && current.role !== "admin") {
          router.replace(`/${params.locale}/notebooks`);
        } else {
          setUser(current);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [params.locale, requireAdmin, router]);

  return { user, loading };
}
