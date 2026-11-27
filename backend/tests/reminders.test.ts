import type { Express } from "express";
import type { Response } from "superagent";
import bcrypt from "bcrypt";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { errorHandler } from "../src/middleware/errorHandler.js";

// F-09 Reminder schedules, contract v1.2 §5 (TEST-09.1 to TEST-09.13b).
// Every check goes through the API, never a Prisma model of the new table, so this file
// runs unchanged before the migration and the routes exist (red), and after (green).

const MANAGER_PASSWORD = "manager-pass-123";
const P1_PASSWORD = "participant-one-pass-123";
const P2_PASSWORD = "participant-two-pass-123";

const AUTH = "Authentication required.";
const ROLE = "You do not have permission to perform this action.";
const GOAL_ID = "Invalid goal id.";
const FIELDS = "Invalid reminder fields.";
const GOAL404 = "Goal not found.";
const NO_SCHEDULE = "No reminder schedule set for this goal.";
const NO_WEEKDAY = "At least one weekday is required.";

// 12:00 on Tuesday 10 November 2026 in Bangkok: today is 2026-11-10, window 11-10 to 11-16.
const DEFAULT_NOW = "2026-11-10T05:00:00Z";

let app: Express;
let manager: { id: number; email: string };
let p1: { id: number; email: string };
let p2: { id: number; email: string };
let managerCookie: string;
let p1Cookie: string;
let p2Cookie: string;
let T: { id: number };
let T2: { id: number };
let G1: { id: number };
let G2: { id: number };

async function createUser(email: string, password: string, role: "MANAGER" | "PARTICIPANT") {
  return prisma.user.create({ data: { email, passwordHash: await bcrypt.hash(password, 10), role } });
}

async function login(email: string, password: string): Promise<string> {
  const res = await request(app).post("/auth/login").send({ email, password });
  const cookie = res.headers["set-cookie"]?.[0];
  if (!cookie) throw new Error(`login failed for ${email}: ${res.status}`);
  return cookie;
}

async function start(now = DEFAULT_NOW) {
  vi.setSystemTime(new Date(now));
  managerCookie = await login(manager.email, MANAGER_PASSWORD);
  p1Cookie = await login(p1.email, P1_PASSWORD);
  p2Cookie = await login(p2.email, P2_PASSWORD);
}

function expectError(res: Response, status: number, code: string, message: string) {
  expect(res.status).toBe(status);
  expect(res.body.error?.code).toBe(code);
  expect(res.body.error?.message).toBe(message);
}

async function insertGoal(userId: number, templateId: number, startDate: string, endDate: string) {
  return prisma.goal.create({
    data: { userId, templateId, dailyTarget: 5, startDate: new Date(startDate), endDate: new Date(endDate) },
  });
}

function call(method: "put" | "get" | "delete", path: string, cookie: string | null, body?: unknown) {
  const req = request(app)[method](path);
  if (cookie) req.set("Cookie", cookie);
  return body === undefined ? req : req.send(body as object);
}

const putReminder = (cookie: string | null, goalId: number | string, body: unknown) =>
  call("put", `/goals/${goalId}/reminder`, cookie, body);
const getReminder = (cookie: string | null, goalId: number | string) =>
  call("get", `/goals/${goalId}/reminder`, cookie);
const deleteReminder = (cookie: string | null, goalId: number | string) =>
  call("delete", `/goals/${goalId}/reminder`, cookie);
const getUpcoming = (cookie: string | null) => call("get", "/reminders/upcoming", cookie);

const MWF_0800 = { weekdays: [1, 3, 5], time: "08:00" };

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(DEFAULT_NOW));
  app = createApp();
  app.use(errorHandler);
  manager = await createUser("test-manager@example.com", MANAGER_PASSWORD, "MANAGER");
  p1 = await createUser("test-p1@example.com", P1_PASSWORD, "PARTICIPANT");
  p2 = await createUser("test-p2@example.com", P2_PASSWORD, "PARTICIPANT");
  T = await prisma.template.create({
    data: { name: "Running", unit: "km", minValue: 0, maxValue: 50, createdById: manager.id },
  });
  T2 = await prisma.template.create({
    data: { name: "Reading", unit: "minutes", minValue: 0, maxValue: 300, createdById: manager.id },
  });
  G1 = await insertGoal(p1.id, T.id, "2026-11-01", "2026-11-30");
  G2 = await insertGoal(p1.id, T2.id, "2026-11-01", "2026-11-30");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Slice 1: set, read and remove one goal's schedule (FR-13)", () => {
  it("TEST-09.1 owner sets a schedule on a goal without one: 200 and it is stored", async () => {
    await start();
    const res = await putReminder(p1Cookie, G1.id, MWF_0800);
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({ goalId: G1.id, weekdays: [1, 3, 5], time: "08:00" });

    const read = await getReminder(p1Cookie, G1.id);
    expect(read.status).toBe(200);
    expect(read.body).toStrictEqual({ goalId: G1.id, weekdays: [1, 3, 5], time: "08:00" });
  });

  it("TEST-09.2 a second PUT replaces the schedule wholesale, not a merge (D-20)", async () => {
    await start();
    expect((await putReminder(p1Cookie, G1.id, MWF_0800)).status).toBe(200);
    const res = await putReminder(p1Cookie, G1.id, { weekdays: [0, 6], time: "20:00" });
    expect(res.status).toBe(200);

    const read = await getReminder(p1Cookie, G1.id);
    expect(read.body).toStrictEqual({ goalId: G1.id, weekdays: [0, 6], time: "20:00" });
  });

  it("TEST-09.3a no cookie gets 401 on PUT, GET and DELETE", async () => {
    await start();
    expectError(await putReminder(null, G1.id, MWF_0800), 401, "UNAUTHENTICATED", AUTH);
    expectError(await getReminder(null, G1.id), 401, "UNAUTHENTICATED", AUTH);
    expectError(await deleteReminder(null, G1.id), 401, "UNAUTHENTICATED", AUTH);
  });

  it("TEST-09.3b a Manager gets 403 on PUT, GET and DELETE and nothing is stored", async () => {
    await start();
    expectError(await putReminder(managerCookie, G1.id, MWF_0800), 403, "FORBIDDEN", ROLE);
    expectError(await getReminder(managerCookie, G1.id), 403, "FORBIDDEN", ROLE);
    expectError(await deleteReminder(managerCookie, G1.id), 403, "FORBIDDEN", ROLE);
    expectError(await getReminder(p1Cookie, G1.id), 404, "NOT_FOUND", NO_SCHEDULE);
  });

  it("TEST-09.4a a weekday out of range (7) is a shape error", async () => {
    await start();
    expectError(await putReminder(p1Cookie, G1.id, { weekdays: [7], time: "08:00" }), 400, "VALIDATION_ERROR", FIELDS);
  });

  it("TEST-09.4b a duplicate weekday is a shape error", async () => {
    await start();
    expectError(await putReminder(p1Cookie, G1.id, { weekdays: [1, 1], time: "08:00" }), 400, "VALIDATION_ERROR", FIELDS);
  });

  it("TEST-09.4c a time not matching HH:MM (8:00, 24:00) is a shape error", async () => {
    await start();
    for (const time of ["8:00", "24:00"]) {
      expectError(await putReminder(p1Cookie, G1.id, { weekdays: [1], time }), 400, "VALIDATION_ERROR", FIELDS);
    }
  });

  it("TEST-09.4d a malformed goal id returns Invalid goal id.", async () => {
    await start();
    expectError(await putReminder(p1Cookie, "abc", MWF_0800), 400, "VALIDATION_ERROR", GOAL_ID);
  });

  it("TEST-09.4e other shape errors: not an object, missing and unknown keys, string weekday", async () => {
    await start();
    const bodies: unknown[] = [
      [1, 2],
      { weekdays: [1] },
      { ...MWF_0800, note: "x" },
      { weekdays: ["1"], time: "08:00" },
      { weekdays: [1.5], time: "08:00" },
    ];
    for (const body of bodies) {
      expectError(await putReminder(p1Cookie, G1.id, body), 400, "VALIDATION_ERROR", FIELDS);
    }
    expectError(await getReminder(p1Cookie, G1.id), 404, "NOT_FOUND", NO_SCHEDULE);
  });

  it("TEST-09.5 control; another Participant gets the same 404 as a missing goal on all three", async () => {
    await start();
    expect((await putReminder(p1Cookie, G1.id, MWF_0800)).status).toBe(200);

    const responses = [
      await putReminder(p2Cookie, G1.id, MWF_0800),
      await putReminder(p2Cookie, 99999, MWF_0800),
      await getReminder(p2Cookie, G1.id),
      await getReminder(p2Cookie, 99999),
      await deleteReminder(p2Cookie, G1.id),
      await deleteReminder(p2Cookie, 99999),
    ];
    for (const res of responses) expectError(res, 404, "NOT_FOUND", GOAL404);
    expect(new Set(responses.map((r) => JSON.stringify(r.body))).size).toBe(1);

    const stillThere = await getReminder(p1Cookie, G1.id);
    expect(stillThere.body).toStrictEqual({ goalId: G1.id, weekdays: [1, 3, 5], time: "08:00" });
  });

  it("TEST-09.6 an empty weekdays array returns the BR-13 message and nothing is stored", async () => {
    await start();
    expectError(await putReminder(p1Cookie, G1.id, { weekdays: [], time: "08:00" }), 400, "VALIDATION_ERROR", NO_WEEKDAY);
    expectError(await getReminder(p1Cookie, G1.id), 404, "NOT_FOUND", NO_SCHEDULE);
  });

  it("TEST-09.6b an empty weekdays array does not change an existing schedule", async () => {
    await start();
    expect((await putReminder(p1Cookie, G1.id, MWF_0800)).status).toBe(200);
    expectError(await putReminder(p1Cookie, G1.id, { weekdays: [], time: "09:00" }), 400, "VALIDATION_ERROR", NO_WEEKDAY);
    expect((await getReminder(p1Cookie, G1.id)).body).toStrictEqual({ goalId: G1.id, weekdays: [1, 3, 5], time: "08:00" });
  });

  it("TEST-09.7 GET on an own goal with no schedule is the no-schedule 404, not goal-not-found", async () => {
    await start();
    expectError(await getReminder(p1Cookie, G2.id), 404, "NOT_FOUND", NO_SCHEDULE);
  });

  it("TEST-09.8 DELETE is 204 with or without a schedule, and GET is the no-schedule 404 after", async () => {
    await start();
    const none = await deleteReminder(p1Cookie, G2.id);
    expect(none.status).toBe(204);

    expect((await putReminder(p1Cookie, G1.id, MWF_0800)).status).toBe(200);
    const existing = await deleteReminder(p1Cookie, G1.id);
    expect(existing.status).toBe(204);
    expect(existing.text).toBe("");
    expectError(await getReminder(p1Cookie, G1.id), 404, "NOT_FOUND", NO_SCHEDULE);
  });

  it("TEST-09.9 control; Manager 403 before shape, ownership 404 before the weekday rule", async () => {
    await start();
    expectError(await putReminder(p1Cookie, G1.id, { weekdays: [], time: "08:00" }), 400, "VALIDATION_ERROR", NO_WEEKDAY);
    expectError(await putReminder(managerCookie, G1.id, {}), 403, "FORBIDDEN", ROLE);
    expectError(await putReminder(p2Cookie, G1.id, { weekdays: [], time: "08:00" }), 404, "NOT_FOUND", GOAL404);
    expectError(await putReminder(null, G1.id, {}), 401, "UNAUTHENTICATED", AUTH);
  });
});

describe("Slice 2: upcoming reminders for the next 7 days (FR-14, BR-13)", () => {
  it("TEST-09.10 lists every matching instance across the caller's goals, sorted", async () => {
    await start();
    expect((await putReminder(p1Cookie, G1.id, MWF_0800)).status).toBe(200);
    expect((await putReminder(p1Cookie, G2.id, { weekdays: [0], time: "20:00" })).status).toBe(200);

    const res = await getUpcoming(p1Cookie);
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual([
      { goalId: G1.id, date: "2026-11-11", time: "08:00" },
      { goalId: G1.id, date: "2026-11-13", time: "08:00" },
      { goalId: G2.id, date: "2026-11-15", time: "20:00" },
      { goalId: G1.id, date: "2026-11-16", time: "08:00" },
    ]);
  });

  it("TEST-09.10b today itself is in the window and today + 7 is not", async () => {
    await start();
    expect((await putReminder(p1Cookie, G1.id, { weekdays: [2], time: "07:00" })).status).toBe(200);
    const res = await getUpcoming(p1Cookie);
    expect(res.body).toStrictEqual([{ goalId: G1.id, date: "2026-11-10", time: "07:00" }]);
  });

  it("TEST-09.11 an instance after the goal's end date is excluded, earlier ones stay", async () => {
    const G3 = await insertGoal(p1.id, T.id, "2026-12-01", "2026-12-31");
    await prisma.goal.update({ where: { id: G1.id }, data: { endDate: new Date("2026-11-13") } });
    await start();
    expect((await putReminder(p1Cookie, G1.id, MWF_0800)).status).toBe(200);
    expect((await putReminder(p1Cookie, G3.id, MWF_0800)).status).toBe(200);

    const res = await getUpcoming(p1Cookie);
    expect(res.body).toStrictEqual([
      { goalId: G1.id, date: "2026-11-11", time: "08:00" },
      { goalId: G1.id, date: "2026-11-13", time: "08:00" },
    ]);
  });

  it("TEST-09.11b the end date in effect is used: an F-06 extension past the stored end adds instances", async () => {
    await prisma.goal.update({ where: { id: G1.id }, data: { endDate: new Date("2026-11-13") } });
    await prisma.goalRevision.create({
      data: {
        goalId: G1.id,
        dailyTarget: 5,
        endDate: new Date("2026-11-30"),
        effectiveFrom: new Date("2026-11-05"),
      },
    });
    await start();
    expect((await putReminder(p1Cookie, G1.id, MWF_0800)).status).toBe(200);

    const res = await getUpcoming(p1Cookie);
    expect(res.body).toStrictEqual([
      { goalId: G1.id, date: "2026-11-11", time: "08:00" },
      { goalId: G1.id, date: "2026-11-13", time: "08:00" },
      { goalId: G1.id, date: "2026-11-16", time: "08:00" },
    ]);
  });

  it("TEST-09.12a a goal without a schedule contributes nothing", async () => {
    await start();
    expect((await putReminder(p1Cookie, G1.id, { weekdays: [3], time: "08:00" })).status).toBe(200);
    const res = await getUpcoming(p1Cookie);
    expect(res.body).toStrictEqual([{ goalId: G1.id, date: "2026-11-11", time: "08:00" }]);
  });

  it("TEST-09.12b a Participant with no schedules gets an empty list, never another user's", async () => {
    await start();
    expect((await putReminder(p1Cookie, G1.id, MWF_0800)).status).toBe(200);
    const res = await getUpcoming(p2Cookie);
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual([]);
  });

  it("TEST-09.13a two goals on the same date and time are ordered by goalId", async () => {
    await start();
    expect((await putReminder(p1Cookie, G2.id, { weekdays: [3], time: "08:00" })).status).toBe(200);
    expect((await putReminder(p1Cookie, G1.id, { weekdays: [3], time: "08:00" })).status).toBe(200);
    const res = await getUpcoming(p1Cookie);
    expect(res.body).toStrictEqual([
      { goalId: G1.id, date: "2026-11-11", time: "08:00" },
      { goalId: G2.id, date: "2026-11-11", time: "08:00" },
    ]);
  });

  it("TEST-09.13b anonymous gets 401 and a Manager gets 403", async () => {
    await start();
    expectError(await getUpcoming(null), 401, "UNAUTHENTICATED", AUTH);
    expectError(await getUpcoming(managerCookie), 403, "FORBIDDEN", ROLE);
  });
});
