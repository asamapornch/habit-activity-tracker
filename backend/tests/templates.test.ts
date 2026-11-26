import type { Express } from "express";
import bcrypt from "bcrypt";
import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { errorHandler } from "../src/middleware/errorHandler.js";

const MANAGER_PASSWORD = "manager-pass-123";
const PARTICIPANT_PASSWORD = "participant-pass-123";
const MANAGER_B_PASSWORD = "manager-b-pass-123";

const VALID_TEMPLATE = { name: "Running", unit: "km", minValue: 0, maxValue: 50 };

function buildTestApp(): Express {
  const app = createApp();
  app.use(errorHandler);
  return app;
}

async function createUser(email: string, password: string, role: "MANAGER" | "PARTICIPANT") {
  return prisma.user.create({
    data: {
      email,
      passwordHash: await bcrypt.hash(password, 10),
      role,
    },
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

let app: Express;
let manager: { id: number; email: string };
let participant: { id: number; email: string };
let managerCookie: string;
let participantCookie: string;

beforeEach(async () => {
  app = buildTestApp();

  manager = await createUser("test-manager@example.com", MANAGER_PASSWORD, "MANAGER");
  participant = await createUser("test-participant@example.com", PARTICIPANT_PASSWORD, "PARTICIPANT");

  managerCookie = await login(app, manager.email, MANAGER_PASSWORD);
  participantCookie = await login(app, participant.email, PARTICIPANT_PASSWORD);
});

describe("POST /templates", () => {
  it("TEST-02.1a creates a template and returns it with createdById equal to the Manager's id", async () => {
    const res = await request(app)
      .post("/templates")
      .set("Cookie", managerCookie)
      .send(VALID_TEMPLATE);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ...VALID_TEMPLATE, createdById: manager.id });
    expect(typeof res.body.id).toBe("number");
  });

  it("TEST-02.1b trims name and unit and stores the trimmed value", async () => {
    const res = await request(app)
      .post("/templates")
      .set("Cookie", managerCookie)
      .send({ name: "  Running  ", unit: " km ", minValue: 0, maxValue: 50 });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Running");
    expect(res.body.unit).toBe("km");
  });

  it("TEST-02.2 rejects a Participant with 403 and stores nothing", async () => {
    const res = await request(app)
      .post("/templates")
      .set("Cookie", participantCookie)
      .send(VALID_TEMPLATE);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    await expect(prisma.template.count()).resolves.toBe(0);
  });
});

describe("AC-02.3 anonymous access", () => {
  it("TEST-02.3a GET /templates with no cookie returns 401 UNAUTHENTICATED", async () => {
    const res = await request(app).get("/templates");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("TEST-02.3b POST /templates with no cookie returns 401", async () => {
    const res = await request(app).post("/templates").send(VALID_TEMPLATE);

    expect(res.status).toBe(401);
  });

  it("TEST-02.3c PUT /templates/1 with no cookie returns 401", async () => {
    const res = await request(app).put("/templates/1").send(VALID_TEMPLATE);

    expect(res.status).toBe(401);
  });
});

describe("AC-02.4 min/max ordering", () => {
  it("TEST-02.4a rejects minValue equal to maxValue on create", async () => {
    const res = await request(app)
      .post("/templates")
      .set("Cookie", managerCookie)
      .send({ name: "Running", unit: "km", minValue: 10, maxValue: 10 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("TEST-02.4b rejects minValue greater than maxValue on create", async () => {
    const res = await request(app)
      .post("/templates")
      .set("Cookie", managerCookie)
      .send({ name: "Running", unit: "km", minValue: 20, maxValue: 5 });

    expect(res.status).toBe(400);
  });

  it("TEST-02.4c rejects minValue greater than maxValue on update, leaving the template unchanged", async () => {
    const created = await request(app)
      .post("/templates")
      .set("Cookie", managerCookie)
      .send(VALID_TEMPLATE);

    const res = await request(app)
      .put(`/templates/${created.body.id}`)
      .set("Cookie", managerCookie)
      .send({ name: "Running", unit: "km", minValue: 9, maxValue: 3 });

    expect(res.status).toBe(400);

    const stored = await prisma.template.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(stored.minValue).toBe(VALID_TEMPLATE.minValue);
    expect(stored.maxValue).toBe(VALID_TEMPLATE.maxValue);
  });
});

describe("AC-02.5 / AC-02.11 / AC-02.12 validation", () => {
  it("TEST-02.5a rejects an empty body and stores nothing", async () => {
    const res = await request(app).post("/templates").set("Cookie", managerCookie).send({});

    expect(res.status).toBe(400);
    await expect(prisma.template.count()).resolves.toBe(0);
  });

  it("TEST-02.5b rejects a whitespace-only name", async () => {
    const res = await request(app)
      .post("/templates")
      .set("Cookie", managerCookie)
      .send({ name: "   ", unit: "km", minValue: 0, maxValue: 50 });

    expect(res.status).toBe(400);
  });

  it("TEST-02.5c rejects a non-numeric minValue", async () => {
    const res = await request(app)
      .post("/templates")
      .set("Cookie", managerCookie)
      .send({ name: "Running", unit: "km", minValue: "abc", maxValue: 50 });

    expect(res.status).toBe(400);
  });

  it("TEST-02.5d rejects a maxValue with more than two decimals", async () => {
    const res = await request(app)
      .post("/templates")
      .set("Cookie", managerCookie)
      .send({ name: "Running", unit: "km", minValue: 0, maxValue: 10.123 });

    expect(res.status).toBe(400);
  });

  it("TEST-02.5e rejects an unknown field", async () => {
    const res = await request(app)
      .post("/templates")
      .set("Cookie", managerCookie)
      .send({ ...VALID_TEMPLATE, colour: "red" });

    expect(res.status).toBe(400);
  });

  it("TEST-02.5f rejects a name longer than 100 characters after trimming", async () => {
    const res = await request(app)
      .post("/templates")
      .set("Cookie", managerCookie)
      .send({ name: "a".repeat(101), unit: "km", minValue: 0, maxValue: 50 });

    expect(res.status).toBe(400);
  });

  it("TEST-02.5g rejects a unit longer than 20 characters after trimming", async () => {
    const res = await request(app)
      .post("/templates")
      .set("Cookie", managerCookie)
      .send({ name: "Running", unit: "a".repeat(21), minValue: 0, maxValue: 50 });

    expect(res.status).toBe(400);
  });

  it("TEST-02.5h rejects a numeric string for minValue", async () => {
    const res = await request(app)
      .post("/templates")
      .set("Cookie", managerCookie)
      .send({ name: "Running", unit: "km", minValue: "10", maxValue: 50 });

    expect(res.status).toBe(400);
  });

  it("TEST-02.5i rejects a maxValue outside the allowed range", async () => {
    const res = await request(app)
      .post("/templates")
      .set("Cookie", managerCookie)
      .send({ name: "Running", unit: "km", minValue: 0, maxValue: 1000001 });

    expect(res.status).toBe(400);
  });

  it("TEST-02.5j accepts a negative minValue", async () => {
    const res = await request(app)
      .post("/templates")
      .set("Cookie", managerCookie)
      .send({ name: "Temperature", unit: "C", minValue: -20, maxValue: 50 });

    expect(res.status).toBe(201);
  });
});

describe("PUT /templates/:id", () => {
  it("TEST-02.6a updates a template, keeps createdById, and GET reflects the change", async () => {
    const created = await request(app)
      .post("/templates")
      .set("Cookie", managerCookie)
      .send(VALID_TEMPLATE);

    const updated = { name: "Cycling", unit: "km", minValue: 0, maxValue: 100 };
    const putRes = await request(app)
      .put(`/templates/${created.body.id}`)
      .set("Cookie", managerCookie)
      .send(updated);

    expect(putRes.status).toBe(200);
    expect(putRes.body).toMatchObject({ ...updated, id: created.body.id, createdById: manager.id });

    const getRes = await request(app).get("/templates").set("Cookie", managerCookie);
    expect(getRes.body).toContainEqual(putRes.body);
  });

  it("TEST-02.6b allows a different Manager to update, and createdById stays the original Manager's id", async () => {
    const created = await request(app)
      .post("/templates")
      .set("Cookie", managerCookie)
      .send(VALID_TEMPLATE);

    const managerB = await createUser("test-manager-b@example.com", MANAGER_B_PASSWORD, "MANAGER");
    const managerBCookie = await login(app, managerB.email, MANAGER_B_PASSWORD);

    const updated = { name: "Cycling", unit: "km", minValue: 0, maxValue: 100 };
    const res = await request(app)
      .put(`/templates/${created.body.id}`)
      .set("Cookie", managerBCookie)
      .send(updated);

    expect(res.status).toBe(200);
    expect(res.body.createdById).toBe(manager.id);
  });

  it("TEST-02.7 rejects a Participant with 403 and leaves the template unchanged", async () => {
    const created = await request(app)
      .post("/templates")
      .set("Cookie", managerCookie)
      .send(VALID_TEMPLATE);

    const res = await request(app)
      .put(`/templates/${created.body.id}`)
      .set("Cookie", participantCookie)
      .send({ name: "Cycling", unit: "km", minValue: 0, maxValue: 100 });

    expect(res.status).toBe(403);

    const stored = await prisma.template.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(stored.name).toBe(VALID_TEMPLATE.name);
  });

  it("TEST-02.8a returns 404 NOT_FOUND for a Manager updating a missing id", async () => {
    const res = await request(app)
      .put("/templates/99999")
      .set("Cookie", managerCookie)
      .send(VALID_TEMPLATE);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("TEST-02.8b returns 400 for a non-integer id", async () => {
    const res = await request(app)
      .put("/templates/abc")
      .set("Cookie", managerCookie)
      .send(VALID_TEMPLATE);

    expect(res.status).toBe(400);
  });

  it("TEST-02.8c returns 403 (not 404) for a Participant updating a missing id", async () => {
    const res = await request(app)
      .put("/templates/99999")
      .set("Cookie", participantCookie)
      .send(VALID_TEMPLATE);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("TEST-02.8d returns 400 VALIDATION_ERROR, not 500, for an id beyond Postgres's int4 range", async () => {
    const res = await request(app)
      .put("/templates/99999999999")
      .set("Cookie", managerCookie)
      .send(VALID_TEMPLATE);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("B2-01 oversized request body (AC-02.11, AC-02.17)", () => {
  it("accepts a 100-character name (boundary)", async () => {
    const res = await request(app)
      .post("/templates")
      .set("Cookie", managerCookie)
      .send({ name: "a".repeat(100), unit: "km", minValue: 0, maxValue: 50 });

    expect(res.status).toBe(201);
  });

  it("rejects a 99,000-character name with 400 VALIDATION_ERROR (body under the 100 kB limit)", async () => {
    const res = await request(app)
      .post("/templates")
      .set("Cookie", managerCookie)
      .send({ name: "a".repeat(99_000), unit: "km", minValue: 0, maxValue: 50 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  // 102,000 characters is chosen because the body stays just under body-parser's
  // 102,400-byte (100 kB) default limit, so this case must still reach the length
  // check and return 400; the 110,000-character case exceeds the limit and must
  // also return 400.
  it("rejects a 102,000-character name with 400 VALIDATION_ERROR (body still under the 100 kB limit)", async () => {
    const res = await request(app)
      .post("/templates")
      .set("Cookie", managerCookie)
      .send({ name: "a".repeat(102_000), unit: "km", minValue: 0, maxValue: 50 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /templates with a 110,000-character name returns 400 VALIDATION_ERROR, not 500 (body over the 100 kB limit)", async () => {
    const res = await request(app)
      .post("/templates")
      .set("Cookie", managerCookie)
      .send({ name: "a".repeat(110_000), unit: "km", minValue: 0, maxValue: 50 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(typeof res.body.error.message).toBe("string");
    expect(res.body.error.message.length).toBeGreaterThan(0);
    await expect(prisma.template.count()).resolves.toBe(0);
  });

  it("PUT /templates/:id with a 110,000-character name returns 400 VALIDATION_ERROR, not 500, and leaves the template unchanged", async () => {
    const created = await request(app)
      .post("/templates")
      .set("Cookie", managerCookie)
      .send(VALID_TEMPLATE);

    const res = await request(app)
      .put(`/templates/${created.body.id}`)
      .set("Cookie", managerCookie)
      .send({ name: "a".repeat(110_000), unit: "km", minValue: 0, maxValue: 50 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(typeof res.body.error.message).toBe("string");
    expect(res.body.error.message.length).toBeGreaterThan(0);

    const stored = await prisma.template.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(stored.name).toBe(VALID_TEMPLATE.name);
  });
});

describe("GET /templates", () => {
  it("TEST-02.9a returns both templates to a Manager, ordered by id ascending", async () => {
    const first = await request(app).post("/templates").set("Cookie", managerCookie).send(VALID_TEMPLATE);
    const second = await request(app)
      .post("/templates")
      .set("Cookie", managerCookie)
      .send({ name: "Cycling", unit: "km", minValue: 0, maxValue: 100 });

    const res = await request(app).get("/templates").set("Cookie", managerCookie);

    expect(res.status).toBe(200);
    expect(res.body.map((t: { id: number }) => t.id)).toEqual([first.body.id, second.body.id]);
  });

  it("TEST-02.9b returns both templates to a Participant", async () => {
    await request(app).post("/templates").set("Cookie", managerCookie).send(VALID_TEMPLATE);
    await request(app)
      .post("/templates")
      .set("Cookie", managerCookie)
      .send({ name: "Cycling", unit: "km", minValue: 0, maxValue: 100 });

    const res = await request(app).get("/templates").set("Cookie", participantCookie);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });
});

// Lab 7 (Issue #65): per-template back-dating limit, F-02 contract v1.7 §5.1.
// Templates with a limit are created through POST /templates and backdateDays is
// read from API responses, so this file runs unchanged on the pre-change schema.
type TemplateBody = { id: number; backdateDays?: number | null; createdById: number };

async function listTemplates(cookie: string): Promise<TemplateBody[]> {
  const res = await request(app).get("/templates").set("Cookie", cookie);
  expect(res.status).toBe(200);
  return res.body as TemplateBody[];
}

async function listedTemplate(id: number, cookie = managerCookie): Promise<TemplateBody | undefined> {
  return (await listTemplates(cookie)).find((t) => t.id === id);
}

describe("Lab 7 back-dating limit: create (AC-02.21)", () => {
  it("TEST-02.21a creates a template with backdateDays 7 and GET shows 7", async () => {
    const res = await request(app)
      .post("/templates")
      .set("Cookie", managerCookie)
      .send({ ...VALID_TEMPLATE, backdateDays: 7 });

    expect(res.status).toBe(201);
    expect(res.body.backdateDays).toBe(7);
    expect(await listedTemplate(res.body.id)).toHaveProperty("backdateDays", 7);
  });

  it("TEST-02.21b accepts the limits 0 and 30", async () => {
    const zero = await request(app)
      .post("/templates")
      .set("Cookie", managerCookie)
      .send({ ...VALID_TEMPLATE, backdateDays: 0 });
    const thirty = await request(app)
      .post("/templates")
      .set("Cookie", managerCookie)
      .send({ ...VALID_TEMPLATE, name: "Cycling", backdateDays: 30 });

    expect(zero.status).toBe(201);
    expect(thirty.status).toBe(201);
    expect(await listedTemplate(zero.body.id)).toHaveProperty("backdateDays", 0);
    expect(await listedTemplate(thirty.body.id)).toHaveProperty("backdateDays", 30);
  });

  it("TEST-02.21c stores null when the key is left out or sent as null", async () => {
    const withoutKey = await request(app).post("/templates").set("Cookie", managerCookie).send(VALID_TEMPLATE);
    const withNull = await request(app)
      .post("/templates")
      .set("Cookie", managerCookie)
      .send({ ...VALID_TEMPLATE, name: "Cycling", backdateDays: null });

    expect(withoutKey.status).toBe(201);
    expect(withoutKey.body).toHaveProperty("backdateDays", null);
    expect(withNull.status).toBe(201);
    expect(withNull.body).toHaveProperty("backdateDays", null);
    expect(await listedTemplate(withoutKey.body.id)).toHaveProperty("backdateDays", null);
    expect(await listedTemplate(withNull.body.id)).toHaveProperty("backdateDays", null);
  });
});

describe("Lab 7 back-dating limit: invalid values (AC-02.22)", () => {
  const INVALID_VALUES: unknown[] = [-1, 31, 2.5, "7", true];

  it("TEST-02.22a rejects -1, 31, 2.5, \"7\" and true on POST and stores nothing", async () => {
    for (const backdateDays of INVALID_VALUES) {
      const res = await request(app)
        .post("/templates")
        .set("Cookie", managerCookie)
        .send({ ...VALID_TEMPLATE, backdateDays });

      expect(res.status, `backdateDays ${JSON.stringify(backdateDays)}`).toBe(400);
      expect(res.body.error).toEqual({ code: "VALIDATION_ERROR", message: "Invalid template fields." });
    }
    await expect(prisma.template.count()).resolves.toBe(0);
  });

  it("TEST-02.22b rejects -1, 31, 2.5 and \"7\" on PUT and leaves the limit at 7", async () => {
    const created = await request(app)
      .post("/templates")
      .set("Cookie", managerCookie)
      .send({ ...VALID_TEMPLATE, backdateDays: 7 });
    expect(created.status).toBe(201);

    for (const backdateDays of [-1, 31, 2.5, "7"]) {
      const res = await request(app)
        .put(`/templates/${created.body.id}`)
        .set("Cookie", managerCookie)
        .send({ ...VALID_TEMPLATE, backdateDays });

      expect(res.status, `backdateDays ${JSON.stringify(backdateDays)}`).toBe(400);
      expect(res.body.error).toEqual({ code: "VALIDATION_ERROR", message: "Invalid template id or fields." });
    }
    expect(await listedTemplate(created.body.id)).toHaveProperty("backdateDays", 7);
  });
});

describe("Lab 7 back-dating limit: update (AC-02.23)", () => {
  it("TEST-02.23a changes the limit from 7 to 3, keeps createdById, and GET shows 3", async () => {
    const created = await request(app)
      .post("/templates")
      .set("Cookie", managerCookie)
      .send({ ...VALID_TEMPLATE, backdateDays: 7 });
    expect(created.status).toBe(201);

    const res = await request(app)
      .put(`/templates/${created.body.id}`)
      .set("Cookie", managerCookie)
      .send({ ...VALID_TEMPLATE, backdateDays: 3 });

    expect(res.status).toBe(200);
    expect(res.body.backdateDays).toBe(3);
    expect(res.body.createdById).toBe(manager.id);
    expect(await listedTemplate(created.body.id)).toHaveProperty("backdateDays", 3);
  });

  it("TEST-02.23b clears the limit with a PUT without the key and with backdateDays null", async () => {
    const first = await request(app)
      .post("/templates")
      .set("Cookie", managerCookie)
      .send({ ...VALID_TEMPLATE, backdateDays: 3 });
    expect(first.status).toBe(201);
    const clearedByOmission = await request(app)
      .put(`/templates/${first.body.id}`)
      .set("Cookie", managerCookie)
      .send(VALID_TEMPLATE);

    const second = await request(app)
      .post("/templates")
      .set("Cookie", managerCookie)
      .send({ ...VALID_TEMPLATE, name: "Cycling", backdateDays: 5 });
    expect(second.status).toBe(201);
    const clearedByNull = await request(app)
      .put(`/templates/${second.body.id}`)
      .set("Cookie", managerCookie)
      .send({ ...VALID_TEMPLATE, name: "Cycling", backdateDays: null });

    expect(clearedByOmission.status).toBe(200);
    expect(clearedByNull.status).toBe(200);
    expect(await listedTemplate(first.body.id)).toHaveProperty("backdateDays", null);
    expect(await listedTemplate(second.body.id)).toHaveProperty("backdateDays", null);
  });
});

describe("Lab 7 back-dating limit: list (AC-02.24)", () => {
  it("TEST-02.24 returns backdateDays for every template to a Manager and a Participant", async () => {
    const limited = await request(app)
      .post("/templates")
      .set("Cookie", managerCookie)
      .send({ ...VALID_TEMPLATE, backdateDays: 7 });
    const unlimited = await request(app)
      .post("/templates")
      .set("Cookie", managerCookie)
      .send({ ...VALID_TEMPLATE, name: "Cycling" });
    expect(limited.status).toBe(201);
    expect(unlimited.status).toBe(201);

    for (const cookie of [managerCookie, participantCookie]) {
      expect(await listedTemplate(limited.body.id, cookie)).toHaveProperty("backdateDays", 7);
      expect(await listedTemplate(unlimited.body.id, cookie)).toHaveProperty("backdateDays", null);
    }
  });
});

describe("Lab 7 back-dating limit: Manager only (AC-02.25)", () => {
  it("TEST-02.25a rejects a Participant POST with backdateDays with 403 and stores nothing", async () => {
    const res = await request(app)
      .post("/templates")
      .set("Cookie", participantCookie)
      .send({ ...VALID_TEMPLATE, backdateDays: 7 });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    await expect(prisma.template.count()).resolves.toBe(0);
  });

  it("TEST-02.25b rejects a Participant PUT with backdateDays with 403 and the limit stays null", async () => {
    const created = await request(app).post("/templates").set("Cookie", managerCookie).send(VALID_TEMPLATE);
    expect(created.status).toBe(201);

    const res = await request(app)
      .put(`/templates/${created.body.id}`)
      .set("Cookie", participantCookie)
      .send({ ...VALID_TEMPLATE, backdateDays: 1 });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(await listedTemplate(created.body.id)).toHaveProperty("backdateDays", null);
  });
});
