import type { FastifyBaseLogger } from "fastify";
import type { NotificationDispatcher } from "@mbe/notifications";
import type { CommunicationPreference, Reservation } from "@mbe/types";
import { reservationService } from "./reservation.js";
import { venueService } from "./venue.js";
import { depositService } from "./deposit.js";
import { evaluateCancellationFee } from "./cancellation-policy.js";
import type { BookingNotifier } from "./booking-notifications.js";

export interface CancelReservationDeps {
  bookingNotifier: BookingNotifier;
  notificationPort: NotificationDispatcher;
  logger: FastifyBaseLogger;
}

export type CancelReservationResult =
  | { success: true; reservation: Reservation }
  | { success: false; status: number; title: string; detail: string };

const DEPOSIT_FAILURE_RESULT: CancelReservationResult = {
  success: false,
  status: 500,
  title: "Cancellation Failed",
  detail: "Could not process the deposit refund. The reservation was not cancelled.",
};

/**
 * Resolves the deposit associated with `reservation` — replaying a
 * `partial_refunded` retry from its persisted amounts, or evaluating the
 * cancellation policy against the current clock for a fresh `held` deposit.
 *
 * A deposit and its reservation must never diverge: this always runs BEFORE
 * the reservation is flipped to CANCELLED, and any money-path failure aborts
 * the cancel entirely (returns a failure result) rather than leaving a
 * `held` deposit stranded against a cancelled reservation ("ghost state").
 */
async function resolveDeposit(
  reservation: Reservation,
  logger: FastifyBaseLogger
): Promise<CancelReservationResult | null> {
  const deposit = await depositService.getByReservationId(reservation.id);
  if (!deposit) return null;

  if (deposit.status === "partial_refunded") {
    // Retry guard: a previous attempt captured the card but failed on refund.
    // Re-deriving the action from the current clock risks crossing the
    // no-show boundary and calling forfeit() on an already-captured deposit
    // (DepositTransitionError → permanent 500). Replay refundPartial using
    // the PERSISTED amounts instead.
    if (deposit.refundAmountCents == null) {
      logger.error(
        { depositId: deposit.id, reservationId: reservation.id },
        "partial_refunded deposit missing persisted refund amount; cannot replay"
      );
      return DEPOSIT_FAILURE_RESULT;
    }
    try {
      await depositService.refundPartial(deposit.id, deposit.refundAmountCents);
    } catch (err) {
      logger.error(
        { err, reservationId: reservation.id, depositId: deposit.id },
        "Failed to replay partial refund on cancellation retry; aborting cancel"
      );
      return DEPOSIT_FAILURE_RESULT;
    }
    return null;
  }

  if (deposit.status !== "held") return null;

  const rawVenue = reservation.venueId ? await venueService.getRawById(reservation.venueId) : null;

  const policy =
    rawVenue?.freeCancellationHours != null
      ? {
          depositAmountCents: deposit.amountCents,
          freeCancellationHours: rawVenue.freeCancellationHours,
          lateCancellationFeePercent: rawVenue.lateCancellationFeePercent ?? null,
          noShowFeePercent: rawVenue.noShowFeePercent ?? null,
        }
      : null;

  const feeResult = evaluateCancellationFee(policy, new Date(reservation.startTime), new Date());

  try {
    if (feeResult.depositAction === "refund_full") {
      await depositService.refund(deposit.id);
    } else if (feeResult.depositAction === "forfeit") {
      await depositService.forfeit(deposit.id);
    } else {
      // refund_partial: capture then partially refund (also covers a partial
      // no-show where noShowFeePercent < 100).
      await depositService.refundPartial(deposit.id, feeResult.refundAmountCents);
    }
  } catch (err) {
    logger.error(
      { err, reservationId: reservation.id, depositId: deposit.id },
      "Failed to process deposit on cancellation; aborting cancel to avoid ghost state"
    );
    return DEPOSIT_FAILURE_RESULT;
  }

  return null;
}

/**
 * Cancels the reminder jobs and dispatches the guest-facing cancellation
 * notification for an already-cancelled reservation. Both are best-effort:
 * neither failure should undo the cancellation, which has already committed.
 */
async function notifyCancellation(
  reservation: Reservation,
  manageToken: string,
  deps: CancelReservationDeps
): Promise<void> {
  const { bookingNotifier, notificationPort, logger } = deps;

  bookingNotifier
    .cancelBookingReminders(reservation.id)
    .catch((err) => logger.error({ err }, "Failed to cancel booking reminders"));

  const venue = reservation.venueId ? await venueService.getById(reservation.venueId) : null;
  if (!reservation.guestEmail || !venue) return;

  const preference =
    (reservation.guest?.communicationPreference as CommunicationPreference | null) ?? "email_only";
  try {
    await notificationPort.sendBookingCancelled(
      {
        reservationId: reservation.id,
        date: reservation.date,
        startTime: reservation.startTime,
        endTime: reservation.endTime,
        partySize: reservation.partySize,
        guestName: reservation.guestName,
        guestEmail: reservation.guestEmail,
        guestPhone: reservation.guestPhone ?? null,
        specialRequests: reservation.notes ?? null,
        venueName: venue.name,
        venueTimezone: venue.ianaTimezone,
        venueAddress: null,
        manageToken,
      },
      preference
    );
  } catch {
    logger.error("Failed to send booking cancelled notification");
  }
}

/**
 * Domain-level cancel: owns deposit resolution ordering, the
 * `partial_refunded` retry guard, abort-on-money-failure, reminder-job
 * cancellation, and guest notification dispatch. Callers (routes) are thin
 * adapters that translate the result into an HTTP response.
 */
export async function cancelReservationWithDeposit(
  reservation: Reservation,
  manageToken: string,
  deps: CancelReservationDeps
): Promise<CancelReservationResult> {
  const depositFailure = await resolveDeposit(reservation, deps.logger);
  if (depositFailure) return depositFailure;

  const updated = await reservationService.update(reservation.id, { status: "CANCELLED" });
  if (!updated) {
    return {
      success: false,
      status: 500,
      title: "Update Failed",
      detail: "Failed to cancel reservation",
    };
  }

  await notifyCancellation(reservation, manageToken, deps);

  return { success: true, reservation: updated };
}
