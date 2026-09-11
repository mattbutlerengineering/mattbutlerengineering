import type { Reservation, Table, TableStatus } from "@mbe/types";

/**
 * "Seated" is derived, never stored (audit A4): a CONFIRMED reservation whose authoritative
 * table — the tables list, not the copy embedded on the reservation — is OCCUPIED, while the
 * clock sits inside [startTime − 15 min, endTime]. The early window covers parties sat a little
 * ahead of their slot; the end is the reservation's own, so a lingering table that turns
 * OCCUPIED for the next party never marks the finished one.
 */

/** How early a party may be sat and still read as seated for its reservation. */
export const SEATED_EARLY_WINDOW_MS = 15 * 60_000;

type SeatedReservation = Pick<Reservation, "status" | "startTime" | "endTime">;

export function isSeated(
  reservation: SeatedReservation,
  tableStatus: TableStatus | undefined,
  now: Date
): boolean {
  if (reservation.status !== "CONFIRMED" || tableStatus !== "OCCUPIED") return false;
  const start = new Date(reservation.startTime).getTime();
  const end = new Date(reservation.endTime).getTime();
  const at = now.getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || Number.isNaN(at)) return false;
  return at >= start - SEATED_EARLY_WINDOW_MS && at <= end;
}

/** Ids of the reservations seated at `now`, resolving each table by `tableId` (absent → not seated). */
export function seatedReservationIds(
  reservations: readonly (SeatedReservation & Pick<Reservation, "id" | "tableId">)[],
  tables: readonly Pick<Table, "id" | "status">[],
  now: Date
): ReadonlySet<string> {
  const statusByTableId = new Map(tables.map((table) => [table.id, table.status]));
  return new Set(
    reservations
      .filter((reservation) => isSeated(reservation, statusByTableId.get(reservation.tableId), now))
      .map((reservation) => reservation.id)
  );
}
