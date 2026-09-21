/**
 * The runner's local calendar day, and wall-clock instants on it.
 *
 * Both are **functions**, deliberately: a `const localToday = new Date().toLocaleDateString(...)`
 * at module or `describe` scope is evaluated when Playwright *collects* the file, which can be
 * minutes before the test body runs. A run that straddles local midnight then computes one day at
 * import and a different one at request time, and the spec breaks for a reason nothing in it
 * names (#5279 item 3). Call these at use time instead.
 *
 * `en-CA` formats as `YYYY-MM-DD`, and the local day is the day the app itself filters on —
 * `src/utils/local-clock.ts` `localDateString` is the twin of `localDay()` inside the app.
 */

const LOCAL_DAY_LOCALE = "en-CA"; // formats as YYYY-MM-DD

/** Local calendar day as `YYYY-MM-DD`, `offsetDays` whole days from now (calendar, DST-safe). */
export function localDay(offsetDays = 0): string {
  const day = new Date();
  day.setDate(day.getDate() + offsetDays);
  return day.toLocaleDateString(LOCAL_DAY_LOCALE);
}

/**
 * The instant at local wall-clock `time` (`HH:MM`, `HH:MM:SS` or `HH:MM:SS.mmm`) on `day`, as an
 * ISO string. No `Z`: the string is parsed in the runner's zone, so `atLocal("18:00")` is 6 PM
 * where the test runs — which is where the timeline grid positions it (`start.getHours()`).
 *
 * "Local" here is **Node's** zone: route handlers and fixture builders run in the test process,
 * while the assertions run in the browser. The two agree because Playwright defaults a context's
 * timezone to the system one. A spec that sets `test.use({ timezoneId })` breaks that agreement
 * and will read these instants at the wrong hour — pin the clock with `page.clock`, not the zone.
 */
export function atLocal(time: string, day: string = localDay()): string {
  return new Date(`${day}T${time}`).toISOString();
}
