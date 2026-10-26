import type { ClosureSummary, DateRule } from "@mbe/types";

export type SpecialDatesFilter = "all" | "closures" | "special_hours" | "repeating" | "past";

export type SpecialDateRule = Extract<DateRule, { kind: "closure" | "special_hours" }>;

export interface SpecialDateRow {
  readonly rule: SpecialDateRule;
  readonly past: boolean;
}

const isSpecialDate = (rule: DateRule): rule is SpecialDateRule =>
  rule.kind === "closure" || rule.kind === "special_hours";

/** An open-ended rule ("until I reopen") is never past. */
const isPast = (rule: DateRule, today: string): boolean =>
  rule.endsOn != null && rule.endsOn < today;

const matches = (row: SpecialDateRow, filter: SpecialDatesFilter): boolean => {
  switch (filter) {
    case "all":
      return !row.past;
    case "past":
      return row.past;
    case "closures":
      return !row.past && row.rule.kind === "closure";
    case "special_hours":
      return !row.past && row.rule.kind === "special_hours";
    case "repeating":
      return !row.past && row.rule.repeat != null;
  }
};

/**
 * Every closure and special-hours date for the Special dates tab (ux.md F6), upcoming first;
 * `past` lists the ones already over, most recent first. Tonight changes, skips and
 * schedule assignments are not special dates.
 */
export function specialDateRows(
  rules: readonly DateRule[],
  today: string,
  filter: SpecialDatesFilter
): SpecialDateRow[] {
  const rows = rules
    .filter(isSpecialDate)
    .map((rule) => ({ rule, past: isPast(rule, today) }))
    .filter((row) => matches(row, filter));
  const byStart = (a: SpecialDateRow, b: SpecialDateRow) =>
    a.rule.startsOn.localeCompare(b.rule.startsOn);
  return [...rows].sort(filter === "past" ? (a, b) => byStart(b, a) : byStart);
}

/** The date the day editor opens on for a special-hours row: its first date not yet past. */
export function hoursEditDate(rule: DateRule, today: string): string {
  return rule.startsOn > today ? rule.startsOn : today;
}

/**
 * Outcomes whose refunds a retry can still touch (`failed` or `pending`) but whose rule
 * has no row: a reopened closure, or a Tonight close-early that ended. They keep a retry
 * path because outcomes are keyed by the rule id, not by the rule still existing.
 */
export function orphanRefundRules(
  summaries: readonly ClosureSummary[],
  listedRuleIds: readonly string[]
): ClosureSummary[] {
  return summaries.filter(
    (s) => s.refundFailed + s.refundPending > 0 && !listedRuleIds.includes(s.ruleId)
  );
}
