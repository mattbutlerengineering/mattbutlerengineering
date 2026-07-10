import type { FastifyBaseLogger } from "fastify";
import type { Reservation } from "@mbe/types";
import { reservationService } from "./reservation.js";
import { depositService } from "./deposit.js";
import { transitionReservation, ReservationTransitionError } from "./reservation-state-machine.js";

export type RecordNoShowResult =
  | { success: true; reservation: Reservation }
  | { success: false; status: number; title: string; detail: string };

const DEPOSIT_FAILURE_RESULT: RecordNoShowResult = {
  success: false,
  status: 500,
  title: "No-Show Recording Failed",
  detail: "Could not process the deposit forfeiture. The reservation was not marked as a no-show.",
};

/**
 * Domain-level no-show: owns every consequence of the NO_SHOW state
 * transition (#3232). Validates the transition, forfeits any `held` Deposit
 * via the existing deposit-transition path (the same held → forfeited
 * Stripe-capture flow the manual `/deposits/:id/forfeit` route uses — no
 * duplicated Stripe logic), then writes the reservation status change.
 * `Guest.noShowCount` is bumped by {@link reservationService.update} in the
 * same DB transaction as the status write (#3231); since `riskScore` is
 * derived from that counter via `assessGuestReliability` at read time, the
 * risk escalation happens automatically and needs no separate write here.
 *
 * Deposit forfeiture runs BEFORE the status write, mirroring
 * `cancelReservationWithDeposit`: a Stripe failure must abort the whole
 * no-show rather than leave a ghost state (reservation NO_SHOW, deposit
 * still held).
 */
export async function recordNoShow(
  reservation: Reservation,
  logger: FastifyBaseLogger
): Promise<RecordNoShowResult> {
  try {
    transitionReservation(reservation.status, "NO_SHOW");
  } catch (err) {
    if (err instanceof ReservationTransitionError) {
      return { success: false, status: 409, title: "Conflict", detail: err.message };
    }
    throw err;
  }

  const deposit = await depositService.getByReservationId(reservation.id);
  if (deposit?.status === "held") {
    try {
      await depositService.forfeit(deposit.id);
    } catch (err) {
      logger.error(
        { err, reservationId: reservation.id, depositId: deposit.id },
        "Failed to forfeit deposit on no-show; aborting to avoid ghost state"
      );
      return DEPOSIT_FAILURE_RESULT;
    }
  }

  const updated = await reservationService.update(reservation.id, { status: "NO_SHOW" });
  if (!updated) {
    return {
      success: false,
      status: 409,
      title: "Conflict",
      detail: "Reservation was already updated by a concurrent request",
    };
  }

  return { success: true, reservation: updated };
}
