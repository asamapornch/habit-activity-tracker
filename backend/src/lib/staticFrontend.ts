import fs from "node:fs";
import path from "node:path";
import express, { type Express } from "express";
import { sendError } from "./errors.js";

// Backend routes are bare paths, not namespaced under "/api" (see the
// routers mounted in app.ts), so there is no single prefix check that
// separates "API request" from "SPA client route". This list is the one
// place that has to know all of them, so an unmatched request under one of
// these still gets the API's own 404 instead of index.html.
const API_PATH_PREFIXES = ["/health", "/ready", "/auth", "/templates", "/goals"];

function isApiPath(pathname: string): boolean {
  return API_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Register after every API router. Serves the built frontend as a
 * single-page app for any other GET request. A no-op when distDir has no
 * index.html — e.g. local dev, where the frontend runs via its own Vite dev
 * server instead of being built into this process.
 */
export function mountFrontend(app: Express, distDir: string) {
  const indexHtml = path.join(distDir, "index.html");
  if (!fs.existsSync(indexHtml)) {
    return;
  }

  app.use(express.static(distDir));

  app.get("*", (req, res) => {
    if (isApiPath(req.path)) {
      sendError(res, 404, "NOT_FOUND", "Not found.");
      return;
    }
    res.sendFile(indexHtml);
  });
}
