import type { FastifyBaseLogger } from "fastify";
import type { Reservation } from "@mbe/types";
import type { Deposit } from "../generated/prisma/index.js";
import { reservationService } from "./reservation.js";
import { depositService, DepositConcurrentUpdateError, DepositTransitionError } from "./deposit.js";
import { StripeOperationError } from "./stripe.js";
import { venueService } from "./venue.js";
import { evaluateCancellationFee } from "./cancellation-policy.js";
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

/** Outcome of resolving a `held` deposit against a no-show. */
type ForfeitOutcome =
  | { outcome: "resolved" }
  | { outcome: "uncollectable"; warning: string }
  | { outcome: "already-no-show"; reservation: Reservation }
  | { outcome: "failed" };

/** Which Stripe money-move a no-show resolves the deposit with. */
type NoShowDepositAction =
  { op: "forfeit" } | { op: "refund_full" } | { op: "refund_partial"; refundAmountCents: number };

/**
 * Determines how much of the deposit to keep on a no-show, mirroring
 * `cancelReservationWithDeposit`'s guest-cancel policy evaluation exactly
 * (same `evaluateCancellationFee` call, same venue-policy shape) so the
 * amount actually captured always matches what `formatCancellationTerms`
 * disclosed to the guest — never a full forfeit when only a partial
 * noShowFeePercent was disclosed (#5719 item 6).
 */
async function resolveNoShowDepositAction(
  deposit: Deposit,
  reservation: Reservation
): Promise<NoShowDepositAction> {
  const venuePolicy = reservation.venueId
    ? await venueService.getPolicyById(reservation.venueId)
    : null;

  const policy =
    venuePolicy?.freeCancellationHours != null
      ? {
          depositAmountCents: deposit.amountCents,
          freeCancellationHours: venuePolicy.freeCancellationHours,
          lateCancellationFeePercent: venuePolicy.lateCancellationFeePercent ?? null,
          noShowFeePercent: venuePolicy.noShowFeePercent ?? null,
        }
      : null;

  const feeResult = evaluateCancellationFee(policy, new Date(reservation.startTime), new Date());

  if (feeResult.depositAction === "forfeit") return { op: "forfeit" };
  if (feeResult.depositAction === "refund_full") return { op: "refund_full" };
  return { op: "refund_partial", refundAmountCents: feeResult.refundAmountCents };
}

/**
 * A capture failed permanently (e.g. Stripe auto-canceled the ~7-day-old
 * authorization) — the money is gone for good. Mark the deposit
 * uncollectable (no Stripe call needed, we already know it's dead) so the
 * no-show can still be recorded instead of being unrecordable forever
 * (#5719 item 5).
 */
async function handlePermanentCaptureFailure(
  depositId: string,
  reservation: Reservation,
  logger: FastifyBaseLogger,
  err: StripeOperationError
): Promise<ForfeitOutcome> {
  try {
    await depositService.markUncollectable(depositId);
  } catch (markErr) {
    logger.error(
      { err: markErr, reservationId: reservation.id, depositId },
      "Failed to mark deposit uncollectable after a permanent capture failure"
    );
    return { outcome: "failed" };
  }
  logger.warn(
    { err, reservationId: reservation.id, depositId },
    "Deposit authorization could not be captured (it may have expired); marked uncollectable and recording the no-show anyway"
  );
  return {
    outcome: "uncollectable",
    warning:
      "Deposit authorization could not be captured (it may have expired) — marked uncollectable.",
  };
}

/**
 * Resolves a `held` deposit against a no-show — forfeit, full refund, or
 * partial refund, per {@link resolveNoShowDepositAction} — handling the
 * concurrent/retried case explicitly: if the CAS loses
 * (`DepositConcurrentUpdateError`) or the deposit already moved past `held`
 * (`DepositTransitionError` — e.g. a retried call arrives after the winner
 * already resolved it), re-read the reservation. If the winning request
 * already completed the whole no-show (status is NO_SHOW), this is a false
 * failure on top of a real success, not a genuine error (#5719 item 3). A
 * permanent (non-retriable) Stripe capture failure on the forfeit/partial
 * paths — the only two that attempt a capture — is handled separately
 * (#5719 item 5); a full-refund failure has no capture to have expired, so
 * it always falls through to the generic failure result.
 */
async function forfeitHeldDeposit(
  deposit: Deposit,
  reservation: Reservation,
  logger: FastifyBaseLogger
): Promise<ForfeitOutcome> {
  const depositId = deposit.id;
  const action = await resolveNoShowDepositAction(deposit, reservation);
  try {
    if (action.op === "forfeit") {
      await depositService.forfeit(depositId);
    } else if (action.op === "refund_partial") {
      await depositService.refundPartial(depositId, action.refundAmountCents);
    } else {
      await depositService.refund(depositId);
    }
    return { outcome: "resolved" };
  } catch (err) {
    if (action.op !== "refund_full" && err instanceof StripeOperationError && !err.isRetriable) {
      return handlePermanentCaptureFailure(depositId, reservation, logger, err);
    }
    if (err instanceof DepositConcurrentUpdateError || err instanceof DepositTransitionError) {
      const current = await reservationService.getById(reservation.id);
      if (current?.status === "NO_SHOW") {
        return { outcome: "already-no-show", reservation: current };
      }
    }
    logger.error(
      { err, reservationId: reservation.id, depositId },
      "Failed to resolve deposit on no-show; aborting to avoid ghost state"
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
    const outcome = await forfeitHeldDeposit(deposit, reservation, logger);
    if (outcome.outcome === "already-no-show") {
      return { success: true, reservation: outcome.reservation };
    }
    if (outcome.outcome === "failed") {
      return DEPOSIT_FAILURE_RESULT;
    }
    if (outcome.outcome === "uncollectable") {
      // No money moved — the deposit was written off, not forfeited against
      // Stripe — so this is not the money-moved ghost-state case below.
      depositWarning = outcome.warning;
    } else {
      forfeitedDepositId = deposit.id;
    }
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
