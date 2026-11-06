import type { NextFunction, Request, Response } from "express";
import { sendError } from "../lib/errors.js";

/**
 * Last middleware in the stack. Normalises every error (including body-parser's
 * malformed-JSON SyntaxError) into the standard { error: { code, message } }
 * body — never a stack trace or an HTML error page (F-01 contract AC-01.11).
 */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const isBodyParseError =
    err instanceof SyntaxError && (err as { status?: number; type?: string }).status === 400;

  if (isBodyParseError) {
    sendError(res, 400, "VALIDATION_ERROR", "Request body is not valid JSON.");
    return;
  }

  sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred.");
}
