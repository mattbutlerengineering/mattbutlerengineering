import { addDays, weekdayIndexOf } from "@mbe/availability";
import type {
  AvailabilityConfig,
  AvailabilityConfigChanges,
  ClosureAlongside,
  DateRule,
} from "@mbe/types";

/**
 * F-SER (ux.md): changing one date of something that repeats, or the series itself. Pure: each
 * function returns the row operations a config save sends, reusing the engine's own model. A
 * skipped date is a `skip` row pointing at its series (`seriesId`); the series row is never
 * rewritten for a single date. The server's stranded-bookings check still guards every save,
 * and an edit that closes something new (one date, or a series that grows) goes through the
 * closure command.
 */

/** Which dates of the series an edit reaches (ux.md F-SER step 2). */
export type SeriesScope = "following" | "all";

/** What a "This and following" or "All dates" edit can change. */
export interface SeriesEdit {
  readonly weekdays: readonly number[];
  /** `null`: until reopened. */
  readonly endsOn: string | null;
}

/** A special-hours rule: one date, a range, or a repeat. */
export type SpecialHoursRule = Extract<DateRule, { kind: "special_hours" }>;

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

/** The skip or one-date edit that already replaces the series on `date`, if any. */
export function dateOverride(
  rules: readonly DateRule[],
  seriesId: string,
  date: string
): DateRule | undefined {
  return rules.find((r) => r.seriesId === seriesId && r.startsOn === date);
}

/** The skip rows of a series, in date order. */
export function skipRows(rules: readonly DateRule[], seriesId: string): DateRule[] {
  return rules
    .filter((r) => r.kind === "skip" && r.seriesId === seriesId)
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn));
}

/** Dates already skipped out of a series, in order. */
export function skippedDates(rules: readonly DateRule[], seriesId: string): string[] {
  return skipRows(rules, seriesId).map((r) => r.startsOn);
}

/** Restore a skipped date: drop the skip row, so the series closes it again. */
export function restoreDate(skip: DateRule): AvailabilityConfigChanges {
  return { upsert: {}, remove: { dateRules: [skip.id] } };
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
 * Whether the edit can close a date the series did not: a weekday added, or an end moved later
 * (or removed). Only these go through the closure flow; the rest can only reopen dates.
 */
export function growsSeries(series: DateRule, edit: SeriesEdit): boolean {
  const had = series.repeat?.weekdays ?? [];
  const later = series.endsOn != null && (edit.endsOn == null || edit.endsOn > series.endsOn);
  return edit.weekdays.some((d) => !had.includes(d)) || later;
}

/**
 * A growth edit as a closure: the edited series is the draft rule, and the rows it replaces go
 * `alongside` so the server saves both in one transaction. "This and following" ends the original
 * the day before `date`; from the first date (or "All dates") the original is removed and the new
 * series, under a new id, takes over. Later skips and one-date edits move onto the new series.
 */
export function growthClosure(
  config: AvailabilityConfig,
  series: DateRule,
  scope: SeriesScope,
  date: string,
  edit: SeriesEdit,
  makeId: () => string
): { rule: DateRule; alongside: ClosureAlongside } {
  const from = scope === "all" || date <= series.startsOn ? series.startsOn : date;
  const rule: DateRule = { ...withEdit(series, edit), id: makeId(), startsOn: from };
  const moved = config.dateRules
    .filter((r) => r.seriesId === series.id && r.startsOn >= from)
    .map((r) => ({ ...r, seriesId: rule.id }));
  if (from === series.startsOn) return { rule, alongside: { upsert: moved, remove: [series.id] } };
  const ended: DateRule = { ...series, endsOn: addDays(from, -1) };
  return { rule, alongside: { upsert: [ended, ...moved], remove: [] } };
}

/**
 * Change the hours of a range or repeating special-hours rule (ux.md F-SER). "All dates" edits
 * the rule itself. "This and following" ends it the day before `date` and starts a new rule on
 * `date` with the edited hours; from the rule's first date it is the same as "All dates". The
 * server's stranded-bookings check guards the save, so no booking is cancelled silently.
 */
export function editHoursRule(
  rule: SpecialHoursRule,
  scope: SeriesScope,
  date: string,
  payload: SpecialHoursRule["payload"],
  makeId: () => string
): AvailabilityConfigChanges {
  const edited: SpecialHoursRule = { ...rule, payload };
  if (scope === "all" || date <= rule.startsOn) {
    return { upsert: { dateRules: [edited] }, remove: {} };
  }
  const created: SpecialHoursRule = { ...edited, id: makeId(), startsOn: date };
  const ended: SpecialHoursRule = { ...rule, endsOn: addDays(date, -1) };
  return { upsert: { dateRules: [ended, created] }, remove: {} };
}

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
