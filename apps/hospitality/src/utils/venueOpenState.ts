import type { DaySchedule, OperatingHours } from "@mbe/types";
import { hasOperatingHours } from "../components/booking-widget/hasOperatingHours.js";

export type Weekday = keyof OperatingHours; // "monday" … "sunday"
/** Venue-local wall-clock, validated "HH:MM" (00:00–23:59). */
export type LocalTime = string;

export type VenueOpenState =
  | { readonly state: "open"; readonly closesAt: LocalTime }
  | { readonly state: "opening-soon"; readonly opensAt: LocalTime }
  | {
      readonly state: "closed";
      readonly opensAt: LocalTime;
      /** `null` = later today. */
      readonly opensOn: Weekday | null;
    }
  | { readonly state: "unset" };

export interface DeriveVenueOpenStateInput {
  readonly operatingHours: OperatingHours | null | undefined;
  readonly ianaTimezone: string | null | undefined;
  readonly now: Date;
  /** Lead window for `opening-soon`, inclusive. @default 60 */
  readonly openingSoonMinutes?: number;
}

/** Ordered so that `Intl`'s long weekday name, lower-cased, indexes it. */
const WEEKDAYS: readonly Weekday[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const DAYS_PER_WEEK = WEEKDAYS.length;
const MINUTES_PER_DAY = 24 * 60;
const DEFAULT_OPENING_SOON_MINUTES = 60;
const LOCAL_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const UNSET: VenueOpenState = { state: "unset" };

/** One day's usable trading window, in venue-local minutes. */
interface DayWindow {
  readonly open: number;
  readonly close: number;
  readonly overnight: boolean;
  readonly opensAt: LocalTime;
  readonly closesAt: LocalTime;
}

interface VenueDay {
  readonly weekday: Weekday;
  readonly window: DayWindow | null;
}

interface VenueClock {
  /** Index into `WEEKDAYS`. */
  readonly day: number;
  /** Minutes since venue-local midnight. */
  readonly nowMin: number;
}

/**
 * Read the venue-local weekday and minute of `now` in `timeZone`.
 * `null` when the runtime cannot resolve the zone (`RangeError`).
 */
function readVenueClock(timeZone: string, now: Date): VenueClock | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const get = (type: string): string | undefined =>
      parts.find((part) => part.type === type)?.value;
    const day = WEEKDAYS.indexOf(get("weekday")?.toLowerCase() as Weekday);
    const hour = Number(get("hour"));
    const minute = Number(get("minute"));
    if (day < 0 || !Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return { day, nowMin: hour * 60 + minute };
  } catch {
    return null;
  }
}

function toMinutes(hhmm: string): number | null {
  if (!LOCAL_TIME_PATTERN.test(hhmm)) return null;
  const [hours = 0, minutes = 0] = hhmm.split(":").map(Number);
  return hours * 60 + minutes;
}

/** `null` when the day is missing, closed, malformed, or zero-length. */
function toWindow(schedule: DaySchedule | undefined): DayWindow | null {
  if (schedule == null || schedule.closed === true) return null;
  const open = toMinutes(schedule.open);
  const close = toMinutes(schedule.close);
  if (open === null || close === null || open === close) return null;
  return { open, close, overnight: close < open, opensAt: schedule.open, closesAt: schedule.close };
}

/**
 * Derive whether a venue is trading at the instant `now`, read on the
 * venue's own clock — never the caller's.
 *
 * Windows are half-open `[open, close)`; a `close` earlier than `open`
 * spills into the next day. `null` means "render no sign": the zone is
 * not a usable IANA name.
 */
export function deriveVenueOpenState(input: DeriveVenueOpenStateInput): VenueOpenState | null {
  const {
    operatingHours,
    ianaTimezone,
    now,
    openingSoonMinutes = DEFAULT_OPENING_SOON_MINUTES,
  } = input;

  // `Intl` silently falls back to the machine zone for `undefined` — gate first.
  if (typeof ianaTimezone !== "string" || ianaTimezone.length === 0) return null;
  const clock = readVenueClock(ianaTimezone, now);
  if (clock === null) return null;

  if (!hasOperatingHours(operatingHours)) return UNSET;

  const days: readonly VenueDay[] = WEEKDAYS.map((weekday) => ({
    weekday,
    window: toWindow(operatingHours?.[weekday]),
  }));
  if (days.every(({ window }) => window === null)) return UNSET;

  const { day, nowMin } = clock;
  const today = days[day]?.window ?? null;
  if (today !== null) {
    const inDaytimeWindow = !today.overnight && today.open <= nowMin && nowMin < today.close;
    const inOvernightEvening = today.overnight && nowMin >= today.open;
    if (inDaytimeWindow || inOvernightEvening) return { state: "open", closesAt: today.closesAt };
  }

  const yesterday = days[(day + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK]?.window ?? null;
  if (yesterday !== null && yesterday.overnight && nowMin < yesterday.close) {
    return { state: "open", closesAt: yesterday.closesAt };
  }

  for (let offset = 0; offset <= DAYS_PER_WEEK; offset += 1) {
    const candidate = days[(day + offset) % DAYS_PER_WEEK];
    if (candidate === undefined || candidate.window === null) continue;
    if (offset === 0 && candidate.window.open <= nowMin) continue;
    const lead = offset * MINUTES_PER_DAY + candidate.window.open - nowMin;
    if (lead <= openingSoonMinutes) {
      return { state: "opening-soon", opensAt: candidate.window.opensAt };
    }
    return {
      state: "closed",
      opensAt: candidate.window.opensAt,
      opensOn: offset === 0 ? null : candidate.weekday,
    };
  }

  // Invariant: at least one window exists (checked above), so the loop always
  // returns within one week. This line is unreachable.
  return UNSET;
}
