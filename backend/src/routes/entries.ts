import { Router, type Request, type Response } from "express";
import { Prisma, type Entry, type Goal } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { sendError } from "../lib/errors.js";
import { requireRole } from "../middleware/auth.js";
import { todayInBangkok } from "../lib/today.js";
import { effectiveOn, type EffectiveRevision } from "../lib/goalRevisions.js";
import { isoWeekRange, monthRange } from "../lib/dateWindows.js";
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

/** F-06 §3.4: a goal's revisions, shaped for effectiveOn(). Shared by BR-09 progress and F-08 summaries. */
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
    if (date < formatDateOnly(goal.startDate) || date > formatDateOnly(goal.endDate)) {
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

    // BR-09 (SRS D-10): days from start to the earlier of today and end, both inclusive.
    const today = todayInBangkok();
    const start = formatDateOnly(goal.startDate);
    const end = formatDateOnly(goal.endDate);
    const lastDay = today < end ? today : end;

    let daysElapsed = 0;
    let daysMet = 0;
    if (lastDay >= start) {
      const lastDate = parseDateOnly(lastDay)!;
      daysElapsed = Math.round((lastDate.getTime() - goal.startDate.getTime()) / DAY_MS) + 1;
      const entries = await prisma.entry.findMany({
        where: { goalId: goal.id, date: { gte: goal.startDate, lte: lastDate } },
      });
      // F-06 §3.2 (BR-09 change, planned there): the target in effect on
      // each entry's own date, not one scalar comparison. A goal with no
      // revisions falls through to goal.dailyTarget for every entry, so
      // this reproduces the Sprint-1 comparison exactly when unrevised.
      const revisions = await fetchRevisionList(goal.id);
      const goalLike = { dailyTarget: goal.dailyTarget, endDate: formatDateOnly(goal.endDate) };
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

interface SummaryWindow {
  start: string;
  end: string;
  daysRecorded: number;
  daysMet: number;
  total: number;
  average: number;
}

/** F-08 §2.4/§2.5: one window (week or month), clipped to [goal.startDate, lastDay]. */
function computeWindow(
  naturalStart: string,
  naturalEnd: string,
  goalStart: string,
  lastDay: string,
  entries: Entry[],
  goalLike: { dailyTarget: number; endDate: string },
  revisions: EffectiveRevision[],
): SummaryWindow {
  const windowStart = naturalStart > goalStart ? naturalStart : goalStart;
  const windowEnd = naturalEnd < lastDay ? naturalEnd : lastDay;

  if (windowStart > windowEnd) {
    return { start: windowStart, end: windowEnd, daysRecorded: 0, daysMet: 0, total: 0, average: 0 };
  }

  const inWindow = entries.filter((e) => {
    const date = formatDateOnly(e.date);
    return date >= windowStart && date <= windowEnd;
  });

  let total = 0;
  let daysMet = 0;
  for (const entry of inWindow) {
    const value = round2(entry.value);
    total = round2(total + value);
    const targetOnDate = round2(
      effectiveOn(goalLike, revisions, formatDateOnly(entry.date), "dailyTarget") as number,
    );
    if (value >= targetOnDate) daysMet += 1;
  }
  const daysRecorded = inWindow.length;
  const average = daysRecorded === 0 ? 0 : round2(total / daysRecorded);

  return { start: windowStart, end: windowEnd, daysRecorded, daysMet, total, average };
}

/**
 * F-08: the current week's and month's figures for an own goal. Check
 * order per contract §2 step 2: 401 -> 403 -> 400 (id) -> 404 (ownership).
 */
entriesRouter.get("/goals/:id/summary", requireRole("PARTICIPANT"), async (req, res, next) => {
  try {
    const goal = await findOwnGoal(req, res, parseIdParam(req.params.id));
    if (!goal) return;

    const today = todayInBangkok();
    const goalStart = formatDateOnly(goal.startDate);
    const goalEnd = formatDateOnly(goal.endDate);
    const lastDay = today < goalEnd ? today : goalEnd;

    const entries = await prisma.entry.findMany({ where: { goalId: goal.id } });
    const revisions = await fetchRevisionList(goal.id);
    const goalLike = { dailyTarget: goal.dailyTarget, endDate: goalEnd };

    const week = isoWeekRange(lastDay);
    const month = monthRange(lastDay);

    res.status(200).json({
      goalId: goal.id,
      week: computeWindow(week.start, week.end, goalStart, lastDay, entries, goalLike, revisions),
      month: computeWindow(month.start, month.end, goalStart, lastDay, entries, goalLike, revisions),
    });
  } catch (err) {
    next(err);
  }
});
