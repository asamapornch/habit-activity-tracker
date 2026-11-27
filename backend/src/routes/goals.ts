import { Router } from "express";
import type { Goal, GoalRevision } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { sendError } from "../lib/errors.js";
import { requireRole } from "../middleware/auth.js";
import { effectiveOn, type EffectiveRevision } from "../lib/goalRevisions.js";
import { todayInBangkok } from "../lib/today.js";
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
const REVISION_KEYS = ["dailyTarget", "endDate"] as const;

interface GoalInput {
  templateId: number;
  dailyTarget: number;
  startDate: Date;
  endDate: Date;
}

interface RevisionInput {
  dailyTarget?: number;
  endDate?: Date;
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

function toRevisionLike(revision: GoalRevision): EffectiveRevision {
  return {
    id: revision.id,
    dailyTarget: revision.dailyTarget,
    endDate: formatDateOnly(revision.endDate),
    effectiveFrom: formatDateOnly(revision.effectiveFrom),
  };
}

/** F-06 §2.6/§3.4: the currently effective dailyTarget/endDate, not necessarily the stored row. */
function toEffectiveGoalResponse(goal: Goal, revisions: GoalRevision[], today: string) {
  const goalLike = { dailyTarget: goal.dailyTarget, endDate: formatDateOnly(goal.endDate) };
  const revisionList = revisions.map(toRevisionLike);
  return {
    id: goal.id,
    userId: goal.userId,
    templateId: goal.templateId,
    dailyTarget: effectiveOn(goalLike, revisionList, today, "dailyTarget"),
    startDate: formatDateOnly(goal.startDate),
    endDate: effectiveOn(goalLike, revisionList, today, "endDate"),
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

/**
 * F-06 §2 step 3 / field rules: a non-empty object with only `dailyTarget`
 * and/or `endDate` (at least one, not both absent, no other key).
 */
function parseRevisionInput(body: unknown): RevisionInput | null {
  if (!isPlainObject(body)) return null;
  const keys = Object.keys(body);
  if (keys.length === 0 || keys.length > REVISION_KEYS.length) return null;
  if (!keys.every((key) => (REVISION_KEYS as readonly string[]).includes(key))) return null;

  const result: RevisionInput = {};
  if ("dailyTarget" in body) {
    if (!isTwoDecimalNumber(body.dailyTarget)) return null;
    result.dailyTarget = body.dailyTarget;
  }
  if ("endDate" in body) {
    const endDate = parseDateOnly(body.endDate);
    if (!endDate) return null;
    result.endDate = endDate;
  }
  return result;
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
    const today = todayInBangkok();
    const goals = await prisma.goal.findMany({
      where: { userId: req.session.userId! },
      orderBy: { id: "asc" },
      include: { revisions: true },
    });
    res.status(200).json(goals.map((goal) => toEffectiveGoalResponse(goal, goal.revisions, today)));
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
    const goal = await prisma.goal.findFirst({
      where: { id, userId: req.session.userId! },
      include: { revisions: true },
    });
    if (!goal) {
      sendError(res, 404, "NOT_FOUND", "Goal not found.");
      return;
    }

    res.status(200).json(toEffectiveGoalResponse(goal, goal.revisions, todayInBangkok()));
  } catch (err) {
    next(err);
  }
});

class RevisionConflictError extends Error {}

/**
 * F-06: revise an own goal's dailyTarget and/or endDate, effective today
 * (Asia/Bangkok). Check order per contract §2 step 2: 401 -> 403 -> 400
 * (id/body shape) -> 404 (ownership) -> BR-10 target range -> BR-10
 * end-date floors (today -> start -> latest entry) -> BR-04 overlap.
 */
goalsRouter.patch("/goals/:id", requireRole("PARTICIPANT"), async (req, res, next) => {
  try {
    const id = parseIdParam(req.params.id);
    if (id === null) {
      sendError(res, 400, "VALIDATION_ERROR", "Invalid goal id.");
      return;
    }
    const input = parseRevisionInput(req.body);
    if (!input) {
      sendError(res, 400, "VALIDATION_ERROR", "Invalid goal revision fields.");
      return;
    }

    const userId = req.session.userId!;
    const goal = await prisma.goal.findFirst({
      where: { id, userId },
      include: { revisions: true },
    });
    if (!goal) {
      sendError(res, 404, "NOT_FOUND", "Goal not found.");
      return;
    }

    const today = todayInBangkok();
    const goalLike = { dailyTarget: goal.dailyTarget, endDate: formatDateOnly(goal.endDate) };
    const revisionList = goal.revisions.map(toRevisionLike);
    const currentTarget = effectiveOn(goalLike, revisionList, today, "dailyTarget") as number;
    const currentEndDate = effectiveOn(goalLike, revisionList, today, "endDate") as string;

    // BR-10 target range (current template range, SRS D-06), only if given.
    if (input.dailyTarget !== undefined) {
      const template = await prisma.template.findUniqueOrThrow({ where: { id: goal.templateId } });
      const target = round2(input.dailyTarget);
      if (target < round2(template.minValue) || target > round2(template.maxValue)) {
        sendError(res, 400, "VALIDATION_ERROR", "Daily target must be within the template range.");
        return;
      }
    }

    // BR-10 end-date floors, only if endDate given: today -> start -> latest entry.
    let newEndDate = currentEndDate;
    if (input.endDate !== undefined) {
      newEndDate = formatDateOnly(input.endDate);
      if (newEndDate < today) {
        sendError(res, 400, "VALIDATION_ERROR", "New end date must not be before today.");
        return;
      }
      if (newEndDate < formatDateOnly(goal.startDate)) {
        sendError(
          res,
          400,
          "VALIDATION_ERROR",
          "New end date must not be before the goal's start date.",
        );
        return;
      }
      const latestEntry = await prisma.entry.findFirst({
        where: { goalId: goal.id },
        orderBy: { date: "desc" },
      });
      if (latestEntry && newEndDate < formatDateOnly(latestEntry.date)) {
        sendError(
          res,
          400,
          "VALIDATION_ERROR",
          "New end date must not be before the goal's latest entry date.",
        );
        return;
      }
    }

    const newTarget = input.dailyTarget !== undefined ? round2(input.dailyTarget) : currentTarget;

    try {
      const revision = await prisma.$transaction(async (tx) => {
        // BR-04 re-check, only if endDate changed: serialise per (user, template) as POST /goals does.
        if (input.endDate !== undefined) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(${userId}::int, ${goal.templateId}::int)`;
          const overlapping = await tx.goal.findFirst({
            where: {
              id: { not: goal.id },
              userId,
              templateId: goal.templateId,
              startDate: { lte: input.endDate },
              endDate: { gte: goal.startDate },
            },
          });
          if (overlapping) throw new RevisionConflictError();
        }

        return tx.goalRevision.create({
          data: {
            goalId: goal.id,
            dailyTarget: newTarget,
            endDate: parseDateOnly(newEndDate)!,
            effectiveFrom: parseDateOnly(today)!,
          },
        });
      });

      res.status(200).json({
        id: goal.id,
        userId: goal.userId,
        templateId: goal.templateId,
        dailyTarget: revision.dailyTarget,
        startDate: formatDateOnly(goal.startDate),
        endDate: formatDateOnly(revision.endDate),
      });
    } catch (err) {
      if (err instanceof RevisionConflictError) {
        sendError(
          res,
          409,
          "CONFLICT",
          "You already have a goal for this template that overlaps these dates.",
        );
        return;
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
});
