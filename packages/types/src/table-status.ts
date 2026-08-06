/**
 * Shared floor-plan table-status primitives.
 *
 * Pure derivation of a table's live display status from reservation/hold
 * state — no React, no I/O. Lives here (rather than in `apps/hospitality`)
 * because the reservations service also needs to derive this status when
 * emitting per-table SSE deltas, and a service must never import from an
 * app. Color-token mapping stays app-side (UI concern); this module only
 * produces the raw status string.
 *
 * Status waterfall (first match wins):
 *   1. no reservation                          -> available
 *   2. reservation cancelled / no-show         -> available
 *   3. reservation completed                   -> needs-bussing
 *   4. active hold (guest confirmed at table)  -> seated
 *   5. now is at/after the reservation's end   -> needs-bussing
 *   6. now is within [start, end)              -> seated
 *   7. now is within the reserved-soon window  -> reserved-soon
 *   8. otherwise                               -> available
 */

import type { Reservation } from "./reservation.js";

export type TableDisplayStatus = "available" | "seated" | "needs-bussing" | "reserved-soon";

/** Minutes before a reservation's start time that a table is flagged "reserved-soon". */
export const RESERVED_SOON_WINDOW_MINUTES = 30;

const MS_PER_MINUTE = 60_000;

export interface TableDisplayStatusInput {
  /** The reservation currently or next occupying this table, or null if none. */
  reservation: Reservation | null;
  /**
   * Whether staff has confirmed an active seating hold on `reservation`
   * (e.g. a deposit hold or check-in), independent of the reservation's
   * own booking-lifecycle `status`. Ignored when `reservation` is null.
   */
  hasActiveHold: boolean;
  /** Current time, injected by the caller. */
  now: Date;
}

export function deriveTableDisplayStatus(input: TableDisplayStatusInput): TableDisplayStatus {
  const { reservation, hasActiveHold, now } = input;

  if (!reservation) {
    return "available";
  }

  if (reservation.status === "CANCELLED" || reservation.status === "NO_SHOW") {
    return "available";
  }

  if (reservation.status === "COMPLETED") {
    return "needs-bussing";
  }

  if (hasActiveHold) {
    return "seated";
  }

  const nowMs = now.getTime();
  const startMs = new Date(reservation.startTime).getTime();
  const endMs = new Date(reservation.endTime).getTime();

  if (nowMs >= endMs) {
    return "needs-bussing";
  }

  if (nowMs >= startMs) {
    return "seated";
  }

  const msUntilStart = startMs - nowMs;
  if (msUntilStart <= RESERVED_SOON_WINDOW_MINUTES * MS_PER_MINUTE) {
    return "reserved-soon";
  }

  return "available";
}

/** A single table's status delta, as carried on an SSE `table-status:changed` event. */
export interface TableStatusDelta {
  tableId: string;
  status: TableDisplayStatus;
}
