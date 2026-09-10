import { HttpException } from "@nestjs/common";

/**
 * Throw this instead of a bare `HttpException` whenever the API needs to
 * return a specific machine-readable error `code` (per SDD section 15.6:
 * `{ "error": { "code": "...", "message": "..." } }`).
 *
 * `HttpExceptionFilter` (see ./http-exception.filter.ts) reads the
 * `code`/`message` off the exception response and reshapes it into that
 * envelope for every response, so route handlers never build the JSON
 * body by hand.
 */
export class AppException extends HttpException {
  constructor(status: number, code: string, message: string) {
    super({ code, message }, status);
  }
}
