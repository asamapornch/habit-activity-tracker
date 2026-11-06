import type { NextFunction, Request, Response } from "express";

/**
 * Stub — real session/token verification lands with F-01, written against
 * failing tests first. Until then every protected route reports "not implemented".
 */
export function requireAuth(_req: Request, res: Response, _next: NextFunction) {
  res.status(501).json({ error: "Not implemented" });
}

export function requireRole(_role: "MANAGER" | "PARTICIPANT") {
  return (_req: Request, res: Response, _next: NextFunction) => {
    res.status(501).json({ error: "Not implemented" });
  };
}
