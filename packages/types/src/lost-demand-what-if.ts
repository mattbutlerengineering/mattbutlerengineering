import type { LostDemand } from "./endpoints/lost-demand.js";

/**
 * Helpers for the "Add a seating at X" what-if on the Lost Demand Ledger (#9486).
 * The estimate itself is computed server-side (#9577) so it can run the candidate
 * seating through the availability preview; these are the shared pieces.
 */

export interface CandidateSeating {
  /** 0 = Sunday ... 6 = Saturday, venue-local. */
  readonly weekday: number;
  /** Minutes since venue-local midnight the seating starts. */
  readonly minute: number;
}

const MS_PER_DAY = 86_400_000;

const utcMidnight = (date: string): number => Date.parse(`${date}T00:00:00.000Z`);

/** How many times `weekday` falls in the inclusive window `from`..`to`. */
export function countWeekday(from: string, to: string, weekday: number): number {
  const start = utcMidnight(from);
  const days = Math.round((utcMidnight(to) - start) / MS_PER_DAY) + 1;
  let nights = 0;
  for (let i = 0; i < days; i += 1) {
    if (new Date(start + i * MS_PER_DAY).getUTCDay() === weekday) nights += 1;
  }
  return nights;
}

/** The weekday and hour with the most turned-away searches: the default candidate. */
export function busiestTurnedAwaySlot(demand: LostDemand): CandidateSeating | null {
  const top = [...demand.cells].sort(
    (a, b) => b.searches - a.searches || a.weekday - b.weekday || a.hour - b.hour
  )[0];
  return top ? { weekday: top.weekday, minute: top.hour * 60 } : null;
}
