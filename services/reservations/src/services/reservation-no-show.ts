import type { FastifyBaseLogger } from "fastify";
import type { Reservation } from "@mbe/types";
import { reservationService } from "./reservation.js";
import { depositService, DepositConcurrentUpdateError, DepositTransitionError } from "./deposit.js";
import { transitionReservation, ReservationTransitionError } from "./reservation-state-machine.js";

export type RecordNoShowResult =
  | { success: true; reservation: Reservation; depositWarning?: string }
  | { success: false; status: number; title: string; detail: string };

const DEPOSIT_FAILURE_RESULT: RecordNoShowResult = {
  success: false,
  status: 500,
  title: "No-Show Recording Failed",
  detail: "Could not process the deposit forfeiture. The reservation was not marked as a no-show.",
};

/**
 * The final status write failed AFTER the deposit was already forfeited
 * against Stripe (e.g. a concurrent status change during the round trip made
 * the NO_SHOW transition invalid, so `reservationService.update` rethrows
 * `ReservationTransitionError`). Money moved but the reservation status did
 * not: a divergence needing manual reconciliation, so this is a distinct
 * 500-class result rather than a bare 409 that reads as a harmless conflict.
 * Mirrors `cancelReservationWithDeposit`'s `DEPOSIT_RESOLVED_STATUS_WRITE_FAILED_RESULT`.
 */
const DEPOSIT_RESOLVED_STATUS_WRITE_FAILED_RESULT: RecordNoShowResult = {
  success: false,
  status: 500,
  title: "No-Show Incomplete",
  detail:
    "The deposit was forfeited but the reservation status could not be updated. This requires manual reconciliation.",
};

/** Outcome of attempting to forfeit a `held` deposit for a no-show. */
type ForfeitOutcome =
  | { outcome: "proceed" }
  | { outcome: "already-no-show"; reservation: Reservation }
  | { outcome: "failed" };

/**
 * Forfeits a `held` deposit for a no-show, handling the concurrent/retried
 * case explicitly: if the CAS loses (`DepositConcurrentUpdateError`) or the
 * deposit already moved past `held` (`DepositTransitionError` — e.g. a
 * retried call arrives after the winner already forfeited), re-read the
 * reservation. If the winning request already completed the whole no-show
 * (status is NO_SHOW), this is a false failure on top of a real success, not
 * a genuine error (#5719 item 3).
 */
async function forfeitHeldDeposit(
  depositId: string,
  reservation: Reservation,
  logger: FastifyBaseLogger
): Promise<ForfeitOutcome> {
  try {
    await depositService.forfeit(depositId);
    return { outcome: "proceed" };
  } catch (err) {
    if (err instanceof DepositConcurrentUpdateError || err instanceof DepositTransitionError) {
      const current = await reservationService.getById(reservation.id);
      if (current?.status === "NO_SHOW") {
        return { outcome: "already-no-show", reservation: current };
      }
    }
    logger.error(
      { err, reservationId: reservation.id, depositId },
      "Failed to forfeit deposit on no-show; aborting to avoid ghost state"
    );
    return { outcome: "failed" };
  }
}

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
  let depositWarning: string | undefined;
  let forfeitedDepositId: string | null = null;

  if (deposit?.status === "pending") {
    // No confirmed Stripe authorization exists yet (webhook lag, or the
    // guest never completed payment) — there is nothing held to forfeit.
    // Silently skipping this let staff believe a no-show fee was collected
    // when nothing moved (#5719 item 1); record the no-show but say so.
    depositWarning = "Deposit authorization is still pending — no charge was made.";
    logger.warn(
      { reservationId: reservation.id, depositId: deposit.id },
      "Recording no-show with a pending (not yet authorized) deposit; nothing was captured"
    );
  } else if (deposit?.status === "held") {
    const outcome = await forfeitHeldDeposit(deposit.id, reservation, logger);
    if (outcome.outcome === "already-no-show") {
      return { success: true, reservation: outcome.reservation };
    }
    if (outcome.outcome === "failed") {
      return DEPOSIT_FAILURE_RESULT;
    }
    forfeitedDepositId = deposit.id;
  }

  let updated: Reservation | null;
  try {
    updated = await reservationService.update(reservation.id, { status: "NO_SHOW" });
  } catch (err) {
    if (forfeitedDepositId === null) {
      // No money moved this call — the ordinary concurrent-no-show loser.
      if (err instanceof ReservationTransitionError) {
        return { success: false, status: 409, title: "Conflict", detail: err.message };
      }
      throw err;
    }
    // The deposit has ALREADY been forfeited against Stripe (money moved) but
    // the status did not change: a ghost state. Log it explicitly so
    // ops/finance can reconcile, and return a distinct result — never a bare
    // 409 that reads as a harmless conflict.
    logger.error(
      { err, reservationId: reservation.id, depositId: forfeitedDepositId },
      "Reservation status update failed AFTER the deposit was already forfeited against Stripe; deposit and reservation status now diverge and require manual reconciliation"
    );
    return DEPOSIT_RESOLVED_STATUS_WRITE_FAILED_RESULT;
  }
  if (!updated) {
    return {
      success: false,
      status: 409,
      title: "Conflict",
      detail: "Reservation was already updated by a concurrent request",
    };
  }

  return { success: true, reservation: updated, ...(depositWarning && { depositWarning }) };
}
