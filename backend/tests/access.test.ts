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

const VALID_TEMPLATE_BODY = { name: "Running", unit: "km", minValue: 0, maxValue: 10 };
const VALID_GOAL_BODY = {
  templateId: 0, // filled in per-test from T.id
  dailyTarget: 5,
  startDate: "2026-01-01",
  endDate: "2026-12-31",
};
const VALID_ENTRY_BODY = { date: "2026-02-01", value: 5 };

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

function expectIdenticalNotFound(a: Response, b: Response) {
  expect(a.status).toBe(404);
  expect(b.status).toBe(404);
  expect(a.body.error.code).toBe("NOT_FOUND");
  expect(b.body.error.code).toBe("NOT_FOUND");
  expect(a.body.error.message).toBe(b.body.error.message);
}

let app: Express;
let manager: { id: number; email: string };
let p1: { id: number; email: string };
let p2: { id: number; email: string };
let managerCookie: string;
let p1Cookie: string;
let p2Cookie: string;
let template: { id: number };
let goal1: { id: number };

beforeEach(async () => {
  app = buildTestApp();

  manager = await createUser("test-manager@example.com", MANAGER_PASSWORD, "MANAGER");
  p1 = await createUser("test-p1@example.com", P1_PASSWORD, "PARTICIPANT");
  p2 = await createUser("test-p2@example.com", P2_PASSWORD, "PARTICIPANT");

  managerCookie = await login(app, manager.email, MANAGER_PASSWORD);
  p1Cookie = await login(app, p1.email, P1_PASSWORD);
  p2Cookie = await login(app, p2.email, P2_PASSWORD);

  template = await prisma.template.create({
    data: { ...VALID_TEMPLATE_BODY, createdById: manager.id },
  });

  goal1 = await prisma.goal.create({
    data: {
      userId: p1.id,
      templateId: template.id,
      dailyTarget: 5,
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
    },
  });

  await prisma.entry.create({
    data: { goalId: goal1.id, date: new Date("2026-01-15"), value: 5 },
  });
});

describe("AC-05.1 anonymous access", () => {
  it("TEST-05.1a no cookie: GET /templates returns 401 UNAUTHENTICATED", async () => {
    const res = await request(app).get("/templates");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("TEST-05.1b no cookie: POST /templates and PUT /templates/:id each return 401", async () => {
    const postRes = await request(app).post("/templates").send(VALID_TEMPLATE_BODY);
    const putRes = await request(app).put(`/templates/${template.id}`).send(VALID_TEMPLATE_BODY);

    expect(postRes.status).toBe(401);
    expect(postRes.body.error.code).toBe("UNAUTHENTICATED");
    expect(putRes.status).toBe(401);
    expect(putRes.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("TEST-05.1c no cookie: POST /goals, GET /goals, GET /goals/:id each return 401", async () => {
    const postRes = await request(app)
      .post("/goals")
      .send({ ...VALID_GOAL_BODY, templateId: template.id });
    const listRes = await request(app).get("/goals");
    const getRes = await request(app).get(`/goals/${goal1.id}`);

    expect(postRes.status).toBe(401);
    expect(postRes.body.error.code).toBe("UNAUTHENTICATED");
    expect(listRes.status).toBe(401);
    expect(listRes.body.error.code).toBe("UNAUTHENTICATED");
    expect(getRes.status).toBe(401);
    expect(getRes.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("TEST-05.1d no cookie: POST/GET entries and GET progress each return 401", async () => {
    const postRes = await request(app).post(`/goals/${goal1.id}/entries`).send(VALID_ENTRY_BODY);
    const listRes = await request(app).get(`/goals/${goal1.id}/entries`);
    const progressRes = await request(app).get(`/goals/${goal1.id}/progress`);

    expect(postRes.status).toBe(401);
    expect(postRes.body.error.code).toBe("UNAUTHENTICATED");
    expect(listRes.status).toBe(401);
    expect(listRes.body.error.code).toBe("UNAUTHENTICATED");
    expect(progressRes.status).toBe(401);
    expect(progressRes.body.error.code).toBe("UNAUTHENTICATED");
  });
});

describe("AC-05.2 Participant cannot manage templates", () => {
  it("TEST-05.2a Participant POST /templates returns 403 and stores nothing", async () => {
    const countBefore = await prisma.template.count();

    const res = await request(app)
      .post("/templates")
      .set("Cookie", p1Cookie)
      .send(VALID_TEMPLATE_BODY);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    await expect(prisma.template.count()).resolves.toBe(countBefore);
  });

  it("TEST-05.2b Participant PUT /templates/:id returns 403 and the template is unchanged", async () => {
    const before = await prisma.template.findUniqueOrThrow({ where: { id: template.id } });

    const res = await request(app)
      .put(`/templates/${template.id}`)
      .set("Cookie", p1Cookie)
      .send({ name: "Cycling", unit: "km", minValue: 0, maxValue: 100 });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");

    const after = await prisma.template.findUniqueOrThrow({ where: { id: template.id } });
    expect(after).toEqual(before);
  });
});

describe("AC-05.3 Manager cannot use Participant-only endpoints", () => {
  it("TEST-05.3a Manager GET /goals/:id returns 403 (not 200, not 404)", async () => {
    const res = await request(app).get(`/goals/${goal1.id}`).set("Cookie", managerCookie);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("TEST-05.3b Manager GET /goals returns 403", async () => {
    const res = await request(app).get("/goals").set("Cookie", managerCookie);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("TEST-05.3c Manager POST /goals returns 403 and goal count is unchanged", async () => {
    const countBefore = await prisma.goal.count();

    const res = await request(app)
      .post("/goals")
      .set("Cookie", managerCookie)
      .send({ ...VALID_GOAL_BODY, templateId: template.id });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    await expect(prisma.goal.count()).resolves.toBe(countBefore);
  });

  it("TEST-05.3d Manager GET /goals/:id/entries and GET /goals/:id/progress each return 403", async () => {
    const entriesRes = await request(app)
      .get(`/goals/${goal1.id}/entries`)
      .set("Cookie", managerCookie);
    const progressRes = await request(app)
      .get(`/goals/${goal1.id}/progress`)
      .set("Cookie", managerCookie);

    expect(entriesRes.status).toBe(403);
    expect(entriesRes.body.error.code).toBe("FORBIDDEN");
    expect(progressRes.status).toBe(403);
    expect(progressRes.body.error.code).toBe("FORBIDDEN");
  });

  it("TEST-05.3e Manager POST /goals/:id/entries returns 403 and entry count is unchanged", async () => {
    const countBefore = await prisma.entry.count();

    const res = await request(app)
      .post(`/goals/${goal1.id}/entries`)
      .set("Cookie", managerCookie)
      .send(VALID_ENTRY_BODY);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    await expect(prisma.entry.count()).resolves.toBe(countBefore);
  });
});

describe("AC-05.4 / AC-05.8 ownership on reads", () => {
  it("TEST-05.4a owner P1 gets 200 (control); P2 gets 404 on the same GET /goals/:id", async () => {
    const p1Res = await request(app).get(`/goals/${goal1.id}`).set("Cookie", p1Cookie);
    expect(p1Res.status).toBe(200);

    const p2Res = await request(app).get(`/goals/${goal1.id}`).set("Cookie", p2Cookie);
    expect(p2Res.status).toBe(404);
    expect(p2Res.body.error.code).toBe("NOT_FOUND");
  });

  it("TEST-05.4b owner P1 gets 200 and lists E1 (control); P2 gets 404 on GET /goals/:id/entries", async () => {
    const p1Res = await request(app).get(`/goals/${goal1.id}/entries`).set("Cookie", p1Cookie);
    expect(p1Res.status).toBe(200);
    expect(p1Res.body).toHaveLength(1);
    expect(p1Res.body[0]).toMatchObject({ value: 5 });

    const p2Res = await request(app).get(`/goals/${goal1.id}/entries`).set("Cookie", p2Cookie);
    expect(p2Res.status).toBe(404);
    expect(p2Res.body.error.code).toBe("NOT_FOUND");
  });

  it("TEST-05.4c owner P1 gets 200 (control); P2 gets 404 on GET /goals/:id/progress", async () => {
    const p1Res = await request(app).get(`/goals/${goal1.id}/progress`).set("Cookie", p1Cookie);
    expect(p1Res.status).toBe(200);

    const p2Res = await request(app).get(`/goals/${goal1.id}/progress`).set("Cookie", p2Cookie);
    expect(p2Res.status).toBe(404);
    expect(p2Res.body.error.code).toBe("NOT_FOUND");
  });
});

describe("AC-05.5 / AC-05.8 ownership on writes", () => {
  it("TEST-05.5 owner P1 gets 201 (control); P2 gets 404 and no entry is created", async () => {
    const p1Res = await request(app)
      .post(`/goals/${goal1.id}/entries`)
      .set("Cookie", p1Cookie)
      .send({ date: "2026-02-02", value: 5 });
    expect(p1Res.status).toBe(201);

    const countBeforeP2 = await prisma.entry.count();

    const p2Res = await request(app)
      .post(`/goals/${goal1.id}/entries`)
      .set("Cookie", p2Cookie)
      .send({ date: "2026-02-03", value: 5 });
    expect(p2Res.status).toBe(404);
    expect(p2Res.body.error.code).toBe("NOT_FOUND");

    await expect(prisma.entry.count()).resolves.toBe(countBeforeP2);
  });
});

describe("AC-05.6 own goals only", () => {
  it("TEST-05.6 P1's list has only G1; P2's list has only their own goal G2", async () => {
    const goal2 = await prisma.goal.create({
      data: {
        userId: p2.id,
        templateId: template.id,
        dailyTarget: 5,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
      },
    });

    const p1Res = await request(app).get("/goals").set("Cookie", p1Cookie);
    const p2Res = await request(app).get("/goals").set("Cookie", p2Cookie);

    expect(p1Res.status).toBe(200);
    expect(p1Res.body.map((g: { id: number }) => g.id)).toEqual([goal1.id]);

    expect(p2Res.status).toBe(200);
    expect(p2Res.body.map((g: { id: number }) => g.id)).toEqual([goal2.id]);
  });
});

describe("AC-05.7 identical response for another's goal and a missing goal", () => {
  it("TEST-05.7a P2 control on GET /goals/:id then identical 404 for G1 and for a missing id", async () => {
    const p1Res = await request(app).get(`/goals/${goal1.id}`).set("Cookie", p1Cookie);
    expect(p1Res.status).toBe(200);

    const onG1 = await request(app).get(`/goals/${goal1.id}`).set("Cookie", p2Cookie);
    const onMissing = await request(app).get("/goals/99999").set("Cookie", p2Cookie);
    expectIdenticalNotFound(onG1, onMissing);
  });

  it("TEST-05.7b P2 control on GET /goals/:id/entries then identical 404 for G1 and for a missing id", async () => {
    const p1Res = await request(app).get(`/goals/${goal1.id}/entries`).set("Cookie", p1Cookie);
    expect(p1Res.status).toBe(200);

    const onG1 = await request(app).get(`/goals/${goal1.id}/entries`).set("Cookie", p2Cookie);
    const onMissing = await request(app).get("/goals/99999/entries").set("Cookie", p2Cookie);
    expectIdenticalNotFound(onG1, onMissing);
  });

  it("TEST-05.7c P2 control on GET /goals/:id/progress then identical 404 for G1 and for a missing id", async () => {
    const p1Res = await request(app).get(`/goals/${goal1.id}/progress`).set("Cookie", p1Cookie);
    expect(p1Res.status).toBe(200);

    const onG1 = await request(app).get(`/goals/${goal1.id}/progress`).set("Cookie", p2Cookie);
    const onMissing = await request(app).get("/goals/99999/progress").set("Cookie", p2Cookie);
    expectIdenticalNotFound(onG1, onMissing);
  });

  it("TEST-05.7d P2 control on POST /goals/:id/entries then identical 404 for G1 and for a missing id", async () => {
    const p1Res = await request(app)
      .post(`/goals/${goal1.id}/entries`)
      .set("Cookie", p1Cookie)
      .send({ date: "2026-03-01", value: 5 });
    expect(p1Res.status).toBe(201);

    const onG1 = await request(app)
      .post(`/goals/${goal1.id}/entries`)
      .set("Cookie", p2Cookie)
      .send({ date: "2026-03-02", value: 5 });
    const onMissing = await request(app)
      .post("/goals/99999/entries")
      .set("Cookie", p2Cookie)
      .send({ date: "2026-03-02", value: 5 });
    expectIdenticalNotFound(onG1, onMissing);
  });
});

describe("AC-05.9 ownership checked before goal-dependent validation", () => {
  it("TEST-05.9a control P1 gets 400 for a date before the goal start; P2 gets identical 404 on G1 and a missing id", async () => {
    const p1Res = await request(app)
      .post(`/goals/${goal1.id}/entries`)
      .set("Cookie", p1Cookie)
      .send({ date: "2025-12-31", value: 5 });
    expect(p1Res.status).toBe(400);
    expect(p1Res.body.error.code).toBe("VALIDATION_ERROR");

    const onG1 = await request(app)
      .post(`/goals/${goal1.id}/entries`)
      .set("Cookie", p2Cookie)
      .send({ date: "2025-12-31", value: 5 });
    const onMissing = await request(app)
      .post("/goals/99999/entries")
      .set("Cookie", p2Cookie)
      .send({ date: "2025-12-31", value: 5 });
    expectIdenticalNotFound(onG1, onMissing);
  });

  it("TEST-05.9b control P1 gets 400 for a value above the template maximum; P2 gets identical 404 on G1 and a missing id", async () => {
    const p1Res = await request(app)
      .post(`/goals/${goal1.id}/entries`)
      .set("Cookie", p1Cookie)
      .send({ date: "2026-04-01", value: 11 });
    expect(p1Res.status).toBe(400);
    expect(p1Res.body.error.code).toBe("VALIDATION_ERROR");

    const onG1 = await request(app)
      .post(`/goals/${goal1.id}/entries`)
      .set("Cookie", p2Cookie)
      .send({ date: "2026-04-01", value: 11 });
    const onMissing = await request(app)
      .post("/goals/99999/entries")
      .set("Cookie", p2Cookie)
      .send({ date: "2026-04-01", value: 11 });
    expectIdenticalNotFound(onG1, onMissing);
  });

  it("TEST-05.9c control P1 gets 409 for a date that already has an entry; P2 gets identical 404 on G1 and a missing id", async () => {
    const p1Res = await request(app)
      .post(`/goals/${goal1.id}/entries`)
      .set("Cookie", p1Cookie)
      .send({ date: "2026-01-15", value: 5 });
    expect(p1Res.status).toBe(409);

    const onG1 = await request(app)
      .post(`/goals/${goal1.id}/entries`)
      .set("Cookie", p2Cookie)
      .send({ date: "2026-01-15", value: 5 });
    const onMissing = await request(app)
      .post("/goals/99999/entries")
      .set("Cookie", p2Cookie)
      .send({ date: "2026-01-15", value: 5 });
    expectIdenticalNotFound(onG1, onMissing);
  });
});
