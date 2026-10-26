import { addDays, resolveDay, weekdayIndexOf } from "@mbe/availability";
import type { AvailabilityConfig, DateRule } from "@mbe/types";
import type { EditScope } from "./draft-changes.js";

/**
 * Which service dates an edit reaches, mirroring how the server settles a save
 * (`availability-config-plan.ts`): an open end is settled 366 days out, and "everywhere a
 * schedule is used" looks at the week alone, with date rules set aside.
 */

/** How far past its start an open-ended scope is counted; the server's horizon. */
export const SCOPE_HORIZON_DAYS = 366;

interface ScopeContext {
  readonly config: AvailabilityConfig;
  readonly timezone: string;
  /** Today on the venue clock. */
  readonly today: string;
}

function eachDate(from: string, to: string, step: number): string[] {
  const dates: string[] = [];
  for (let d = from; d <= to; d = addDays(d, step)) dates.push(d);
  return dates;
}

export function scopeDates(scope: EditScope, context: ScopeContext): string[] {
  if (scope.kind === "date") return [scope.date];
  if (scope.kind === "weekday") {
    const horizon = addDays(scope.from, SCOPE_HORIZON_DAYS - 1);
    const last = scope.until !== null && scope.until < horizon ? scope.until : horizon;
    return eachDate(scope.from, last, 7);
  }
  const week = {
    timezone: context.timezone,
    config: { ...context.config, dateRules: [] },
  };
  return eachDate(context.today, addDays(context.today, SCOPE_HORIZON_DAYS - 1), 1).filter(
    (d) => resolveDay(week, d).scheduleId === scope.scheduleId
  );
}

const isHoursRule = (rule: DateRule): boolean =>
  (rule.kind === "special_hours" || rule.kind === "use_schedule") && rule.seriesId == null;

function coversDate(rule: DateRule, date: string): boolean {
  return (
    rule.startsOn <= date &&
    (rule.endsOn == null || date <= rule.endsOn) &&
    (rule.repeat == null || rule.repeat.weekdays.includes(weekdayIndexOf(date)))
  );
}

/**
 * The dates among `dates` that already have their own hours change, apart from the rule being
 * edited (`ignoreRuleId`) and dates a skip row already took out of a rule. These are the dates
 * the "Keep theirs / Replace them" choice is about.
 */
export function ownChangeDates(
  config: AvailabilityConfig,
  dates: readonly string[],
  ignoreRuleId: string | null
): string[] {
  const skipped = new Set(
    config.dateRules.filter((r) => r.kind === "skip").map((r) => `${r.seriesId}@${r.startsOn}`)
  );
  const rules = config.dateRules.filter((r) => isHoursRule(r) && r.id !== ignoreRuleId);
  return dates.filter((date) =>
    rules.some((rule) => coversDate(rule, date) && !skipped.has(`${rule.id}@${date}`))
  );
}
