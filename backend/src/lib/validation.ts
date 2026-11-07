// Shared input checks for goal and entry routes (F-03, F-04).

// Postgres's `integer` (int4) max; larger ids would surface as a 500.
export const MAX_POSTGRES_INT4 = 2147483647;

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function hasExactKeys(body: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(body);
  return actual.length === keys.length && keys.every((key) => actual.includes(key));
}

/** A JSON integer from 1 to 2147483647. */
export function isPositiveIntId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_POSTGRES_INT4;
}

/** `:id` path parameter: digits only, 1 to 2147483647. */
export function parseIdParam(raw: string): number | null {
  if (!/^[1-9]\d*$/.test(raw)) return null;
  const value = Number(raw);
  return value > MAX_POSTGRES_INT4 ? null : value;
}

/**
 * Finite JSON number with at most two decimal places (SRS A-05). Compares
 * against the value rounded to two decimals, so 0.07 and 1.15 pass while
 * 5.123 fails (a naive `x * 100 % 1` check rejects 0.07 and 1.15).
 */
export function isTwoDecimalNumber(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number((Math.round(value * 100) / 100).toFixed(2)) === value
  );
}

/** Rounds to two decimals for comparisons (SRS D-07). */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Exactly `YYYY-MM-DD` and a real calendar date; returns a UTC-midnight Date. */
export function parseDateOnly(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || formatDateOnly(date) !== value) return null;
  return date;
}

export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}
