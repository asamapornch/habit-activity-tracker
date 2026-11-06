import express from "express";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { templatesRouter } from "./routes/templates.js";
import { createSessionMiddleware } from "./lib/session.js";

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(createSessionMiddleware());
  app.use(healthRouter);
  app.use(authRouter);
  app.use(templatesRouter);

  return app;
}
