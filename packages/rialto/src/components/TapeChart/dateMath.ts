/** Shared date utilities for TapeChart. All dates are YYYY-MM-DD strings treated as UTC-anchored for arithmetic. */

const MS_PER_DAY = 86400000;

/** Parse YYYY-MM-DD → UTC-midnight ms. Defaults malformed parts to 1970-01-01 rather than throwing. */
export function parseISOMs(iso: string): number {
  const parts = iso.split("-");
  const y = Number(parts[0] ?? "1970");
  const m = Number(parts[1] ?? "1");
  const d = Number(parts[2] ?? "1");
  return Date.UTC(y, m - 1, d);
}

/** Whole days between two ISO dates (b - a). Rounds to avoid DST drift. */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseISOMs(b) - parseISOMs(a)) / MS_PER_DAY);
}

/** Add n days (positive or negative) to an ISO date and return an ISO date. */
export function addDays(iso: string, n: number): string {
  return new Date(parseISOMs(iso) + n * MS_PER_DAY).toISOString().slice(0, 10);
}

/** UTC-based Date from ISO — useful for Intl formatters that honor a timeZone option. */
export function parseISODate(iso: string): Date {
  return new Date(parseISOMs(iso));
}

/** YYYY-MM month key of an ISO date. */
export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}
