import { Injectable } from "@nestjs/common";
import { AppConfigService } from "./config/app-config.service";

export interface HealthStatus {
  status: "ok";
  service: "local-notebook-ai-api";
  phase: string;
  environment: string;
  timestamp: string;
}

@Injectable()
export class AppService {
  constructor(private readonly appConfig: AppConfigService) {}

  getHealth(): HealthStatus {
    return {
      status: "ok",
      service: "local-notebook-ai-api",
      // Non-secret config values only. Never include session secrets,
      // database URLs, or admin credentials here.
      phase: "2",
      environment: this.appConfig.config.app.nodeEnv,
      timestamp: new Date().toISOString(),
    };
  }
}
