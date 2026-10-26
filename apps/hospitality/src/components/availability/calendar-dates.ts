import { addDays, weekdayIndexOf } from "@mbe/availability";

export type CalendarView = "month" | "week";

/** Days from the Monday that starts `date`'s week (Monday-first grid). */
function daysSinceMonday(date: string): number {
  return (weekdayIndexOf(date) + 6) % 7;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Every date the grid shows, Monday to Sunday; a month view pads to whole weeks (<= 42 days). */
export function visibleDates(view: CalendarView, anchor: string): string[] {
  const first = view === "week" ? anchor : `${anchor.slice(0, 8)}01`;
  const start = addDays(first, -daysSinceMonday(first));
  let end =
    view === "week"
      ? anchor
      : `${anchor.slice(0, 8)}${daysInMonth(Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7)))}`;
  end = addDays(end, 6 - daysSinceMonday(end));
  const dates: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) dates.push(d);
  return dates;
}

/** Move the anchor one step: a week, or a month clamped to the target month's length. */
export function shiftAnchor(view: CalendarView, anchor: string, direction: 1 | -1): string {
  if (view === "week") return addDays(anchor, 7 * direction);
  const monthIndex = Number(anchor.slice(0, 4)) * 12 + Number(anchor.slice(5, 7)) - 1 + direction;
  const year = Math.floor(monthIndex / 12);
  const month = (monthIndex % 12) + 1;
  const day = Math.min(Number(anchor.slice(8, 10)), daysInMonth(year, month));
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
