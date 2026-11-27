import { Router } from "express";
import type { ReminderSchedule } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { sendError } from "../lib/errors.js";
import { requireRole } from "../middleware/auth.js";
import { effectiveOn } from "../lib/goalRevisions.js";
import { todayInBangkok } from "../lib/today.js";
import { formatDateOnly, hasExactKeys, isPlainObject, parseDateOnly, parseIdParam } from "../lib/validation.js";

// F-09 Reminder schedules (contract v1.2). Nothing is delivered: the schedule is only
// stored and shown (SRS §2.3). Check order on the goal routes (§2.1): 401 -> 403 ->
// 400 id/body shape -> 404 goal (BR-08) -> 400 BR-13 at least one weekday.

export const remindersRouter = Router();

const REMINDER_KEYS = ["weekdays", "time"] as const;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 7;

interface ReminderInput {
  weekdays: number[];
  time: string;
}

/** Body shape only (§2.4 field rules). An empty weekdays array passes here; BR-13 rejects it later. */
function parseReminderInput(body: unknown): ReminderInput | null {
  if (!isPlainObject(body) || !hasExactKeys(body, REMINDER_KEYS)) return null;
  const { weekdays, time } = body;
  if (!Array.isArray(weekdays)) return null;
  if (!weekdays.every((d) => typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= 6)) return null;
  if (new Set(weekdays).size !== weekdays.length) return null;
  if (typeof time !== "string" || !TIME_PATTERN.test(time)) return null;
  return { weekdays: weekdays as number[], time };
}

function toReminderResponse(schedule: ReminderSchedule) {
  return { goalId: schedule.goalId, weekdays: [...schedule.weekdays].sort((a, b) => a - b), time: schedule.time };
}

/** Same 404 for a goal that does not exist and another Participant's goal (BR-08). */
async function findOwnGoalId(goalId: number, userId: number) {
  const goal = await prisma.goal.findFirst({ where: { id: goalId, userId }, select: { id: true } });
  return goal?.id ?? null;
}

remindersRouter.put("/goals/:id/reminder", requireRole("PARTICIPANT"), async (req, res, next) => {
  try {
    const id = parseIdParam(req.params.id);
    if (id === null) {
      sendError(res, 400, "VALIDATION_ERROR", "Invalid goal id.");
      return;
    }
    const input = parseReminderInput(req.body);
    if (!input) {
      sendError(res, 400, "VALIDATION_ERROR", "Invalid reminder fields.");
      return;
    }
    if ((await findOwnGoalId(id, req.session.userId!)) === null) {
      sendError(res, 404, "NOT_FOUND", "Goal not found.");
      return;
    }
    // BR-13: at least one weekday (a business rule, its own message; §2.1 step 5).
    if (input.weekdays.length === 0) {
      sendError(res, 400, "VALIDATION_ERROR", "At least one weekday is required.");
      return;
    }

    const weekdays = [...input.weekdays].sort((a, b) => a - b);
    // D-20: one schedule per goal, PUT replaces it wholesale (unique goalId backs this up).
    const schedule = await prisma.reminderSchedule.upsert({
      where: { goalId: id },
      create: { goalId: id, weekdays, time: input.time },
      update: { weekdays, time: input.time },
    });
    res.status(200).json(toReminderResponse(schedule));
  } catch (err) {
    next(err);
  }
});

remindersRouter.get("/goals/:id/reminder", requireRole("PARTICIPANT"), async (req, res, next) => {
  try {
    const id = parseIdParam(req.params.id);
    if (id === null) {
      sendError(res, 400, "VALIDATION_ERROR", "Invalid goal id.");
      return;
    }
    if ((await findOwnGoalId(id, req.session.userId!)) === null) {
      sendError(res, 404, "NOT_FOUND", "Goal not found.");
      return;
    }
    const schedule = await prisma.reminderSchedule.findUnique({ where: { goalId: id } });
    if (!schedule) {
      sendError(res, 404, "NOT_FOUND", "No reminder schedule set for this goal.");
      return;
    }
    res.status(200).json(toReminderResponse(schedule));
  } catch (err) {
    next(err);
  }
});

remindersRouter.delete("/goals/:id/reminder", requireRole("PARTICIPANT"), async (req, res, next) => {
  try {
    const id = parseIdParam(req.params.id);
    if (id === null) {
      sendError(res, 400, "VALIDATION_ERROR", "Invalid goal id.");
      return;
    }
    if ((await findOwnGoalId(id, req.session.userId!)) === null) {
      sendError(res, 404, "NOT_FOUND", "Goal not found.");
      return;
    }
    // D-21: idempotent, 204 whether or not a schedule existed.
    await prisma.reminderSchedule.deleteMany({ where: { goalId: id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

/**
 * Slice 2 (FR-14): every (goal, date, time) in today .. today+6 (Asia/Bangkok) that falls on a
 * scheduled weekday and inside the goal's startDate .. end date in effect today (BR-13, F-06 §3.2).
 */
remindersRouter.get("/reminders/upcoming", requireRole("PARTICIPANT"), async (req, res, next) => {
  try {
    const today = todayInBangkok();
    const todayDate = parseDateOnly(today)!;
    const days = Array.from({ length: WINDOW_DAYS }, (_, i) => new Date(todayDate.getTime() + i * DAY_MS));

    const goals = await prisma.goal.findMany({
      where: { userId: req.session.userId!, reminder: { isNot: null } },
      include: { reminder: true, revisions: true },
    });

    const instances: { goalId: number; date: string; time: string }[] = [];
    for (const goal of goals) {
      const schedule = goal.reminder!;
      const goalLike = { dailyTarget: goal.dailyTarget, endDate: formatDateOnly(goal.endDate) };
      const revisions = goal.revisions.map((r) => ({
        id: r.id,
        dailyTarget: r.dailyTarget,
        endDate: formatDateOnly(r.endDate),
        effectiveFrom: formatDateOnly(r.effectiveFrom),
      }));
      const start = formatDateOnly(goal.startDate);
      const end = effectiveOn(goalLike, revisions, today, "endDate") as string;
      for (const day of days) {
        const date = formatDateOnly(day);
        if (date < start || date > end) continue;
        if (!schedule.weekdays.includes(day.getUTCDay())) continue;
        instances.push({ goalId: goal.id, date, time: schedule.time });
      }
    }

    instances.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.goalId - b.goalId);
    res.status(200).json(instances);
  } catch (err) {
    next(err);
  }
});
