import type { ReservationStatus } from "@mbe/types";
import { formatInstant } from "./format.js";

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
export function formatReservationTime(
  isoString: string,
  locale?: string,
  timeZone?: string
): string {
  return formatInstant(isoString, { hour: "2-digit", minute: "2-digit" }, locale, timeZone);
}

/**
 * The one presence and display rule for a reservation's Special Requests
 * (`notes`). Returns `null` when there is nothing to echo — null, undefined,
 * or empty after `trim()` — so every surface renders no block at all.
 * Otherwise returns the text with its ends trimmed and its interior (spaces,
 * line breaks) untouched. Storage is never trimmed; this is display only.
 */
export function specialRequestsText(notes: string | null | undefined): string | null {
  const text = notes?.trim() ?? "";
  return text === "" ? null : text;
}
