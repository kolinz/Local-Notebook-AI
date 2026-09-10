import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/config/public-env";

/**
 * Server-side route protection for `/[locale]/notebooks/*` and
 * `/[locale]/admin/*`.
 *
 * This runs before the page renders, so an unauthenticated request never
 * even sees protected content (unlike a client-side-only check, which
 * would briefly render before redirecting). It works by forwarding the
 * incoming request's `Cookie` header to `GET /api/auth/me` — a plain
 * server-to-server HTTP call, not subject to CORS or SameSite cookie
 * restrictions (those only apply to browser-initiated requests).
 *
 * Fails closed: if the API is unreachable or returns anything other than
 * 200, the request is treated as unauthenticated.
 */

interface MeResponse {
  user: { role: string } | null;
}

async function getCurrentUser(cookieHeader: string): Promise<{ role: string } | null> {
  try {
    const res = await fetch(`${publicEnv.apiBaseUrl}/api/auth/me`, {
      headers: { cookie: cookieHeader },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as MeResponse;
    return data.user;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const segments = pathname.split("/").filter(Boolean);
  const [locale, section] = segments;

  const user = await getCurrentUser(request.headers.get("cookie") ?? "");

  if (!user) {
    const loginUrl = new URL(`/${locale}/login`, request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (section === "admin" && user.role !== "admin") {
    return NextResponse.redirect(new URL(`/${locale}/notebooks`, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/:locale(ja|en)/admin/:path*", "/:locale(ja|en)/notebooks/:path*"],
};
