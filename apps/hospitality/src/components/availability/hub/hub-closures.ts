import { addDays, resolveDay } from "@mbe/availability";
import type { AvailabilityConfig, DateRule } from "@mbe/types";
import { isPauseInForce } from "../close-draft.js";
import { upcomingRules } from "../rule-summaries.js";
import { coversOn, nextDateOn } from "./rule-dates.js";

/** Hub row 4, closures and pauses, as facts with no text (see `hub-rows.ts`). */

type BookingChannel = NonNullable<DateRule["bookingTypes"]>[number];

/** What a closure closes. A section's name is `null` when the section names do not hold it. */
export type HubClosureTarget =
  | { readonly kind: "venue" }
  | { readonly kind: "service"; readonly venueServiceId: string; readonly name: string | null }
  | { readonly kind: "section"; readonly sectionId: string; readonly name: string | null }
  | { readonly kind: "tables"; readonly count: number }
  | { readonly kind: "booking"; readonly channels: readonly BookingChannel[] };

export interface HubClosure {
  readonly ruleId: string;
  readonly target: HubClosureTarget;
  /**
   * In `now`, the service date it is in force on: today, or yesterday while that service runs past
   * midnight. In `next`, the first date it closes: a skipped or replaced date is passed over.
   */
  readonly nextOn: string;
  readonly startsOn: string;
  /** `null` for a closure that lasts until it is reopened. */
  readonly endsOn: string | null;
  /** The weekdays a repeating closure covers (0 = Sunday); `null` when it does not repeat. */
  readonly weekdays: readonly number[] | null;
  /** The part of each day it closes, in service-day minutes; `null` for the whole day. */
  readonly window: { readonly from: number; readonly to: number } | null;
}

/**
 * Online booking paused today: an online-only booking closure that covers today and does not
 * repeat, or a stop of online booking made for tonight (the Timeline's "Pause online").
 */
export interface HubOnlinePause {
  readonly ruleId: string;
  /** The kind of rule it is, which decides where it is removed. */
  readonly source: "closure" | "tonight";
  /** `false` while it waits for `fromMinute`. */
  readonly inForce: boolean;
  /** The minute of each day it starts at; `null` when it covers the whole day. */
  readonly fromMinute: number | null;
  /** The minute of the day it ends at; `null` when it runs to the end of the service day. */
  readonly untilMinute: number | null;
  /** Its last date; `null` for a pause that lasts until it is resumed. */
  readonly endsOn: string | null;
}

/** A change made for tonight that alters the hours: a close-early, or a stop for part of it. */
export interface HubTonightChange {
  readonly ruleId: string;
  /** The minute tonight closes at; `null` for a stop. */
  readonly closeAt: number | null;
  /** The minutes a stop covers; `null` for a close-early. */
  readonly window: { readonly from: number; readonly to: number } | null;
}

export interface ClosuresRow {
  readonly row: 4;
  /** The pause in force, else the soonest waiting. Any other pause is among the closures. */
  readonly pause: HubOnlinePause | null;
  readonly tonight: readonly HubTonightChange[];
  /** The closures in force at this minute, soonest started first. */
  readonly now: readonly HubClosure[];
  /** The closure that starts soonest among those not in force. */
  readonly next: HubClosure | null;
}

export interface ClosuresRowInput {
  readonly config: AvailabilityConfig;
  /** Section id to name; empty while sections load. */
  readonly sectionNames: ReadonlyMap<string, string>;
  readonly timezone: string;
  readonly today: string;
  readonly nowMinute: number;
}

const MINUTES_PER_DAY = 1440;
const END_OF_SERVICE_DAY = 2880;

export type ClosureRule = Extract<DateRule, { kind: "closure" }>;

export interface Clock extends ClosuresRowInput {
  readonly rules: readonly DateRule[];
  readonly yesterday: string;
  /** This minute on yesterday's service day, while that service still runs; else `null`. */
  readonly lateMinute: number | null;
}

export function clockOf(input: ClosuresRowInput): Clock {
  const { config, timezone, today, nowMinute } = input;
  const yesterday = addDays(today, -1);
  const lastClose = Math.max(
    0,
    ...resolveDay({ timezone, config }, yesterday).services.map((s) => s.closesAt)
  );
  const late = nowMinute + MINUTES_PER_DAY;
  return {
    ...input,
    rules: config.dateRules,
    yesterday,
    lateMinute: late < lastClose ? late : null,
  };
}

export const isClosure = (rule: DateRule): rule is ClosureRule => rule.kind === "closure";

export function isOnlinePause(rule: DateRule): rule is ClosureRule {
  const channels = rule.bookingTypes ?? [];
  return (
    isClosure(rule) &&
    rule.targetKind === "booking" &&
    channels.length === 1 &&
    channels[0] === "online" &&
    rule.repeat == null
  );
}

/** The minute a part of the day ends at; `null` when it runs to the end of the service day. */
const endMinute = (to: number | undefined): number | null =>
  to !== undefined && to < END_OF_SERVICE_DAY ? to : null;

const soonestFirst = (a: HubOnlinePause, b: HubOnlinePause) =>
  (a.fromMinute ?? 0) - (b.fromMinute ?? 0);

/** The online-only closures that cover today and whose time today has not passed. */
function closurePauses(clock: Clock): HubOnlinePause[] {
  const { config, rules, timezone, today, nowMinute } = clock;
  return rules
    .filter(isOnlinePause)
    .filter((r) => coversOn(r, rules, today))
    .filter((r) => r.window == null || nowMinute < r.window.to)
    .map((r): HubOnlinePause => ({
      ruleId: r.id,
      source: "closure",
      inForce: isPauseInForce(r, config, timezone, today, nowMinute),
      fromMinute: r.window?.from ?? null,
      untilMinute: endMinute(r.window?.to),
      endsOn: r.endsOn ?? null,
    }))
    .sort(soonestFirst);
}

/** The stops of online booking made for tonight that are not over: what the Today line calls paused. */
function tonightPauses({ rules, today, nowMinute }: Clock): HubOnlinePause[] {
  return rules
    .flatMap((rule): HubOnlinePause[] => {
      if (rule.kind !== "tonight" || rule.startsOn !== today) return [];
      if (rule.targetKind !== "booking" || !(rule.bookingTypes ?? []).includes("online")) return [];
      if (!("stop" in rule.payload)) return [];
      const { from, to } = rule.payload.stop;
      if (to <= nowMinute) return [];
      return [
        {
          ruleId: rule.id,
          source: "tonight",
          inForce: from <= nowMinute,
          fromMinute: from,
          untilMinute: endMinute(to),
          endsOn: today,
        },
      ];
    })
    .sort(soonestFirst);
}

/** A closure pause in force, else a tonight stop in force, else the soonest of those waiting. */
export function onlinePause(clock: Clock): HubOnlinePause | null {
  const pauses = [...closurePauses(clock), ...tonightPauses(clock)];
  return pauses.find((p) => p.inForce) ?? [...pauses].sort(soonestFirst)[0] ?? null;
}

/**
 * The tonight rules for today that change the hours; pacing and blocked tables do not, and a stop
 * of booking is the pause when it stops online booking.
 */
function tonightChanges(rules: readonly DateRule[], today: string): HubTonightChange[] {
  return rules.flatMap((rule): HubTonightChange[] => {
    if (rule.kind !== "tonight" || rule.startsOn !== today) return [];
    const { payload } = rule;
    if ("closeAt" in payload) return [{ ruleId: rule.id, closeAt: payload.closeAt, window: null }];
    if (!("stop" in payload) || rule.targetKind === "booking" || rule.targetKind === "tables") {
      return [];
    }
    return [
      { ruleId: rule.id, closeAt: null, window: { from: payload.stop.from, to: payload.stop.to } },
    ];
  });
}

/** The service date the closure is in force on at this minute, or `null`. */
export function inForceOn(rule: ClosureRule, clock: Clock): string | null {
  const { rules, today, yesterday, nowMinute, lateMinute } = clock;
  const from = rule.window?.from ?? 0;
  const to = rule.window?.to ?? END_OF_SERVICE_DAY;
  if (coversOn(rule, rules, today) && from <= nowMinute && nowMinute < to) return today;
  const runsLate =
    lateMinute !== null &&
    coversOn(rule, rules, yesterday) &&
    from <= lateMinute &&
    lateMinute < to;
  return runsLate ? yesterday : null;
}

/** The next date a closure not in force closes: today if its time is still to come. */
export function waitingOn(rule: ClosureRule, clock: Clock): string | null {
  const { rules, today, nowMinute } = clock;
  const first = nextDateOn(rule, rules, today);
  const passedToday = first === today && rule.window != null && rule.window.to <= nowMinute;
  return passedToday ? nextDateOn(rule, rules, addDays(today, 1)) : first;
}

export function targetOf(rule: ClosureRule, clock: Clock): HubClosureTarget {
  if (rule.targetKind === "service" && rule.venueServiceId) {
    const { venueServiceId } = rule;
    const service = clock.config.venueServices.find((s) => s.id === venueServiceId);
    return { kind: "service", venueServiceId, name: service?.name ?? null };
  }
  if (rule.targetKind === "booking") return { kind: "booking", channels: rule.bookingTypes ?? [] };
  if (rule.targetKind === "tables") {
    return rule.sectionId
      ? {
          kind: "section",
          sectionId: rule.sectionId,
          name: clock.sectionNames.get(rule.sectionId) ?? null,
        }
      : { kind: "tables", count: rule.tableIds?.length ?? 0 };
  }
  return { kind: "venue" };
}

function closureOf(rule: ClosureRule, nextOn: string, clock: Clock): HubClosure {
  return {
    ruleId: rule.id,
    target: targetOf(rule, clock),
    nextOn,
    startsOn: rule.startsOn,
    endsOn: rule.endsOn ?? null,
    weekdays: rule.repeat?.weekdays ?? null,
    window: rule.window ? { from: rule.window.from, to: rule.window.to } : null,
  };
}

export function closuresRow(input: ClosuresRowInput): ClosuresRow {
  const clock = clockOf(input);
  const pause = onlinePause(clock);
  // From yesterday on, so a closure that ended yesterday can still be running past midnight.
  const closures = upcomingRules(clock.rules, clock.yesterday)
    .filter(isClosure)
    .filter((rule) => rule.id !== pause?.ruleId)
    .map((rule) => ({ rule, inForce: inForceOn(rule, clock) }));
  const waiting = closures
    .flatMap(({ rule, inForce }) => {
      const on = inForce === null ? waitingOn(rule, clock) : null;
      return on === null ? [] : [closureOf(rule, on, clock)];
    })
    .sort(
      (a, b) => a.nextOn.localeCompare(b.nextOn) || (a.window?.from ?? 0) - (b.window?.from ?? 0)
    );
  return {
    row: 4,
    pause,
    tonight: tonightChanges(clock.rules, clock.today),
    now: closures.flatMap(({ rule, inForce }) =>
      inForce === null ? [] : [closureOf(rule, inForce, clock)]
    ),
    next: waiting[0] ?? null,
  };
}
