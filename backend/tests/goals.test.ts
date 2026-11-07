import type { Express } from "express";
import type { Response } from "superagent";
import bcrypt from "bcrypt";
import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { errorHandler } from "../src/middleware/errorHandler.js";

const MANAGER_PASSWORD = "manager-pass-123";
const P1_PASSWORD = "participant-one-pass-123";
const P2_PASSWORD = "participant-two-pass-123";

// Messages from F-03 contract §3.1 (and F-01 for 401/403).
const AUTH = "Authentication required.";
const ROLE = "You do not have permission to perform this action.";
const FIELDS = "Invalid goal fields.";
const ID = "Invalid goal id.";
const DATES = "End date must not be before start date.";
const RANGE = "Daily target must be within the template range.";
const TPL404 = "Template not found.";
const GOAL404 = "Goal not found.";
const OVERLAP = "You already have a goal for this template that overlaps these dates.";

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

async function login(app: Express, email: string, password: string): Promise<string> {
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
let T3: { id: number };

type GoalBody = Record<string, unknown>;

function validBody(overrides: GoalBody = {}): GoalBody {
  return {
    templateId: T.id,
    dailyTarget: 5,
    startDate: "2026-11-01",
    endDate: "2026-11-30",
    ...overrides,
  };
}

function postGoal(cookie: string | null, body: unknown) {
  const req = request(app).post("/goals");
  if (cookie) req.set("Cookie", cookie);
  return req.send(body as object);
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

async function goalCount() {
  return prisma.goal.count();
}

beforeEach(async () => {
  app = buildTestApp();

  manager = await createUser("test-manager@example.com", MANAGER_PASSWORD, "MANAGER");
  p1 = await createUser("test-p1@example.com", P1_PASSWORD, "PARTICIPANT");
  p2 = await createUser("test-p2@example.com", P2_PASSWORD, "PARTICIPANT");

  managerCookie = await login(app, manager.email, MANAGER_PASSWORD);
  p1Cookie = await login(app, p1.email, P1_PASSWORD);
  p2Cookie = await login(app, p2.email, P2_PASSWORD);

  T = await prisma.template.create({
    data: { name: "Running", unit: "km", minValue: 0, maxValue: 50, createdById: manager.id },
  });
  T2 = await prisma.template.create({
    data: { name: "Reading", unit: "minutes", minValue: 0, maxValue: 300, createdById: manager.id },
  });
  T3 = await prisma.template.create({
    data: {
      name: "Outdoor temperature",
      unit: "°C",
      minValue: -20,
      maxValue: 50,
      createdById: manager.id,
    },
  });
});

describe("AC-03.1 create a goal", () => {
  it("TEST-03.1a P1 creates a goal and receives 201 with the stored goal", async () => {
    const body = validBody();
    const res = await postGoal(p1Cookie, body);

    expect(res.status).toBe(201);
    expect(typeof res.body.id).toBe("number");
    expect(res.body).toEqual({ ...body, id: res.body.id, userId: p1.id });
    expect(await goalCount()).toBe(1);

    const stored = await prisma.goal.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(stored.userId).toBe(p1.id);
    expect(stored.templateId).toBe(T.id);
  });

  it("TEST-03.1b accepts two-decimal targets 2.5, 0.07 and 1.15", async () => {
    const a = await postGoal(p1Cookie, validBody({ dailyTarget: 2.5 }));
    const b = await postGoal(p1Cookie, validBody({ templateId: T2.id, dailyTarget: 0.07 }));
    const c = await postGoal(p1Cookie, validBody({ templateId: T3.id, dailyTarget: 1.15 }));

    expect(a.status).toBe(201);
    expect(a.body.dailyTarget).toBe(2.5);
    expect(b.status).toBe(201);
    expect(b.body.dailyTarget).toBe(0.07);
    expect(c.status).toBe(201);
    expect(c.body.dailyTarget).toBe(1.15);
    expect(await goalCount()).toBe(3);
  });
});

describe("AC-03.2 anonymous access", () => {
  it("TEST-03.2 no cookie: POST /goals, GET /goals, GET /goals/1 each return 401", async () => {
    const postRes = await postGoal(null, validBody());
    const listRes = await request(app).get("/goals");
    const oneRes = await request(app).get("/goals/1");

    expectError(postRes, 401, "UNAUTHENTICATED", AUTH);
    expectError(listRes, 401, "UNAUTHENTICATED", AUTH);
    expectError(oneRes, 401, "UNAUTHENTICATED", AUTH);
    expect(await goalCount()).toBe(0);
  });
});

describe("AC-03.3 Manager is stopped at the role gate", () => {
  it("TEST-03.3a M POST /goals returns 403 and stores nothing", async () => {
    const res = await postGoal(managerCookie, validBody());

    expectError(res, 403, "FORBIDDEN", ROLE);
    expect(await goalCount()).toBe(0);
  });

  it("TEST-03.3b M GET /goals and GET /goals/:id of P1's goal return 403", async () => {
    const goal = await insertGoal(p1.id, T.id, "2026-11-01", "2026-11-30");

    const listRes = await request(app).get("/goals").set("Cookie", managerCookie);
    const oneRes = await request(app).get(`/goals/${goal.id}`).set("Cookie", managerCookie);

    expectError(listRes, 403, "FORBIDDEN", ROLE);
    expectError(oneRes, 403, "FORBIDDEN", ROLE);
  });
});

describe("AC-03.4 body shape", () => {
  it("TEST-03.4a {} returns 400 and stores nothing", async () => {
    expectError(await postGoal(p1Cookie, {}), 400, "VALIDATION_ERROR", FIELDS);
    expect(await goalCount()).toBe(0);
  });

  it("TEST-03.4b an unknown field returns 400 and stores nothing", async () => {
    const res = await postGoal(p1Cookie, validBody({ note: "x" }));
    expectError(res, 400, "VALIDATION_ERROR", FIELDS);
    expect(await goalCount()).toBe(0);
  });

  it("TEST-03.4c templateId as a numeric string returns 400 and stores nothing", async () => {
    const res = await postGoal(p1Cookie, validBody({ templateId: String(T.id) }));
    expectError(res, 400, "VALIDATION_ERROR", FIELDS);
    expect(await goalCount()).toBe(0);
  });

  it("TEST-03.4d dailyTarget as a numeric string returns 400 and stores nothing", async () => {
    const res = await postGoal(p1Cookie, validBody({ dailyTarget: "5" }));
    expectError(res, 400, "VALIDATION_ERROR", FIELDS);
    expect(await goalCount()).toBe(0);
  });

  it("TEST-03.4e dailyTarget with three decimals returns 400 and stores nothing", async () => {
    const res = await postGoal(p1Cookie, validBody({ dailyTarget: 5.123 }));
    expectError(res, 400, "VALIDATION_ERROR", FIELDS);
    expect(await goalCount()).toBe(0);
  });

  it("TEST-03.4f a non-YYYY-MM-DD startDate (slashes, timestamp) returns 400 and stores nothing", async () => {
    const slashes = await postGoal(p1Cookie, validBody({ startDate: "01/11/2026" }));
    const timestamp = await postGoal(p1Cookie, validBody({ startDate: "2026-11-01T00:00:00Z" }));

    expectError(slashes, 400, "VALIDATION_ERROR", FIELDS);
    expectError(timestamp, 400, "VALIDATION_ERROR", FIELDS);
    expect(await goalCount()).toBe(0);
  });

  it("TEST-03.4g an impossible calendar date returns 400 and stores nothing", async () => {
    const res = await postGoal(p1Cookie, validBody({ endDate: "2026-02-30" }));
    expectError(res, 400, "VALIDATION_ERROR", FIELDS);
    expect(await goalCount()).toBe(0);
  });

  it("TEST-03.4h templateId 0, -1, 1.5 and 99999999999 return 400 (not 404 or 500)", async () => {
    for (const templateId of [0, -1, 1.5, 99999999999]) {
      const res = await postGoal(p1Cookie, validBody({ templateId }));
      expectError(res, 400, "VALIDATION_ERROR", FIELDS);
    }
    expect(await goalCount()).toBe(0);
  });

  it("TEST-03.4i a JSON array or null body returns 400 and stores nothing", async () => {
    const arrayRes = await request(app)
      .post("/goals")
      .set("Cookie", p1Cookie)
      .set("Content-Type", "application/json")
      .send("[]");
    const nullRes = await request(app)
      .post("/goals")
      .set("Cookie", p1Cookie)
      .set("Content-Type", "application/json")
      .send("null");

    expectError(arrayRes, 400, "VALIDATION_ERROR", FIELDS);
    expectError(nullRes, 400, "VALIDATION_ERROR", FIELDS);
    expect(await goalCount()).toBe(0);
  });
});

describe("AC-03.5 end date not before start date (BR-05)", () => {
  it("TEST-03.5a endDate before startDate returns 400 DATES and stores nothing", async () => {
    const res = await postGoal(
      p1Cookie,
      validBody({ startDate: "2026-11-30", endDate: "2026-11-01" }),
    );
    expectError(res, 400, "VALIDATION_ERROR", DATES);
    expect(await goalCount()).toBe(0);
  });

  it("TEST-03.5b a one-day goal (startDate = endDate) is accepted", async () => {
    const res = await postGoal(
      p1Cookie,
      validBody({ startDate: "2026-11-15", endDate: "2026-11-15" }),
    );
    expect(res.status).toBe(201);
    expect(await goalCount()).toBe(1);
  });
});

describe("AC-03.6 template must exist", () => {
  it("TEST-03.6 templateId 99999 returns 404 and stores nothing", async () => {
    const res = await postGoal(p1Cookie, validBody({ templateId: 99999 }));
    expectError(res, 404, "NOT_FOUND", TPL404);
    expect(await goalCount()).toBe(0);
  });
});

describe("AC-03.7 daily target within template range (BR-05)", () => {
  it("TEST-03.7a target above the template maximum returns 400 RANGE", async () => {
    const res = await postGoal(p1Cookie, validBody({ dailyTarget: 51 }));
    expectError(res, 400, "VALIDATION_ERROR", RANGE);
    expect(await goalCount()).toBe(0);
  });

  it("TEST-03.7b target below the template minimum returns 400 RANGE", async () => {
    const res = await postGoal(p1Cookie, validBody({ dailyTarget: -1 }));
    expectError(res, 400, "VALIDATION_ERROR", RANGE);
    expect(await goalCount()).toBe(0);
  });

  it("TEST-03.7c targets equal to the bounds (0, 300, -20) are accepted", async () => {
    const a = await postGoal(p1Cookie, validBody({ dailyTarget: 0 }));
    const b = await postGoal(p1Cookie, validBody({ templateId: T2.id, dailyTarget: 300 }));
    const c = await postGoal(p1Cookie, validBody({ templateId: T3.id, dailyTarget: -20 }));

    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(c.status).toBe(201);
    expect(await goalCount()).toBe(3);
  });
});

describe("AC-03.8 overlapping goals on the same template (BR-04)", () => {
  it("TEST-03.8a a partly overlapping range returns 409", async () => {
    await insertGoal(p1.id, T.id, "2026-11-01", "2026-11-30");
    const res = await postGoal(
      p1Cookie,
      validBody({ startDate: "2026-11-15", endDate: "2026-12-15" }),
    );
    expectError(res, 409, "CONFLICT", OVERLAP);
    expect(await goalCount()).toBe(1);
  });

  it("TEST-03.8b a range sharing only the last day returns 409", async () => {
    await insertGoal(p1.id, T.id, "2026-11-01", "2026-11-30");
    const res = await postGoal(
      p1Cookie,
      validBody({ startDate: "2026-11-30", endDate: "2026-12-31" }),
    );
    expectError(res, 409, "CONFLICT", OVERLAP);
    expect(await goalCount()).toBe(1);
  });

  it("TEST-03.8c overlapping a future goal returns 409", async () => {
    await insertGoal(p1.id, T.id, "2099-01-01", "2099-01-31");
    const res = await postGoal(
      p1Cookie,
      validBody({ startDate: "2098-12-15", endDate: "2099-01-05" }),
    );
    expectError(res, 409, "CONFLICT", OVERLAP);
    expect(await goalCount()).toBe(1);
  });

  it("TEST-03.8d a range enclosing an existing goal returns 409", async () => {
    await insertGoal(p1.id, T.id, "2026-11-01", "2026-11-30");
    const res = await postGoal(
      p1Cookie,
      validBody({ startDate: "2026-10-01", endDate: "2026-12-31" }),
    );
    expectError(res, 409, "CONFLICT", OVERLAP);
    expect(await goalCount()).toBe(1);
  });
});

describe("AC-03.9 non-overlapping goals are accepted (BR-04)", () => {
  it("TEST-03.9a ranges that start the day after or end the day before are accepted", async () => {
    await insertGoal(p1.id, T.id, "2026-11-01", "2026-11-30");
    const after = await postGoal(
      p1Cookie,
      validBody({ startDate: "2026-12-01", endDate: "2026-12-31" }),
    );
    const before = await postGoal(
      p1Cookie,
      validBody({ startDate: "2026-10-01", endDate: "2026-10-31" }),
    );

    expect(after.status).toBe(201);
    expect(before.status).toBe(201);
    expect(await goalCount()).toBe(3);
  });

  it("TEST-03.9b the same dates on another template are accepted", async () => {
    await insertGoal(p1.id, T.id, "2026-11-01", "2026-11-30");
    const res = await postGoal(p1Cookie, validBody({ templateId: T2.id }));
    expect(res.status).toBe(201);
  });

  it("TEST-03.9c another Participant may use the same template and dates", async () => {
    await insertGoal(p1.id, T.id, "2026-11-01", "2026-11-30");
    const res = await postGoal(p2Cookie, validBody());
    expect(res.status).toBe(201);
    expect(res.body.userId).toBe(p2.id);
  });
});

describe("AC-03.10 concurrent overlapping creates (BR-04)", () => {
  it("TEST-03.10 five concurrent overlapping requests give one 201 and four 409", async () => {
    // Every range contains 2026-11-15, so all five overlap each other.
    const ranges = [
      ["2026-11-01", "2026-11-30"],
      ["2026-11-10", "2026-12-10"],
      ["2026-10-15", "2026-11-15"],
      ["2026-11-15", "2026-11-15"],
      ["2026-11-14", "2026-11-20"],
    ];

    const results = await Promise.all(
      ranges.map(([startDate, endDate]) => postGoal(p1Cookie, validBody({ startDate, endDate }))),
    );

    const created = results.filter((r) => r.status === 201);
    const conflicts = results.filter((r) => r.status === 409);
    expect(created).toHaveLength(1);
    expect(conflicts).toHaveLength(4);
    for (const r of conflicts) expectError(r, 409, "CONFLICT", OVERLAP);
    expect(await goalCount()).toBe(1);
  });
});

describe("AC-03.11 list own goals", () => {
  it("TEST-03.11 each Participant lists only their own goals, ordered by id", async () => {
    const g1 = await insertGoal(p1.id, T.id, "2026-11-01", "2026-11-30");
    const g2 = await insertGoal(p2.id, T.id, "2026-11-01", "2026-11-30");
    const g3 = await insertGoal(p1.id, T2.id, "2026-11-01", "2026-11-30");

    const p1Res = await request(app).get("/goals").set("Cookie", p1Cookie);
    const p2Res = await request(app).get("/goals").set("Cookie", p2Cookie);

    expect(p1Res.status).toBe(200);
    expect(p1Res.body.map((g: { id: number }) => g.id)).toEqual([g1.id, g3.id]);
    expect(p1Res.body.every((g: { userId: number }) => g.userId === p1.id)).toBe(true);
    expect(p2Res.status).toBe(200);
    expect(p2Res.body.map((g: { id: number }) => g.id)).toEqual([g2.id]);
  });
});

describe("AC-03.12 read one goal", () => {
  it("TEST-03.12a the owner reads their goal with 200", async () => {
    const goal = await insertGoal(p1.id, T.id, "2026-11-01", "2026-11-30", 7.5);
    const res = await request(app).get(`/goals/${goal.id}`).set("Cookie", p1Cookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: goal.id,
      userId: p1.id,
      templateId: T.id,
      dailyTarget: 7.5,
      startDate: "2026-11-01",
      endDate: "2026-11-30",
    });
  });

  it("TEST-03.12b control P1 gets 200; P2 gets identical 404 for P1's goal and a missing id", async () => {
    const goal = await insertGoal(p1.id, T.id, "2026-11-01", "2026-11-30");

    const control = await request(app).get(`/goals/${goal.id}`).set("Cookie", p1Cookie);
    expect(control.status).toBe(200);

    const others = await request(app).get(`/goals/${goal.id}`).set("Cookie", p2Cookie);
    const missing = await request(app).get("/goals/99999").set("Cookie", p2Cookie);

    expectError(others, 404, "NOT_FOUND", GOAL404);
    expectError(missing, 404, "NOT_FOUND", GOAL404);
    expect(others.body).toEqual(missing.body);
  });

  it("TEST-03.12c malformed ids (abc, 0, 99999999999) return 400", async () => {
    for (const id of ["abc", "0", "99999999999"]) {
      const res = await request(app).get(`/goals/${id}`).set("Cookie", p1Cookie);
      expectError(res, 400, "VALIDATION_ERROR", ID);
    }
  });
});

describe("AC-03.13 template range change applies only to new goals (D-06)", () => {
  it("TEST-03.13 existing goal keeps its target; a new goal uses the new range", async () => {
    const goal = await insertGoal(p1.id, T.id, "2026-11-01", "2026-11-30", 40);

    const putRes = await request(app)
      .put(`/templates/${T.id}`)
      .set("Cookie", managerCookie)
      .send({ name: "Running", unit: "km", minValue: 0, maxValue: 20 });
    expect(putRes.status).toBe(200);

    const readRes = await request(app).get(`/goals/${goal.id}`).set("Cookie", p1Cookie);
    expect(readRes.status).toBe(200);
    expect(readRes.body.dailyTarget).toBe(40);

    const newRes = await postGoal(
      p1Cookie,
      validBody({ startDate: "2027-01-01", endDate: "2027-01-31", dailyTarget: 30 }),
    );
    expectError(newRes, 400, "VALIDATION_ERROR", RANGE);
    expect(await goalCount()).toBe(1);
  });
});

describe("AC-03.14 check order", () => {
  it("TEST-03.14a no cookie with an invalid body returns 401, not 400", async () => {
    expectError(await postGoal(null, {}), 401, "UNAUTHENTICATED", AUTH);
  });

  it("TEST-03.14b Manager with an invalid body or malformed id returns 403, not 400", async () => {
    const postRes = await postGoal(managerCookie, {});
    const getRes = await request(app).get("/goals/abc").set("Cookie", managerCookie);

    expectError(postRes, 403, "FORBIDDEN", ROLE);
    expectError(getRes, 403, "FORBIDDEN", ROLE);
  });

  it("TEST-03.14c control; missing template with an out-of-range target returns 404, not 400", async () => {
    const rangeOnly = await postGoal(p1Cookie, validBody({ dailyTarget: 999 }));
    expectError(rangeOnly, 400, "VALIDATION_ERROR", RANGE);
    const missingOnly = await postGoal(p1Cookie, validBody({ templateId: 99999 }));
    expectError(missingOnly, 404, "NOT_FOUND", TPL404);

    const both = await postGoal(p1Cookie, validBody({ templateId: 99999, dailyTarget: 999 }));
    expectError(both, 404, "NOT_FOUND", TPL404);
    expect(await goalCount()).toBe(0);
  });

  it("TEST-03.14d control; missing template with endDate before startDate returns 404, not 400", async () => {
    const reversed = { startDate: "2026-11-30", endDate: "2026-11-01" };
    const datesOnly = await postGoal(p1Cookie, validBody(reversed));
    expectError(datesOnly, 400, "VALIDATION_ERROR", DATES);

    const both = await postGoal(p1Cookie, validBody({ ...reversed, templateId: 99999 }));
    expectError(both, 404, "NOT_FOUND", TPL404);
    expect(await goalCount()).toBe(0);
  });

  it("TEST-03.14e control; overlap with an out-of-range target returns 400, not 409", async () => {
    await insertGoal(p1.id, T.id, "2026-11-01", "2026-11-30");
    const overlap = { startDate: "2026-11-15", endDate: "2026-12-15" };

    const overlapOnly = await postGoal(p1Cookie, validBody({ ...overlap, dailyTarget: 5 }));
    expectError(overlapOnly, 409, "CONFLICT", OVERLAP);

    const both = await postGoal(p1Cookie, validBody({ ...overlap, dailyTarget: 999 }));
    expectError(both, 400, "VALIDATION_ERROR", RANGE);
    expect(await goalCount()).toBe(1);
  });
});
