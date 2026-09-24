import type { FastifyBaseLogger } from "fastify";
import type { Reservation } from "@mbe/types";
import type { Deposit } from "../generated/prisma/index.js";
import { reservationService } from "./reservation.js";
import { depositService, DepositConcurrentUpdateError, DepositTransitionError } from "./deposit.js";
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
  | { outcome: "resolved"; warning?: string }
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
 *
 * Evaluated at `max(now, startTime)`, never bare `now` (#5719 M4): staff
 * marking a no-show a few minutes before the reservation's exact startTime
 * clock tick must still resolve the NO-SHOW fee tier
 * (`evaluateCancellationFee` treats `cancellationTime >= reservationTime` as
 * the no-show boundary) rather than falling through to the — usually much
 * lower — late-cancellation tier.
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

  const startTime = new Date(reservation.startTime);
  const now = new Date();
  const evaluationTime = now > startTime ? now : startTime;
  const feeResult = evaluateCancellationFee(policy, startTime, evaluationTime);

  if (feeResult.depositAction === "forfeit") return { op: "forfeit" };
  if (feeResult.depositAction === "refund_full") return { op: "refund_full" };
  if (feeResult.refundAmountCents >= deposit.amountCents) {
    // A 0%-fee no-show still resolves to "refund_partial" from
    // evaluateCancellationFee (it only special-cases the 100% case as
    // "forfeit"), which would needlessly capture the full deposit and then
    // refund all of it right back rather than simply canceling the
    // authorization outright (#5719 LOW).
    return { op: "refund_full" };
  }
  return { op: "refund_partial", refundAmountCents: feeResult.refundAmountCents };
}

/**
 * A forfeit/partial-refund's CAPTURE leg failed. `DepositService` itself
 * already asked Stripe for the real PaymentIntent status and reconciled the
 * row accordingly before rethrowing (`_reconcileCaptureFailure` in
 * `deposit.ts`: rolled back to `held` if Stripe confirms `requires_capture`,
 * written off to `uncollectable` if Stripe confirms `canceled`, or left
 * untouched at the target status if Stripe confirms `succeeded` or the
 * status is otherwise ambiguous) — this reads that outcome back from the
 * deposit's CURRENT status rather than re-deriving it from the thrown
 * error's own retriable/non-retriable shape, which conflates "definitely
 * didn't capture" with "an auth/config error (e.g. `StripeAuthenticationError`,
 * or the `sk_test_placeholder` fallback key) that never reached Stripe's
 * network at all" (#5719 H2).
 */
async function reconcileCaptureLegFailure(
  depositId: string,
  targetStatus: "forfeited" | "partial_refunded",
  reservation: Reservation,
  logger: FastifyBaseLogger,
  err: unknown
): Promise<ForfeitOutcome> {
  const current = await depositService.getById(depositId);

  if (current?.status === "uncollectable") {
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

  if (current?.status === targetStatus) {
    // Stripe confirmed the charge actually went through (the failure was
    // purely transport-side) — the row is already correct despite the
    // thrown error. Report success rather than a false failure on top of a
    // real one.
    logger.warn(
      { err, reservationId: reservation.id, depositId },
      "Deposit capture reported an error but the row already reflects a completed capture; proceeding"
    );
    return { outcome: "resolved" };
  }

  // Anything else (still `held` — Stripe confirmed `requires_capture` and
  // deposit.ts rolled back — or an unreadable row) is a genuine failure.
  logger.error(
    { err, reservationId: reservation.id, depositId },
    "Failed to resolve deposit on no-show; aborting to avoid ghost state"
  );
  return { outcome: "failed" };
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
 * capture-leg failure on the forfeit/partial paths — the only two that
 * attempt a capture — is reconciled via {@link reconcileCaptureLegFailure}
 * (#5719 item 5, H2); a full-refund failure has no capture to have expired,
 * so it always falls through to the generic failure result.
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
      return { outcome: "resolved" };
    } else if (action.op === "refund_partial") {
      await depositService.refundPartial(depositId, action.refundAmountCents);
      return {
        outcome: "resolved",
        // The policy resolved to less than a full forfeit (#5719 item 6) —
        // surface it so staff aren't surprised the guest wasn't charged the
        // full deposit (#5719 M4).
        warning:
          "Only part of the deposit was charged as a no-show fee; the remainder was refunded.",
      };
    } else {
      await depositService.refund(depositId);
      return {
        outcome: "resolved",
        warning: "The deposit was fully refunded — the no-show policy applied no fee.",
      };
    }
  } catch (err) {
    if (err instanceof DepositConcurrentUpdateError || err instanceof DepositTransitionError) {
      const current = await reservationService.getById(reservation.id);
      if (current?.status === "NO_SHOW") {
        return { outcome: "already-no-show", reservation: current };
      }
    }
    if (action.op !== "refund_full") {
      const targetStatus = action.op === "forfeit" ? "forfeited" : "partial_refunded";
      return reconcileCaptureLegFailure(depositId, targetStatus, reservation, logger, err);
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
      // A refund_full/refund_partial resolution still moved money (or
      // deliberately moved none) — the ghost-state guard below still
      // applies, and staff still get a warning when the fee wasn't a full
      // forfeit (#5719 M4).
      depositWarning = outcome.warning;
      forfeitedDepositId = deposit.id;
    }
  } else if (deposit?.status === "partial_refunded") {
    // Retry guard: a previous attempt captured the card but failed on the
    // refund leg (or the status write after it), leaving the deposit stuck
    // here rather than `held` — the old `held`-only branch above silently
    // skipped it and marked NO_SHOW without ever completing the guest's
    // refund. Replay refundPartial from the PERSISTED amount instead of
    // re-deriving the action from the current clock, mirroring
    // `resolveDeposit`'s identical retry guard in
    // `reservation-cancellation.ts` (#5719 H1). A failure here is always a
    // plain failure — never routed to uncollectable, since that path is only
    // for a fresh capture leg starting from `held` (#5719 H1).
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
        "Failed to replay partial refund on no-show retry; aborting to avoid ghost state"
      );
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
    // Money already moved this call. Before treating this as a ghost state,
    // check whether a concurrent request already completed the whole
    // no-show — including this same status write — so a real success is
    // never reported as a false reconciliation alarm (#5719 item 3 remainder).
    const current = await reservationService.getById(reservation.id);
    if (current?.status === "NO_SHOW") {
      return { success: true, reservation: current, ...(depositWarning && { depositWarning }) };
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
