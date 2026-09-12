/**
 * Browser-local calendar facts — the one place the app reads "today" and "this hour".
 *
 * The venue's IANA zone is deliberately not consulted (ux.md decision (a)): the Host stands in
 * the venue, so the device clock is the service-night clock. The E2E harness re-dates its
 * fixtures with the same call (`e2e/api-mocks.ts` `todayReservations()`) so app and mock agree
 * on every runner. The UTC-keyed `toDateString` from `@mbe/types` rolls to tomorrow at 17:00
 * Pacific and is what emptied the grid mid-service (audit A1).
 */

const LOCAL_DAY_LOCALE = "en-CA"; // formats as YYYY-MM-DD

function isValidDate(now: Date): boolean {
  return !Number.isNaN(now.getTime());
}

/** Local calendar day as `YYYY-MM-DD`; `""` for an invalid Date (never throws). */
export function localDateString(now: Date): string {
  return isValidDate(now) ? now.toLocaleDateString(LOCAL_DAY_LOCALE) : "";
}

/** Local hour of day, 0–23 (`NaN` for an invalid Date). */
export function localHour(now: Date): number {
  return now.getHours();
}

/** True when `date` (`YYYY-MM-DD`) is the local calendar day of `now`; false on any invalid input. */
export function isLocalToday(date: string, now: Date): boolean {
  const today = localDateString(now);
  return today !== "" && date === today;
}
