import { WEEKDAYS, type ServiceDate, type Weekday } from "./types.js";

/**
 * Pure civil-date arithmetic on "YYYY-MM-DD" strings. Every computation goes
 * through `Date.UTC` and `getUTC*`, so the process time zone never leaks in.
 */

const MS_PER_DAY = 86_400_000;

function toUtcMs(date: ServiceDate): number {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const d = Number(date.slice(8, 10));
  return Date.UTC(y, m - 1, d);
}

function fromUtcMs(ms: number): ServiceDate {
  return new Date(ms).toISOString().slice(0, 10);
}

/** `date` shifted by `n` calendar days (negative moves backwards). */
export function addDays(date: ServiceDate, n: number): ServiceDate {
  return fromUtcMs(toUtcMs(date) + n * MS_PER_DAY);
}

/** The weekday named by the date's digits. */
export function weekdayOf(date: ServiceDate): Weekday {
  const sundayFirst = new Date(toUtcMs(date)).getUTCDay();
  // getUTCDay is 0..6, so the index is always in range.
  return WEEKDAYS[(sundayFirst + 6) % 7] as Weekday;
}

/** The stored weekday number of the date: 0 = Sunday … 6 = Saturday. */
export function weekdayIndexOf(date: ServiceDate): number {
  return new Date(toUtcMs(date)).getUTCDay();
}
