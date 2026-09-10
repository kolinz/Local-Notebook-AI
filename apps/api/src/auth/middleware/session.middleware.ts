import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { AppConfigService } from "../../config/app-config.service";
import { SessionService, type SessionUser } from "../session.service";

declare module "express-serve-static-core" {
  interface Request {
    /** Set by SessionMiddleware when a valid, active-user session cookie is present. */
    user?: SessionUser;
  }
}

/**
 * Runs on every request (registered in AppModule.configure(), after
 * cookie-parser). If the session cookie resolves to a valid, non-expired
 * session whose user is still `is_active`, attaches that user to
 * `req.user`. Never blocks the request itself — route-level access
 * control is `SessionAuthGuard`'s job (see ../guards/session-auth.guard.ts).
 *
 * Checking `is_active` here (not just at login) means deactivating a user
 * takes effect immediately on their very next request, without waiting
 * for their existing session to expire.
 */
@Injectable()
export class SessionMiddleware implements NestMiddleware {
  constructor(
    private readonly appConfig: AppConfigService,
    private readonly sessionService: SessionService,
  ) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const { cookieName } = this.appConfig.config.session;
    const token = req.signedCookies?.[cookieName] as string | undefined;

    if (token) {
      const user = this.sessionService.getUserForToken(token);
      if (user && user.isActive) {
        req.user = user;
      }
    }

    next();
  }
}
