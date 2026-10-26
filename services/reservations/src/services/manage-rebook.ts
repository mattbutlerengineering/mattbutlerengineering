import { randomUUID } from "node:crypto";
import { addDays, rebookOfferId, rebookOffers, REBOOK_WINDOW_DAYS } from "@mbe/availability";
import type { Reservation } from "@mbe/types";
import type { GateRejection } from "./assert-bookable.js";
import { defaultRebookDeps } from "./manage-rebook-deps.js";
import type {
  GuestRefundStatus,
  RebookDeps,
  VenueCancellationDeps,
} from "./manage-rebook-types.js";

export type {
  GuestRefundStatus,
  RebookDeps,
  VenueCancellationDeps,
} from "./manage-rebook-types.js";

/**
 * What the guest manage page needs for a booking the venue cancelled with a
 * closure: the refund status, up to 3 rebook offers (engine `rebookOffers`),
 * and, once the guest has rebooked, the new booking. Offers are computed at
 * read time, so they are as fresh as the page load; the rebook re-checks the
 * slot through the booking gate.
 *
 * Venue scope: the caller is inside `runWithVenueContext` (`manageTokenScoped`).
 */

/** `id` is {@link rebookOfferId}, the value a `rebook=` manage-link parameter carries. */
export interface RebookOffer {
  id: string;
  date: string;
  startTime: string;
}

export interface VenueCancellation {
  refundStatus: GuestRefundStatus;
  offers: RebookOffer[];
  /** Set once the guest has rebooked; offers are then always empty. */
  rebooked: { reservationId: string; startTime: string } | null;
}

async function currentOffers(
  reservation: Reservation,
  venueId: string,
  now: Date,
  deps: Pick<RebookDeps, "loadSnapshot">
): Promise<RebookOffer[]> {
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
  return result.kind === "offers"
    ? result.slots.map((slot) => ({
        id: rebookOfferId(slot.start),
        date: slot.serviceDate,
        startTime: slot.start.toISOString(),
      }))
    : [];
}

export async function loadVenueCancellation(
  reservation: Reservation,
  venueId: string,
  now: Date = new Date(),
  deps: VenueCancellationDeps = defaultRebookDeps
): Promise<VenueCancellation | null> {
  if (reservation.status !== "CANCELLED") return null;
  const outcome = await deps.findCancelOutcome(reservation.id, venueId);
  if (!outcome) return null;
  const { refund: refundStatus } = outcome;

  if (outcome.rebookedReservationId) {
    const rebooked = await deps.findRebooked(outcome.rebookedReservationId);
    return {
      refundStatus,
      offers: [],
      rebooked: rebooked
        ? { reservationId: rebooked.id, startTime: rebooked.startTime.toISOString() }
        : null,
    };
  }

  // A deposit venue gets no one-tap offers: the guest goes through the widget's payment step.
  if (await deps.requiresDeposit(venueId, reservation)) {
    return { refundStatus, offers: [], rebooked: null };
  }
  const offers = await currentOffers(reservation, venueId, now, deps);
  return { refundStatus, offers, rebooked: null };
}

export type RebookResult =
  | { ok: true; reservation: Reservation }
  | {
      ok: false;
      reason:
        | "not-rebookable"
        | "already-rebooked"
        | "deposit-required"
        | "offer-unavailable"
        | "slot-taken";
    }
  | { ok: false; reason: "rejected"; rejection: GateRejection };

class AlreadyRebookedError extends Error {}

/**
 * Rebooks a venue-cancelled booking into one of its current offers: re-checks
 * the slot through the booking gate (hold create, then the confirm's gate under
 * the table lock), creates the reservation with the original guest's name,
 * email and phone, and sets `ClosureOutcome.rebookedReservationId` in the same
 * transaction as the reservation insert. A venue that would need a deposit is
 * refused, because the server never collects one on this path.
 */
export async function rebookVenueCancelled(
  reservation: Reservation,
  venueId: string,
  offerId: string,
  now: Date,
  deps: RebookDeps = defaultRebookDeps
): Promise<RebookResult> {
  if (reservation.status !== "CANCELLED") return { ok: false, reason: "not-rebookable" };
  const outcome = await deps.findCancelOutcome(reservation.id, venueId);
  if (!outcome) return { ok: false, reason: "not-rebookable" };
  if (outcome.rebookedReservationId) return { ok: false, reason: "already-rebooked" };
  if (await deps.requiresDeposit(venueId, reservation)) {
    return { ok: false, reason: "deposit-required" };
  }

  const offers = await currentOffers(reservation, venueId, now, deps);
  const offer = offers.find((o) => o.id === offerId);
  if (!offer) return { ok: false, reason: "offer-unavailable" };

  const sessionId = randomUUID();
  const held = await deps.createHold(
    { venueId, date: offer.date, time: offer.startTime, partySize: reservation.partySize },
    sessionId
  );
  if (held.rejection) return { ok: false, reason: "rejected", rejection: held.rejection };
  if (!held.success || !held.hold) return { ok: false, reason: "slot-taken" };

  try {
    const confirmed = await deps.confirmHold({
      holdId: held.hold.id,
      sessionId,
      venueId,
      guestDetails: {
        guestName: reservation.guestName ?? undefined,
        guestEmail: reservation.guestEmail ?? undefined,
        guestPhone: reservation.guestPhone ?? undefined,
        guestId: reservation.guestId ?? undefined,
      },
      inTransaction: async (tx, newReservationId) => {
        if (!(await deps.linkOutcome(tx, outcome.id, newReservationId))) {
          throw new AlreadyRebookedError();
        }
      },
    });
    if (confirmed.success) return { ok: true, reservation: confirmed.reservation };
    if (confirmed.rejection) {
      return { ok: false, reason: "rejected", rejection: confirmed.rejection };
    }
    return { ok: false, reason: "slot-taken" };
  } catch (err) {
    // The transaction rolled back, so the hold survives; free it.
    await deps.releaseHold(held.hold.id, sessionId);
    if (err instanceof AlreadyRebookedError) return { ok: false, reason: "already-rebooked" };
    throw err;
  }
}
