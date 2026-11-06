import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { config } from "../src/lib/config.js";

describe("CORS", () => {
  it("sends Access-Control-Allow-Origin and -Credentials for the configured FRONTEND_ORIGIN", async () => {
    const app = createApp();

    const res = await request(app).get("/health").set("Origin", config.frontendOrigin);

    expect(res.headers["access-control-allow-origin"]).toBe(config.frontendOrigin);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("does not send Access-Control-Allow-Origin for a different Origin", async () => {
    const app = createApp();

    const res = await request(app).get("/health").set("Origin", "http://evil.example.com");

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("fail-fast on missing FRONTEND_ORIGIN", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("throws at import time if FRONTEND_ORIGIN is empty (config.ts treats unset the same way)", async () => {
    // A present-but-empty value, not `delete`: dotenv only fills in keys that are
    // NOT already present in process.env, so this stays empty through re-import
    // regardless of what the local .env file happens to contain.
    vi.stubEnv("FRONTEND_ORIGIN", "");
    vi.resetModules();

    await expect(import("../src/lib/cors.js")).rejects.toThrow(/FRONTEND_ORIGIN/);
  });
});
