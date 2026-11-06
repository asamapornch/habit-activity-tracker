import { describe, expect, it } from "vitest";
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
