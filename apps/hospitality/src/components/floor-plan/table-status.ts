/**
 * Floor-plan table display status + color mapping.
 *
 * The status waterfall itself (`deriveTableDisplayStatus`) lives in
 * `@mbe/types` — the reservations service also needs it to derive
 * per-table SSE status deltas, and a service must never import from an
 * app. This module re-exports the shared type/function and adds the
 * rialto color-token mapping, which is a UI-only concern and stays here.
 */

import type { Reservation } from "@mbe/types";
import {
  deriveTableDisplayStatus,
  RESERVED_SOON_WINDOW_MINUTES,
  type TableDisplayStatus,
} from "@mbe/types";

export type { TableDisplayStatus };
export { RESERVED_SOON_WINDOW_MINUTES };

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
  const status = deriveTableDisplayStatus(input);
  return { status, colorToken: TABLE_STATUS_COLOR_TOKEN[status] };
}
