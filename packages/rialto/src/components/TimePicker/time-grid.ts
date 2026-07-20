/**
 * Pure helpers for the {@link TimePicker}. Times cross the public boundary as
 * 24h `HH:mm` strings only — these helpers convert to/from minutes-since-
 * midnight for arithmetic and produce locale-aware display labels via `Intl`.
 *
 * Zero-padded `HH:mm` strings sort lexicographically the same as chronologically,
 * so bound comparisons use plain string `<`/`>`.
 */

const MINUTES_PER_DAY = 24 * 60;

/** Parse an `HH:mm` string into minutes since midnight, or `null` when invalid. */
export function parseTime(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Format minutes since midnight as a zero-padded `HH:mm` string. */
export function toTimeString(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * Build a full day of `HH:mm` slots at `stepMinutes` intervals, from `00:00`
 * up to (but never including) `24:00`. A non-positive step is clamped to 1.
 */
export function buildTimeSlots(stepMinutes: number): string[] {
  const step = Math.max(1, Math.floor(stepMinutes));
  const slots: string[] = [];
  for (let minute = 0; minute < MINUTES_PER_DAY; minute += step) {
    slots.push(toTimeString(minute));
  }
  return slots;
}

/**
 * Locale-aware display of an `HH:mm` string via `Intl`. Storage always stays
 * `HH:mm`; this is presentation only. Returns `""` for an invalid value.
 */
export function formatTimeDisplay(value: string, locale?: string): string {
  const minutes = parseTime(value);
  if (minutes === null) return "";
  const date = new Date(Date.UTC(1970, 0, 1, Math.floor(minutes / 60), minutes % 60));
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

/** Bounds/predicate inputs shared by the slot-disabled check. */
export interface TimeBounds {
  /** Earliest selectable time (`HH:mm`, inclusive). */
  min?: string;
  /** Latest selectable time (`HH:mm`, inclusive). */
  max?: string;
  /**
   * Predicate deciding whether a time is disabled. When supplied it is
   * authoritative and wins over `min`/`max`.
   */
  isTimeDisabled?: (time: string) => boolean;
}

/**
 * Decide whether a slot is disabled. When `isTimeDisabled` is supplied it is
 * authoritative and `min`/`max` are ignored; otherwise the inclusive bounds
 * apply.
 */
export function isTimeSlotDisabled(
  value: string,
  { min, max, isTimeDisabled }: TimeBounds
): boolean {
  if (isTimeDisabled) return isTimeDisabled(value);
  if (min && value < min) return true;
  if (max && value > max) return true;
  return false;
}
