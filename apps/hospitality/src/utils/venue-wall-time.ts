import { resolveTimeZone } from "./format.js";
import { minutesOfDayIn } from "./service-day.js";

/** Milliseconds `timeZone` is ahead of UTC at `instantMs` (negative west of Greenwich). */
function zoneOffsetMs(instantMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(instantMs));
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value);
  const wallAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );
  return wallAsUtc - Math.floor(instantMs / 1000) * 1000;
}

/**
 * The instant at which the venue's wall clock reads `date` (`YYYY-MM-DD`) + `hhmm` (`HH:MM`).
 * DST-correct: the offset is the one in force on that date. A wall time that does not exist
 * (spring-forward gap) or occurs twice (fall-back) resolves to one of its valid instants, never
 * throws. A missing or unresolvable zone falls back to the device clock.
 */
export function venueWallTimeToInstant(date: string, hhmm: string, timeZone?: string): Date {
  const zone = resolveTimeZone(timeZone);
  if (!zone) return new Date(`${date}T${hhmm}:00`);
  const wallAsUtc = Date.parse(`${date}T${hhmm}:00Z`);
  // One pass lands within an hour of the answer; the second corrects across a DST edge.
  const first = wallAsUtc - zoneOffsetMs(wallAsUtc, zone);
  return new Date(wallAsUtc - zoneOffsetMs(first, zone));
}

/** An instant as the venue's `HH:MM`, the value shape of `<input type="time">`. */
export function wallTimeInputValue(isoString: string, timeZone?: string): string {
  const minutes = minutesOfDayIn(new Date(isoString), resolveTimeZone(timeZone));
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}
