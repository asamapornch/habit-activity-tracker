import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("config.frontendDistPath", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("defaults to <repo>/frontend/dist when FRONTEND_DIST_PATH is unset", async () => {
    // A present-but-empty value, not `delete`: dotenv only fills in keys
    // that are NOT already present in process.env (and vitest.config.ts's
    // own test env sets this one), so an empty stub is what "unset" looks
    // like through a fresh import — same convention as cors.test.ts's
    // FRONTEND_ORIGIN fail-fast test.
    vi.stubEnv("FRONTEND_DIST_PATH", "");
    vi.resetModules();

    const { config } = await import("../src/lib/config.js");

    expect(config.frontendDistPath).toBe(
      path.resolve(import.meta.dirname, "../../frontend/dist"),
    );
  });

  it("is overridable via FRONTEND_DIST_PATH (so tests can point it at a fixture or a known-missing path)", async () => {
    vi.stubEnv("FRONTEND_DIST_PATH", "/tmp/lab5-fixture-dist");
    vi.resetModules();

    const { config } = await import("../src/lib/config.js");

    expect(config.frontendDistPath).toBe("/tmp/lab5-fixture-dist");
  });
});
