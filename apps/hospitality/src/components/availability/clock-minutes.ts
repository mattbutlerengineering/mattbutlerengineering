import { MINUTES_PER_DAY } from "@mbe/availability";

/**
 * Service-day minutes <-> the 24h `HH:mm` a time picker speaks. A service opens within its
 * service day; its last seating and close may fall past midnight (ADR-029), which the picker
 * cannot express, so a clock earlier than the open means "the next day".
 */

export function toClock(minute: number): string {
  const wrapped = minute % MINUTES_PER_DAY;
  const hh = String(Math.floor(wrapped / 60)).padStart(2, "0");
  const mm = String(wrapped % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function openFromClock(clock: string): number {
  const [hh = "0", mm = "0"] = clock.split(":");
  return Number(hh) * 60 + Number(mm);
}

/** A close at or before the open is the next day's. */
export function closeFromClock(clock: string, opensAt: number): number {
  const minute = openFromClock(clock);
  return minute <= opensAt ? minute + MINUTES_PER_DAY : minute;
}

/** A last seating before the open is the next day's; one at the open is the open itself. */
export function lastSeatingFromClock(clock: string, opensAt: number): number {
  const minute = openFromClock(clock);
  return minute < opensAt ? minute + MINUTES_PER_DAY : minute;
}
