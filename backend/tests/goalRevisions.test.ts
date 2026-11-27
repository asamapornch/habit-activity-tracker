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

// Messages from the F-06 contract §3.1 (and F-01/F-03 for reused ones).
const AUTH = "Authentication required.";
const ROLE = "You do not have permission to perform this action.";
const GOAL_ID = "Invalid goal id.";
const FIELDS = "Invalid goal revision fields.";
const GOAL404 = "Goal not found.";
const RANGE = "Daily target must be within the template range.";
const BEFORE_TODAY = "New end date must not be before today.";
const BEFORE_START = "New end date must not be before the goal's start date.";
const BEFORE_ENTRY = "New end date must not be before the goal's latest entry date.";
const OVERLAP = "You already have a goal for this template that overlaps these dates.";

// 12:00 on 10 November 2026 in Bangkok: today is 2026-11-10.
const DEFAULT_NOW = "2026-11-10T05:00:00Z";

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
let G1: { id: number };

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

function getGoal(cookie: string | null, goalId: number | string) {
  const req = request(app).get(`/goals/${goalId}`);
  if (cookie) req.set("Cookie", cookie);
  return req;
}

function getGoals(cookie: string | null) {
  const req = request(app).get("/goals");
  if (cookie) req.set("Cookie", cookie);
  return req;
}

function getEntries(cookie: string | null, goalId: number | string) {
  const req = request(app).get(`/goals/${goalId}/entries`);
  if (cookie) req.set("Cookie", cookie);
  return req;
}

async function revisionCount() {
  return prisma.goalRevision.count();
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
  G1 = await insertGoal(p1.id, T.id, "2026-11-01", "2026-11-30");
  // No login here: each test sets its clock first, then logs in (same pattern as F-04).
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AC-06.1 revise dailyTarget only (TEST-06.1)", () => {
  it("TEST-06.1 200, dailyTarget updated, endDate unchanged, one GoalRevision row at today", async () => {
    await start();
    const res = await patchGoal(p1Cookie, G1.id, { dailyTarget: 8 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: G1.id,
      templateId: T.id,
      dailyTarget: 8,
      startDate: "2026-11-01",
      endDate: "2026-11-30",
    });

    const revisions = await prisma.goalRevision.findMany({ where: { goalId: G1.id } });
    expect(revisions).toHaveLength(1);
    expect(revisions[0].dailyTarget).toBe(8);
    expect(revisions[0].effectiveFrom.toISOString().slice(0, 10)).toBe("2026-11-10");
  });
});

describe("AC-06.2 revise endDate only (TEST-06.2)", () => {
  it("TEST-06.2 200, endDate updated, dailyTarget unchanged", async () => {
    await start();
    const res = await patchGoal(p1Cookie, G1.id, { endDate: "2026-12-10" });

    expect(res.status).toBe(200);
    expect(res.body.endDate).toBe("2026-12-10");
    expect(res.body.dailyTarget).toBe(5);
  });
});

describe("AC-06.3 revise both fields in one request (TEST-06.3)", () => {
  it("TEST-06.3 200, both updated, stored as one revision row", async () => {
    await start();
    const res = await patchGoal(p1Cookie, G1.id, { dailyTarget: 9, endDate: "2026-12-05" });

    expect(res.status).toBe(200);
    expect(res.body.dailyTarget).toBe(9);
    expect(res.body.endDate).toBe("2026-12-05");
    expect(await revisionCount()).toBe(1);
  });
});

describe("AC-06.4 anonymous and Manager are rejected (TEST-06.4)", () => {
  it("TEST-06.4a no cookie returns 401 and stores nothing", async () => {
    await start();
    const res = await patchGoal(null, G1.id, { dailyTarget: 8 });
    expectError(res, 401, "UNAUTHENTICATED", AUTH);
    expect(await revisionCount()).toBe(0);
  });

  it("TEST-06.4b Manager returns 403 and stores nothing", async () => {
    await start();
    const res = await patchGoal(managerCookie, G1.id, { dailyTarget: 8 });
    expectError(res, 403, "FORBIDDEN", ROLE);
    expect(await revisionCount()).toBe(0);
  });
});

describe("AC-06.5 body shape and id format (TEST-06.5)", () => {
  it("TEST-06.5a empty object returns 400 Invalid goal revision fields.", async () => {
    await start();
    const res = await patchGoal(p1Cookie, G1.id, {});
    expectError(res, 400, "VALIDATION_ERROR", FIELDS);
  });

  it("TEST-06.5b an unknown key alongside a valid one returns 400", async () => {
    await start();
    const res = await patchGoal(p1Cookie, G1.id, { dailyTarget: 8, note: "x" });
    expectError(res, 400, "VALIDATION_ERROR", FIELDS);
  });

  it("TEST-06.5c a numeric string dailyTarget returns 400", async () => {
    await start();
    const res = await patchGoal(p1Cookie, G1.id, { dailyTarget: "8" });
    expectError(res, 400, "VALIDATION_ERROR", FIELDS);
  });

  it("TEST-06.5d a malformed goal id returns 400 Invalid goal id.", async () => {
    await start();
    const res = await patchGoal(p1Cookie, "abc", { dailyTarget: 8 });
    expectError(res, 400, "VALIDATION_ERROR", GOAL_ID);
  });
});

describe("AC-06.6 ownership and existence (TEST-06.6)", () => {
  it("TEST-06.6 a missing goal and another Participant's goal both return the same 404", async () => {
    await start();

    const control = await patchGoal(p1Cookie, G1.id, { dailyTarget: 8 });
    expect(control.status).toBe(200);

    const missing = await patchGoal(p1Cookie, 999999, { dailyTarget: 8 });
    expectError(missing, 404, "NOT_FOUND", GOAL404);

    const foreign = await patchGoal(p2Cookie, G1.id, { dailyTarget: 8 });
    expectError(foreign, 404, "NOT_FOUND", GOAL404);

    expect(await revisionCount()).toBe(1); // only the control call stored one
  });
});

describe("AC-06.7 dailyTarget within the template's current range (TEST-06.7)", () => {
  it("TEST-06.7a above the template maximum returns 400", async () => {
    await start();
    const res = await patchGoal(p1Cookie, G1.id, { dailyTarget: 51 });
    expectError(res, 400, "VALIDATION_ERROR", RANGE);
  });

  it("TEST-06.7b the minimum and maximum are both accepted (inclusive)", async () => {
    await start();
    const min = await patchGoal(p1Cookie, G1.id, { dailyTarget: 0 });
    expect(min.status).toBe(200);
    const max = await patchGoal(p1Cookie, G1.id, { dailyTarget: 50 });
    expect(max.status).toBe(200);
  });
});

describe("AC-06.8 endDate floors (TEST-06.8)", () => {
  it("TEST-06.8a before today returns 400 New end date must not be before today.", async () => {
    await start();
    const res = await patchGoal(p1Cookie, G1.id, { endDate: "2026-11-09" });
    expectError(res, 400, "VALIDATION_ERROR", BEFORE_TODAY);
  });

  it("TEST-06.8b before the goal's startDate returns 400 (start date floor, G3 fixture)", async () => {
    // G3 (contract v1.2): startDate = today + 5, so the today floor is not
    // also tripped and the start-date floor is reachable on its own.
    const G3 = await insertGoal(p1.id, T.id, "2026-11-15", "2026-12-15");
    await start();
    const res = await patchGoal(p1Cookie, G3.id, { endDate: "2026-11-14" });
    expectError(res, 400, "VALIDATION_ERROR", BEFORE_START);
  });

  it("TEST-06.8c before the goal's latest entry date returns 400 (entry-date floor)", async () => {
    await insertEntry(G1.id, "2026-11-10", 5);
    await insertEntry(G1.id, "2026-11-12", 5);
    await start();
    const res = await patchGoal(p1Cookie, G1.id, { endDate: "2026-11-11" });
    expectError(res, 400, "VALIDATION_ERROR", BEFORE_ENTRY);
  });

  it("TEST-06.8d proves the §2.6 check order: today before start date", async () => {
    // G1 starts in the past (2026-11-01); endDate = the day before it
    // (2026-10-31) violates both the today floor and the start-date floor
    // at once. The today message must win (today is checked first).
    await start();
    const res = await patchGoal(p1Cookie, G1.id, { endDate: "2026-10-31" });
    expectError(res, 400, "VALIDATION_ERROR", BEFORE_TODAY);
  });
});

describe("AC-06.9 BR-04 overlap re-check (TEST-06.9)", () => {
  it("TEST-06.9a revising endDate to overlap another goal on the same template returns 409", async () => {
    const other = await insertGoal(p1.id, T.id, "2026-12-15", "2026-12-31");
    await start();
    const res = await patchGoal(p1Cookie, G1.id, { endDate: "2026-12-16" });
    expectError(res, 409, "CONFLICT", OVERLAP);
    expect(await revisionCount()).toBe(0);
    void other;
  });

  it("TEST-06.9b touching but not overlapping is accepted", async () => {
    await insertGoal(p1.id, T.id, "2026-12-15", "2026-12-31");
    await start();
    const res = await patchGoal(p1Cookie, G1.id, { endDate: "2026-12-14" });
    expect(res.status).toBe(200);
  });
});

describe("AC-06.10 reads reflect the currently effective value (TEST-06.10)", () => {
  it("TEST-06.10 GET /goals/:id and GET /goals show the new target; an unrevised goal is unaffected", async () => {
    const other = await insertGoal(p2.id, T.id, "2026-11-01", "2026-11-30");
    await start();

    await patchGoal(p1Cookie, G1.id, { dailyTarget: 8 });

    const single = await getGoal(p1Cookie, G1.id);
    expect(single.body.dailyTarget).toBe(8);

    const list = await getGoals(p1Cookie);
    expect(list.body.find((g: { id: number }) => g.id === G1.id).dailyTarget).toBe(8);

    const otherSingle = await getGoal(p2Cookie, other.id);
    expect(otherSingle.body.dailyTarget).toBe(5);
  });
});

describe("AC-06.11 a revision never touches entries (TEST-06.11)", () => {
  it("TEST-06.11 GET /goals/:id/entries is identical before and after a revision", async () => {
    await insertEntry(G1.id, "2026-11-05", 3);
    await insertEntry(G1.id, "2026-11-08", 7);
    await start();

    const before = await getEntries(p1Cookie, G1.id);
    await patchGoal(p1Cookie, G1.id, { dailyTarget: 8 });
    const after = await getEntries(p1Cookie, G1.id);

    expect(after.body).toEqual(before.body);
  });
});

describe("AC-06.12 two revisions on the same day (TEST-06.12)", () => {
  it("TEST-06.12 the later revision (by id) is in effect for that day", async () => {
    await start();
    await patchGoal(p1Cookie, G1.id, { dailyTarget: 8 });
    const second = await patchGoal(p1Cookie, G1.id, { dailyTarget: 12 });

    expect(second.status).toBe(200);
    expect(second.body.dailyTarget).toBe(12);

    const current = await getGoal(p1Cookie, G1.id);
    expect(current.body.dailyTarget).toBe(12);
    expect(await revisionCount()).toBe(2);
  });
});

describe("AC-06.13 combined check order (TEST-06.13)", () => {
  it("TEST-06.13a no cookie with an empty body returns 401, not 400", async () => {
    await start();
    const res = await patchGoal(null, G1.id, {});
    expectError(res, 401, "UNAUTHENTICATED", AUTH);
  });

  it("TEST-06.13b the BR-10 target check runs before the BR-04 overlap re-check", async () => {
    await insertGoal(p1.id, T.id, "2026-12-15", "2026-12-31");
    await start();

    const control = await patchGoal(p1Cookie, G1.id, { dailyTarget: 999 });
    expectError(control, 400, "VALIDATION_ERROR", RANGE);

    const combined = await patchGoal(p1Cookie, G1.id, { dailyTarget: 999, endDate: "2026-12-16" });
    expectError(combined, 400, "VALIDATION_ERROR", RANGE);
  });
});
