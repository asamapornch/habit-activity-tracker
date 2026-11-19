import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { config } from "./config.js";
import { pgPool } from "./db.js";

export const SESSION_COOKIE_NAME = "sid";
export const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000; // 8 hours

if (!config.sessionSecret) {
  throw new Error("SESSION_SECRET must be set to a non-empty value before the app can start.");
}

// One store (and one underlying pg Pool, see lib/db.ts) shared by every
// createApp() call / Cloud Run instance, instead of express-session's
// default per-process MemoryStore. The "session" table is created by an
// additive Prisma migration, not by this store, so createTableIfMissing
// stays false.
const PgSessionStore = connectPgSimple(session);
const sessionStore = new PgSessionStore({ pool: pgPool, createTableIfMissing: false });
// express-session's session() factory adds a "connect"/"disconnect"
// listener to the store on every call. In production createSessionMiddleware
// runs once per process, so that's a non-issue; tests call createApp() (and
// so this factory) once per test against this same shared store, which would
// otherwise trip Node's default max-listeners warning.
sessionStore.setMaxListeners(0);

export function createSessionMiddleware() {
  return session({
    store: sessionStore,
    name: SESSION_COOKIE_NAME,
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    // The session row's expiry in Postgres is derived from this same cookie
    // expiry, so setting maxAge covers both.
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_LIFETIME_MS,
    },
  });
}
