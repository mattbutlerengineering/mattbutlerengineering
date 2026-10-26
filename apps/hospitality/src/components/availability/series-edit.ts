import { addDays, weekdayIndexOf } from "@mbe/availability";
import type { AvailabilityConfig, AvailabilityConfigChanges, DateRule } from "@mbe/types";

/**
 * F-SER (ux.md): changing one date of something that repeats, or the series itself. Pure: each
 * function returns the row operations a config save sends, reusing the engine's own model. A
 * skipped date is a `skip` row pointing at its series (`seriesId`); the series row is never
 * rewritten for a single date. The server's stranded-bookings check still guards every save,
 * and a one-date edit that closes something new goes through the closure command.
 */

/** Which dates of the series an edit reaches (ux.md F-SER step 2). */
export type SeriesScope = "following" | "all";

/** What a "This and following" or "All dates" edit can change. */
export interface SeriesEdit {
  readonly weekdays: readonly number[];
  /** `null`: until reopened. */
  readonly endsOn: string | null;
}

/** A repeating closure that is a series in its own right, not an edit of another one. */
export function isSeries(rule: DateRule): boolean {
  return rule.kind === "closure" && rule.repeat != null && rule.seriesId == null;
}

/** Whether the series would close `date`, before any skip. */
export function coversDate(series: DateRule, date: string): boolean {
  return (
    series.startsOn <= date &&
    (series.endsOn == null || date <= series.endsOn) &&
    (series.repeat?.weekdays.includes(weekdayIndexOf(date)) ?? false)
  );
}

/** The first date on or after `from` the series covers, or its own start if none is within a week. */
export function nextOccurrence(series: DateRule, from: string): string {
  const start = from > series.startsOn ? from : series.startsOn;
  for (let i = 0; i < 7; i += 1) {
    const date = addDays(start, i);
    if (coversDate(series, date)) return date;
  }
  return series.startsOn;
}

/** Dates already skipped out of a series, in order. */
export function skippedDates(rules: readonly DateRule[], seriesId: string): string[] {
  return rules
    .filter((r) => r.kind === "skip" && r.seriesId === seriesId)
    .map((r) => r.startsOn)
    .sort();
}

/** Skip one date: the series stays, and that date is bookable as usual. */
export function skipDate(
  series: DateRule,
  date: string,
  makeId: () => string
): AvailabilityConfigChanges {
  const skip: DateRule = {
    id: makeId(),
    kind: "skip",
    targetKind: "venue",
    startsOn: date,
    endsOn: date,
    seriesId: series.id,
  };
  return { upsert: { dateRules: [skip] }, remove: {} };
}

const withEdit = (series: DateRule, edit: SeriesEdit): DateRule => ({
  ...series,
  endsOn: edit.endsOn,
  repeat: { version: 1, weekdays: [...edit.weekdays] },
});

/**
 * Change the series' weekdays and end. "This and following" ends the original the day before
 * `date`, starts a new series on `date` with the edit, and moves the later skips and one-date
 * edits onto it; from the series' first date it is the same as "All dates".
 */
export function editSeriesDates(
  config: AvailabilityConfig,
  series: DateRule,
  scope: SeriesScope,
  date: string,
  edit: SeriesEdit,
  makeId: () => string
): AvailabilityConfigChanges {
  if (scope === "all" || date <= series.startsOn) {
    return { upsert: { dateRules: [withEdit(series, edit)] }, remove: {} };
  }
  const created: DateRule = { ...withEdit(series, edit), id: makeId(), startsOn: date };
  const moved = config.dateRules
    .filter((r) => r.seriesId === series.id && r.startsOn >= date)
    .map((r) => ({ ...r, seriesId: created.id }));
  const ended: DateRule = { ...series, endsOn: addDays(date, -1) };
  return { upsert: { dateRules: [ended, created, ...moved] }, remove: {} };
}
