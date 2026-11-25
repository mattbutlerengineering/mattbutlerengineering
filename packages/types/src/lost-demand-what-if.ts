import type { LostDemand } from "./endpoints/lost-demand.js";

/**
 * "Add a seating at X" what-if on the Lost Demand Ledger (#9486). An estimate,
 * never a promise: it counts the recorded turned-away searches that asked for
 * the seating's weekday and hour, because those guests found no slot then and
 * a seating there would have offered one. Searches that named no time are not
 * counted (nothing says the new seating would suit them), and the ledger keeps
 * no party size per hour, so there is no party cap.
 */

export interface CandidateSeating {
  /** 0 = Sunday ... 6 = Saturday, venue-local. */
  readonly weekday: number;
  /** Minutes since venue-local midnight the seating starts. */
  readonly minute: number;
}

export interface AddedSeatingEstimate {
  /** Turned-away searches in the window the seating would have offered a slot to. */
  readonly searches: number;
  /** How many of that weekday the window holds. */
  readonly nights: number;
  /** `searches` per night, to one decimal. */
  readonly perNight: number;
}

const MS_PER_DAY = 86_400_000;

const utcMidnight = (date: string): number => Date.parse(`${date}T00:00:00.000Z`);

/** How many times `weekday` falls in the inclusive window `from`..`to`. */
function countWeekday(from: string, to: string, weekday: number): number {
  const start = utcMidnight(from);
  const days = Math.round((utcMidnight(to) - start) / MS_PER_DAY) + 1;
  let nights = 0;
  for (let i = 0; i < days; i += 1) {
    if (new Date(start + i * MS_PER_DAY).getUTCDay() === weekday) nights += 1;
  }
  return nights;
}

export function estimateAddedSeating(
  demand: LostDemand,
  seating: CandidateSeating
): AddedSeatingEstimate {
  const hour = Math.floor(seating.minute / 60);
  const searches = demand.cells
    .filter((c) => c.weekday === seating.weekday && c.hour === hour)
    .reduce((sum, c) => sum + c.searches, 0);
  const nights = countWeekday(demand.from, demand.to, seating.weekday);
  return {
    searches,
    nights,
    perNight: nights === 0 ? 0 : Math.round((searches / nights) * 10) / 10,
  };
}

/** The weekday and hour with the most turned-away searches: the default candidate. */
export function busiestTurnedAwaySlot(demand: LostDemand): CandidateSeating | null {
  const top = [...demand.cells].sort(
    (a, b) => b.searches - a.searches || a.weekday - b.weekday || a.hour - b.hour
  )[0];
  return top ? { weekday: top.weekday, minute: top.hour * 60 } : null;
}
