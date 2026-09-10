import { Injectable, PipeTransform } from "@nestjs/common";
import type { ZodSchema } from "zod";
import { AppException } from "./app-exception";

/**
 * Validates a request payload against a Zod schema. Use via
 * `@UsePipes(new ZodValidationPipe(someSchema))` on a controller method.
 *
 * The project standardized on Zod for `.env` validation (Phase 1.5); this
 * keeps request-body validation consistent with that choice rather than
 * introducing `class-validator` decorators as well.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const detail = result.error.issues
        .map((issue) => `${issue.path.join(".") || "(body)"}: ${issue.message}`)
        .join("; ");
      throw new AppException(400, "VALIDATION_ERROR", detail);
    }
    return result.data;
  }
}
