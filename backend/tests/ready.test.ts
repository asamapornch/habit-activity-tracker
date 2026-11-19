import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

describe("GET /ready", () => {
  it("responds 200 with status ready when the database answers", async () => {
    const res = await request(createApp()).get("/ready");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ready" });
  });

  it("responds 503 when the database does not answer", async () => {
    const spy = vi.spyOn(prisma, "$queryRaw").mockRejectedValueOnce(new Error("db down"));

    const res = await request(createApp()).get("/ready");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: "not ready" });
    spy.mockRestore();
  });
});
