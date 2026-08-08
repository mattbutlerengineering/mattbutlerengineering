import {
  deriveTableDisplayStatus,
  toDateString,
  type Reservation,
  type TableStatusDelta,
} from "@mbe/types";
import { prisma } from "./database.js";
import { toReservation } from "./serializers.js";
import { NOT_BOOKED_STATUSES } from "./slot-rules.js";

/**
 * Picks the reservation that represents "now" for a table's derived display
 * status — mirrors the event-sourced client's projection. `table-status:changed`
 * (see routes/events.ts) always carries whichever reservation just
 * transitioned; replaying those deltas in order leaves a table showing
 * either the reservation currently underway, or (once it ends, before the
 * next begins) the soonest upcoming one. This picks the same reservation
 * directly from a point-in-time read, so a resync snapshot agrees with
 * whatever the live delta stream would have produced.
 */
export function selectCurrentReservation(
  reservations: readonly Reservation[],
  now: Date
): Reservation | null {
  const nowMs = now.getTime();
  let current: Reservation | null = null;
  let next: Reservation | null = null;

  for (const reservation of reservations) {
    const startMs = new Date(reservation.startTime).getTime();
    if (startMs <= nowMs) {
      if (!current || startMs > new Date(current.startTime).getTime()) {
        current = reservation;
      }
    } else if (!next || startMs < new Date(next.startTime).getTime()) {
      next = reservation;
    }
  }

  return current ?? next;
}

/**
 * Current derived status for every table in a venue — the snapshot a
 * reconnecting SSE client refetches to replace `table-status:changed`
 * deltas lost while disconnected (#3931). Reuses `deriveTableDisplayStatus`
 * (the same function `routes/events.ts` derives live deltas from) so this
 * never becomes a second, divergent definition of "what status is this
 * table" — including its `hasActiveHold: false` simplification, since
 * hold state isn't carried on the `Reservation` payload either path reads.
 *
 * Scoped to today's non-cancelled reservations, matching `briefingService`'s
 * single-day convention: a reservation days away cannot be "currently or
 * next occupying" a table right now.
 */
async function getSnapshot(venueId: string, now: Date = new Date()): Promise<TableStatusDelta[]> {
  const today = new Date(toDateString(now));

  const [tables, reservationRows] = await Promise.all([
    prisma.table.findMany({ where: { venueId }, select: { id: true } }),
    prisma.reservation.findMany({
      where: {
        venueId,
        date: today,
        status: { notIn: [...NOT_BOOKED_STATUSES] },
      },
    }),
  ]);

  const reservationsByTable = new Map<string, Reservation[]>();
  for (const row of reservationRows) {
    const reservation = toReservation(row);
    const existing = reservationsByTable.get(reservation.tableId) ?? [];
    reservationsByTable.set(reservation.tableId, [...existing, reservation]);
  }

  return tables.map(({ id: tableId }) => {
    const reservation = selectCurrentReservation(reservationsByTable.get(tableId) ?? [], now);
    return {
      tableId,
      status: deriveTableDisplayStatus({ reservation, hasActiveHold: false, now }),
    };
  });
}

export const tableStatusService = { getSnapshot };
