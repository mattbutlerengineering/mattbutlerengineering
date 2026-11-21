import type { DateRule } from "@mbe/types";
import { weekdayIndexOf } from "./civil-date.js";

/**
 * The reach of a stored date rule, shared by the reservations service (which settles a save)
 * and the staff client (which predicts it). One copy, so the prediction cannot drift.
 */

/** How far past its start an open-ended scope is settled, date by date. */
export const SCOPE_HORIZON_DAYS = 366;

/** Whether the rule's stored range and repeat reach `date`; no series or Tonight special case. */
export function coversDate(rule: DateRule, date: string): boolean {
  return (
    rule.startsOn <= date &&
    (rule.endsOn == null || date <= rule.endsOn) &&
    (rule.repeat == null || rule.repeat.weekdays.includes(weekdayIndexOf(date)))
  );
}

/** A special-hours or use-schedule rule in its own right, not an edit of a series. */
export function isHoursRule(rule: DateRule): boolean {
  return (rule.kind === "special_hours" || rule.kind === "use_schedule") && rule.seriesId == null;
}
