import type { Reservation } from "@mbe/types";
import { loadAvailabilitySnapshot } from "./availability-snapshot.js";
import { confirmHold } from "./confirm-hold.js";
import { prisma } from "./database.js";
import { assessGuestReliability } from "./guest-reliability.js";
import { guestService } from "./guest.js";
import { holdService } from "./hold.js";
import type { RebookDeps } from "./manage-rebook-types.js";
import { venueService } from "./venue.js";

/**
 * Whether a new booking would need a deposit, mirroring the widget's
 * `effectiveDepositPolicy` (apps/hospitality): a deposit amount is configured
 * AND either the venue's general policy is enabled or the guest is risky. The
 * server cannot see the widget's Stripe publishable key, so it fails closed
 * and treats a configured deposit as required.
 */
export async function rebookRequiresDeposit(
  venueId: string,
  reservation: Pick<Reservation, "guestEmail" | "guestPhone">
): Promise<boolean> {
  const policy = await venueService.getPolicyById(venueId);
  if (!policy || policy.depositAmountCents == null) return false;
  if (policy.depositEnabled) return true;

  const venue = await venueService.getById(venueId);
  const settings = venue?.settings ?? null;
  const guest = reservation.guestEmail
    ? await guestService.findByEmail(venueId, reservation.guestEmail)
    : reservation.guestPhone
      ? await guestService.findByPhone(venueId, reservation.guestPhone)
      : null;
  return guest !== null && assessGuestReliability(guest, settings) === "risky";
}

export const defaultRebookDeps: RebookDeps = {
  findCancelOutcome: (reservationId, venueId) =>
    prisma.closureOutcome.findFirst({
      where: { reservationId, venueId, action: "cancel" },
      select: { id: true, refund: true, rebookedReservationId: true },
    }),
  findRebooked: (reservationId) =>
    prisma.reservation.findUnique({
      where: { id: reservationId },
      select: { id: true, startTime: true },
    }),
  requiresDeposit: rebookRequiresDeposit,
  loadSnapshot: (venueId, from, to, now) => loadAvailabilitySnapshot(venueId, from, to, now),
  createHold: (data, sessionId) => holdService.create(data, sessionId),
  confirmHold,
  releaseHold: (holdId, sessionId) => holdService.release(holdId, sessionId),
  linkOutcome: async (tx, outcomeId, reservationId) => {
    const { count } = await tx.closureOutcome.updateMany({
      where: { id: outcomeId, rebookedReservationId: null },
      data: { rebookedReservationId: reservationId },
    });
    return count === 1;
  },
};
