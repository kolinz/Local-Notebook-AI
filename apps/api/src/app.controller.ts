import { Controller, Get } from "@nestjs/common";
import { AppService, HealthStatus } from "./app.service";

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /**
   * GET /api/health
   *
   * Minimal liveness check. Reports non-secret config (environment name)
   * so operators can confirm which .env was loaded. No auth/DB/RAG
   * dependencies yet.
   */
  @Get("health")
  getHealth(): HealthStatus {
    return this.appService.getHealth();
  }
}
