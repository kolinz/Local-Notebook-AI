import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { getValidatedConfig } from "./config/configuration";
import { ConfigValidationError } from "./config/config-error";
import { HttpExceptionFilter } from "./common/http-exception.filter";

async function bootstrap() {
  // Validate configuration BEFORE constructing the Nest application. If
  // this throws, we print a single clean, human-readable message (see
  // config/config-error.ts) with no Nest-internal stack trace noise, and
  // exit immediately. AppConfigService re-uses this same (memoized) result
  // once the app does start, so validation only ever runs once.
  let config;
  try {
    config = getValidatedConfig(process.env);
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }

  const app = await NestFactory.create(AppModule);

  // Global prefix so all routes live under /api, matching SDD section 15.
  app.setGlobalPrefix("api");

  // Every response from this API is either session/auth-dependent or
  // otherwise dynamic (notebooks, files, chat, admin settings, ...) —
  // none of it should ever be cached by the browser. Without this, a
  // browser can serve a stale cached response for an endpoint like
  // `GET /api/auth/me` (observed as an HTTP 304 "Not Modified" served
  // from cache) even after the user has since logged in or out,
  // producing exactly the kind of "briefly shows signed-out, then
  // flips to signed-in" flicker this fixes.
  app.use((_req: unknown, res: { setHeader: (name: string, value: string) => void }, next: () => void) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
  });

  // Every error response is reshaped into { error: { code, message } }
  // (SDD section 15.6), regardless of which guard/pipe/service threw.
  app.useGlobalFilters(new HttpExceptionFilter());

  // apps/web (a different port, hence a different origin even though it
  // shares the same hostname in local dev) needs to be able to send
  // cookies with its requests for session-based auth to work at all.
  app.enableCors({
    origin: config.app.appBaseUrl,
    credentials: true,
  });

  await app.listen(config.app.portApi);

  // eslint-disable-next-line no-console
  console.log(
    `[api] Local Notebook AI API listening on http://localhost:${config.app.portApi}/api ` +
      `(env: ${config.app.nodeEnv})`,
  );
}

bootstrap().catch((error: unknown) => {
  // Any startup failure other than config validation (already handled
  // above): show the real error for debugging.
  // eslint-disable-next-line no-console
  console.error("[api] Fatal error during startup:");
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
