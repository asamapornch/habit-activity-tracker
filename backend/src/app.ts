import express from "express";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { templatesRouter } from "./routes/templates.js";
import { goalsRouter } from "./routes/goals.js";
import { createSessionMiddleware } from "./lib/session.js";
import { createCorsMiddleware } from "./lib/cors.js";

export function createApp() {
  const app = express();

  app.use(createCorsMiddleware());
  // strict: false so a JSON `null` or scalar body reaches the route and gets the
  // route's own 400 message (F-03 TEST-03.4i); malformed JSON is still a SyntaxError.
  app.use(express.json({ strict: false }));
  app.use(createSessionMiddleware());
  app.use(healthRouter);
  app.use(authRouter);
  app.use(templatesRouter);
  app.use(goalsRouter);

  return app;
}
