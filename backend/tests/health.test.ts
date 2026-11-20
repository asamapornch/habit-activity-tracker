import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

describe("GET /health", () => {
  it("responds with status ok", async () => {
    const res = await request(createApp()).get("/health");
    expect(res.status).toBe(200);
    // LAB 5 C-02 DEMO: deliberately wrong expectation so the required check
    // `test-and-docker` fails and branch protection blocks the merge.
    // This PR is closed without merging; the real value is { status: "ok" }.
    expect(res.body).toEqual({ status: "deliberately-broken-for-c02-demo" });
  });
});
