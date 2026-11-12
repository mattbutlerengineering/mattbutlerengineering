import type { AvailabilityConfig, AvailabilityConfigState, VenueSettings } from "@mbe/types";
import { bookingRulesOf, type BookingRulesValues } from "../booking-rules.js";
import type { HolidayState } from "../holiday-decisions.js";
import {
  regularWeekLine,
  upcomingRegularWeek,
  type RegularWeekLineService,
} from "../regular-week-line.js";
import { scheduleUsage, type ScheduleUsage } from "../rule-summaries.js";
import type { DateAnswerHubRow } from "./date-answer.js";
import { closuresRow, type ClosuresRow } from "./hub-closures.js";
import { specialDatesRow, type SpecialDatesRow } from "./hub-special-dates.js";

/**
 * The hub's five rows as facts (availability-hub architecture.md, `hubRows`), in the order they
 * win: a later row wins on the dates it covers. It composes the functions the list pages already
 * read and holds no text: the hub page words every line. Row 3 is built in `hub-special-dates.ts`
 * and row 4 in `hub-closures.ts`.
 */

export interface HubRowsInput {
  readonly state: Pick<AvailabilityConfigState, "config" | "source">;
  readonly settings: VenueSettings | null | undefined;
  /** The upcoming holidays with what the venue decided (`holidayStates`). */
  readonly holidays: readonly { readonly state: HolidayState }[];
  /** Section id to name; empty while sections load. */
  readonly sectionNames: ReadonlyMap<string, string>;
  readonly timezone: string;
  /** The venue's civil date, `YYYY-MM-DD`. */
  readonly today: string;
  /** The venue's minute of the day. */
  readonly nowMinute: number;
}

export interface RegularHoursRow {
  readonly row: 1;
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

export interface SeasonalHoursRow {
  readonly row: 2;
  /** At most three, in config order. */
  readonly sets: readonly SeasonalHoursSet[];
  /** How many sets are not listed. */
  readonly more: number;
}

export interface BookingRulesRow {
  readonly row: 5;
  /** `null` when none of the three is set. */
  readonly rules: BookingRulesValues | null;
}

/** A hub row's number, as the date check numbers them; row 5 never decides a date. */
type HubRowNumber = DateAnswerHubRow | 5;

/** Ties a row's number to the date check's: a number it does not know fails to compile. */
type Numbered<N extends HubRowNumber, Row extends { readonly row: N }> = Row;

export type HubRowModels = readonly [
  Numbered<1, RegularHoursRow>,
  Numbered<2, SeasonalHoursRow>,
  Numbered<3, SpecialDatesRow>,
  Numbered<4, ClosuresRow>,
  Numbered<5, BookingRulesRow>,
];

/** `emptyVenue`: no hours are set, so there is nothing to list. */
export type HubRows =
  { readonly kind: "emptyVenue" } | { readonly kind: "rows"; readonly rows: HubRowModels };

const SEASONAL_SETS_SHOWN = 3;

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

function bookingRulesRow(settings: HubRowsInput["settings"]): BookingRulesRow {
  const rules = bookingRulesOf(settings);
  const anySet = Object.values(rules).some((value) => value !== null);
  return { row: 5, rules: anySet ? rules : null };
}

/** The five rows, or `emptyVenue` for a venue with no hours set. */
export function hubRows(input: HubRowsInput): HubRows {
  const { config, source } = input.state;
  if (source === "empty") return { kind: "emptyVenue" };
  const { sectionNames, timezone, today, nowMinute } = input;
  return {
    kind: "rows",
    rows: [
      regularHoursRow(config, today),
      seasonalHoursRow(config),
      specialDatesRow(config.dateRules, today, input.holidays),
      closuresRow({ config, sectionNames, timezone, today, nowMinute }),
      bookingRulesRow(input.settings),
    ],
  };
}
