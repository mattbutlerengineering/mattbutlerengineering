import { addDays, rebookOffers, REBOOK_WINDOW_DAYS } from "@mbe/availability";
import type { BookingSnapshot } from "@mbe/availability";
import type { Reservation } from "@mbe/types";
import { loadAvailabilitySnapshot } from "./availability-snapshot.js";
import { prisma } from "./database.js";

/**
 * What the guest manage page needs for a booking the venue cancelled with a
 * closure: the refund status and up to 3 rebook offers (engine `rebookOffers`).
 * Offers are computed at read time, so they are as fresh as the page load; the
 * tap re-checks through the hold (booking gate).
 *
 * Venue scope: the caller is inside `runWithVenueContext` (`manageTokenScoped`).
 */

export type GuestRefundStatus = "none" | "pending" | "done" | "failed";

/** `id` is the slot's start instant, the value a `rebook=` manage-link parameter carries. */
export interface RebookOffer {
  id: string;
  date: string;
  startTime: string;
}

export interface VenueCancellation {
  refundStatus: GuestRefundStatus;
  offers: RebookOffer[];
}

export interface VenueCancellationDeps {
  findCancelOutcome(
    reservationId: string,
    venueId: string
  ): Promise<{ refund: GuestRefundStatus } | null>;
  loadSnapshot(
    venueId: string,
    from: string,
    to: string,
    now: Date
  ): Promise<{ snapshot: BookingSnapshot }>;
}

const defaultDeps: VenueCancellationDeps = {
  findCancelOutcome: (reservationId, venueId) =>
    prisma.closureOutcome.findFirst({
      where: { reservationId, venueId, action: "cancel" },
      select: { refund: true },
    }),
  loadSnapshot: (venueId, from, to, now) => loadAvailabilitySnapshot(venueId, from, to, now),
};

export async function loadVenueCancellation(
  reservation: Reservation,
  venueId: string,
  now: Date = new Date(),
  deps: VenueCancellationDeps = defaultDeps
): Promise<VenueCancellation | null> {
  if (reservation.status !== "CANCELLED") return null;
  const outcome = await deps.findCancelOutcome(reservation.id, venueId);
  if (!outcome) return null;

  // Probe the timezone-free window generously; the engine applies the exact 14-day rule.
  const today = now.toISOString().slice(0, 10);
  const { snapshot } = await deps.loadSnapshot(
    venueId,
    addDays(today, -1),
    addDays(today, REBOOK_WINDOW_DAYS + 1),
    now
  );
  const result = rebookOffers(
    snapshot,
    { startTime: new Date(reservation.startTime), partySize: reservation.partySize },
    now
  );
  const offers =
    result.kind === "offers"
      ? result.slots.map((slot) => ({
          id: slot.start.toISOString(),
          date: slot.serviceDate,
          startTime: slot.start.toISOString(),
        }))
      : [];
  return { refundStatus: outcome.refund, offers };
}
