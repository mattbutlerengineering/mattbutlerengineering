import type { LostDemand, LostDemandCell } from "@mbe/types";
import { prisma } from "./database.js";
import { ANY_TIME_MINUTE } from "./lost-demand.js";
import { venueLocalDateString } from "./slot-rules.js";

/**
 * Turned-away demand by weekday and hour (#9485), read from the Lost Demand
 * Ledger counters. Counts only.
 *
 * Time zone: the ledger already stores each search against the venue-local
 * service date and a minute since local midnight (public-availability's
 * `missedMinute`), so the weekday of that civil date and `minute / 60` ARE the
 * venue-local weekday and hour. Nothing is shifted by a UTC offset; only the
 * default window's "today" needs the venue's zone.
 */

/** Default window: this many days, ending today at the venue. */
export const DEFAULT_WINDOW_DAYS = 28;
/** The longest window a caller may ask for. */
export const MAX_WINDOW_DAYS = 92;

const MS_PER_DAY = 86_400_000;
const MINUTES_PER_DAY = 24 * 60;

export interface GetLostDemandParams {
  venueId: string;
  /** Venue-local service dates, YYYY-MM-DD, inclusive. */
  from: string;
  to: string;
}

const toUtcMidnight = (date: string): Date => new Date(`${date}T00:00:00.000Z`);

/** Whole days from `from` to `to`, inclusive of both ends. */
export function windowDays(from: string, to: string): number {
  return Math.round((toUtcMidnight(to).getTime() - toUtcMidnight(from).getTime()) / MS_PER_DAY) + 1;
}

/** First date of the default 28-day window ending on `to`. */
export function defaultWindowStart(to: string): string {
  const from = new Date(toUtcMidnight(to).getTime() - (DEFAULT_WINDOW_DAYS - 1) * MS_PER_DAY);
  return from.toISOString().slice(0, 10);
}

function addCount(counts: ReadonlyMap<string, number>, key: string, by: number) {
  return new Map(counts).set(key, (counts.get(key) ?? 0) + by);
}

async function getLostDemand(params: GetLostDemandParams): Promise<LostDemand> {
  const { venueId, from, to } = params;
  const groups = await prisma.noSlotSearch.groupBy({
    by: ["date", "requestedMinute"],
    where: { venueId, date: { gte: toUtcMidnight(from), lte: toUtcMidnight(to) } },
    _sum: {
      searches: true,
      pacingSearches: true,
      tablesSearches: true,
      hoursSearches: true,
      closureSearches: true,
    },
  });

  const byReason = { pacing: 0, tables: 0, hours: 0, closure: 0 };
  let cells: ReadonlyMap<string, number> = new Map();
  let anyTime: ReadonlyMap<number, number> = new Map();
  let total = 0;
  for (const group of groups) {
    const searches = group._sum?.searches ?? 0;
    const weekday = group.date.getUTCDay();
    const minute = group.requestedMinute;
    if (minute === ANY_TIME_MINUTE) {
      anyTime = new Map(anyTime).set(weekday, (anyTime.get(weekday) ?? 0) + searches);
    } else if (minute >= 0 && minute < MINUTES_PER_DAY) {
      cells = addCount(cells, `${weekday}:${Math.floor(minute / 60)}`, searches);
    } else {
      // Malformed minute: dropping it beats placing it in the wrong cell.
      continue;
    }
    total += searches;
    byReason.pacing += group._sum?.pacingSearches ?? 0;
    byReason.tables += group._sum?.tablesSearches ?? 0;
    byReason.hours += group._sum?.hoursSearches ?? 0;
    byReason.closure += group._sum?.closureSearches ?? 0;
  }

  const cellList: LostDemandCell[] = [...cells].map(([key, searches]) => {
    const [weekday, hour] = key.split(":").map(Number);
    return { weekday: weekday ?? 0, hour: hour ?? 0, searches };
  });
  return {
    venueId,
    from,
    to,
    total,
    byReason,
    cells: cellList.sort((a, b) => a.weekday - b.weekday || a.hour - b.hour),
    anyTime: [...anyTime]
      .map(([weekday, searches]) => ({ weekday, searches }))
      .sort((a, b) => a.weekday - b.weekday),
  };
}

/** The last 28 days ending "today" in the venue's own IANA zone, never the UTC day. */
async function defaultWindow(
  venueId: string,
  now: Date = new Date()
): Promise<{ from: string; to: string }> {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { ianaTimezone: true },
  });
  const to = venueLocalDateString(now, venue?.ianaTimezone ?? "UTC");
  return { from: defaultWindowStart(to), to };
}

export const lostDemandReportService = { getLostDemand, defaultWindow };
