/**
 * A service's three times as the fields hold them: "HH:mm" strings (rialto `TimePicker`), `null`
 * while one is not typed yet. A close (or last seating) earlier than the opening runs past
 * midnight. Pure: no React, and no form's draft model.
 */

/** Opens, last seating and closes, with whether last seating still follows the close. */
export interface LinkedTimes {
  readonly opens: string | null;
  readonly lastSeating: string | null;
  readonly closes: string | null;
  /** While true, last seating follows close minus {@link LAST_SEATING_LEAD_MINUTES}. */
  readonly lastSeatingLinked: boolean;
}

export type TimeField = "opens" | "lastSeating" | "closes";

const LAST_SEATING_LEAD_MINUTES = 45;
const MINUTES_PER_DAY = 1440;

export function toMinutes(hhmm: string): number {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function toClock(minutes: number): string {
  const wrapped = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hh = String(Math.floor(wrapped / 60)).padStart(2, "0");
  const mm = String(wrapped % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Last seating that follows a close: close minus the lead time, e.g. 22:00 → 21:15. With the
 * opening known, a service shorter than the lead seats at its opening, not before it; a close
 * earlier than the opening is the next day's.
 */
export function autoLastSeating(closes: string, opens: string | null = null): string {
  const lead = toMinutes(closes) - LAST_SEATING_LEAD_MINUTES;
  if (opens === null) return toClock(lead);
  const opensAt = toMinutes(opens);
  const closesAfter = toMinutes(closes) <= opensAt ? MINUTES_PER_DAY : 0;
  return toClock(Math.max(lead + closesAfter, opensAt));
}

/** Editing close keeps a linked last seating in step; editing last seating unlinks it. */
export function setServiceTime<T extends LinkedTimes>(
  service: T,
  field: TimeField,
  value: string | null
): T {
  if (field === "lastSeating") return { ...service, lastSeating: value, lastSeatingLinked: false };
  const next = { ...service, [field]: value };
  // Both ends bound a linked last seating, so moving either one keeps it in step.
  if (!service.lastSeatingLinked) return next;
  return {
    ...next,
    lastSeating: next.closes === null ? null : autoLastSeating(next.closes, next.opens),
  };
}
