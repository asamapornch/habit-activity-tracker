import type { Response } from "express";

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "INVALID_CREDENTIALS"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "INTERNAL_ERROR"
  | "NOT_FOUND"
  | "CONFLICT";

export function sendError(res: Response, status: number, code: ErrorCode, message: string) {
  res.status(status).json({ error: { code, message } });
}
