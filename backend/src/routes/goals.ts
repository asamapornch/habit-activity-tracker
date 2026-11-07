import { Router } from "express";
import type { Goal } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { sendError } from "../lib/errors.js";
import { requireRole } from "../middleware/auth.js";
import {
  formatDateOnly,
  hasExactKeys,
  isPlainObject,
  isPositiveIntId,
  isTwoDecimalNumber,
  parseDateOnly,
  parseIdParam,
  round2,
} from "../lib/validation.js";

export const goalsRouter = Router();

const GOAL_KEYS = ["templateId", "dailyTarget", "startDate", "endDate"] as const;

interface GoalInput {
  templateId: number;
  dailyTarget: number;
  startDate: Date;
  endDate: Date;
}

export function toGoalResponse(goal: Goal) {
  return {
    id: goal.id,
    userId: goal.userId,
    templateId: goal.templateId,
    dailyTarget: goal.dailyTarget,
    startDate: formatDateOnly(goal.startDate),
    endDate: formatDateOnly(goal.endDate),
  };
}

/** Body shape only (F-03 §2 step 3); rules that need stored data come later. */
function parseGoalInput(body: unknown): GoalInput | null {
  if (!isPlainObject(body) || !hasExactKeys(body, GOAL_KEYS)) return null;

  const { templateId, dailyTarget } = body;
  if (!isPositiveIntId(templateId) || !isTwoDecimalNumber(dailyTarget)) return null;

  const startDate = parseDateOnly(body.startDate);
  const endDate = parseDateOnly(body.endDate);
  if (!startDate || !endDate) return null;

  return { templateId, dailyTarget, startDate, endDate };
}

class OverlapError extends Error {}

goalsRouter.post("/goals", requireRole("PARTICIPANT"), async (req, res, next) => {
  try {
    const input = parseGoalInput(req.body);
    if (!input) {
      sendError(res, 400, "VALIDATION_ERROR", "Invalid goal fields.");
      return;
    }

    const template = await prisma.template.findUnique({ where: { id: input.templateId } });
    if (!template) {
      sendError(res, 404, "NOT_FOUND", "Template not found.");
      return;
    }

    // BR-05: dates first, then target range (current template range, SRS D-06/D-07).
    if (input.endDate < input.startDate) {
      sendError(res, 400, "VALIDATION_ERROR", "End date must not be before start date.");
      return;
    }
    const target = round2(input.dailyTarget);
    if (target < round2(template.minValue) || target > round2(template.maxValue)) {
      sendError(res, 400, "VALIDATION_ERROR", "Daily target must be within the template range.");
      return;
    }

    const userId = req.session.userId!;

    // BR-04: serialise per (user, template), then check overlap and insert (system SDS §3).
    const goal = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${userId}::int, ${input.templateId}::int)`;

      const overlapping = await tx.goal.findFirst({
        where: {
          userId,
          templateId: input.templateId,
          startDate: { lte: input.endDate },
          endDate: { gte: input.startDate },
        },
      });
      if (overlapping) throw new OverlapError();

      return tx.goal.create({ data: { ...input, userId } });
    });

    res.status(201).json(toGoalResponse(goal));
  } catch (err) {
    if (err instanceof OverlapError) {
      sendError(
        res,
        409,
        "CONFLICT",
        "You already have a goal for this template that overlaps these dates.",
      );
      return;
    }
    next(err);
  }
});

goalsRouter.get("/goals", requireRole("PARTICIPANT"), async (req, res, next) => {
  try {
    const goals = await prisma.goal.findMany({
      where: { userId: req.session.userId! },
      orderBy: { id: "asc" },
    });
    res.status(200).json(goals.map(toGoalResponse));
  } catch (err) {
    next(err);
  }
});

goalsRouter.get("/goals/:id", requireRole("PARTICIPANT"), async (req, res, next) => {
  try {
    const id = parseIdParam(req.params.id);
    if (id === null) {
      sendError(res, 400, "VALIDATION_ERROR", "Invalid goal id.");
      return;
    }

    // Another Participant's goal and a missing id give the same 404 (BR-08).
    const goal = await prisma.goal.findFirst({ where: { id, userId: req.session.userId! } });
    if (!goal) {
      sendError(res, 404, "NOT_FOUND", "Goal not found.");
      return;
    }

    res.status(200).json(toGoalResponse(goal));
  } catch (err) {
    next(err);
  }
});
