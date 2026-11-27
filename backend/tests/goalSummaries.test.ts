import type { Express } from "express";
import type { Response } from "superagent";
import bcrypt from "bcrypt";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { errorHandler } from "../src/middleware/errorHandler.js";

const MANAGER_PASSWORD = "manager-pass-123";
const P1_PASSWORD = "participant-one-pass-123";
const P2_PASSWORD = "participant-two-pass-123";

const AUTH = "Authentication required.";
const ROLE = "You do not have permission to perform this action.";
const GOAL_ID = "Invalid goal id.";
const GOAL404 = "Goal not found.";

// 12:00 on 12 November 2026 in Bangkok: today is 2026-11-12 (a Thursday).
// Its ISO week is Mon 2026-11-09 to Sun 2026-11-15; its month is Nov 2026.
const DEFAULT_NOW = "2026-11-12T05:00:00Z";

function buildTestApp(): Express {
  const app = createApp();
  app.use(errorHandler);
  return app;
}

async function createUser(email: string, password: string, role: "MANAGER" | "PARTICIPANT") {
  return prisma.user.create({
    data: { email, passwordHash: await bcrypt.hash(password, 10), role },
  });
}

async function login(email: string, password: string): Promise<string> {
  const res = await request(app).post("/auth/login").send({ email, password });
  const cookie = res.headers["set-cookie"]?.[0];
  if (!cookie) {
    throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return cookie;
}

function expectError(res: Response, status: number, code: string, message: string) {
  expect(res.status).toBe(status);
  expect(res.body.error?.code).toBe(code);
  expect(res.body.error?.message).toBe(message);
}

let app: Express;
let manager: { id: number; email: string };
let p1: { id: number; email: string };
let p2: { id: number; email: string };
let managerCookie: string;
let p1Cookie: string;
let p2Cookie: string;
let T: { id: number };

function setNow(iso: string) {
  vi.setSystemTime(new Date(iso));
}

async function loginAll() {
  managerCookie = await login(manager.email, MANAGER_PASSWORD);
  p1Cookie = await login(p1.email, P1_PASSWORD);
  p2Cookie = await login(p2.email, P2_PASSWORD);
}

async function start(now = DEFAULT_NOW) {
  setNow(now);
  await loginAll();
}

async function insertGoal(
  userId: number,
  templateId: number,
  startDate: string,
  endDate: string,
  dailyTarget = 5,
) {
  return prisma.goal.create({
    data: {
      userId,
      templateId,
      dailyTarget,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    },
  });
}

async function insertEntry(goalId: number, date: string, value: number) {
  return prisma.entry.create({ data: { goalId, date: new Date(date), value } });
}

function patchGoal(cookie: string | null, goalId: number | string, body: unknown) {
  const req = request(app).patch(`/goals/${goalId}`);
  if (cookie) req.set("Cookie", cookie);
  return req.send(body as object);
}

function getSummary(cookie: string | null, goalId: number | string) {
  const req = request(app).get(`/goals/${goalId}/summary`);
  if (cookie) req.set("Cookie", cookie);
  return req;
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  setNow(DEFAULT_NOW);

  app = buildTestApp();

  manager = await createUser("test-manager@example.com", MANAGER_PASSWORD, "MANAGER");
  p1 = await createUser("test-p1@example.com", P1_PASSWORD, "PARTICIPANT");
  p2 = await createUser("test-p2@example.com", P2_PASSWORD, "PARTICIPANT");

  T = await prisma.template.create({
    data: { name: "Running", unit: "km", minValue: 0, maxValue: 50, createdById: manager.id },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AC-08.1 week window (TEST-08.1)", () => {
  it("TEST-08.1a week figures over entries inside the ISO week only", async () => {
    const G = await insertGoal(p1.id, T.id, "2026-10-01", "2026-12-31", 5);
    await insertEntry(G.id, "2026-11-10", 6); // Tue, in week
    await insertEntry(G.id, "2026-11-11", 4); // Wed, in week
    await insertEntry(G.id, "2026-11-12", 5); // Thu, in week (= today = lastDay)
    await insertEntry(G.id, "2026-11-02", 10); // the week before - excluded
    await start();

    const res = await getSummary(p1Cookie, G.id);
    expect(res.status).toBe(200);
    expect(res.body.week).toMatchObject({ daysRecorded: 3, daysMet: 2, total: 15, average: 5 });
  });

  it("TEST-08.1b week.end equals lastDay when the goal ends before the week's Sunday", async () => {
    const G = await insertGoal(p1.id, T.id, "2026-10-01", "2026-11-10", 5); // ends Tue, mid-week
    await start();

    const res = await getSummary(p1Cookie, G.id);
    expect(res.status).toBe(200);
    expect(res.body.week.end).toBe("2026-11-10");
  });
});

describe("AC-08.2 month window (TEST-08.2)", () => {
  it("TEST-08.2 month figures match a hand-computed total over the clipped month", async () => {
    const G = await insertGoal(p1.id, T.id, "2026-10-01", "2026-12-31", 5);
    await insertEntry(G.id, "2026-11-02", 10);
    await insertEntry(G.id, "2026-11-10", 6);
    await insertEntry(G.id, "2026-11-11", 4);
    await insertEntry(G.id, "2026-11-12", 5);
    await start();

    const res = await getSummary(p1Cookie, G.id);
    expect(res.status).toBe(200);
    expect(res.body.month).toMatchObject({
      start: "2026-11-01",
      end: "2026-11-12",
      daysRecorded: 4,
      daysMet: 3,
      total: 25,
      average: 6.25,
    });
  });
});

describe("AC-08.3 window clipped to a goal starting mid-week (TEST-08.3)", () => {
  it("TEST-08.3 week.start equals the goal's startDate, not the week's Monday", async () => {
    const G = await insertGoal(p1.id, T.id, "2026-11-11", "2026-12-31", 5); // Wed, 3rd day of the week
    await start();

    const res = await getSummary(p1Cookie, G.id);
    expect(res.status).toBe(200);
    expect(res.body.week.start).toBe("2026-11-11");
  });
});

describe("AC-08.4 a goal with no entries (TEST-08.4)", () => {
  it("TEST-08.4 both windows are all zero", async () => {
    const G2 = await insertGoal(p2.id, T.id, "2026-10-01", "2026-12-31", 5);
    await start();

    const res = await getSummary(p2Cookie, G2.id);
    expect(res.status).toBe(200);
    expect(res.body.week).toMatchObject({ daysRecorded: 0, daysMet: 0, total: 0, average: 0 });
    expect(res.body.month).toMatchObject({ daysRecorded: 0, daysMet: 0, total: 0, average: 0 });
  });
});

describe("AC-08.5 average rounding (TEST-08.5)", () => {
  it("TEST-08.5a total 10 over 3 days rounds to 3.33", async () => {
    const G = await insertGoal(p1.id, T.id, "2026-10-01", "2026-12-31", 5);
    await insertEntry(G.id, "2026-11-10", 3);
    await insertEntry(G.id, "2026-11-11", 3);
    await insertEntry(G.id, "2026-11-12", 4);
    await start();

    const res = await getSummary(p1Cookie, G.id);
    expect(res.body.week.average).toBe(3.33);
  });

  it("TEST-08.5b total 11 over 3 days rounds up to 3.67", async () => {
    const G = await insertGoal(p1.id, T.id, "2026-10-01", "2026-12-31", 5);
    await insertEntry(G.id, "2026-11-10", 3);
    await insertEntry(G.id, "2026-11-11", 4);
    await insertEntry(G.id, "2026-11-12", 4);
    await start();

    const res = await getSummary(p1Cookie, G.id);
    expect(res.body.week.average).toBe(3.67);
  });
});

describe("AC-08.6 a revision changes daysMet mid-window (TEST-08.6)", () => {
  it("TEST-08.6 daysMet uses the target in effect on each entry's own date", async () => {
    const G = await insertGoal(p1.id, T.id, "2026-10-01", "2026-12-31", 5);
    await insertEntry(G.id, "2026-11-01", 6);
    await insertEntry(G.id, "2026-11-02", 6);
    await insertEntry(G.id, "2026-11-03", 6);
    await insertEntry(G.id, "2026-11-04", 6);
    await insertEntry(G.id, "2026-11-05", 6);

    // Revision effective 2026-11-03, raising the target to 7.
    await start("2026-11-03T05:00:00Z");
    const revision = await patchGoal(p1Cookie, G.id, { dailyTarget: 7 });
    expect(revision.status).toBe(200);

    // Back to "today" (2026-11-12); re-login refreshes the session.
    await start();
    const res = await getSummary(p1Cookie, G.id);
    expect(res.status).toBe(200);
    expect(res.body.month).toMatchObject({ daysRecorded: 5, daysMet: 2, total: 30 });
  });
});

describe("AC-08.7 anonymous and Manager are rejected (TEST-08.7)", () => {
  it("TEST-08.7a no cookie returns 401", async () => {
    const G = await insertGoal(p1.id, T.id, "2026-10-01", "2026-12-31", 5);
    await start();
    const res = await getSummary(null, G.id);
    expectError(res, 401, "UNAUTHENTICATED", AUTH);
  });

  it("TEST-08.7b Manager returns 403", async () => {
    const G = await insertGoal(p1.id, T.id, "2026-10-01", "2026-12-31", 5);
    await start();
    const res = await getSummary(managerCookie, G.id);
    expectError(res, 403, "FORBIDDEN", ROLE);
  });
});

describe("AC-08.8 ownership and existence (TEST-08.8)", () => {
  it("TEST-08.8a a missing goal and another Participant's goal both return the same 404", async () => {
    const G1 = await insertGoal(p1.id, T.id, "2026-10-01", "2026-12-31", 5);
    await start();

    const control = await getSummary(p1Cookie, G1.id);
    expect(control.status).toBe(200);

    const missing = await getSummary(p1Cookie, 999999);
    expectError(missing, 404, "NOT_FOUND", GOAL404);

    const foreign = await getSummary(p2Cookie, G1.id);
    expectError(foreign, 404, "NOT_FOUND", GOAL404);
  });

  it("TEST-08.8b a malformed goal id returns 400 Invalid goal id.", async () => {
    await start();
    const res = await getSummary(p1Cookie, "abc");
    expectError(res, 400, "VALIDATION_ERROR", GOAL_ID);
  });
});

describe("AC-08.9 combined check order (TEST-08.9)", () => {
  it("TEST-08.9 a Manager is refused before existence is disclosed to another Participant", async () => {
    const G1 = await insertGoal(p1.id, T.id, "2026-10-01", "2026-12-31", 5);
    await start();

    const asManager = await getSummary(managerCookie, G1.id);
    expectError(asManager, 403, "FORBIDDEN", ROLE);

    const asP2 = await getSummary(p2Cookie, G1.id);
    expectError(asP2, 404, "NOT_FOUND", GOAL404);
  });
});

// Review finding by warunwora on F-06 PR #76 (F-08 v1.5): lastDay must use
// the end date in effect, not the stored Goal.endDate column.
describe("AC-08.16 summary window uses the effective end date (TEST-08.16)", () => {
  it("TEST-08.16 the month window's end and daysRecorded reflect the revised effective end, not the stale stored end", async () => {
    const G = await insertGoal(p1.id, T.id, "2026-11-01", "2026-11-05", 5);
    await start("2026-11-01T05:00:00Z");
    const revision = await patchGoal(p1Cookie, G.id, { endDate: "2026-11-10" });
    expect(revision.status).toBe(200);

    await insertEntry(G.id, "2026-11-08", 5);

    await start(); // back to DEFAULT_NOW (2026-11-12); re-login refreshes the session
    const res = await getSummary(p1Cookie, G.id);
    expect(res.status).toBe(200);
    expect(res.body.month.end).toBe("2026-11-10");
    expect(res.body.month.daysRecorded).toBe(1);
  });
});
