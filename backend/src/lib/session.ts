import session from "express-session";
import { config } from "./config.js";

export const SESSION_COOKIE_NAME = "sid";
export const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000; // 8 hours

if (!config.sessionSecret) {
  throw new Error("SESSION_SECRET must be set to a non-empty value before the app can start.");
}

export function createSessionMiddleware() {
  return session({
    name: SESSION_COOKIE_NAME,
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    // The default in-memory store (Sprint 1, SDS §5) derives a session's TTL
    // from this same cookie expiry, so setting maxAge covers both.
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_LIFETIME_MS,
    },
  });
}
