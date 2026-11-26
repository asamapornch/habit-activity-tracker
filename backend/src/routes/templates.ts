import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { sendError } from "../lib/errors.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const templatesRouter = Router();

const REQUIRED_KEYS = ["name", "unit", "minValue", "maxValue"] as const;
// Optional key (F-02 v1.7, SRS D-12): left out means null, the Sprint 1 behaviour.
const OPTIONAL_KEYS = ["backdateDays"] as const;
const MAX_BACKDATE_DAYS = 30;
const MIN_RANGE_VALUE = -1_000_000;
const MAX_RANGE_VALUE = 1_000_000;

interface TemplateInput {
  name: string;
  unit: string;
  minValue: number;
  maxValue: number;
  backdateDays: number | null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasAtMostTwoDecimals(value: number): boolean {
  return Math.round(value * 100) / 100 === value;
}

function isValidRangeValue(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= MIN_RANGE_VALUE &&
    value <= MAX_RANGE_VALUE &&
    hasAtMostTwoDecimals(value)
  );
}

function isValidBackdateDays(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_BACKDATE_DAYS;
}

function parseTemplateInput(body: unknown): TemplateInput | null {
  if (!isPlainObject(body)) return null;

  const keys = Object.keys(body);
  const allowed: readonly string[] = [...REQUIRED_KEYS, ...OPTIONAL_KEYS];
  if (!REQUIRED_KEYS.every((key) => keys.includes(key)) || !keys.every((key) => allowed.includes(key))) {
    return null;
  }

  const { name, unit, minValue, maxValue } = body;
  const backdateDays = body.backdateDays ?? null;
  if (typeof name !== "string" || typeof unit !== "string") return null;

  const trimmedName = name.trim();
  const trimmedUnit = unit.trim();
  if (trimmedName.length < 1 || trimmedName.length > 100) return null;
  if (trimmedUnit.length < 1 || trimmedUnit.length > 20) return null;

  if (!isValidRangeValue(minValue) || !isValidRangeValue(maxValue)) return null;
  if (minValue >= maxValue) return null;

  if (backdateDays !== null && !isValidBackdateDays(backdateDays)) return null;

  return { name: trimmedName, unit: trimmedUnit, minValue, maxValue, backdateDays };
}

// Postgres's `integer` (int4) column max; a larger id would reach the
// database and surface as a 500 instead of a clean 400 (F-02 contract AC-02.8).
const MAX_POSTGRES_INT4 = 2147483647;

function parsePositiveIntId(raw: string): number | null {
  if (!/^[1-9]\d*$/.test(raw)) return null;
  const value = Number(raw);
  if (value > MAX_POSTGRES_INT4) return null;
  return value;
}

templatesRouter.get("/templates", requireAuth, async (_req, res, next) => {
  try {
    const templates = await prisma.template.findMany({ orderBy: { id: "asc" } });
    res.status(200).json(templates);
  } catch (err) {
    next(err);
  }
});

templatesRouter.post("/templates", requireRole("MANAGER"), async (req, res, next) => {
  try {
    const input = parseTemplateInput(req.body);
    if (!input) {
      sendError(res, 400, "VALIDATION_ERROR", "Invalid template fields.");
      return;
    }

    const template = await prisma.template.create({
      data: { ...input, createdById: req.session.userId! },
    });

    res.status(201).json(template);
  } catch (err) {
    next(err);
  }
});

templatesRouter.put("/templates/:id", requireRole("MANAGER"), async (req, res, next) => {
  try {
    const id = parsePositiveIntId(req.params.id);
    const input = parseTemplateInput(req.body);

    if (id === null || !input) {
      sendError(res, 400, "VALIDATION_ERROR", "Invalid template id or fields.");
      return;
    }

    const existing = await prisma.template.findUnique({ where: { id } });
    if (!existing) {
      sendError(res, 404, "NOT_FOUND", "Template not found.");
      return;
    }

    const template = await prisma.template.update({
      where: { id },
      data: input,
    });

    res.status(200).json(template);
  } catch (err) {
    next(err);
  }
});
