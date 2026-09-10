import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { AppConfigService } from "../../config/app-config.service";
import { AppException } from "../../common/app-exception";
import { CsrfService } from "../csrf.service";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Registered globally (see AppModule) via `APP_GUARD`, so it runs for
 * every route in the application, present and future — matching SDD
 * section 16.3's requirement that ALL state-changing endpoints
 * (POST/PUT/PATCH/DELETE) require a CSRF token, with no per-route
 * opt-in needed. This includes the auth endpoints themselves
 * (login/logout): the spec makes no exception for them, and a CSRF
 * token can be obtained anonymously from `GET /api/auth/csrf` before a
 * session exists.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly appConfig: AppConfigService,
    private readonly csrfService: CsrfService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) {
      return true;
    }

    const { cookieName, headerName } = this.appConfig.config.csrf;
    const cookieValue = request.cookies?.[cookieName] as string | undefined;
    const headerValue = request.header(headerName);

    if (!this.csrfService.isValid(cookieValue, headerValue)) {
      throw new AppException(403, "CSRF_INVALID", "Missing or invalid CSRF token.");
    }

    return true;
  }
}
