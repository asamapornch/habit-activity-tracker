import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express, { type Express } from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { mountFrontend } from "../src/lib/staticFrontend.js";

let distDir: string;

function buildApp(dir: string | undefined): Express {
  const app = express();
  // Mirrors app.ts's shape: a couple of real-looking API routes mounted
  // before mountFrontend, an unmatched sub-path left to fall through.
  app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));
  app.get("/goals", (_req, res) => res.status(200).json({ items: [] }));
  if (dir) {
    mountFrontend(app, dir);
  }
  return app;
}

beforeEach(() => {
  distDir = fs.mkdtempSync(path.join(os.tmpdir(), "frontend-dist-"));
  fs.writeFileSync(path.join(distDir, "index.html"), "<!doctype html><title>spa-fixture</title>");
});

afterEach(() => {
  fs.rmSync(distDir, { recursive: true, force: true });
});

describe("mountFrontend", () => {
  it("serves index.html for an unknown, non-API client path", async () => {
    const res = await request(buildApp(distDir)).get("/goals-list/42");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/html/);
    expect(res.text).toContain("spa-fixture");
  });

  it("still lets a registered API route answer normally", async () => {
    const res = await request(buildApp(distDir)).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("returns the API's own JSON 404, not index.html, for an unmatched path under a known API prefix", async () => {
    const res = await request(buildApp(distDir)).get("/goals/does-not-exist/sub");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: "NOT_FOUND", message: "Not found." } });
  });

  it("is a no-op (existing behaviour unchanged) when the dist directory has no build", async () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "frontend-dist-empty-"));
    try {
      const res = await request(buildApp(emptyDir)).get("/some/client/route");
      // Express's own default 404 (unchanged from before this feature
      // existed), not our fixture's index.html.
      expect(res.status).toBe(404);
      expect(res.text).not.toContain("spa-fixture");
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});
