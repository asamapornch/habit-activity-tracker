import type { Express } from "express";
import bcrypt from "bcrypt";
import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { requireAuth, requireRole } from "../src/middleware/auth.js";

const MANAGER_PASSWORD = "manager-pass-123";
const PARTICIPANT_PASSWORD = "participant-pass-123";

function buildTestApp(): Express {
  const app = createApp();

  app.get("/__test/protected", requireAuth, (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.get("/__test/manager-only", requireRole("MANAGER"), (_req, res) => {
    res.status(200).json({ ok: true });
  });

  return app;
}

let app: Express;
let manager: { id: number; email: string };
let participant: { id: number; email: string };

beforeEach(async () => {
  app = buildTestApp();

  manager = await prisma.user.create({
    data: {
      email: "test-manager@example.com",
      passwordHash: await bcrypt.hash(MANAGER_PASSWORD, 10),
      role: "MANAGER",
    },
  });

  participant = await prisma.user.create({
    data: {
      email: "test-participant@example.com",
      passwordHash: await bcrypt.hash(PARTICIPANT_PASSWORD, 10),
      role: "PARTICIPANT",
    },
  });
});

describe("POST /auth/login", () => {
  it("TEST-01.1 logs in with correct credentials, returns id/email/role, and sets an HttpOnly SameSite=Lax cookie", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: manager.email, password: MANAGER_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: manager.id, email: manager.email, role: "MANAGER" });

    const cookie = res.headers["set-cookie"]?.[0];
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it("TEST-01.2a returns 401 INVALID_CREDENTIALS for a wrong password", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: manager.email, password: "wrong-password" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("TEST-01.2b returns the same 401 code and message for an unknown email", async () => {
    const wrongPasswordRes = await request(app)
      .post("/auth/login")
      .send({ email: manager.email, password: "wrong-password" });

    const unknownEmailRes = await request(app)
      .post("/auth/login")
      .send({ email: "nobody@example.com", password: "whatever" });

    expect(unknownEmailRes.status).toBe(401);
    expect(unknownEmailRes.body.error.code).toBe(wrongPasswordRes.body.error.code);
    expect(unknownEmailRes.body.error.message).toBe(wrongPasswordRes.body.error.message);
  });

  it("TEST-01.7a returns 400 VALIDATION_ERROR for an empty body", async () => {
    const res = await request(app).post("/auth/login").send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("TEST-01.7b returns 400 for non-string fields and the server still answers a later request", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: 123, password: null });

    expect(res.status).toBe(400);

    const followUp = await request(app).get("/health");
    expect(followUp.status).toBe(200);
  });
});

describe("POST /auth/logout", () => {
  it("TEST-01.3 invalidates the session so the same cookie later gets 401 from /auth/me", async () => {
    const agent = request.agent(app);
    await agent.post("/auth/login").send({ email: manager.email, password: MANAGER_PASSWORD });

    const logoutRes = await agent.post("/auth/logout");
    expect(logoutRes.status).toBe(200);

    const meRes = await agent.get("/auth/me");
    expect(meRes.status).toBe(401);
  });
});

describe("requireAuth / requireRole middleware", () => {
  it("TEST-01.4 rejects a protected route with no session (401 UNAUTHENTICATED)", async () => {
    const res = await request(app).get("/__test/protected");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("TEST-01.5a rejects a Participant on a manager-only route (403 FORBIDDEN)", async () => {
    const agent = request.agent(app);
    await agent
      .post("/auth/login")
      .send({ email: participant.email, password: PARTICIPANT_PASSWORD });

    const res = await agent.get("/__test/manager-only");

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("TEST-01.5b allows a Manager on a manager-only route", async () => {
    const agent = request.agent(app);
    await agent.post("/auth/login").send({ email: manager.email, password: MANAGER_PASSWORD });

    const res = await agent.get("/__test/manager-only");

    expect(res.status).toBe(200);
  });

  it("TEST-01.9 rejects an anonymous request to a manager-only route with 401, not 403", async () => {
    const res = await request(app).get("/__test/manager-only");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });
});

describe("password storage", () => {
  it("TEST-01.6 stores a bcrypt hash that differs from the plaintext and verifies with bcrypt", async () => {
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: manager.id } });

    expect(stored.passwordHash).not.toBe(MANAGER_PASSWORD);
    await expect(bcrypt.compare(MANAGER_PASSWORD, stored.passwordHash)).resolves.toBe(true);
  });
});

describe("GET /auth/me", () => {
  it("TEST-01.8 returns the same identity as login, with no passwordHash", async () => {
    const agent = request.agent(app);
    const loginRes = await agent
      .post("/auth/login")
      .send({ email: manager.email, password: MANAGER_PASSWORD });

    const meRes = await agent.get("/auth/me");

    expect(meRes.status).toBe(200);
    expect(meRes.body).toEqual(loginRes.body);
    expect(meRes.body.passwordHash).toBeUndefined();
  });
});

describe("session regeneration", () => {
  it("TEST-01.10 issues a new session id on re-login and invalidates the old cookie", async () => {
    const firstLogin = await request(app)
      .post("/auth/login")
      .send({ email: manager.email, password: MANAGER_PASSWORD });
    const cookieA = firstLogin.headers["set-cookie"]?.[0];
    expect(cookieA).toBeDefined();

    const secondLogin = await request(app)
      .post("/auth/login")
      .set("Cookie", cookieA!)
      .send({ email: manager.email, password: MANAGER_PASSWORD });
    const cookieB = secondLogin.headers["set-cookie"]?.[0];
    expect(cookieB).toBeDefined();
    expect(cookieB).not.toBe(cookieA);

    const meWithA = await request(app).get("/auth/me").set("Cookie", cookieA!);
    expect(meWithA.status).toBe(401);

    const meWithB = await request(app).get("/auth/me").set("Cookie", cookieB!);
    expect(meWithB.status).toBe(200);
  });
});
