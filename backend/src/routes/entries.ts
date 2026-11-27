import { Router, type Request, type Response } from "express";
import { Prisma, type Entry, type Goal } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { sendError } from "../lib/errors.js";
import { requireRole } from "../middleware/auth.js";
import { todayInBangkok } from "../lib/today.js";
import { effectiveOn, type EffectiveRevision } from "../lib/goalRevisions.js";
import {
  formatDateOnly,
  hasExactKeys,
  isPlainObject,
  isTwoDecimalNumber,
  parseDateOnly,
  parseIdParam,
  round2,
} from "../lib/validation.js";

export const entriesRouter = Router();

const ENTRY_KEYS = ["date", "value"] as const;
const DAY_MS = 24 * 60 * 60 * 1000;
const DUPLICATE_MESSAGE = "An entry already exists for this date.";

function toEntryResponse(entry: Entry) {
  return {
    id: entry.id,
    goalId: entry.goalId,
    date: formatDateOnly(entry.date),
    value: entry.value,
  };
}

/**
 * Steps 3 and 4 of the F-04 check order for the goal id: 400 malformed id,
 * then 404 for a goal that is missing or not the caller's (same response, BR-08).
 * Sends the error and returns null on failure.
 */
async function findOwnGoal(req: Request, res: Response, id: number | null): Promise<Goal | null> {
  if (id === null) {
    sendError(res, 400, "VALIDATION_ERROR", "Invalid goal id.");
    return null;
  }
  const goal = await prisma.goal.findFirst({ where: { id, userId: req.session.userId! } });
  if (!goal) {
    sendError(res, 404, "NOT_FOUND", "Goal not found.");
    return null;
  }
  return goal;
}

/** F-06 §3.4: a goal's revisions, shaped for effectiveOn(). */
async function fetchRevisionList(goalId: number): Promise<EffectiveRevision[]> {
  const revisions = await prisma.goalRevision.findMany({ where: { goalId } });
  return revisions.map((r) => ({
    id: r.id,
    dailyTarget: r.dailyTarget,
    endDate: formatDateOnly(r.endDate),
    effectiveFrom: formatDateOnly(r.effectiveFrom),
  }));
}

function parseEntryInput(body: unknown): { date: Date; value: number } | null {
  if (!isPlainObject(body) || !hasExactKeys(body, ENTRY_KEYS)) return null;
  const date = parseDateOnly(body.date);
  if (!date || !isTwoDecimalNumber(body.value)) return null;
  return { date, value: body.value };
}

entriesRouter.post("/goals/:id/entries", requireRole("PARTICIPANT"), async (req, res, next) => {
  try {
    // Step 3: id format and body shape both answer 400 before any lookup.
    const id = parseIdParam(req.params.id);
    if (id === null) {
      sendError(res, 400, "VALIDATION_ERROR", "Invalid goal id.");
      return;
    }
    const input = parseEntryInput(req.body);
    if (!input) {
      sendError(res, 400, "VALIDATION_ERROR", "Invalid entry fields.");
      return;
    }

    const goal = await findOwnGoal(req, res, id);
    if (!goal) return;

    // The goal's template, read once: its current back-dating limit (BR-03, SRS D-12)
    // and its current range (BR-02, SRS D-06).
    const template = await prisma.template.findUniqueOrThrow({ where: { id: goal.templateId } });

    // BR-03: future first, then the template's back-dating limit (F-04 v1.5), then the goal's dates.
    const date = formatDateOnly(input.date);
    const today = todayInBangkok();
    if (date > today) {
      sendError(res, 400, "VALIDATION_ERROR", "Entry date must not be in the future.");
      return;
    }
    if (template.backdateDays !== null) {
      const earliest = formatDateOnly(new Date(parseDateOnly(today)!.getTime() - template.backdateDays * DAY_MS));
      if (date < earliest) {
        sendError(res, 400, "VALIDATION_ERROR", `Entry date must not be earlier than ${earliest}.`);
        return;
      }
    }
    // Review fix (warunwora, F-06 v1.4): the goal's end date *in effect
    // today* (§3.2), not the stored endDate column - a revision extending
    // (or shortening) the end must apply here too.
    const entryRevisions = await fetchRevisionList(goal.id);
    const entryGoalLike = { dailyTarget: goal.dailyTarget, endDate: formatDateOnly(goal.endDate) };
    const effectiveGoalEnd = effectiveOn(entryGoalLike, entryRevisions, today, "endDate") as string;
    if (date < formatDateOnly(goal.startDate) || date > effectiveGoalEnd) {
      sendError(res, 400, "VALIDATION_ERROR", "Entry date must be within the goal's start and end dates.");
      return;
    }

    // BR-02: the template's current range (SRS D-06), compared at two decimals (D-07).
    const value = round2(input.value);
    if (value < round2(template.minValue) || value > round2(template.maxValue)) {
      sendError(res, 400, "VALIDATION_ERROR", "Value must be within the template range.");
      return;
    }

    // BR-01: API check first; the unique (goalId, date) constraint backs it up under races.
    const existing = await prisma.entry.findUnique({
      where: { goalId_date: { goalId: goal.id, date: input.date } },
    });
    if (existing) {
      sendError(res, 409, "CONFLICT", DUPLICATE_MESSAGE);
      return;
    }

    const entry = await prisma.entry.create({
      data: { goalId: goal.id, date: input.date, value: input.value },
    });
    res.status(201).json(toEntryResponse(entry));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      sendError(res, 409, "CONFLICT", DUPLICATE_MESSAGE);
      return;
    }
    next(err);
  }
});

entriesRouter.get("/goals/:id/entries", requireRole("PARTICIPANT"), async (req, res, next) => {
  try {
    const goal = await findOwnGoal(req, res, parseIdParam(req.params.id));
    if (!goal) return;

    const entries = await prisma.entry.findMany({
      where: { goalId: goal.id },
      orderBy: { date: "asc" },
    });
    res.status(200).json(entries.map(toEntryResponse));
  } catch (err) {
    next(err);
  }
});

entriesRouter.get("/goals/:id/progress", requireRole("PARTICIPANT"), async (req, res, next) => {
  try {
    const goal = await findOwnGoal(req, res, parseIdParam(req.params.id));
    if (!goal) return;

    // BR-09 (SRS D-10): days from start to the earlier of today and end, both
    // inclusive. Review fix (warunwora, F-06 v1.4): "end" is the end date in
    // effect today (§3.2), not the stored endDate column.
    const today = todayInBangkok();
    const start = formatDateOnly(goal.startDate);
    const revisions = await fetchRevisionList(goal.id);
    const goalLike = { dailyTarget: goal.dailyTarget, endDate: formatDateOnly(goal.endDate) };
    const end = effectiveOn(goalLike, revisions, today, "endDate") as string;
    const lastDay = today < end ? today : end;

    let daysElapsed = 0;
    let daysMet = 0;
    if (lastDay >= start) {
      const lastDate = parseDateOnly(lastDay)!;
      daysElapsed = Math.round((lastDate.getTime() - goal.startDate.getTime()) / DAY_MS) + 1;
      const entries = await prisma.entry.findMany({
        where: { goalId: goal.id, date: { gte: goal.startDate, lte: lastDate } },
      });
      // F-06 §3.2: the target in effect on each entry's own date, not one
      // scalar comparison. A goal with no revisions falls through to
      // goal.dailyTarget for every entry, so this reproduces the Sprint-1
      // comparison exactly when unrevised.
      daysMet = entries.filter((e) => {
        const targetOnDate = round2(
          effectiveOn(goalLike, revisions, formatDateOnly(e.date), "dailyTarget") as number,
        );
        return round2(e.value) >= targetOnDate;
      }).length;
    }

    const progress = daysElapsed === 0 ? 0 : round2((daysMet / daysElapsed) * 100);
    res.status(200).json({ goalId: goal.id, today, daysElapsed, daysMet, progress });
  } catch (err) {
    next(err);
  }
});
