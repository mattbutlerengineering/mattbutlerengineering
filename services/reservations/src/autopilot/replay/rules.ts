import { tableMachine } from "../../services/table-state-machine.js";
import type { NightState, NightTable, Suggestion } from "./types.js";

/** Phases in which a reservation still claims its table. */
const HOLDING_PHASES = new Set(["booked", "arrived", "seated"]);

export function fits(table: NightTable, partySize: number): boolean {
  return partySize >= table.minCovers && partySize <= (table.maxCovers ?? table.capacity);
}

/** Why `partySize` cannot take `table` right now, or null if it can. `ignoreReservationId` is the party being moved. */
export function tableBlocker(
  state: NightState,
  tableId: string,
  partySize: number,
  ignoreReservationId?: string
): string | null {
  const table = state.tables.find((t) => t.id === tableId);
  if (!table) return "unknown table";
  if (!table.isActive) return "table inactive";
  // Reuse the real table state machine: only a table that may move to OCCUPIED can be sat.
  if (!tableMachine.canTransition(table.status, "OCCUPIED")) return `table is ${table.status}`;
  if (!fits(table, partySize)) return "party size outside table capacity";
  const holder = state.reservations.find(
    (r) => r.id !== ignoreReservationId && r.tableId === tableId && HOLDING_PHASES.has(r.phase)
  );
  if (holder) return `table already held by reservation ${holder.id}`;
  return null;
}

/** The reason a suggestion would hurt the host if followed at this state, or null if it is safe. */
export function harmReason(state: NightState, suggestion: Suggestion): string | null {
  if (suggestion.kind === "reseat") {
    const reservation = state.reservations.find((r) => r.id === suggestion.reservationId);
    if (!reservation) return "unknown reservation";
    if (reservation.phase !== "booked" && reservation.phase !== "arrived") {
      return `reservation is ${reservation.phase}`;
    }
    return tableBlocker(state, suggestion.toTableId, reservation.partySize, reservation.id);
  }
  const entry = state.waitlist.find((w) => w.id === suggestion.entryId);
  if (!entry) return "unknown waitlist entry";
  if (entry.status !== "waiting") return `entry is ${entry.status}`;
  return tableBlocker(state, suggestion.tableId, entry.partySize);
}

export function sameMove(a: Suggestion, b: Suggestion): boolean {
  if (a.kind === "reseat" && b.kind === "reseat") {
    return a.reservationId === b.reservationId && a.toTableId === b.toTableId;
  }
  if (a.kind === "waitlist_offer" && b.kind === "waitlist_offer") {
    return a.entryId === b.entryId && a.tableId === b.tableId;
  }
  return false;
}
