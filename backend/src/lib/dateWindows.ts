// F-08 §2.4 (SRS D-18): the ISO week and calendar month containing a date,
// as YYYY-MM-DD strings (unclipped - callers clip to the goal's own bounds).
import { formatDateOnly, parseDateOnly } from "./validation.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Monday-to-Sunday ISO week containing `date` (YYYY-MM-DD). */
export function isoWeekRange(date: string): { start: string; end: string } {
  const d = parseDateOnly(date)!;
  const dayOfWeek = d.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  const monday = new Date(d.getTime() - daysSinceMonday * DAY_MS);
  const sunday = new Date(monday.getTime() + 6 * DAY_MS);
  return { start: formatDateOnly(monday), end: formatDateOnly(sunday) };
}

/** Calendar month (first to last day) containing `date` (YYYY-MM-DD). */
export function monthRange(date: string): { start: string; end: string } {
  const d = parseDateOnly(date)!;
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const first = new Date(Date.UTC(year, month, 1));
  const last = new Date(Date.UTC(year, month + 1, 0));
  return { start: formatDateOnly(first), end: formatDateOnly(last) };
}
