import { addDays, weekdayIndexOf } from "./civil-date.js";
import type { ServiceDate } from "./types.js";

/** The dates a rule can cover: its range and, when it repeats, its weekdays (0 = Sunday). */
export interface OccurrenceRule {
  readonly startsOn: ServiceDate;
  readonly endsOn?: ServiceDate | null;
  readonly repeat?: { readonly weekdays: readonly number[] } | null;
}

/**
 * The earliest service date on or after `from` that the rule covers, or `null`
 * when it has none left. A rule that started in the past is judged from `from`,
 * not from its `startsOn`, and a repeating one lands on its next listed weekday.
 */
export function firstOccurrenceOnOrAfter(
  rule: OccurrenceRule,
  from: ServiceDate
): ServiceDate | null {
  const start = rule.startsOn > from ? rule.startsOn : from;
  // A weekly repeat recurs within 7 days; no listed weekday means it never does.
  const horizon = rule.repeat == null ? 1 : 7;
  for (let i = 0; i < horizon; i += 1) {
    const date = addDays(start, i);
    if (rule.endsOn != null && date > rule.endsOn) return null;
    if (rule.repeat == null || rule.repeat.weekdays.includes(weekdayIndexOf(date))) return date;
  }
  return null;
}
