import { addDays, weekdayIndexOf } from "@mbe/availability";
import type { AvailabilityConfig, DateRule, HolidayDecision } from "@mbe/types";
import { holidaysIn, type Holiday, type HolidayCountry } from "./holidays.js";

/** How far ahead the panel looks (PRD 1: twelve months), and the range its decisions are read for. */
export const HOLIDAY_HORIZON_DAYS = 365;

/** What a holiday line shows. Not the wire `HolidayDecision`: this also reads the config's rules. */
export type HolidayState =
  | { readonly kind: "undecided" }
  | { readonly kind: "closed"; readonly ruleId: string }
  | { readonly kind: "openAsUsual" }
  | { readonly kind: "specialHours"; readonly ruleId: string }
  /** A rule this flow does not own covers the date. */
  | { readonly kind: "other" };

export interface DecidedHoliday extends Holiday {
  readonly state: HolidayState;
}

/** A rule that says something about `date`; `skip` and `tonight` never decide a holiday. */
function covers(rule: DateRule, date: string): boolean {
  return (
    rule.kind !== "tonight" &&
    rule.kind !== "skip" &&
    rule.startsOn <= date &&
    (rule.endsOn == null || rule.endsOn >= date) &&
    (rule.repeat == null || rule.repeat.weekdays.includes(weekdayIndexOf(date)))
  );
}

/** One whole-venue rule for exactly this date: the shape the holiday flow writes itself. */
function isOwnedOneDate(rule: DateRule, date: string): boolean {
  return (
    rule.targetKind === "venue" &&
    rule.startsOn === date &&
    rule.endsOn === date &&
    rule.repeat == null &&
    rule.seriesId == null
  );
}

function classify(
  rules: readonly DateRule[],
  decided: ReadonlySet<string>,
  date: string
): HolidayState {
  const skipped = new Set(
    rules
      .filter((r) => r.kind === "skip" && r.seriesId != null && r.startsOn <= date)
      .filter((r) => (r.endsOn ?? r.startsOn) >= date)
      .map((r) => r.seriesId)
  );
  // A series skipped on this date does not cover it: the skip is not a decision either.
  const covering = rules.filter((r) => covers(r, date) && !skipped.has(r.id));
  const closed = covering.find(
    (r) => r.kind === "closure" && r.window == null && isOwnedOneDate(r, date)
  );
  if (closed) return { kind: "closed", ruleId: closed.id };
  const special = covering.find((r) => r.kind === "special_hours" && isOwnedOneDate(r, date));
  if (special) return { kind: "specialHours", ruleId: special.id };
  // A covering rule outranks the open mark: the mark means "no change to the hours", and it
  // never reopens a day another rule shuts.
  if (covering.length > 0) return { kind: "other" };
  return decided.has(date) ? { kind: "openAsUsual" } : { kind: "undecided" };
}

/**
 * Every holiday from `today` (inclusive) to `HOLIDAY_HORIZON_DAYS` later, in date order, each with
 * what the venue has decided: from its date rules (a closure or special hours the Manager made)
 * and from its open-as-usual decisions.
 */
export function holidayStates(
  country: HolidayCountry,
  today: string,
  config: AvailabilityConfig,
  decisions: readonly HolidayDecision[]
): DecidedHoliday[] {
  const end = addDays(today, HOLIDAY_HORIZON_DAYS);
  const year = Number(today.slice(0, 4));
  const decided = new Set(decisions.map((d) => d.serviceDate));
  return [...holidaysIn(country, year), ...holidaysIn(country, year + 1)]
    .filter((h) => h.date >= today && h.date <= end)
    .map((h) => ({ ...h, state: classify(config.dateRules, decided, h.date) }));
}
