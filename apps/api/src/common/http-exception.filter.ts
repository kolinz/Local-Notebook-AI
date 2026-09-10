import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { Response } from "express";
import { MulterError } from "multer";

/**
 * Reshapes every error response into the SDD's standard envelope
 * (section 15.6):
 *
 * ```json
 * { "error": { "code": "FORBIDDEN", "message": "..." } }
 * ```
 *
 * Exceptions thrown as `AppException` (see ./app-exception.ts) already
 * carry a specific `code`; Nest's built-in `HttpException`s fall back to
 * a code derived from the HTTP status.
 *
 * Widened from `@Catch(HttpException)` to a catch-all (Phase 7) so that
 * `multer.MulterError` — thrown by the file-upload interceptor when a
 * request exceeds its configured limit, before any of our own
 * handler/pipe code runs — also gets the same envelope and an
 * appropriate status, instead of falling through to Nest's default
 * (unformatted) internal-error response. Any other unexpected error is
 * logged server-side and returned as a generic 500 without leaking
 * internals to the client.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      let code: string;
      let message: string;

      if (typeof body === "object" && body !== null && "code" in body) {
        const typed = body as { code: unknown; message?: unknown };
        code = String(typed.code);
        message = typeof typed.message === "string" ? typed.message : exception.message;
      } else {
        code = defaultCodeForStatus(status);
        message =
          typeof body === "string"
            ? body
            : (typeof (body as { message?: unknown })?.message === "string"
                ? ((body as { message: string }).message)
                : exception.message);
      }

      response.status(status).json({ error: { code, message } });
      return;
    }

    if (exception instanceof MulterError) {
      const status = exception.code === "LIMIT_FILE_SIZE" ? HttpStatus.PAYLOAD_TOO_LARGE : HttpStatus.BAD_REQUEST;
      response.status(status).json({ error: { code: "UPLOAD_ERROR", message: exception.message } });
      return;
    }

    // eslint-disable-next-line no-console
    console.error("[api] Unhandled exception:", exception);
    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ error: { code: "INTERNAL_ERROR", message: "Internal server error." } });
  }
}

function defaultCodeForStatus(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return "BAD_REQUEST";
    case HttpStatus.UNAUTHORIZED:
      return "UNAUTHENTICATED";
    case HttpStatus.FORBIDDEN:
      return "FORBIDDEN";
    case HttpStatus.NOT_FOUND:
      return "NOT_FOUND";
    case HttpStatus.CONFLICT:
      return "CONFLICT";
    default:
      return "ERROR";
  }
}
