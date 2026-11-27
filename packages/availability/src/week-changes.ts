import type { AvailabilityConfig, DateRule, Schedule } from "@mbe/types";
import { addDays } from "./civil-date.js";
import { activeRules, type RuleOf } from "./date-rules.js";
import { firstOccurrenceOnOrAfter } from "./first-occurrence.js";
import type { ServiceDate } from "./types.js";

/**
 * What changes at the venue in the coming week: closures, special hours and switches between
 * schedules that start inside the window. Shared by the app digest and a chat tool, so it returns
 * typed rows only — no text. Pure.
 */

export const WEEK_CHANGES_DAYS = 7;

export type WeekChange =
  | { kind: "closure"; ruleId: string; dates: string[] }
  | { kind: "reopen"; ruleId: string; date: string }
  | { kind: "specialHours"; ruleId: string; dates: string[] }
  | {
      kind: "seasonalStarts";
      scheduleId: string;
      date: string;
      via: "assignment" | "rule";
      ruleId?: string;
    }
  | { kind: "seasonalEnds"; scheduleId: string; date: string }
  | { kind: "regularHours"; scheduleId: string; date: string };

const KIND_RANK: Record<WeekChange["kind"], number> = {
  closure: 0,
  reopen: 1,
  specialHours: 2,
  seasonalStarts: 3,
  seasonalEnds: 4,
  regularHours: 5,
};

/** The rule kinds a week digest lists; `tonight` and `skip` never are. */
type Listed = RuleOf<"closure"> | RuleOf<"special_hours"> | RuleOf<"use_schedule">;

const isListed = (rule: DateRule): rule is Listed =>
  rule.kind === "closure" || rule.kind === "special_hours" || rule.kind === "use_schedule";

interface Window {
  readonly from: ServiceDate;
  readonly to: ServiceDate;
  readonly days: readonly ServiceDate[];
}

const inWindow = (w: Window, date: ServiceDate) => w.from <= date && date <= w.to;

/** Each listed rule with the in-window dates it is in force on, in first-met order. */
function ruleDates(rules: readonly DateRule[], w: Window): Map<Listed, ServiceDate[]> {
  const found = new Map<Listed, ServiceDate[]>();
  for (const date of w.days) {
    for (const rule of activeRules(rules, date).filter(isListed)) {
      found.set(rule, [...(found.get(rule) ?? []), date]);
    }
  }
  return found;
}

const isActive = (rule: DateRule, rules: readonly DateRule[], date: ServiceDate) =>
  activeRules(rules, date).some((r) => r.id === rule.id);

/**
 * The series' first date on or after its start that is not skipped or edited away, walking its
 * own occurrences only and stopping past the window's end.
 */
function firstActiveDate(rule: DateRule, rules: readonly DateRule[], w: Window) {
  let date = firstOccurrenceOnOrAfter(rule, rule.startsOn);
  while (date != null && date <= w.to) {
    if (isActive(rule, rules, date)) return date;
    date = firstOccurrenceOnOrAfter(rule, addDays(date, 1));
  }
  return null;
}

/** A rule counts as a change only when it newly takes effect inside the window. */
function startsInWindow(rule: DateRule, rules: readonly DateRule[], w: Window): boolean {
  if (isActive(rule, rules, addDays(w.from, -1))) return false;
  if (rule.repeat == null || rule.seriesId != null) return true;
  // A series is news once: in the week of its first active occurrence.
  const first = firstActiveDate(rule, rules, w);
  return first != null && inWindow(w, first);
}

/** Only a venue-wide, whole-day closure shuts the venue, and only its end is a reopening. */
const shutsVenue = (rule: DateRule) =>
  rule.kind === "closure" && rule.targetKind === "venue" && rule.window == null;

/** The first day after a one-off venue closure ends that no venue closure shuts, if in the window. */
function reopenDate(rule: DateRule, rules: readonly DateRule[], w: Window): ServiceDate | null {
  if (!shutsVenue(rule) || rule.endsOn == null || rule.repeat != null) return null;
  for (let date = addDays(rule.endsOn, 1); date <= w.to; date = addDays(date, 1)) {
    // The venue reopened before the window: old news.
    if (!activeRules(rules, date).some(shutsVenue)) return date >= w.from ? date : null;
  }
  return null;
}

/** `dates` is never empty: a rule is only met on a day it is in force. */
function ruleChange(rule: Listed, dates: ServiceDate[]): WeekChange {
  switch (rule.kind) {
    case "closure":
      return { kind: "closure", ruleId: rule.id, dates };
    case "special_hours":
      return { kind: "specialHours", ruleId: rule.id, dates };
    case "use_schedule":
      return {
        kind: "seasonalStarts",
        scheduleId: rule.useScheduleId,
        date: dates[0] as ServiceDate,
        via: "rule",
        ruleId: rule.id,
      };
  }
}

function ruleChanges(config: AvailabilityConfig, w: Window, live: Map<string, Schedule>) {
  const rules = config.dateRules;
  const listed = [...ruleDates(rules, w)]
    .filter(([rule]) => startsInWindow(rule, rules, w))
    .filter(([rule]) => rule.kind !== "use_schedule" || live.has(rule.useScheduleId))
    .map(([rule, dates]) => ruleChange(rule, dates));
  const reopens = rules.flatMap((rule): WeekChange[] => {
    const date = reopenDate(rule, rules, w);
    return date == null ? [] : [{ kind: "reopen", ruleId: rule.id, date }];
  });
  return [...listed, ...reopens];
}

function assignmentChanges(config: AvailabilityConfig, w: Window, live: Map<string, Schedule>) {
  return config.assignments.flatMap((a): WeekChange[] => {
    const schedule = live.get(a.scheduleId);
    if (schedule == null) return [];
    const regular = schedule.kind === "regular";
    const starts: WeekChange[] =
      a.startsOn != null && inWindow(w, a.startsOn)
        ? [
            regular
              ? { kind: "regularHours", scheduleId: schedule.id, date: a.startsOn }
              : {
                  kind: "seasonalStarts",
                  scheduleId: schedule.id,
                  date: a.startsOn,
                  via: "assignment",
                },
          ]
        : [];
    const after = a.endsOn == null ? null : addDays(a.endsOn, 1);
    const ends: WeekChange[] =
      !regular && after != null && inWindow(w, after)
        ? [{ kind: "seasonalEnds", scheduleId: schedule.id, date: after }]
        : [];
    return [...starts, ...ends];
  });
}

const firstDate = (c: WeekChange) => ("dates" in c ? (c.dates[0] ?? "") : c.date);
const idOf = (c: WeekChange) =>
  "ruleId" in c && c.ruleId != null ? c.ruleId : "scheduleId" in c ? c.scheduleId : "";

function compare(a: WeekChange, b: WeekChange): number {
  return (
    firstDate(a).localeCompare(firstDate(b)) ||
    KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
    idOf(a).localeCompare(idOf(b))
  );
}

/**
 * The changes starting in `[from, from + days - 1]`, sorted by first date then a fixed kind rank.
 * A rule already in force the day before `from` is not a change; a one-off venue-wide, whole-day
 * closure yields a `reopen` when its first open day falls in the window. A series appears in the
 * week of its first active date. `tonight` and `skip` rules never appear.
 */
export function weekChanges(
  config: AvailabilityConfig,
  from: ServiceDate,
  days: number = WEEK_CHANGES_DAYS
): WeekChange[] {
  const dates = Array.from({ length: Math.max(days, 0) }, (_, i) => addDays(from, i));
  const w: Window = { from, to: addDays(from, days - 1), days: dates };
  const live = new Map(
    config.schedules.filter((s) => s.archivedAt == null).map((s) => [s.id, s] as const)
  );
  return [...ruleChanges(config, w, live), ...assignmentChanges(config, w, live)].sort(compare);
}
