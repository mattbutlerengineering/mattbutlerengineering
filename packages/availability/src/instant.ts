import { addDays } from "./civil-date.js";
import { MINUTES_PER_DAY, type ServiceDate } from "./types.js";

/**
 * The only crossings between venue wall-clock time and instants. DST-correct:
 * a nonexistent wall time (spring-forward gap) yields `null`, and an ambiguous
 * one (fall-back repeat) resolves to its first occurrence.
 */

const MS_PER_MINUTE = 60_000;
const PROBE_MS = 12 * 60 * MS_PER_MINUTE;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
  const cached = formatters.get(tz);
  if (cached) return cached;
  const created = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  formatters.set(tz, created);
  return created;
}

interface WallFields {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function wallFieldsOf(instantMs: number, tz: string): WallFields {
  const parts = formatterFor(tz).formatToParts(new Date(instantMs));
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
  };
}

/** Offset (wall − UTC) in ms at an instant, at minute precision. */
function offsetAt(instantMs: number, tz: string): number {
  const w = wallFieldsOf(instantMs, tz);
  const wallMs = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
  const flooredInstant = Math.floor(instantMs / MS_PER_MINUTE) * MS_PER_MINUTE;
  return wallMs - flooredInstant;
}

/**
 * The instant at which `serviceDate`'s local midnight + `minute` occurs in
 * `tz`. `minute` may exceed 1440 (past-midnight windows). Returns `null` when
 * that wall time does not exist (spring-forward gap).
 */
export function serviceDayInstant(
  serviceDate: ServiceDate,
  minute: number,
  tz: string
): Date | null {
  const civil = addDays(serviceDate, Math.floor(minute / MINUTES_PER_DAY));
  const wallMs =
    Date.UTC(Number(civil.slice(0, 4)), Number(civil.slice(5, 7)) - 1, Number(civil.slice(8, 10))) +
    (minute % MINUTES_PER_DAY) * MS_PER_MINUTE;
  // Candidate offsets from either side of the wall time; a candidate is real
  // only if the zone actually uses that offset at the resulting instant.
  const offsets = new Set([offsetAt(wallMs - PROBE_MS, tz), offsetAt(wallMs + PROBE_MS, tz)]);
  const valid = [...offsets]
    .map((offset) => wallMs - offset)
    .filter((instantMs) => offsetAt(instantMs, tz) === wallMs - instantMs);
  return valid.length === 0 ? null : new Date(Math.min(...valid));
}

/** The venue-local civil date and minute-of-day of an instant. */
export function localDateTimeOf(instant: Date, tz: string): { date: ServiceDate; minute: number } {
  const w = wallFieldsOf(instant.getTime(), tz);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${String(w.year).padStart(4, "0")}-${pad(w.month)}-${pad(w.day)}`,
    minute: w.hour * 60 + w.minute,
  };
}
