import { addDays, weekdayIndexOf } from "@mbe/availability";
import type { CalendarView } from "./calendar-dates.js";

/** Sorted, de-duplicated copy: selections are always kept in date order. */
export function normalizeDates(dates: readonly string[]): string[] {
  return [...new Set(dates)].sort();
}

/** Every date from `a` to `b` inclusive, in order, whichever end comes first. */
export function dateRange(a: string, b: string): string[] {
  const [from, to] = a <= b ? [a, b] : [b, a];
  const dates: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);
  return dates;
}

export function toggleDate(selection: readonly string[], date: string): string[] {
  return selection.includes(date)
    ? selection.filter((d) => d !== date)
    : normalizeDates([...selection, date]);
}

/**
 * One Monday-first column of the grid. A month view skips the padding days that belong to
 * neighbouring months; a week view has one date per column.
 */
export function columnDates(
  grid: readonly string[],
  column: number,
  view: CalendarView,
  anchor: string
): string[] {
  const month = anchor.slice(0, 7);
  return grid.filter((d, i) => i % 7 === column && (view === "week" || d.startsWith(month)));
}

/** Every date in the anchor's month that falls on the anchor's weekday. */
export function weekdayDatesInMonth(anchor: string): string[] {
  const month = anchor.slice(0, 7);
  const weekday = weekdayIndexOf(anchor);
  const dates: string[] = [];
  for (let d = `${month}-01`; d.startsWith(month); d = addDays(d, 1)) {
    if (weekdayIndexOf(d) === weekday) dates.push(d);
  }
  return dates;
}

/** The loaded dates a given schedule governs. */
export function datesUsingSchedule(
  days: readonly { readonly serviceDate: string; readonly scheduleId: string | null }[],
  scheduleId: string
): string[] {
  return normalizeDates(days.filter((d) => d.scheduleId === scheduleId).map((d) => d.serviceDate));
}
