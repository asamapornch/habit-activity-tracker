import session from "express-session";
import { config } from "./config.js";

export const SESSION_COOKIE_NAME = "sid";

export function createSessionMiddleware() {
  return session({
    name: SESSION_COOKIE_NAME,
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  });
}
