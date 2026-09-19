import { toDateString } from "@mbe/types";

/**
 * Returns `now`'s date as YYYY-MM-DD in the given IANA timezone (#4981) —
 * the venue's local "today", not the guest's device clock or a UTC
 * midnight boundary. Falls back to `toDateString` (UTC-based) when no
 * timezone is given or the runtime can't resolve it (`RangeError`), which
 * matches the pre-existing "today" definition this component used before
 * venue timezones were threaded in — same pattern as
 * `venueOpenState.ts`'s `readVenueClock`.
 */
export function todayInTimezone(now: Date, timeZone?: string): string {
  if (!timeZone) return toDateString(now);
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const get = (type: string): string | undefined =>
      parts.find((part) => part.type === type)?.value;
    const year = get("year");
    const month = get("month");
    const day = get("day");
    if (!year || !month || !day) return toDateString(now);
    return `${year}-${month}-${day}`;
  } catch {
    return toDateString(now);
  }
}
