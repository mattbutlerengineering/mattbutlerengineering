import type { ReservationStatus } from "@mbe/types";

/**
 * Maps a reservation status to the Rialto Badge variant prop.
 * Shared between ReservationsPage and any other consumer that renders
 * a Rialto <Badge> for reservation status.
 */
export const STATUS_BADGE_VARIANT: Record<
  ReservationStatus,
  "warning" | "success" | "error" | "neutral"
> = {
  PENDING: "warning",
  CONFIRMED: "success",
  CANCELLED: "error",
  COMPLETED: "neutral",
  NO_SHOW: "error",
};

/**
 * Human-readable label for each reservation status.
 * Shared between ReservationsPage and TimelinePage.
 */
export const STATUS_LABEL: Record<ReservationStatus, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
  NO_SHOW: "No Show",
};

/**
 * Formats an ISO datetime string to a localised HH:MM time display.
 * Used in reservation list rows (ReservationsPage) and detail views.
 */
export function formatReservationTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
