import type { ReservationStatus } from "@mbe/types";

/**
 * Catalog keys for a reservation's status word. These are the short forms: a badge or a dense
 * grid cell never truncates a status, so each locale picks a word that fits (ux.md § Conventions).
 */
export const RESERVATION_STATUS_KEYS = {
  PENDING: "timeline.status.pending",
  CONFIRMED: "timeline.status.confirmed",
  CANCELLED: "timeline.status.cancelled",
  COMPLETED: "timeline.status.completed",
  NO_SHOW: "timeline.status.noShow",
} as const satisfies Record<ReservationStatus, string>;
