import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { sendError } from "../lib/errors.js";
import { requireRole } from "../middleware/auth.js";
import { effectiveOn } from "../lib/goalRevisions.js";
import { todayInBangkok } from "../lib/today.js";
import { formatDateOnly, parseDateOnly, parseIdParam, round2 } from "../lib/validation.js";

// F-07 Streaks (contract v1.5). Computed on each request; nothing is stored.
// Check order (§2.2): 401 -> 403 -> 400 id -> 404 goal (BR-08) -> compute.

export const streaksRouter = Router();

const DAY_MS = 24 * 60 * 60 * 1000;

streaksRouter.get("/goals/:id/streaks", requireRole("PARTICIPANT"), async (req, res, next) => {
  try {
    const id = parseIdParam(req.params.id);
    if (id === null) {
      sendError(res, 400, "VALIDATION_ERROR", "Invalid goal id.");
      return;
    }
    const goal = await prisma.goal.findFirst({
      where: { id, userId: req.session.userId! },
      include: { revisions: true },
    });
    if (!goal) {
      sendError(res, 404, "NOT_FOUND", "Goal not found.");
      return;
    }

    const goalLike = { dailyTarget: goal.dailyTarget, endDate: formatDateOnly(goal.endDate) };
    const revisions = goal.revisions.map((r) => ({
      id: r.id,
      dailyTarget: r.dailyTarget,
      endDate: formatDateOnly(r.endDate),
      effectiveFrom: formatDateOnly(r.effectiveFrom),
    }));

    // §2.3 / D-16: lastDay = earlier of today and the end date in effect today (F-06 §3.2).
    const today = todayInBangkok();
    const end = effectiveOn(goalLike, revisions, today, "endDate") as string;
    const lastDay = today < end ? today : end;
    const start = formatDateOnly(goal.startDate);

    let currentStreak = 0;
    let longestStreak = 0;
    if (lastDay >= start) {
      const lastDate = parseDateOnly(lastDay)!;
      const entries = await prisma.entry.findMany({
        where: { goalId: goal.id, date: { gte: goal.startDate, lte: lastDate } },
      });
      // §2.4: met = value >= target in effect on that day, both rounded to 2 decimals.
      const met = new Set<string>();
      const hasEntry = new Set<string>();
      for (const e of entries) {
        const date = formatDateOnly(e.date);
        hasEntry.add(date);
        const target = round2(effectiveOn(goalLike, revisions, date, "dailyTarget") as number);
        if (round2(e.value) >= target) met.add(date);
      }

      const days = Math.round((lastDate.getTime() - goal.startDate.getTime()) / DAY_MS) + 1;
      const dayAt = (i: number) => formatDateOnly(new Date(goal.startDate.getTime() + i * DAY_MS));

      // §2.6: longest run of consecutive met days from startDate to lastDay.
      let run = 0;
      for (let i = 0; i < days; i++) {
        run = met.has(dayAt(i)) ? run + 1 : 0;
        if (run > longestStreak) longestStreak = run;
      }

      // §2.5: anchor = lastDay if it has an entry, otherwise lastDay - 1; walk back while met.
      let i = hasEntry.has(lastDay) ? days - 1 : days - 2;
      while (i >= 0 && met.has(dayAt(i))) {
        currentStreak++;
        i--;
      }
    }

    res.status(200).json({ goalId: goal.id, currentStreak, longestStreak });
  } catch (err) {
    next(err);
  }
});
