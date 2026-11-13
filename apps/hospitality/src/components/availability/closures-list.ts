import type { ClosureSummary } from "@mbe/types";
import { isEditableClosure, isPauseInForce } from "./close-draft.js";
import {
  clockOf,
  inForceOn,
  isClosure,
  isOnlinePause,
  targetOf,
  waitingOn,
  type Clock,
  type ClosureRule,
  type ClosuresRowInput,
  type HubClosure,
} from "./hub/hub-closures.js";
import { coversOn } from "./hub/rule-dates.js";
import { isSeries, skipRows } from "./series-edit.js";

/**
 * The Closures and pauses page as facts with no text: every closure of the config, joined to what
 * became of the bookings it touched, in the page's three groups. It reads dates, targets and "in
 * force" as the hub's row 4 does (`hub/hub-closures.ts`), so the two never disagree.
 */

/** What a closure closes and when, as stored. */
export type ClosureFacts = Pick<
  HubClosure,
  "target" | "startsOn" | "endsOn" | "weekdays" | "window"
>;

/** A date skipped out of a series; removing the skip rule restores it. */
export interface SkippedDate {
  readonly skipId: string;
  readonly date: string;
}

/** A closure in force now, or one with a date still to come. One row per rule; a series is one row. */
export interface ClosureListRow extends ClosureFacts {
  readonly group: "now" | "upcoming";
  readonly ruleId: string;
  /**
   * In `now`, the service date it is in force on: today, or yesterday while that service runs past
   * midnight. In `upcoming`, the next date it closes; `null` when every date it has left is skipped
   * or replaced by a one-date edit.
   */
  readonly on: string | null;
  /** An online-only booking closure that does not repeat: it is resumed, not reopened. */
  readonly pause: boolean;
  /** Whether the Close form can say everything this closure says (`isEditableClosure`). */
  readonly editable: boolean;
  /** The series this row is a one-date edit of; `null` for a closure in its own right. */
  readonly seriesId: string | null;
  /** For a repeating closure in its own right: the dates skipped out of it, from today on. */
  readonly series: { readonly skipped: readonly SkippedDate[] } | null;
  /** `null` when the closure touched no booking, or while the counts are not known. */
  readonly outcomes: ClosureSummary | null;
  /** Refunds failed or still pending. */
  readonly refundsOpen: number;
}

/** A closure with no date left, or a rule that is gone, whose refunds are not all settled. */
export interface EarlierClosureRow {
  readonly group: "earlier";
  readonly ruleId: string;
  /** `null` when no closure of the config has this id: it was reopened, or was a tonight change. */
  readonly closure: ClosureFacts | null;
  readonly outcomes: ClosureSummary;
  readonly refundsOpen: number;
}

export interface ClosuresList {
  /** A pause first, then the closure that started soonest. */
  readonly now: readonly ClosureListRow[];
  /** By the next date each closes, then the time of day it starts; one with no date left is last. */
  readonly upcoming: readonly ClosureListRow[];
  /** Most recently ended first, then refunds whose rule is gone. */
  readonly earlier: readonly EarlierClosureRow[];
}

export interface ClosuresListInput extends ClosuresRowInput {
  /** Outcome counts per rule (`useClosureSummaries`); `null` while they load or after they fail. */
  readonly summaries: readonly ClosureSummary[] | null;
}

const refundsOpenOf = (summary: ClosureSummary | null): number =>
  summary === null ? 0 : summary.refundFailed + summary.refundPending;

function factsOf(rule: ClosureRule, clock: Clock): ClosureFacts {
  return {
    target: targetOf(rule, clock),
    startsOn: rule.startsOn,
    endsOn: rule.endsOn ?? null,
    weekdays: rule.repeat?.weekdays ?? null,
    window: rule.window ? { from: rule.window.from, to: rule.window.to } : null,
  };
}

/** The service date the rule is in force on. A pause covering today is read as guests meet it. */
function forceDate(rule: ClosureRule, clock: Clock): string | null {
  const { config, rules, timezone, today, nowMinute } = clock;
  const pausedToday =
    isOnlinePause(rule) &&
    coversOn(rule, rules, today) &&
    isPauseInForce(rule, config, timezone, today, nowMinute);
  return pausedToday ? today : inForceOn(rule, clock);
}

type Placed =
  | { readonly group: "now"; readonly on: string }
  | { readonly group: "upcoming"; readonly on: string | null }
  | { readonly group: "ended" };

function place(rule: ClosureRule, clock: Clock): Placed {
  const inForce = forceDate(rule, clock);
  if (inForce !== null) return { group: "now", on: inForce };
  const next = waitingOn(rule, clock);
  if (next !== null) return { group: "upcoming", on: next };
  // A date of its own is left, but a skip or a one-date edit replaces each one.
  const ownDateLeft = waitingOn(rule, { ...clock, rules: [] }) !== null;
  return ownDateLeft ? { group: "upcoming", on: null } : { group: "ended" };
}

function skippedOf(rule: ClosureRule, clock: Clock): readonly SkippedDate[] {
  return skipRows(clock.rules, rule.id)
    .filter((skip) => skip.startsOn >= clock.today)
    .map((skip) => ({ skipId: skip.id, date: skip.startsOn }));
}

function rowOf(
  rule: ClosureRule,
  placed: Exclude<Placed, { group: "ended" }>,
  clock: Clock,
  outcomes: ClosureSummary | null
): ClosureListRow {
  return {
    group: placed.group,
    ruleId: rule.id,
    on: placed.on,
    ...factsOf(rule, clock),
    pause: isOnlinePause(rule),
    editable: isEditableClosure(rule),
    seriesId: rule.seriesId ?? null,
    series: isSeries(rule) ? { skipped: skippedOf(rule, clock) } : null,
    outcomes,
    refundsOpen: refundsOpenOf(outcomes),
  };
}

const byStart = (a: ClosureListRow, b: ClosureListRow): number =>
  a.startsOn.localeCompare(b.startsOn) || a.ruleId.localeCompare(b.ruleId);

const byNow = (a: ClosureListRow, b: ClosureListRow): number =>
  Number(b.pause) - Number(a.pause) || byStart(a, b);

function byNextDate(a: ClosureListRow, b: ClosureListRow): number {
  if (a.on === null || b.on === null) return Number(a.on === null) - Number(b.on === null);
  return (
    a.on.localeCompare(b.on) ||
    (a.window?.from ?? 0) - (b.window?.from ?? 0) ||
    a.ruleId.localeCompare(b.ruleId)
  );
}

/** Refunds still open for anything not listed as closed now or to come. */
function earlierRows(
  summaries: readonly ClosureSummary[],
  ended: readonly ClosureRule[],
  listed: ReadonlySet<string>,
  clock: Clock
): EarlierClosureRow[] {
  const open = summaries.filter((s) => refundsOpenOf(s) > 0 && !listed.has(s.ruleId));
  const rowFor = (outcomes: ClosureSummary, rule: ClosureRule | null): EarlierClosureRow => ({
    group: "earlier",
    ruleId: outcomes.ruleId,
    closure: rule === null ? null : factsOf(rule, clock),
    outcomes,
    refundsOpen: refundsOpenOf(outcomes),
  });
  const lastDate = (rule: ClosureRule) => rule.endsOn ?? rule.startsOn;
  const known = [...ended]
    .sort((a, b) => lastDate(b).localeCompare(lastDate(a)) || a.id.localeCompare(b.id))
    .flatMap((rule) => {
      const outcomes = open.find((s) => s.ruleId === rule.id);
      return outcomes ? [rowFor(outcomes, rule)] : [];
    });
  const endedIds = new Set(ended.map((rule) => rule.id));
  const gone = open.filter((s) => !endedIds.has(s.ruleId)).map((s) => rowFor(s, null));
  return [...known, ...gone];
}

export function closuresList(input: ClosuresListInput): ClosuresList {
  const clock = clockOf(input);
  const { summaries } = input;
  const placed = clock.rules
    .filter(isClosure)
    .map((rule) => ({ rule, placed: place(rule, clock) }));
  const rows = placed.flatMap(({ rule, placed: at }) =>
    at.group === "ended"
      ? []
      : [rowOf(rule, at, clock, summaries?.find((s) => s.ruleId === rule.id) ?? null)]
  );
  const ended = placed.flatMap(({ rule, placed: at }) => (at.group === "ended" ? [rule] : []));
  const listed = new Set(rows.map((row) => row.ruleId));
  return {
    now: rows.filter((row) => row.group === "now").sort(byNow),
    upcoming: rows.filter((row) => row.group === "upcoming").sort(byNextDate),
    earlier: earlierRows(summaries ?? [], ended, listed, clock),
  };
}
