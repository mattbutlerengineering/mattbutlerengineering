import { addDays, weekdayIndexOf } from "@mbe/availability";
import type { DateRule } from "@mbe/types";

/**
 * The dates a date rule really reaches, for the hub's rows: a rule's own range and weekdays, less
 * the dates another rule replaces it on. A skip removes a series date; a one-date edit replaces
 * it (`series-edit.ts`, `dateOverride`). Both point at the series through `seriesId`.
 */

/** How far ahead a rule's next date is looked for: a year, so a weekly rule is always found. */
const LOOKAHEAD_DAYS = 366;

/** Whether the rule's own range and weekdays reach `date`, before any replacement. */
function reaches(rule: DateRule, date: string): boolean {
  return (
    rule.startsOn <= date &&
    (rule.endsOn == null || date <= rule.endsOn) &&
    (rule.repeat == null || rule.repeat.weekdays.includes(weekdayIndexOf(date)))
  );
}

/** A skip or a one-date edit stands for its one date when it stores no end. */
function replacesOn(override: DateRule, date: string): boolean {
  return override.startsOn <= date && date <= (override.endsOn ?? override.startsOn);
}

function overridesOf(rule: DateRule, rules: readonly DateRule[]): readonly DateRule[] {
  return rules.filter((r) => r.seriesId === rule.id);
}

/** Whether the rule applies on `date`: it reaches the date and no other rule replaces it there. */
export function coversOn(rule: DateRule, rules: readonly DateRule[], date: string): boolean {
  return reaches(rule, date) && !overridesOf(rule, rules).some((o) => replacesOn(o, date));
}

/** The first date on or after `from` the rule applies on; `null` when it has none left. */
export function nextDateOn(
  rule: DateRule,
  rules: readonly DateRule[],
  from: string
): string | null {
  const overrides = overridesOf(rule, rules);
  const start = from > rule.startsOn ? from : rule.startsOn;
  for (let i = 0; i < LOOKAHEAD_DAYS; i += 1) {
    const date = addDays(start, i);
    if (rule.endsOn != null && date > rule.endsOn) return null;
    if (reaches(rule, date) && !overrides.some((o) => replacesOn(o, date))) return date;
  }
  return null;
}
