import { Injectable } from "@nestjs/common";
import { randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Implements the "double-submit cookie" CSRF defense (SDD section 16.3):
 * the server hands out a random token both as an HttpOnly cookie and in
 * a JSON response body; the client must echo that exact value back in a
 * request header on every state-changing request. A cross-site page can
 * trigger a request that carries the cookie automatically, but has no
 * way to read the token to also set the header — so the two won't match.
 *
 * The cookie is HttpOnly specifically so the token can only be obtained
 * via `GET /api/auth/csrf`'s response body, not by reading
 * `document.cookie` — a small extra layer over the classic (non-HttpOnly)
 * double-submit variant.
 */
@Injectable()
export class CsrfService {
  generateToken(): string {
    return randomBytes(32).toString("base64url");
  }

  isValid(cookieValue: string | undefined | false, headerValue: string | undefined): boolean {
    if (!cookieValue || !headerValue) return false;
    const a = Buffer.from(cookieValue);
    const b = Buffer.from(headerValue);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }
}
