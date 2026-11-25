import type { AutopilotMove, AutopilotProposals } from "@mbe/types";
import { currentServiceDate } from "@mbe/availability";
import { buildLiveSnapshot } from "../autopilot/live-snapshot.js";
import { proposeMoves, type Proposal } from "../autopilot/proposal-engine.js";
import { loadConfigState } from "./availability-config.js";
import { prisma } from "./database.js";
import { venueLocalDateString } from "./slot-rules.js";

/**
 * Read-only: the moves the rule-based engine (#9491) would suggest for a service date, shaped
 * for the host's Autopilot panel (#9492). Nothing here applies a move.
 *
 * "Arrived" parties come from the guest's own night-of signal, already stored as a
 * `guest_signal` reservation event; there is no separate arrival store.
 */

/** How long a waitlist-offer ghost block is drawn, from now. */
const OFFER_BLOCK_MINUTES = 90;
const MS_PER_MINUTE = 60_000;

export interface GetProposalsParams {
  venueId: string;
  /** Venue-local service date, YYYY-MM-DD. Omit for the venue's current service date (ADR-029). */
  date?: string;
  now?: Date;
}

async function arrivedReservationIds(venueId: string, ids: readonly string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const events = await prisma.reservationEvent.findMany({
    where: { venueId, kind: "guest_signal", reservationId: { in: [...ids] } },
    select: { reservationId: true, toState: true },
  });
  return events
    .filter((e) => (e.toState as { signal?: string } | null)?.signal === "arrived")
    .map((e) => e.reservationId);
}

/**
 * The service day "tonight" means: after midnight it is still the day that opened, which the
 * calendar date is not. A venue whose hours cannot be read falls back to its calendar date.
 */
async function currentServiceDay(venueId: string, now: Date): Promise<string> {
  const state = await loadConfigState(prisma, venueId, now);
  if (state) return currentServiceDate({ timezone: state.timezone, config: state.effective }, now);
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { ianaTimezone: true },
  });
  return venueLocalDateString(now, venue?.ianaTimezone ?? "UTC");
}

async function getProposals(params: GetProposalsParams): Promise<AutopilotProposals> {
  const { venueId, now = new Date() } = params;
  const date = params.date ?? (await currentServiceDay(venueId, now));
  const [tables, reservations, waitlist] = await Promise.all([
    prisma.table.findMany({
      where: { venueId },
      select: {
        id: true,
        name: true,
        capacity: true,
        minCovers: true,
        maxCovers: true,
        isActive: true,
        status: true,
      },
    }),
    prisma.reservation.findMany({
      where: { venueId, date: new Date(`${date}T00:00:00.000Z`) },
      select: {
        id: true,
        status: true,
        tableId: true,
        partySize: true,
        startTime: true,
        endTime: true,
        guestName: true,
      },
    }),
    prisma.waitlistEntry.findMany({
      where: { venueId, status: { in: ["waiting", "notified"] } },
      select: { id: true, status: true, partySize: true, guestName: true, createdAt: true },
    }),
  ]);

  const arrived = await arrivedReservationIds(
    venueId,
    reservations.map((r) => r.id)
  );
  const snapshot = buildLiveSnapshot({
    now,
    tables,
    reservations,
    waitlist,
    arrivedReservationIds: arrived,
  });

  const tableNames = new Map(tables.map((t) => [t.id, t.name]));
  const bookings = new Map(reservations.map((r) => [r.id, r]));
  const waiting = new Map(waitlist.map((w) => [w.id, w]));
  const moves = proposeMoves(snapshot.state, snapshot.at).flatMap((p) => {
    const move = toMove(p, { tableNames, bookings, waiting, now });
    return move ? [move] : [];
  });
  return { date, venueId, moves };
}

interface BookingRow {
  id: string;
  tableId: string;
  partySize: number;
  startTime: Date;
  endTime: Date;
  guestName: string | null;
}

interface WaitingRow {
  id: string;
  partySize: number;
  guestName: string;
}

interface Lookups {
  tableNames: ReadonlyMap<string, string>;
  bookings: ReadonlyMap<string, BookingRow>;
  waiting: ReadonlyMap<string, WaitingRow>;
  now: Date;
}

function toMove(
  p: Proposal,
  { tableNames, bookings, waiting, now }: Lookups
): AutopilotMove | null {
  if (p.kind === "reseat") {
    const r = bookings.get(p.reservationId);
    if (!r) return null;
    return {
      id: `reseat:${p.reservationId}>${p.toTableId}`,
      kind: "reseat",
      partyLabel: r.guestName,
      reservationId: r.id,
      waitlistEntryId: null,
      partySize: r.partySize,
      fromTableId: r.tableId,
      fromTableName: tableNames.get(r.tableId) ?? r.tableId,
      toTableId: p.toTableId,
      toTableName: tableNames.get(p.toTableId) ?? p.toTableId,
      startTime: r.startTime.toISOString(),
      endTime: r.endTime.toISOString(),
      reason: p.reason,
    };
  }
  const w = waiting.get(p.entryId);
  if (!w) return null;
  return {
    id: `offer:${p.entryId}>${p.tableId}`,
    kind: "waitlist_offer",
    partyLabel: w.guestName,
    reservationId: null,
    waitlistEntryId: w.id,
    partySize: w.partySize,
    fromTableId: null,
    fromTableName: null,
    toTableId: p.tableId,
    toTableName: tableNames.get(p.tableId) ?? p.tableId,
    startTime: now.toISOString(),
    endTime: new Date(now.getTime() + OFFER_BLOCK_MINUTES * MS_PER_MINUTE).toISOString(),
    reason: p.reason,
  };
}

export const autopilotProposalsService = { getProposals };
