import type { NextFunction, Request, Response } from "express";
import { sendError } from "../lib/errors.js";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    sendError(res, 401, "UNAUTHENTICATED", "Authentication required.");
    return;
  }
  next();
}

export function requireRole(role: "MANAGER" | "PARTICIPANT") {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.userId) {
      sendError(res, 401, "UNAUTHENTICATED", "Authentication required.");
      return;
    }
    if (req.session.role !== role) {
      sendError(res, 403, "FORBIDDEN", "You do not have permission to perform this action.");
      return;
    }
    next();
  };
}
