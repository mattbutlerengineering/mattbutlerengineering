import type {
  AvailabilityConfig,
  AvailabilityConfigState,
  DateRule,
  VenueSettings,
} from "@mbe/types";
import { bookingRulesOf, type BookingRulesValues } from "../booking-rules.js";
import { shownOnlinePause, isPauseInForce } from "../close-draft.js";
import type { HolidayState } from "../holiday-decisions.js";
import {
  regularWeekLine,
  upcomingRegularWeek,
  type RegularWeekLineService,
} from "../regular-week-line.js";
import { closureKindOf, type ClosureKind } from "../rule-subjects.js";
import { scheduleUsage, upcomingRules, type ScheduleUsage } from "../rule-summaries.js";
import { coversDate, nextOccurrence, skippedDates } from "../series-edit.js";
import type { SpecialDateRule } from "../special-dates.js";
import type { DateAnswerHubRow } from "./date-answer.js";

/**
 * The hub's five rows as facts (availability-hub architecture.md, `hubRows`), in the order they
 * win: a later row wins on the dates it covers. It composes the functions the list pages already
 * read and holds no text: the hub page words every line.
 */

/** A hub row's number, as the date check numbers them; row 5 never decides a date. */
type HubRowNumber = DateAnswerHubRow | 5;

/** Ties each row's number to the date check's: a number it does not know fails to compile. */
interface Numbered<N extends HubRowNumber> {
  readonly row: N;
}

export interface HubRowsInput {
  readonly state: Pick<AvailabilityConfigState, "config" | "source">;
  readonly settings: VenueSettings | null | undefined;
  /** The upcoming holidays with what the venue decided (`holidayStates`). */
  readonly holidays: readonly { readonly state: HolidayState }[];
  /** Section id to name. */
  readonly sectionNames: ReadonlyMap<string, string>;
  readonly timezone: string;
  /** The venue's civil date, `YYYY-MM-DD`. */
  readonly today: string;
  /** The venue's minute of the day. */
  readonly nowMinute: number;
}

export interface RegularHoursRow extends Numbered<1> {
  /** The hours in force today, one entry per service; empty when none is set. */
  readonly services: readonly RegularWeekLineService[];
  /** The next dated change, as the row will read on its first day. */
  readonly upcoming: {
    readonly startsOn: string;
    /** `null` when the change has no end. */
    readonly endsOn: string | null;
    readonly services: readonly RegularWeekLineService[];
  } | null;
}

export interface SeasonalHoursSet {
  readonly scheduleId: string;
  /** The name as stored. */
  readonly name: string;
  readonly usage: ScheduleUsage;
}

export interface SeasonalHoursRow extends Numbered<2> {
  /** At most `SEASONAL_SETS_SHOWN`, in config order. */
  readonly sets: readonly SeasonalHoursSet[];
  /** How many sets are not listed. */
  readonly more: number;
}

export interface HubSpecialDate {
  readonly ruleId: string;
  /** What the Add special dates sheet calls it: Closed, Special hours, Same as another day. */
  readonly kind: "closed" | "specialHours" | "useHours";
  readonly startsOn: string;
  /** `null` when the rule has no end. */
  readonly endsOn: string | null;
  /** The weekdays a repeating rule covers (0 = Sunday); `null` when it does not repeat. */
  readonly weekdays: readonly number[] | null;
}

export interface SpecialDatesRow extends Numbered<3> {
  /** At most `SPECIAL_DATES_SHOWN`, soonest first. */
  readonly next: readonly HubSpecialDate[];
  readonly holidaysNotPlanned: number;
}

export interface HubClosure {
  readonly ruleId: string;
  readonly what: ClosureKind;
  readonly startsOn: string;
  /** `null` for a closure that lasts until it is reopened. */
  readonly endsOn: string | null;
  readonly weekdays: readonly number[] | null;
  /** The part of each day it closes, in service-day minutes; `null` for the whole day. */
  readonly window: { readonly from: number; readonly to: number } | null;
}

/** The online pause Resume ends: the shape the Pause button creates (`shownOnlinePause`). */
export interface HubOnlinePause {
  readonly ruleId: string;
  /** `false` while it waits for `fromMinute`. */
  readonly inForce: boolean;
  /** The minute of each day it starts at; `null` when it covers the whole day. */
  readonly fromMinute: number | null;
}

export interface ClosuresRow extends Numbered<4> {
  readonly pause: HubOnlinePause | null;
  /** The closures in force at this minute, soonest started first. The pause is not among them. */
  readonly now: readonly HubClosure[];
  /** The next closure that is not in force yet. */
  readonly next: HubClosure | null;
}

export interface BookingRulesRow extends Numbered<5> {
  /** `null` when none of the three is set. */
  readonly rules: BookingRulesValues | null;
}

export type HubRowModels = readonly [
  RegularHoursRow,
  SeasonalHoursRow,
  SpecialDatesRow,
  ClosuresRow,
  BookingRulesRow,
];

/** `emptyVenue`: no hours are set, so there is nothing to list. */
export type HubRows =
  { readonly kind: "emptyVenue" } | { readonly kind: "rows"; readonly rows: HubRowModels };

const SEASONAL_SETS_SHOWN = 3;
const SPECIAL_DATES_SHOWN = 2;

function regularHoursRow(config: AvailabilityConfig, today: string): RegularHoursRow {
  const upcoming = upcomingRegularWeek(config, today);
  return {
    row: 1,
    services: regularWeekLine(config, today).services,
    upcoming: upcoming && {
      startsOn: upcoming.startsOn,
      endsOn: upcoming.endsOn,
      services: upcoming.line.services,
    },
  };
}

function seasonalHoursRow(config: AvailabilityConfig): SeasonalHoursRow {
  const sets = config.schedules
    .filter((s) => s.kind !== "regular" && !s.archivedAt)
    .map((s) => ({ scheduleId: s.id, name: s.name, usage: scheduleUsage(config, s.id) }));
  return {
    row: 2,
    sets: sets.slice(0, SEASONAL_SETS_SHOWN),
    more: Math.max(0, sets.length - SEASONAL_SETS_SHOWN),
  };
}

function specialDateKind(rule: DateRule): HubSpecialDate["kind"] | null {
  if (rule.kind === "special_hours") return "specialHours";
  if (rule.kind === "use_schedule") return "useHours";
  // Only the whole venue closed for the whole day is a date's "Closed"; any other closure is row 4's.
  return rule.kind === "closure" && rule.targetKind === "venue" && rule.window == null
    ? "closed"
    : null;
}

function specialDatesRow(
  rules: readonly DateRule[],
  today: string,
  holidays: HubRowsInput["holidays"]
): SpecialDatesRow {
  const next = rules
    .filter((r) => r.endsOn == null || r.endsOn >= today)
    .flatMap((r): HubSpecialDate[] => {
      const kind = specialDateKind(r);
      if (kind === null) return [];
      return [
        {
          ruleId: r.id,
          kind,
          startsOn: r.startsOn,
          endsOn: r.endsOn ?? null,
          weekdays: r.repeat?.weekdays ?? null,
        },
      ];
    })
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.ruleId.localeCompare(b.ruleId));
  return {
    row: 3,
    next: next.slice(0, SPECIAL_DATES_SHOWN),
    holidaysNotPlanned: holidays.filter((h) => h.state.kind === "undecided").length,
  };
}

const isClosure = (rule: DateRule): rule is SpecialDateRule => rule.kind === "closure";

/** Whether the closure closes `today`, at any minute of it. */
function closesToday(rule: DateRule, rules: readonly DateRule[], today: string): boolean {
  if (rule.startsOn > today || (rule.endsOn != null && rule.endsOn < today)) return false;
  if (rule.repeat == null) return true;
  return coversDate(rule, today) && !skippedDates(rules, rule.id).includes(today);
}

/** The first date from `today` on the closure reaches; a skipped date of a series still counts. */
function nextDateOf(rule: DateRule, today: string): string {
  if (rule.repeat != null) return nextOccurrence(rule, today);
  return rule.startsOn > today ? rule.startsOn : today;
}

function closureOf(rule: SpecialDateRule, sectionNames: ReadonlyMap<string, string>): HubClosure {
  return {
    ruleId: rule.id,
    what: closureKindOf(rule, sectionNames),
    startsOn: rule.startsOn,
    endsOn: rule.endsOn ?? null,
    weekdays: rule.repeat?.weekdays ?? null,
    window: rule.window ? { from: rule.window.from, to: rule.window.to } : null,
  };
}

function onlinePause(input: HubRowsInput): { rule: DateRule; model: HubOnlinePause } | null {
  const { config } = input.state;
  const { timezone, today, nowMinute } = input;
  const rule = shownOnlinePause(config, timezone, today, nowMinute);
  if (!rule) return null;
  return {
    rule,
    model: {
      ruleId: rule.id,
      inForce: isPauseInForce(rule, config, timezone, today, nowMinute),
      fromMinute: rule.window?.from ?? null,
    },
  };
}

function closuresRow(input: HubRowsInput): ClosuresRow {
  const { today, nowMinute, sectionNames } = input;
  const rules = input.state.config.dateRules;
  const pause = onlinePause(input);
  const closures = upcomingRules(rules, today)
    .filter(isClosure)
    .filter((r) => r.id !== pause?.rule.id);
  const started = (r: DateRule) => r.window == null || r.window.from <= nowMinute;
  const ended = (r: DateRule) => r.window != null && r.window.to <= nowMinute;
  const inForce = (r: DateRule) => closesToday(r, rules, today) && started(r) && !ended(r);
  // A closure whose last day is today and whose time has passed is over, not next.
  const over = (r: DateRule) => r.endsOn === today && ended(r);
  const waiting = closures
    .filter((r) => !inForce(r) && !over(r))
    .map((rule) => ({ rule, date: nextDateOf(rule, today) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const next = waiting[0]?.rule;
  return {
    row: 4,
    pause: pause?.model ?? null,
    now: closures.filter(inForce).map((r) => closureOf(r, sectionNames)),
    next: next ? closureOf(next, sectionNames) : null,
  };
}

function bookingRulesRow(settings: HubRowsInput["settings"]): BookingRulesRow {
  const rules = bookingRulesOf(settings);
  const anySet = Object.values(rules).some((value) => value !== null);
  return { row: 5, rules: anySet ? rules : null };
}

/** The five rows, or `emptyVenue` for a venue with no hours set. */
export function hubRows(input: HubRowsInput): HubRows {
  const { config, source } = input.state;
  if (source === "empty") return { kind: "emptyVenue" };
  return {
    kind: "rows",
    rows: [
      regularHoursRow(config, input.today),
      seasonalHoursRow(config),
      specialDatesRow(config.dateRules, input.today, input.holidays),
      closuresRow(input),
      bookingRulesRow(input.settings),
    ],
  };
}
