import { listSlots, type BookingChannel, type BookingSnapshot } from "./slots.js";
import type { ServiceDate } from "./types.js";

export interface DayDiff {
  serviceDate: ServiceDate;
  /** Seating minutes (past the service day's midnight) guests gain, ascending. */
  added: number[];
  /** Seating minutes guests lose, ascending. */
  removed: number[];
}

export interface DiffDaysOptions {
  partySize: number;
  channel: BookingChannel;
  now: Date;
}

const minutesOn = (snapshot: BookingSnapshot, date: ServiceDate, o: DiffDaysOptions) =>
  new Set(listSlots(snapshot, date, o.partySize, o.channel, o.now).map((s) => s.minute));

const onlyIn = (a: Set<number>, b: Set<number>): number[] =>
  [...a].filter((m) => !b.has(m)).sort((x, y) => x - y);

/**
 * Which listed seating times change per date between two snapshots. It
 * compares the times listed, not whether a table is free: a preview shows the
 * schedule a draft creates, so pass snapshots without inventory if you only
 * want structure.
 */
export function diffDays(
  before: BookingSnapshot,
  after: BookingSnapshot,
  dates: readonly ServiceDate[],
  options: DiffDaysOptions
): DayDiff[] {
  return dates.map((serviceDate) => {
    const was = minutesOn(before, serviceDate, options);
    const now = minutesOn(after, serviceDate, options);
    return { serviceDate, added: onlyIn(now, was), removed: onlyIn(was, now) };
  });
}
