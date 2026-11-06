import type { NextFunction, Request, Response } from "express";

/**
 * Stub — real error normalisation lands with F-01 review follow-up, written
 * against a failing test first. Until then every error reports "not implemented".
 */
export function errorHandler(_err: unknown, _req: Request, res: Response, _next: NextFunction) {
  res.status(501).json({ error: { code: "NOT_IMPLEMENTED", message: "Not implemented" } });
}
