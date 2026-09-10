import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import type { CookieOptions, Request, Response } from "express";
import { Throttle } from "@nestjs/throttler";
import { AppConfigService } from "../config/app-config.service";
import { AuthService } from "./auth.service";
import { CsrfService } from "./csrf.service";
import { SessionAuthGuard } from "./guards/session-auth.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { loginSchema, type LoginDto } from "./dto/login.dto";
import { changePasswordSchema, type ChangePasswordDto } from "./dto/change-password.dto";
import type { SessionUser } from "./session.service";

/** CSRF cookie/token lifetime — independent of the session cookie's. */
const CSRF_TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Shape returned to clients for the current user — never includes passwordHash. */
interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  locale: string;
  mustChangePassword: boolean;
}

function toPublicUser(user: SessionUser): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    locale: user.locale,
    mustChangePassword: user.mustChangePassword,
  };
}

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly csrfService: CsrfService,
    private readonly appConfig: AppConfigService,
  ) {}

  private baseCookieOptions(): CookieOptions {
    const { cookieSecure, cookieSameSite } = this.appConfig.config.session;
    return {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: cookieSameSite,
      path: "/",
    };
  }

  /**
   * GET /api/auth/csrf
   *
   * Issues a fresh CSRF token: sets it as an HttpOnly cookie AND returns
   * it in the JSON body. Callable anonymously (no session required) —
   * the frontend fetches this once (e.g. on the login page) before
   * making any state-changing request.
   */
  @Get("csrf")
  getCsrfToken(@Res({ passthrough: true }) res: Response): { csrfToken: string } {
    const token = this.csrfService.generateToken();
    const { cookieName } = this.appConfig.config.csrf;

    res.cookie(cookieName, token, {
      ...this.baseCookieOptions(),
      maxAge: CSRF_TOKEN_MAX_AGE_MS,
    });

    return { csrfToken: token };
  }

  /**
   * POST /api/auth/login
   *
   * Requires a valid CSRF token (enforced globally by CsrfGuard). On
   * success, sets the session cookie and returns the current user
   * (including `mustChangePassword`, so the frontend can redirect to a
   * password-change screen).
   */
  @Post("login")
  @HttpCode(200)
  // Phase 16: a much stricter limit than the app-wide default (10/s,
  // 200/min) — credential stuffing / brute force is the realistic threat
  // against this specific endpoint, so it gets its own tight window
  // (5 attempts per minute per client) rather than relying on the
  // general-purpose limits meant for ordinary API usage. Both named
  // throttler buckets configured in AppModule ("short", "long") must be
  // overridden here — overriding only one leaves the other's more
  // permissive limit still governing this route.
  @Throttle({ short: { limit: 5, ttl: 60_000 }, long: { limit: 5, ttl: 60_000 } })
  @UsePipes(new ZodValidationPipe(loginSchema))
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: PublicUser }> {
    const { token, maxAgeMs, user } = await this.authService.login(body.email, body.password, {
      ipAddress: req.ip,
      userAgent: req.header("user-agent"),
    });
    const { cookieName } = this.appConfig.config.session;

    res.cookie(cookieName, token, {
      ...this.baseCookieOptions(),
      maxAge: maxAgeMs,
      signed: true,
    });

    return { user: toPublicUser(user) };
  }

  /**
   * POST /api/auth/logout
   *
   * Requires an active session (SessionAuthGuard) and a valid CSRF token
   * (CsrfGuard, global). Destroys the server-side session and clears the
   * cookie.
   */
  @Post("logout")
  @HttpCode(200)
  @UseGuards(SessionAuthGuard)
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): { success: true } {
    const { cookieName } = this.appConfig.config.session;
    const token = req.signedCookies?.[cookieName] as string | undefined;

    if (token) {
      this.authService.logout(token, req.user!.id, {
        ipAddress: req.ip,
        userAgent: req.header("user-agent"),
      });
    }

    res.clearCookie(cookieName, { path: "/" });
    return { success: true };
  }

  /**
   * GET /api/auth/me
   *
   * Requires an active session (SessionAuthGuard). Returns the current
   * user — used by the frontend on page load to check "am I logged in?"
   * and by Next.js middleware (server-to-server) for route protection.
   */
  @Get("me")
  @UseGuards(SessionAuthGuard)
  me(@Req() req: Request): { user: PublicUser } {
    return { user: toPublicUser(req.user!) };
  }

  /**
   * POST /api/auth/change-password
   *
   * Requires an active session (SessionAuthGuard) and a valid CSRF token
   * (CsrfGuard, global). Verifies the caller's current password before
   * setting the new one, and clears `mustChangePassword` on success —
   * this is what the `/change-password` placeholder page was always
   * meant to call once implemented.
   */
  @Post("change-password")
  @HttpCode(200)
  @UseGuards(SessionAuthGuard)
  // Phase 16: a stolen-but-valid session cookie still requires the
  // correct CURRENT password to actually change it (see AuthService)
  // — an attacker with such a session could otherwise brute-force that
  // check. Same tight window as login for the same reason.
  @Throttle({ short: { limit: 5, ttl: 60_000 }, long: { limit: 5, ttl: 60_000 } })
  @UsePipes(new ZodValidationPipe(changePasswordSchema))
  async changePassword(
    @Body() body: ChangePasswordDto,
    @Req() req: Request,
  ): Promise<{ success: true }> {
    await this.authService.changePassword(req.user!.id, body.currentPassword, body.newPassword, {
      ipAddress: req.ip,
      userAgent: req.header("user-agent"),
    });
    return { success: true };
  }
}
