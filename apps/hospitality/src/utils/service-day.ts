/**
 * Service-day clock — the one place the app decides what "today" is.
 *
 * Two policies for choosing a day, neither of which is UTC (the UTC-keyed `toDateString`
 * from `@mbe/types` rolls to tomorrow at 17:00 Pacific and emptied the dashboard and grid):
 *
 * - **Device** (`deviceDate`, `deviceHour`, `isDeviceToday`, `addDays`-based ranges): which
 *   night staff screens open on. The Host stands in the venue, so the device calendar day
 *   picks the service night (ux.md decision (a)). The E2E harness re-dates fixtures with the
 *   same rule (`e2e/local-day.ts`). This only selects a date; every time shown *on* a staff
 *   screen is rendered on the venue's clock via `useVenueFormat` (localization architecture,
 *   "Accepted behaviour changes").
 * - **Venue** (`venueDate`, `venueWallClock`): guest-facing booking flows, read on the venue's
 *   IANA zone. An absent or unresolvable zone falls back to the device policy, never UTC.
 */

const DAY_LOCALE = "en-CA"; // formats as YYYY-MM-DD

/** Device calendar day as `YYYY-MM-DD`; `""` for an invalid Date (never throws). */
export function deviceDate(now: Date): string {
  return Number.isNaN(now.getTime()) ? "" : now.toLocaleDateString(DAY_LOCALE);
}

/** Device hour of day, 0–23 (`NaN` for an invalid Date). */
export function deviceHour(now: Date): number {
  return now.getHours();
}

/** True when `date` (`YYYY-MM-DD`) is the device calendar day of `now`; false on any invalid input. */
export function isDeviceToday(date: string, now: Date): boolean {
  const today = deviceDate(now);
  return today !== "" && date === today;
}

/**
 * `now`'s calendar day as `YYYY-MM-DD` in the venue's IANA zone. Falls back to the device day
 * when the zone is omitted or the runtime cannot resolve it.
 */
export function venueDate(now: Date, timeZone?: string): string {
  if (!timeZone) return deviceDate(now);
  try {
    return now.toLocaleDateString(DAY_LOCALE, { timeZone });
  } catch {
    return deviceDate(now);
  }
}

/** `YYYY-MM-DD` shifted by `days` calendar days (zone-free, DST-safe); `""` for malformed input. */
export function addDays(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(shifted.getTime())) return "";
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

export interface VenueWallClock {
  /** Lower-case English weekday name, e.g. `"monday"`. */
  readonly weekday: string;
  /** Minutes since venue-local midnight. */
  readonly nowMin: number;
}

/**
 * Minutes since midnight of `instant` on the venue's clock. Falls back to the device clock when
 * the zone is omitted or unresolvable. The one source for placing times on the timeline grid, so
 * block positions, the now-line and their labels share a zone.
 */
export function minutesOfDayIn(instant: Date, timeZone?: string): number {
  const clock = timeZone ? venueWallClock(timeZone, instant) : null;
  return clock ? clock.nowMin : instant.getHours() * 60 + instant.getMinutes();
}

/** Venue-local weekday and minute of `now`; `null` when the zone cannot be resolved. */
export function venueWallClock(timeZone: string, now: Date): VenueWallClock | null {
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
    const weekday = get("weekday")?.toLowerCase();
    const hour = Number(get("hour"));
    const minute = Number(get("minute"));
    if (!weekday || !Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return { weekday, nowMin: hour * 60 + minute };
  } catch {
    return null;
  }
}
