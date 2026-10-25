import type { DateRule } from "@mbe/types";
import { weekdayIndexOf } from "./civil-date.js";
import { formatMinute } from "./format-minute.js";
import { MINUTES_PER_DAY, type ServiceDate } from "./types.js";

/**
 * Which date rules apply to a service day, and how each one reads in plain
 * words. Pure; the layering itself lives in `resolve-day.ts`.
 */

export type RuleOf<K extends DateRule["kind"]> = Extract<DateRule, { kind: K }>;

/** A whole service day, including a past-midnight tail (ADR-029). */
export const WHOLE_DAY = { from: 0, to: 2 * MINUTES_PER_DAY } as const;

function covers(rule: DateRule, serviceDate: ServiceDate): boolean {
  // A Tonight rule lives exactly one service day, whatever its stored range
  // says, so its expiry needs no clock and no cleanup job.
  if (rule.kind === "tonight") return rule.startsOn === serviceDate;
  // So does a skip or a one-date edit of a series: it never outgrows its date.
  if (rule.seriesId != null) return rule.startsOn === serviceDate;
  return (
    rule.startsOn <= serviceDate &&
    (rule.endsOn == null || serviceDate <= rule.endsOn) &&
    (rule.repeat == null || rule.repeat.weekdays.includes(weekdayIndexOf(serviceDate)))
  );
}

/**
 * The rules in force on `serviceDate`, in stored order. A skip row, or a row
 * that edits one date of a series, takes its series out on its own dates.
 */
export function activeRules(rules: readonly DateRule[], serviceDate: ServiceDate): DateRule[] {
  const onDate = rules.filter((r) => covers(r, serviceDate));
  const replaced = new Set(onDate.flatMap((r) => (r.seriesId == null ? [] : [r.seriesId])));
  return onDate.filter((r) => !replaced.has(r.id));
}

export function ofKind<K extends DateRule["kind"]>(
  rules: readonly DateRule[],
  kind: K
): RuleOf<K>[] {
  return rules.filter((r): r is RuleOf<K> => r.kind === kind);
}

function timeRange(from: number, to: number): string {
  return `${formatMinute(from)} – ${formatMinute(to)}`;
}

/** "Closed", "Lunch closed", "Online booking closed", "Tables blocked". */
export function targetLabel(rule: DateRule, serviceName: string | undefined): string {
  switch (rule.targetKind) {
    case "venue":
      return "Closed";
    case "service":
      return `${serviceName ?? "Service"} closed`;
    case "booking": {
      const types = (rule.bookingTypes ?? []).join(" and ");
      return `${types.charAt(0).toUpperCase()}${types.slice(1)} booking closed`;
    }
    case "tables":
      return "Tables blocked";
  }
}

const WEEKDAY_NAMES = [
  "Sundays",
  "Mondays",
  "Tuesdays",
  "Wednesdays",
  "Thursdays",
  "Fridays",
  "Saturdays",
];

/** "Closed · Mondays · 2027-01-01 – 2027-03-31": a series as "Why this day" names it. */
export function seriesLabel(rule: DateRule, serviceName: string | undefined): string {
  const days = rule.repeat?.weekdays.map((d) => WEEKDAY_NAMES[d]).join(", ");
  const range = `${rule.startsOn} – ${rule.endsOn ?? "until reopened"}`;
  return [targetLabel(rule, serviceName), days, range].filter(Boolean).join(" · ");
}

export function windowEffect(rule: DateRule): string {
  return rule.window ? timeRange(rule.window.from, rule.window.to) : "All day";
}

export function tonightEffect(rule: RuleOf<"tonight">): string {
  const { payload } = rule;
  if ("closeAt" in payload) return `Closes at ${formatMinute(payload.closeAt)}`;
  if ("stop" in payload) return `Stopped ${timeRange(payload.stop.from, payload.stop.to)}`;
  return `Pacing ${payload.pacing.covers} covers`;
}

export function hoursEffect(
  services: readonly { name: string; opensAt: number; closesAt: number }[]
): string {
  return services.length === 0
    ? "Closed"
    : services.map((s) => `${s.name} ${timeRange(s.opensAt, s.closesAt)}`).join(", ");
}
