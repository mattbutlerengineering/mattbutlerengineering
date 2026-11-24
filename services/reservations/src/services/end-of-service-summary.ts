import type { EndOfServiceSummary } from "@mbe/types";
import { prisma } from "./database.js";
import { venueLocalDateString } from "./slot-rules.js";

/**
 * Counts-only end-of-service summary (#9482). Like booking-metrics, it never
 * returns a reservation id, guest name, email or phone.
 *
 * - covers: sum of party sizes of COMPLETED reservations (the only status that
 *   means the party was seated and served; CONFIRMED is still expected).
 * - tableTurns: COMPLETED reservations, one completed seating each.
 * - noShows: NO_SHOW reservations.
 *
 * A booking's `date` is the service day it opened on (ADR-029), stored as a
 * venue-local civil date at UTC midnight, so filtering on it keeps a 23:30
 * local seating (already tomorrow in UTC) on the right service day.
 */

export interface GetEndOfServiceSummaryParams {
  venueId: string;
  /** Venue-local service date, YYYY-MM-DD. */
  date: string;
}

async function getSummary(params: GetEndOfServiceSummaryParams): Promise<EndOfServiceSummary> {
  const { venueId, date } = params;
  const groups = await prisma.reservation.groupBy({
    by: ["status"],
    where: { venueId, date: new Date(`${date}T00:00:00.000Z`) },
    _count: true,
    _sum: { partySize: true },
  });

  const completed = groups.find((g) => g.status === "COMPLETED");
  const noShow = groups.find((g) => g.status === "NO_SHOW");

  return {
    date,
    venueId,
    covers: completed?._sum?.partySize ?? 0,
    tableTurns: completed?._count ?? 0,
    noShows: noShow?._count ?? 0,
    // Filled by the Lost Demand Ledger (#9484).
    turnedAway: null,
  };
}

/** "Today" at the venue: its own IANA zone, never the UTC day. */
async function defaultServiceDate(venueId: string, now: Date = new Date()): Promise<string> {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { ianaTimezone: true },
  });
  return venueLocalDateString(now, venue?.ianaTimezone ?? "UTC");
}

export const endOfServiceSummaryService = { getSummary, defaultServiceDate };
