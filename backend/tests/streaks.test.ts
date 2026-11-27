import type { Express } from "express";
import type { Response } from "superagent";
import bcrypt from "bcrypt";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { errorHandler } from "../src/middleware/errorHandler.js";

// F-07 Streaks, contract v1.5 §5 (TEST-07.1a to TEST-07.13).
// Goals, entries and revisions are inserted directly (fixed dates, no BR-03 window and no
// "effectiveFrom = today" rule in the way); every streak is read through GET /goals/:id/streaks.

const MANAGER_PASSWORD = "manager-pass-123";
const P1_PASSWORD = "participant-one-pass-123";
const P2_PASSWORD = "participant-two-pass-123";

const AUTH = "Authentication required.";
const ROLE = "You do not have permission to perform this action.";
const GOAL_ID = "Invalid goal id.";
const GOAL404 = "Goal not found.";

// 12:00 on Tuesday 10 November 2026 in Bangkok: today is 2026-11-10.
const NOW = "2026-11-10T05:00:00Z";

let app: Express;
let manager: { id: number; email: string };
let p1: { id: number; email: string };
let p2: { id: number; email: string };
let managerCookie: string;
let p1Cookie: string;
let p2Cookie: string;
let T: { id: number };

async function createUser(email: string, password: string, role: "MANAGER" | "PARTICIPANT") {
  return prisma.user.create({ data: { email, passwordHash: await bcrypt.hash(password, 10), role } });
}

async function login(email: string, password: string): Promise<string> {
  const res = await request(app).post("/auth/login").send({ email, password });
  const cookie = res.headers["set-cookie"]?.[0];
  if (!cookie) throw new Error(`login failed for ${email}: ${res.status}`);
  return cookie;
}

function expectError(res: Response, status: number, code: string, message: string) {
  expect(res.status).toBe(status);
  expect(res.body.error?.code).toBe(code);
  expect(res.body.error?.message).toBe(message);
}

async function insertGoal(startDate: string, endDate: string, dailyTarget = 5, userId = p1.id) {
  return prisma.goal.create({
    data: { userId, templateId: T.id, dailyTarget, startDate: new Date(startDate), endDate: new Date(endDate) },
  });
}

/** Entries as { "YYYY-MM-DD": value }. */
async function insertEntries(goalId: number, entries: Record<string, number>) {
  for (const [date, value] of Object.entries(entries)) {
    await prisma.entry.create({ data: { goalId, date: new Date(date), value } });
  }
}

async function insertRevision(goalId: number, effectiveFrom: string, dailyTarget: number, endDate: string) {
  await prisma.goalRevision.create({
    data: { goalId, dailyTarget, endDate: new Date(endDate), effectiveFrom: new Date(effectiveFrom) },
  });
}

function getStreaks(cookie: string | null, goalId: number | string) {
  const req = request(app).get(`/goals/${goalId}/streaks`);
  if (cookie) req.set("Cookie", cookie);
  return req;
}

async function expectStreaks(goalId: number, currentStreak: number, longestStreak: number) {
  const res = await getStreaks(p1Cookie, goalId);
  expect(res.status).toBe(200);
  expect(res.body).toStrictEqual({ goalId, currentStreak, longestStreak });
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
  app = createApp();
  app.use(errorHandler);
  manager = await createUser("test-manager@example.com", MANAGER_PASSWORD, "MANAGER");
  p1 = await createUser("test-p1@example.com", P1_PASSWORD, "PARTICIPANT");
  p2 = await createUser("test-p2@example.com", P2_PASSWORD, "PARTICIPANT");
  T = await prisma.template.create({
    data: { name: "Running", unit: "km", minValue: 0, maxValue: 50, createdById: manager.id },
  });
  managerCookie = await login(manager.email, MANAGER_PASSWORD);
  p1Cookie = await login(p1.email, P1_PASSWORD);
  p2Cookie = await login(p2.email, P2_PASSWORD);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("current streak (FR-11, BR-12)", () => {
  it("TEST-07.1a three met days up to lastDay after a missing day: currentStreak 3", async () => {
    const G = await insertGoal("2026-11-01", "2026-11-30");
    await insertEntries(G.id, { "2026-11-08": 6, "2026-11-09": 6, "2026-11-10": 6 });
    await expectStreaks(G.id, 3, 3);
  });

  it("TEST-07.1b an entry below target inside the run breaks it: only the run touching lastDay counts", async () => {
    const G = await insertGoal("2026-11-01", "2026-11-30");
    await insertEntries(G.id, { "2026-11-08": 6, "2026-11-09": 4, "2026-11-10": 6 });
    await expectStreaks(G.id, 1, 1);
  });

  it("TEST-07.2 an entry for lastDay below target gives currentStreak 0 even after met days", async () => {
    const G = await insertGoal("2026-11-01", "2026-11-30");
    await insertEntries(G.id, { "2026-11-08": 6, "2026-11-09": 6, "2026-11-10": 4 });
    await expectStreaks(G.id, 0, 2);
  });

  it("TEST-07.3 no entry for lastDay yet: counts from lastDay - 1 backward", async () => {
    const G = await insertGoal("2026-11-01", "2026-11-30");
    await insertEntries(G.id, { "2026-11-08": 6, "2026-11-09": 5 });
    await expectStreaks(G.id, 2, 2);
  });

  it("TEST-07.4a a goal with no entries: 0 and 0", async () => {
    const G = await insertGoal("2026-11-01", "2026-11-30");
    await expectStreaks(G.id, 0, 0);
  });

  it("TEST-07.4b a goal that has not started yet: 0 and 0", async () => {
    const G = await insertGoal("2026-11-15", "2026-11-30");
    await expectStreaks(G.id, 0, 0);
  });
});

describe("longest streak (FR-11)", () => {
  it("TEST-07.5 an earlier 5-day run beats the current 2-day run", async () => {
    const G = await insertGoal("2026-11-01", "2026-11-30");
    await insertEntries(G.id, {
      "2026-11-01": 5, "2026-11-02": 6, "2026-11-03": 7, "2026-11-04": 5, "2026-11-05": 9,
      "2026-11-07": 3,
      "2026-11-09": 5, "2026-11-10": 8,
    });
    await expectStreaks(G.id, 2, 5);
  });

  it("TEST-07.6 the only run is the current one: longest equals current", async () => {
    const G = await insertGoal("2026-11-01", "2026-11-30");
    await insertEntries(G.id, { "2026-11-07": 5, "2026-11-08": 5, "2026-11-09": 5, "2026-11-10": 5 });
    await expectStreaks(G.id, 4, 4);
  });
});

describe("target in effect per day (BR-11, F-06)", () => {
  it("TEST-07.7 a revision raising the target from day 3 turns days 3 to 5 unmet; days 1 to 2 keep the old target", async () => {
    const G = await insertGoal("2026-11-06", "2026-11-30");
    await insertEntries(G.id, {
      "2026-11-06": 6, "2026-11-07": 6, "2026-11-08": 6, "2026-11-09": 6, "2026-11-10": 6,
    });
    await expectStreaks(G.id, 5, 5);

    await insertRevision(G.id, "2026-11-08", 7, "2026-11-30");
    await expectStreaks(G.id, 0, 2);
  });

  it("TEST-07.8 a revision lowering the target from day 3 turns days 3 to 5 met; days 1 to 2 stay unmet", async () => {
    const G = await insertGoal("2026-11-06", "2026-11-30");
    await insertEntries(G.id, {
      "2026-11-06": 4, "2026-11-07": 4, "2026-11-08": 4, "2026-11-09": 4, "2026-11-10": 4,
    });
    await expectStreaks(G.id, 0, 0);

    await insertRevision(G.id, "2026-11-08", 3, "2026-11-30");
    await expectStreaks(G.id, 3, 3);
  });

  it("TEST-07.12 lastDay uses the end date in effect: a revision extending a past stored end counts up to today", async () => {
    const G = await insertGoal("2026-11-01", "2026-11-08");
    await insertEntries(G.id, { "2026-11-08": 6, "2026-11-09": 6, "2026-11-10": 6 });
    await insertRevision(G.id, "2026-11-05", 5, "2026-11-30");
    await expectStreaks(G.id, 3, 3);
  });

  it("TEST-07.13 an ended goal still reports the run ending at its end date (D-16)", async () => {
    const G = await insertGoal("2026-11-01", "2026-11-05");
    await insertEntries(G.id, { "2026-11-03": 5, "2026-11-04": 6, "2026-11-05": 5 });
    await expectStreaks(G.id, 3, 3);
  });
});

describe("access and check order (NFR-02, NFR-05, BR-08)", () => {
  it("TEST-07.9a no cookie gets 401", async () => {
    const G = await insertGoal("2026-11-01", "2026-11-30");
    expectError(await getStreaks(null, G.id), 401, "UNAUTHENTICATED", AUTH);
  });

  it("TEST-07.9b a Manager gets 403", async () => {
    const G = await insertGoal("2026-11-01", "2026-11-30");
    expectError(await getStreaks(managerCookie, G.id), 403, "FORBIDDEN", ROLE);
  });

  it("TEST-07.10a another Participant's goal and a missing goal give the same 404 (control: the owner gets 200)", async () => {
    const G1 = await insertGoal("2026-11-01", "2026-11-30");
    expect((await getStreaks(p1Cookie, G1.id)).status).toBe(200);

    const other = await getStreaks(p2Cookie, G1.id);
    const missing = await getStreaks(p2Cookie, G1.id + 100000);
    expectError(other, 404, "NOT_FOUND", GOAL404);
    expectError(missing, 404, "NOT_FOUND", GOAL404);
    expect(other.body).toStrictEqual(missing.body);
  });

  it("TEST-07.10b a malformed id gives 400 Invalid goal id.", async () => {
    expectError(await getStreaks(p1Cookie, "abc"), 400, "VALIDATION_ERROR", GOAL_ID);
  });

  it("TEST-07.11 check order: a Manager gets 403 before any ownership lookup; another Participant gets 404 (control)", async () => {
    const G1 = await insertGoal("2026-11-01", "2026-11-30");
    expectError(await getStreaks(managerCookie, G1.id), 403, "FORBIDDEN", ROLE);
    expectError(await getStreaks(managerCookie, "abc"), 403, "FORBIDDEN", ROLE);
    expectError(await getStreaks(null, "abc"), 401, "UNAUTHENTICATED", AUTH);
    expectError(await getStreaks(p2Cookie, G1.id), 404, "NOT_FOUND", GOAL404);
  });
});
