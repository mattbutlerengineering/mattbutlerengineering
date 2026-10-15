import { TABLE_VALID_TRANSITIONS, partyFitsTable, type Reservation, type Table } from "@mbe/types";

/**
 * The client's one reading of "can this party sit at this table?". The table rule comes from
 * `TABLE_VALID_TRANSITIONS` (the server enforces the same map), so a DIRTY or READY table is
 * never offered — seating it would flip the booking to CONFIRMED and then be rejected.
 */

/** True when the table's state machine allows a move to OCCUPIED (today: only AVAILABLE). */
function tableAcceptsParty(table: Pick<Table, "status">): boolean {
  return TABLE_VALID_TRANSITIONS[table.status].includes("OCCUPIED");
}

export function isSeatableStatus(reservation: Pick<Reservation, "status">): boolean {
  return reservation.status === "PENDING" || reservation.status === "CONFIRMED";
}

/**
 * Seat Guest shows when status ∈ {PENDING, CONFIRMED} and the party's table can become OCCUPIED.
 * An unknown table (`undefined`) stays seatable — the server is the authority on it.
 */
export function canSeat(
  reservation: Pick<Reservation, "status">,
  table: Pick<Table, "status"> | undefined
): boolean {
  return isSeatableStatus(reservation) && (table === undefined || tableAcceptsParty(table));
}

/** Tables the party can be sat at now and that are big enough, smallest fit first. */
export function tablesThatFit<
  T extends Pick<Table, "status" | "capacity" | "minCovers" | "maxCovers">,
>(tables: readonly T[], partySize: number): T[] {
  return tables
    .filter((table) => tableAcceptsParty(table) && partyFitsTable(table, partySize))
    .sort((a, b) => a.capacity - b.capacity);
}
