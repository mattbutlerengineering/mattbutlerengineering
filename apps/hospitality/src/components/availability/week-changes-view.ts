import { addDays, WEEK_CHANGES_DAYS, type WeekChange } from "@mbe/availability";
import type { DecidedHoliday } from "./holiday-decisions.js";

/** Rows shown before "Show N more". */
const WEEK_CHANGES_FIRST_SHOWN = 4;

/** What tapping a row does: open its first date in the day drawer, or decide a holiday. */
export type WeekChangeAction =
  | { readonly type: "openDay"; readonly date: string }
  | { readonly type: "holiday"; readonly holiday: DecidedHoliday };

export type WeekChangeRow =
  | {
      readonly key: string;
      readonly date: string;
      readonly change: WeekChange;
      readonly action: Extract<WeekChangeAction, { type: "openDay" }>;
    }
  | {
      readonly key: string;
      readonly date: string;
      readonly holiday: DecidedHoliday;
      readonly action: Extract<WeekChangeAction, { type: "holiday" }>;
    };

export interface WeekChangeRowsInput {
  /** `weekChanges(config, from)`: sorted by first date. */
  readonly changes: readonly WeekChange[];
  /** `holidayStates(...)`, or undefined while the decisions load or failed to load. */
  readonly holidays: readonly DecidedHoliday[] | undefined;
  /** The window's first date: the day after the current service date. */
  readonly from: string;
  /** A Manager whose access is known; false for a Host and while access is pending. */
  readonly isManager: boolean;
}

export interface WeekChangeRows {
  readonly rows: readonly WeekChangeRow[];
  readonly first: readonly WeekChangeRow[];
  /** How many rows `first` leaves out. */
  readonly more: number;
}

const firstDate = (c: WeekChange): string => ("dates" in c ? (c.dates[0] ?? "") : c.date);

function changeRows(changes: readonly WeekChange[]): WeekChangeRow[] {
  // A chain of closures can end on one date several times: the venue reopens once.
  const repeatsReopen = (change: WeekChange, i: number) =>
    change.kind === "reopen" &&
    changes.slice(0, i).some((c) => c.kind === "reopen" && c.date === change.date);
  return changes.flatMap((change, i): WeekChangeRow[] => {
    if (repeatsReopen(change, i)) return [];
    const date = firstDate(change);
    return [{ key: `${change.kind}-${i}`, date, change, action: { type: "openDay", date } }];
  });
}

function holidayRows(input: WeekChangeRowsInput): WeekChangeRow[] {
  if (!input.isManager || input.holidays == null) return [];
  const last = addDays(input.from, WEEK_CHANGES_DAYS - 1);
  return input.holidays
    .filter((h) => h.state.kind === "undecided" && h.date >= input.from && h.date <= last)
    .map((holiday) => ({
      key: `holiday-${holiday.id}-${holiday.date}`,
      date: holiday.date,
      holiday,
      action: { type: "holiday", holiday },
    }));
}

/**
 * The rows of "Next 7 days": the week's changes, each opening its first date, merged in date
 * order with the undecided holidays a Manager can decide there (after that day's changes). A
 * Host, a Manager whose access is still being read, and decisions that are loading or failed all
 * get no holiday rows: a holiday is never offered as undecided before that is known.
 */
export function weekChangeRows(input: WeekChangeRowsInput): WeekChangeRows {
  const holidays = holidayRows(input);
  const changes = changeRows(input.changes);
  // A stable sort keeps the engine's kind order within a date, and the holidays after it.
  const rows = [...changes, ...holidays].sort((a, b) => a.date.localeCompare(b.date));
  const first = rows.slice(0, WEEK_CHANGES_FIRST_SHOWN);
  return { rows, first, more: rows.length - first.length };
}
