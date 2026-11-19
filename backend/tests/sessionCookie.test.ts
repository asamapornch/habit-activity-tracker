import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

/**
 * Locks in cookie flags already set in src/lib/session.ts (not new behaviour
 * being added by this PR) so a later refactor cannot silently drop them.
 */
function buildSessionTestApp() {
  const app = createApp();
  app.get("/__test/touch-session", (req, res) => {
    req.session.userId = 1;
    req.session.save(() => res.status(200).end());
  });
  return app;
}

describe("session cookie flags", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sets HttpOnly and SameSite=Lax, and omits Secure outside production", async () => {
    const res = await request(buildSessionTestApp()).get("/__test/touch-session");

    const setCookie = res.headers["set-cookie"]?.[0] ?? "";
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).not.toMatch(/; ?Secure/i);
  });

  it("also sets Secure when NODE_ENV=production (behind the trusted proxy's HTTPS hop)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    // express-session only emits a `secure: true` cookie on a request it
    // considers secure; Cloud Run terminates TLS and forwards this header,
    // which `app.set("trust proxy", 1)` makes Express honour as req.secure.
    const res = await request(buildSessionTestApp())
      .get("/__test/touch-session")
      .set("X-Forwarded-Proto", "https");

    const setCookie = res.headers["set-cookie"]?.[0] ?? "";
    expect(setCookie).toMatch(/; ?Secure/i);
  });
});
