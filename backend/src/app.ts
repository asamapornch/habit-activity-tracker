import express from "express";
import { healthRouter } from "./routes/health.js";
import { readyRouter } from "./routes/ready.js";
import { authRouter } from "./routes/auth.js";
import { templatesRouter } from "./routes/templates.js";
import { goalsRouter } from "./routes/goals.js";
import { entriesRouter } from "./routes/entries.js";
import { streaksRouter } from "./routes/streaks.js";
import { createSessionMiddleware } from "./lib/session.js";
import { createCorsMiddleware } from "./lib/cors.js";
import { mountFrontend } from "./lib/staticFrontend.js";
import { config } from "./lib/config.js";

export function createApp() {
  const app = express();

  // Cloud Run terminates TLS and proxies over HTTP, adding exactly one
  // X-Forwarded-* hop; trusting it (rather than `true`) lets Express compute
  // req.secure/req.ip from that header without trusting a spoofable chain of
  // arbitrary length.
  app.set("trust proxy", 1);

  app.use(createCorsMiddleware());
  // strict: false so a JSON `null` or scalar body reaches the route and gets the
  // route's own 400 message (F-03 TEST-03.4i); malformed JSON is still a SyntaxError.
  app.use(express.json({ strict: false }));
  app.use(createSessionMiddleware());
  app.use(healthRouter);
  app.use(readyRouter);
  app.use(authRouter);
  app.use(templatesRouter);
  app.use(goalsRouter);
  app.use(entriesRouter);
  app.use(streaksRouter);
  // Must come last: a no-op unless frontend/dist was built into this image
  // (see config.frontendDistPath), and only ever reached by a request none
  // of the routers above already handled.
  mountFrontend(app, config.frontendDistPath);

  return app;
}
