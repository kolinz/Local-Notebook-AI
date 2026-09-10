import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { AppException } from "../../common/app-exception";

/**
 * Applied per-route via `@UseGuards(SessionAuthGuard)`. Relies on
 * `SessionMiddleware` having already run (it runs for every request,
 * before any guard) and attached `req.user` if a valid session cookie
 * was present.
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.user) {
      throw new AppException(401, "UNAUTHENTICATED", "Login required.");
    }
    return true;
  }
}
