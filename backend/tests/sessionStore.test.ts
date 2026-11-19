import bcrypt from "bcrypt";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const PASSWORD = "session-store-test-pass-123";

describe("session store", () => {
  it("persists the session in the Postgres `session` table, not in server memory", async () => {
    const user = await prisma.user.create({
      data: {
        email: "session-store-test@example.com",
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        role: "PARTICIPANT",
      },
    });

    const loginRes = await request(createApp())
      .post("/auth/login")
      .send({ email: user.email, password: PASSWORD });
    expect(loginRes.status).toBe(200);

    const rows = await prisma.$queryRaw<
      { sid: string; expire: Date }[]
    >`SELECT sid, expire FROM "session"`;

    expect(rows).toHaveLength(1);
    expect(rows[0].expire.getTime()).toBeGreaterThan(Date.now());
  });

  it("recognises a session cookie issued by one app instance from a brand-new app instance sharing the same store", async () => {
    const user = await prisma.user.create({
      data: {
        email: "session-store-cross-instance@example.com",
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        role: "PARTICIPANT",
      },
    });

    // Cloud Run can route a browser's requests to any of several running
    // container instances; a session must not be pinned to the process that
    // created it.
    const appA = createApp();
    const loginRes = await request(appA)
      .post("/auth/login")
      .send({ email: user.email, password: PASSWORD });
    const cookie = loginRes.headers["set-cookie"]?.[0];
    expect(cookie).toBeDefined();

    const appB = createApp();
    const meRes = await request(appB).get("/auth/me").set("Cookie", cookie!);

    expect(meRes.status).toBe(200);
    expect(meRes.body).toEqual({ id: user.id, email: user.email, role: user.role });
  });
});
