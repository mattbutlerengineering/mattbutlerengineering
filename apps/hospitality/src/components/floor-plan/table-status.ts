/**
 * Pure derivation of a floor-plan table's live display status.
 *
 * No React, no I/O — reservation/hold state in, `{ status, colorToken }` out.
 * "now" is an explicit injected parameter (never read internally) so the
 * function stays pure and boundary-time tests are deterministic.
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

import type { Reservation } from "@mbe/types";

export type TableDisplayStatus = "available" | "seated" | "needs-bussing" | "reserved-soon";

/** Minutes before a reservation's start time that a table is flagged "reserved-soon". */
export const RESERVED_SOON_WINDOW_MINUTES = 30;

const MS_PER_MINUTE = 60_000;

/** rialto design token for each derived status — no raw hex values. */
export const TABLE_STATUS_COLOR_TOKEN: Record<TableDisplayStatus, string> = {
  available: "var(--rialto-success)",
  "reserved-soon": "var(--rialto-accent)",
  seated: "var(--rialto-error)",
  "needs-bussing": "var(--rialto-warning)",
} as const;

export interface TableStatusInput {
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

export interface TableStatusResult {
  status: TableDisplayStatus;
  colorToken: string;
}

export function deriveTableStatus(input: TableStatusInput): TableStatusResult {
  const status = resolveStatus(input);
  return { status, colorToken: TABLE_STATUS_COLOR_TOKEN[status] };
}

function resolveStatus({ reservation, hasActiveHold, now }: TableStatusInput): TableDisplayStatus {
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
