import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { SessionService } from "./session.service";
import { CsrfService } from "./csrf.service";
import { SessionAuthGuard } from "./guards/session-auth.guard";

/**
 * SessionService and CsrfService are exported because AppModule's own
 * providers (SessionMiddleware, CsrfGuard — both registered app-wide,
 * not just for this module's routes) depend on them.
 */
@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionService, CsrfService, SessionAuthGuard],
  exports: [SessionService, CsrfService],
})
export class AuthModule {}
