import { addDays } from "./civil-date.js";
import { localDateTimeOf } from "./instant.js";
import { listSlots, type BookingSnapshot, type Slot } from "./slots.js";
import { MINUTES_PER_DAY } from "./types.js";

/**
 * Rebooking offers for a guest whose booking a closure cancelled (SC Rebooking
 * offer): up to 3 open online slots for the same party size within 14 days,
 * nearest the original time of day.
 *
 * Ranking, fully deterministic:
 * 1. Spread across days — every day's best slot outranks any day's second-best.
 * 2. Nearest venue-local time of day to the original, measured on the 24-hour
 *    clock in both directions (00:30 is 60 minutes from 23:30).
 * 3. Earlier instant first (an earlier day, then the earlier of two equally
 *    near times).
 * The chosen offers are returned in chronological order. The 14-day window is
 * the 14 service dates starting at `now`'s venue-local date, plus the day
 * before it, whose past-midnight seatings may still be ahead (ADR-029); only
 * slots strictly after `now` count. Advance-booking limits stay with the caller.
 */

export const MAX_REBOOK_OFFERS = 3;
export const REBOOK_WINDOW_DAYS = 14;

export interface RebookReservation {
  startTime: Date;
  partySize: number;
}

/** `picker`: nothing qualifies, so the message links to the full picker instead. */
export type RebookResult = { kind: "offers"; slots: Slot[] } | { kind: "picker" };

function timeOfDayDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % MINUTES_PER_DAY;
  return Math.min(diff, MINUTES_PER_DAY - diff);
}

interface Ranked {
  slot: Slot;
  distance: number;
  dayRank: number;
}

function compareRanked(a: Ranked, b: Ranked): number {
  return (
    a.dayRank - b.dayRank ||
    a.distance - b.distance ||
    a.slot.start.getTime() - b.slot.start.getTime()
  );
}

/** One service date's open slots, best first, each tagged with its rank within the day. */
function rankDay(slots: Slot[], originalMinute: number, timezone: string): Ranked[] {
  return slots
    .map((slot) => ({
      slot,
      distance: timeOfDayDistance(localDateTimeOf(slot.start, timezone).minute, originalMinute),
      dayRank: 0,
    }))
    .sort(compareRanked)
    .map((ranked, dayRank) => ({ ...ranked, dayRank }));
}

export function rebookOffers(
  snapshot: BookingSnapshot,
  reservation: RebookReservation,
  now: Date
): RebookResult {
  const { timezone } = snapshot;
  const originalMinute = localDateTimeOf(reservation.startTime, timezone).minute;
  const today = localDateTimeOf(now, timezone).date;
  const isOffer = (s: Slot) =>
    s.available &&
    s.start.getTime() > now.getTime() &&
    s.start.getTime() !== reservation.startTime.getTime();

  const chosen = Array.from({ length: REBOOK_WINDOW_DAYS + 1 }, (_, i) => addDays(today, i - 1))
    .flatMap((date) => {
      const open = listSlots(snapshot, date, reservation.partySize, "online", now).filter(isOffer);
      return rankDay(open, originalMinute, timezone);
    })
    .sort(compareRanked)
    .slice(0, MAX_REBOOK_OFFERS)
    .map((r) => r.slot)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  return chosen.length === 0 ? { kind: "picker" } : { kind: "offers", slots: chosen };
}
