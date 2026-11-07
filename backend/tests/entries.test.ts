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

// Messages from F-04 contract §3.1 (and F-01 for 401/403).
const AUTH = "Authentication required.";
const ROLE = "You do not have permission to perform this action.";
const FIELDS = "Invalid entry fields.";
const ID = "Invalid goal id.";
const GOAL404 = "Goal not found.";
const FUTURE = "Entry date must not be in the future.";
const OUTSIDE = "Entry date must be within the goal's start and end dates.";
const RANGE = "Value must be within the template range.";
const DUP = "An entry already exists for this date.";

// 12:00 on 5 November 2026 in Bangkok: today is 2026-11-05.
const DEFAULT_NOW = "2026-11-05T05:00:00Z";
const OTHER_TZ = "America/Los_Angeles";

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
let T2: { id: number };
let G1: { id: number };
let G2: { id: number };
let savedTz: string | undefined;

/** Fix "now". Must be called before loginAll(): the session expiry is computed at login. */
function setNow(iso: string) {
  vi.setSystemTime(new Date(iso));
}

async function loginAll() {
  managerCookie = await login(manager.email, MANAGER_PASSWORD);
  p1Cookie = await login(p1.email, P1_PASSWORD);
  p2Cookie = await login(p2.email, P2_PASSWORD);
}

/** Default test start: clock at DEFAULT_NOW, then log everyone in. */
async function start(now = DEFAULT_NOW) {
  setNow(now);
  await loginAll();
}

function useOtherTimeZone() {
  process.env.TZ = OTHER_TZ;
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

function postEntry(cookie: string | null, goalId: number | string, body: unknown) {
  const req = request(app).post(`/goals/${goalId}/entries`);
  if (cookie) req.set("Cookie", cookie);
  return req.send(body as object);
}

function getEntries(cookie: string | null, goalId: number | string) {
  const req = request(app).get(`/goals/${goalId}/entries`);
  if (cookie) req.set("Cookie", cookie);
  return req;
}

function getProgress(cookie: string | null, goalId: number | string) {
  const req = request(app).get(`/goals/${goalId}/progress`);
  if (cookie) req.set("Cookie", cookie);
  return req;
}

const B = { date: "2026-11-03", value: 5 };

async function entryCount() {
  return prisma.entry.count();
}

beforeEach(async () => {
  savedTz = process.env.TZ;
  vi.useFakeTimers({ toFake: ["Date"] });
  setNow(DEFAULT_NOW);

  app = buildTestApp();

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
  G2 = await insertGoal(p2.id, T.id, "2026-11-01", "2026-11-30");
  // No login here: each test sets its clock first, then logs in (contract §5, "Clock before login").
});

afterEach(() => {
  vi.useRealTimers();
  if (savedTz === undefined) delete process.env.TZ;
  else process.env.TZ = savedTz;
});

describe("AC-04.1 record an entry", () => {
  it("TEST-04.1a owner records an entry and receives 201 with the stored entry", async () => {
    await start();
    const res = await postEntry(p1Cookie, G1.id, B);

    expect(res.status).toBe(201);
    expect(typeof res.body.id).toBe("number");
    expect(res.body).toEqual({ id: res.body.id, goalId: G1.id, date: "2026-11-03", value: 5 });
    expect(await entryCount()).toBe(1);
  });

  it("TEST-04.1b accepts two-decimal values 0.07, 1.15 and 2.5", async () => {
    await start();
    const a = await postEntry(p1Cookie, G1.id, { date: "2026-11-01", value: 0.07 });
    const b = await postEntry(p1Cookie, G1.id, { date: "2026-11-02", value: 1.15 });
    const c = await postEntry(p1Cookie, G1.id, { date: "2026-11-04", value: 2.5 });

    expect(a.status).toBe(201);
    expect(a.body.value).toBe(0.07);
    expect(b.status).toBe(201);
    expect(b.body.value).toBe(1.15);
    expect(c.status).toBe(201);
    expect(c.body.value).toBe(2.5);
    expect(await entryCount()).toBe(3);
  });
});

describe("AC-04.2 anonymous access", () => {
  it("TEST-04.2 no cookie: POST entries, GET entries, GET progress each return 401", async () => {
    await start();
    expectError(await postEntry(null, G1.id, B), 401, "UNAUTHENTICATED", AUTH);
    expectError(await getEntries(null, G1.id), 401, "UNAUTHENTICATED", AUTH);
    expectError(await getProgress(null, G1.id), 401, "UNAUTHENTICATED", AUTH);
    expect(await entryCount()).toBe(0);
  });
});

describe("AC-04.3 Manager is stopped at the role gate", () => {
  it("TEST-04.3a M POST entries returns 403 and stores nothing", async () => {
    await start();
    expectError(await postEntry(managerCookie, G1.id, B), 403, "FORBIDDEN", ROLE);
    expect(await entryCount()).toBe(0);
  });

  it("TEST-04.3b M GET entries and GET progress return 403", async () => {
    await start();
    expectError(await getEntries(managerCookie, G1.id), 403, "FORBIDDEN", ROLE);
    expectError(await getProgress(managerCookie, G1.id), 403, "FORBIDDEN", ROLE);
  });
});

describe("AC-04.4 body shape and id format", () => {
  it("TEST-04.4a {} returns 400 and stores nothing", async () => {
    await start();
    expectError(await postEntry(p1Cookie, G1.id, {}), 400, "VALIDATION_ERROR", FIELDS);
    expect(await entryCount()).toBe(0);
  });

  it("TEST-04.4b an unknown field returns 400 and stores nothing", async () => {
    await start();
    const res = await postEntry(p1Cookie, G1.id, { ...B, note: "x" });
    expectError(res, 400, "VALIDATION_ERROR", FIELDS);
    expect(await entryCount()).toBe(0);
  });

  it("TEST-04.4c value as a numeric string returns 400 and stores nothing", async () => {
    await start();
    const res = await postEntry(p1Cookie, G1.id, { ...B, value: "5" });
    expectError(res, 400, "VALIDATION_ERROR", FIELDS);
    expect(await entryCount()).toBe(0);
  });

  it("TEST-04.4d value with three decimals returns 400 and stores nothing", async () => {
    await start();
    const res = await postEntry(p1Cookie, G1.id, { ...B, value: 5.123 });
    expectError(res, 400, "VALIDATION_ERROR", FIELDS);
    expect(await entryCount()).toBe(0);
  });

  it("TEST-04.4e slashes, timestamp and impossible dates return 400 and store nothing", async () => {
    await start();
    for (const date of ["03/11/2026", "2026-11-03T00:00:00Z", "2026-02-30"]) {
      const res = await postEntry(p1Cookie, G1.id, { ...B, date });
      expectError(res, 400, "VALIDATION_ERROR", FIELDS);
    }
    expect(await entryCount()).toBe(0);
  });

  it("TEST-04.4f a JSON array or null body returns 400 and stores nothing", async () => {
    await start();
    for (const raw of ["[]", "null"]) {
      const res = await request(app)
        .post(`/goals/${G1.id}/entries`)
        .set("Cookie", p1Cookie)
        .set("Content-Type", "application/json")
        .send(raw);
      expectError(res, 400, "VALIDATION_ERROR", FIELDS);
    }
    expect(await entryCount()).toBe(0);
  });

  it("TEST-04.4g malformed goal ids (abc, 0, 99999999999) return 400 on all three endpoints", async () => {
    await start();
    for (const id of ["abc", "0", "99999999999"]) {
      expectError(await postEntry(p1Cookie, id, B), 400, "VALIDATION_ERROR", ID);
      expectError(await getEntries(p1Cookie, id), 400, "VALIDATION_ERROR", ID);
      expectError(await getProgress(p1Cookie, id), 400, "VALIDATION_ERROR", ID);
    }
    expect(await entryCount()).toBe(0);
  });
});

describe("AC-04.5 ownership (BR-08)", () => {
  it("TEST-04.5a control P1 posts 201; P2 gets identical 404 on G1 and a missing goal", async () => {
    await start();
    const control = await postEntry(p1Cookie, G1.id, B);
    expect(control.status).toBe(201);

    const body = { ...B, date: "2026-11-04" };
    const onG1 = await postEntry(p2Cookie, G1.id, body);
    const onMissing = await postEntry(p2Cookie, 99999, body);

    expectError(onG1, 404, "NOT_FOUND", GOAL404);
    expectError(onMissing, 404, "NOT_FOUND", GOAL404);
    expect(onG1.body).toEqual(onMissing.body);
    expect(await entryCount()).toBe(1);
  });

  it("TEST-04.5b control P1 reads entries and progress; P2 gets identical 404s", async () => {
    await start();
    expect((await getEntries(p1Cookie, G1.id)).status).toBe(200);
    expect((await getProgress(p1Cookie, G1.id)).status).toBe(200);

    const responses = [
      await getEntries(p2Cookie, G1.id),
      await getEntries(p2Cookie, 99999),
      await getProgress(p2Cookie, G1.id),
      await getProgress(p2Cookie, 99999),
    ];
    for (const res of responses) expectError(res, 404, "NOT_FOUND", GOAL404);
    expect(new Set(responses.map((r) => JSON.stringify(r.body))).size).toBe(1);
  });
});

describe("AC-04.6 no future dates (BR-03)", () => {
  it("TEST-04.6a tomorrow returns 400 FUTURE", async () => {
    await start();
    const res = await postEntry(p1Cookie, G1.id, { ...B, date: "2026-11-06" });
    expectError(res, 400, "VALIDATION_ERROR", FUTURE);
    expect(await entryCount()).toBe(0);
  });

  it("TEST-04.6b today is accepted", async () => {
    await start();
    const res = await postEntry(p1Cookie, G1.id, { ...B, date: "2026-11-05" });
    expect(res.status).toBe(201);
  });

  it("TEST-04.6c a date after today and after the goal end returns FUTURE, not OUTSIDE", async () => {
    await start();
    const res = await postEntry(p1Cookie, G1.id, { ...B, date: "2026-12-01" });
    expectError(res, 400, "VALIDATION_ERROR", FUTURE);
    expect(await entryCount()).toBe(0);
  });
});

describe("AC-04.7 date within the goal (BR-03)", () => {
  it("TEST-04.7a the day before the start returns 400 OUTSIDE", async () => {
    await start();
    const res = await postEntry(p1Cookie, G1.id, { ...B, date: "2026-10-31" });
    expectError(res, 400, "VALIDATION_ERROR", OUTSIDE);
    expect(await entryCount()).toBe(0);
  });

  it("TEST-04.7b a past date after the end returns 400 OUTSIDE", async () => {
    await start("2026-12-10T05:00:00Z");
    const res = await postEntry(p1Cookie, G1.id, { ...B, date: "2026-12-01" });
    expectError(res, 400, "VALIDATION_ERROR", OUTSIDE);
    expect(await entryCount()).toBe(0);
  });

  it("TEST-04.7c the start and end dates are accepted", async () => {
    await start("2026-12-10T05:00:00Z");
    const first = await postEntry(p1Cookie, G1.id, { ...B, date: "2026-11-01" });
    const last = await postEntry(p1Cookie, G1.id, { ...B, date: "2026-11-30" });
    expect(first.status).toBe(201);
    expect(last.status).toBe(201);
  });
});

describe("AC-04.8 today follows Asia/Bangkok, not UTC or the server TZ (BR-03, A-02)", () => {
  it("TEST-04.8a at 00:30 on 8 Nov in Bangkok an entry for 8 Nov is accepted", async () => {
    useOtherTimeZone();
    await start("2026-11-07T17:30:00Z");
    const res = await postEntry(p1Cookie, G1.id, { ...B, date: "2026-11-08" });
    expect(res.status).toBe(201);
  });

  it("TEST-04.8b at 23:59 on 7 Nov in Bangkok an entry for 8 Nov is rejected as future", async () => {
    useOtherTimeZone();
    await start("2026-11-07T16:59:00Z");
    const res = await postEntry(p1Cookie, G1.id, { ...B, date: "2026-11-08" });
    expectError(res, 400, "VALIDATION_ERROR", FUTURE);
    expect(await entryCount()).toBe(0);
  });
});

describe("AC-04.9 value within template range (BR-02)", () => {
  it("TEST-04.9a above the maximum returns 400 RANGE", async () => {
    await start();
    const res = await postEntry(p1Cookie, G1.id, { ...B, value: 51 });
    expectError(res, 400, "VALIDATION_ERROR", RANGE);
    expect(await entryCount()).toBe(0);
  });

  it("TEST-04.9b below the minimum returns 400 RANGE", async () => {
    await start();
    const res = await postEntry(p1Cookie, G1.id, { ...B, value: -0.01 });
    expectError(res, 400, "VALIDATION_ERROR", RANGE);
    expect(await entryCount()).toBe(0);
  });

  it("TEST-04.9c values equal to the bounds are accepted", async () => {
    await start();
    const low = await postEntry(p1Cookie, G1.id, { date: "2026-11-01", value: 0 });
    const high = await postEntry(p1Cookie, G1.id, { date: "2026-11-02", value: 50 });
    expect(low.status).toBe(201);
    expect(high.status).toBe(201);
  });
});

describe("AC-04.10 one entry per date (BR-01)", () => {
  it("TEST-04.10a a second entry on the same date returns 409 and the first is unchanged", async () => {
    await insertEntry(G1.id, "2026-11-03", 5);
    await start();
    const res = await postEntry(p1Cookie, G1.id, { date: "2026-11-03", value: 7 });

    expectError(res, 409, "CONFLICT", DUP);
    const entries = await prisma.entry.findMany();
    expect(entries).toHaveLength(1);
    expect(entries[0].value).toBe(5);
  });

  it("TEST-04.10b the same date on another goal is accepted", async () => {
    const G3 = await insertGoal(p1.id, T2.id, "2026-11-01", "2026-11-30");
    await insertEntry(G1.id, "2026-11-03", 5);
    await start();
    const res = await postEntry(p1Cookie, G3.id, B);
    expect(res.status).toBe(201);
  });
});

describe("AC-04.11 concurrent duplicates (BR-01)", () => {
  it("TEST-04.11 five concurrent posts for one date give one 201 and four 409, no 500", async () => {
    await start();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => postEntry(p1Cookie, G1.id, B)),
    );

    const created = results.filter((r) => r.status === 201);
    const conflicts = results.filter((r) => r.status === 409);
    expect(created).toHaveLength(1);
    expect(conflicts).toHaveLength(4);
    for (const r of conflicts) expectError(r, 409, "CONFLICT", DUP);
    expect(await entryCount()).toBe(1);
  });
});

describe("AC-04.12 template range change applies only to new entries (D-06)", () => {
  it("TEST-04.12 existing entry unchanged; a new entry uses the new range", async () => {
    await insertEntry(G1.id, "2026-11-01", 40);
    await start();

    const putRes = await request(app)
      .put(`/templates/${T.id}`)
      .set("Cookie", managerCookie)
      .send({ name: "Running", unit: "km", minValue: 0, maxValue: 20 });
    expect(putRes.status).toBe(200);

    const list = await getEntries(p1Cookie, G1.id);
    expect(list.status).toBe(200);
    expect(list.body.map((e: { value: number }) => e.value)).toEqual([40]);

    const res = await postEntry(p1Cookie, G1.id, { date: "2026-11-02", value: 30 });
    expectError(res, 400, "VALIDATION_ERROR", RANGE);
    expect(await entryCount()).toBe(1);
  });
});

describe("AC-04.13 history", () => {
  it("TEST-04.13a returns only this goal's entries ordered by date", async () => {
    const e3 = await insertEntry(G1.id, "2026-11-03", 3);
    const e1 = await insertEntry(G1.id, "2026-11-01", 1);
    const e2 = await insertEntry(G1.id, "2026-11-02", 2);
    await insertEntry(G2.id, "2026-11-01", 9);
    await start();

    const res = await getEntries(p1Cookie, G1.id);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: e1.id, goalId: G1.id, date: "2026-11-01", value: 1 },
      { id: e2.id, goalId: G1.id, date: "2026-11-02", value: 2 },
      { id: e3.id, goalId: G1.id, date: "2026-11-03", value: 3 },
    ]);
  });

  it("TEST-04.13b no entries returns 200 []", async () => {
    await start();
    const res = await getEntries(p1Cookie, G1.id);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("AC-04.14 progress (BR-09)", () => {
  it("TEST-04.14a 3 of 5 days met is 60", async () => {
    await insertEntry(G1.id, "2026-11-01", 5);
    await insertEntry(G1.id, "2026-11-02", 3);
    await insertEntry(G1.id, "2026-11-03", 6);
    await insertEntry(G1.id, "2026-11-05", 5);
    await start();

    const res = await getProgress(p1Cookie, G1.id);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      goalId: G1.id,
      today: "2026-11-05",
      daysElapsed: 5,
      daysMet: 3,
      progress: 60,
    });
  });

  it("TEST-04.14b 1 of 3 days rounds down to 33.33", async () => {
    await insertEntry(G1.id, "2026-11-01", 5);
    await start("2026-11-03T05:00:00Z");

    const res = await getProgress(p1Cookie, G1.id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ daysElapsed: 3, daysMet: 1, progress: 33.33 });
  });

  it("TEST-04.14c a value equal to the target counts as met", async () => {
    const G4 = await insertGoal(p1.id, T2.id, "2026-11-01", "2026-11-30", 1.15);
    await insertEntry(G4.id, "2026-11-01", 1.15);
    await insertEntry(G4.id, "2026-11-02", 1.14);
    await start("2026-11-02T05:00:00Z");

    const res = await getProgress(p1Cookie, G4.id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ daysElapsed: 2, daysMet: 1, progress: 50 });
  });

  it("TEST-04.14d today is the Bangkok date even when the server TZ differs", async () => {
    useOtherTimeZone();
    await start("2026-11-07T17:30:00Z");

    const res = await getProgress(p1Cookie, G1.id);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      goalId: G1.id,
      today: "2026-11-08",
      daysElapsed: 8,
      daysMet: 0,
      progress: 0,
    });
  });

  it("TEST-04.14e 2 of 3 days rounds up to 66.67", async () => {
    await insertEntry(G1.id, "2026-11-01", 5);
    await insertEntry(G1.id, "2026-11-02", 6);
    await start("2026-11-03T05:00:00Z");

    const res = await getProgress(p1Cookie, G1.id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ daysElapsed: 3, daysMet: 2, progress: 66.67 });
  });
});

describe("AC-04.15 progress before and after the goal period (BR-09)", () => {
  it("TEST-04.15a before the goal starts everything is 0", async () => {
    await start("2026-10-20T05:00:00Z");
    const res = await getProgress(p1Cookie, G1.id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ today: "2026-10-20", daysElapsed: 0, daysMet: 0, progress: 0 });
  });

  it("TEST-04.15b after the goal ends daysElapsed stops at the end date", async () => {
    const G5 = await insertGoal(p1.id, T2.id, "2026-11-01", "2026-11-10", 5);
    await insertEntry(G5.id, "2026-11-01", 5);
    await insertEntry(G5.id, "2026-11-10", 5);
    await start("2026-11-20T05:00:00Z");

    const res = await getProgress(p1Cookie, G5.id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ daysElapsed: 10, daysMet: 2, progress: 20 });
  });
});

describe("AC-04.16 progress uses the stored daily target (D-06)", () => {
  it("TEST-04.16 after the template range moves above the target, the stored target 5 is used", async () => {
    await insertEntry(G1.id, "2026-11-01", 5);
    await start("2026-11-01T05:00:00Z");

    const putRes = await request(app)
      .put(`/templates/${T.id}`)
      .set("Cookie", managerCookie)
      .send({ name: "Running", unit: "km", minValue: 10, maxValue: 50 });
    expect(putRes.status).toBe(200);

    const res = await getProgress(p1Cookie, G1.id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ daysElapsed: 1, daysMet: 1, progress: 100 });
  });
});

describe("AC-04.17 check order", () => {
  it("TEST-04.17a no cookie with an invalid body returns 401, not 400", async () => {
    await start();
    expectError(await postEntry(null, G1.id, {}), 401, "UNAUTHENTICATED", AUTH);
  });

  it("TEST-04.17b Manager with an invalid body or malformed id returns 403, not 400", async () => {
    await start();
    expectError(await postEntry(managerCookie, G1.id, {}), 403, "FORBIDDEN", ROLE);
    expectError(await getEntries(managerCookie, "abc"), 403, "FORBIDDEN", ROLE);
  });

  it("TEST-04.17c control; a future date on a missing goal returns 404, not 400", async () => {
    await start();
    const future = { ...B, date: "2026-11-06" };
    expectError(await postEntry(p1Cookie, G1.id, future), 400, "VALIDATION_ERROR", FUTURE);

    expectError(await postEntry(p1Cookie, 99999, future), 404, "NOT_FOUND", GOAL404);
    expect(await entryCount()).toBe(0);
  });

  it("TEST-04.17d control; a date outside the goal with a bad value returns OUTSIDE (BR-03 before BR-02)", async () => {
    await start();
    const rangeOnly = await postEntry(p1Cookie, G1.id, { date: "2026-11-03", value: 999 });
    expectError(rangeOnly, 400, "VALIDATION_ERROR", RANGE);

    const both = await postEntry(p1Cookie, G1.id, { date: "2026-10-31", value: 999 });
    expectError(both, 400, "VALIDATION_ERROR", OUTSIDE);
    expect(await entryCount()).toBe(0);
  });

  it("TEST-04.17e control; a duplicate date with a bad value returns RANGE (BR-02 before BR-01)", async () => {
    await insertEntry(G1.id, "2026-11-03", 5);
    await start();
    expectError(await postEntry(p1Cookie, G1.id, B), 409, "CONFLICT", DUP);

    const both = await postEntry(p1Cookie, G1.id, { date: "2026-11-03", value: 999 });
    expectError(both, 400, "VALIDATION_ERROR", RANGE);
    expect(await entryCount()).toBe(1);
  });
});
