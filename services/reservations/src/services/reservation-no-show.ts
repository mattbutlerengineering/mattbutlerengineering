import type { FastifyBaseLogger } from "fastify";
import type { Reservation } from "@mbe/types";
import type { Deposit } from "../generated/prisma/index.js";
import { reservationService } from "./reservation.js";
import {
  depositService,
  DepositConcurrentUpdateError,
  DepositTransitionError,
  DepositRefundLegIncompleteError,
  DepositCaptureAmbiguousError,
} from "./deposit.js";
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

/**
 * `refundPartial`'s capture leg succeeded but its refund leg failed — the
 * guest was charged the full deposit but never received the promised
 * partial refund. Distinct from {@link DEPOSIT_FAILURE_RESULT}: no money
 * moved there, whereas here money moved but not all of the intended
 * money-back-to-guest step completed (#5722 H1).
 */
const DEPOSIT_REFUND_LEG_INCOMPLETE_RESULT: RecordNoShowResult = {
  success: false,
  status: 500,
  title: "No-Show Incomplete",
  detail:
    "The deposit was captured but the guest's refund could not be completed. This requires manual reconciliation or a retry.",
};

/**
 * This invocation lost the deposit-transition race to a concurrent request
 * that is still in flight — it never touched Stripe and has nothing of its
 * own to reconcile (see {@link forfeitHeldDeposit}'s doc comment). This is an
 * in-progress conflict, not a failure: the winning request is still working,
 * and retrying should succeed once it finishes. A 500 here would misreport a
 * transient race as a permanent failure (#5722 R4 LOW-2).
 */
const DEPOSIT_CONCURRENT_RETRY_RESULT: RecordNoShowResult = {
  success: false,
  status: 409,
  title: "Conflict",
  detail: "Another request is already processing this no-show. Please retry.",
};

/**
 * A prior no-show attempt left the deposit at a capture-based terminal
 * status (`forfeited`/`applied`) whose Stripe capture was never confirmed
 * (#5722 M3), and this retry could not verify it either (Stripe still won't
 * confirm the charge, or the re-capture attempt itself failed). Recording
 * the no-show anyway would risk a ghost charge — a reservation marked
 * NO_SHOW with no confirmed money ever moved and no webhook able to catch
 * it after the fact (#5722 R4 MED-1).
 */
const DEPOSIT_CAPTURE_UNVERIFIED_RESULT: RecordNoShowResult = {
  success: false,
  status: 500,
  title: "No-Show Incomplete",
  detail:
    "A previous deposit capture could not be verified with Stripe. This requires manual reconciliation before recording a no-show.",
};

/** Outcome of resolving a `held` deposit against a no-show. */
type ForfeitOutcome =
  | { outcome: "resolved"; warning?: string }
  | { outcome: "uncollectable"; warning: string }
  | { outcome: "already-no-show"; reservation: Reservation }
  | { outcome: "refund-leg-incomplete" }
  | { outcome: "concurrent-retry" }
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
 * A forfeit/partial-refund's CAPTURE leg failed, from THIS invocation's own
 * capture attempt (never a concurrent request's — see {@link forfeitHeldDeposit}'s
 * doc comment for why `DepositConcurrentUpdateError`/`DepositTransitionError`
 * are excluded before this is ever called). `DepositService` itself already
 * asked Stripe for the real PaymentIntent status and reconciled the row
 * accordingly before rethrowing (`_reconcileCaptureFailure` in `deposit.ts`:
 * rolled back to `held` if Stripe confirms `requires_capture` via an error
 * proving no-capture, written off to `uncollectable` if Stripe confirms
 * `canceled` via the same, or left untouched at the target status if Stripe
 * confirms `succeeded`) — this reads that outcome back from the deposit's
 * CURRENT status rather than re-deriving it from the thrown error's own
 * retriable/non-retriable shape, which conflates "definitely didn't capture"
 * with "an auth/config error (e.g. `StripeAuthenticationError`, or the
 * `sk_test_placeholder` fallback key) that never reached Stripe's network at
 * all" (#5719 H2).
 *
 * A `DepositCaptureAmbiguousError` means `deposit.ts` could NOT confirm the
 * capture succeeded (e.g. a connection error where the capture may still be
 * in flight, or a non-terminal PaymentIntent status) — the row is kept at
 * its optimistic target status for exactly the same reason a genuine success
 * would be, so a row-status read alone can never tell the two apart. Only a
 * confirmed `succeeded` status may ever be reported as resolved (#5722 M3).
 */
async function reconcileCaptureLegFailure(
  depositId: string,
  targetStatus: "forfeited" | "partial_refunded",
  reservation: Reservation,
  logger: FastifyBaseLogger,
  err: unknown
): Promise<ForfeitOutcome> {
  if (err instanceof DepositCaptureAmbiguousError) {
    logger.error(
      { err, reservationId: reservation.id, depositId, intentStatus: err.intentStatus },
      "Deposit capture status could not be confirmed; aborting the no-show rather than claiming a completion Stripe never confirmed"
    );
    return { outcome: "failed" };
  }

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

  if (targetStatus === "forfeited" && current?.status === targetStatus) {
    // Stripe confirmed the charge actually went through (the failure was
    // purely transport-side) — the row is already correct despite the
    // thrown error. Report success rather than a false failure on top of a
    // real one. Restricted to `forfeited` (a single Stripe call) on purpose:
    // for `partial_refunded`, `deposit.ts` itself now falls through to run
    // the refund leg whenever it confirms the capture landed, so any error
    // that still escapes `refundPartial` with the row at `partial_refunded`
    // is either the refund leg's own `DepositRefundLegIncompleteError`
    // (handled above, before this function is ever called) or something
    // unexpected — never a case this generic status-match may treat as
    // resolved (#5722, general re-review finding: never depend on a row
    // status this invocation didn't itself verify).
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
 * failure on top of a real success, not a genuine error (#5719 item 3).
 *
 * If the winner has NOT yet finished (reservation still not NO_SHOW), this
 * invocation is a bare LOSER: it never touched Stripe at all — the CAS/state
 * check that threw fired before either capture call — so it has nothing of
 * its own to reconcile. Reporting `resolved` here would mean trusting the
 * winner's optimistic, DB-first row write as proof the winner's OWN capture
 * (and, for `refund_partial`, its refund leg too) actually succeeded, which
 * it may not have. Only the winner's own invocation can know that. This
 * invocation returns a plain `failed` (a 409-shaped "in progress, retry")
 * instead (#5722, general re-review finding).
 *
 * A capture-leg failure from THIS invocation's OWN attempt (forfeit/partial
 * — the only two that attempt a capture) is reconciled via
 * {@link reconcileCaptureLegFailure} (#5719 item 5, H2); a full-refund
 * failure has no capture to have expired, so it always falls through to the
 * generic failure result. `refundPartial`'s REFUND leg failing (capture
 * succeeded, refund threw) is a `DepositRefundLegIncompleteError` — routed
 * to its own distinct outcome, never `reconcileCaptureLegFailure`'s
 * row-status check, which would wrongly read the row's DB-first
 * `partial_refunded` status as proof the refund went out (#5722 H1).
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
      // The winner hasn't finished yet — this invocation never touched
      // Stripe and has nothing of its own to reconcile. The winner owns its
      // own capture and reconciliation (#5722 general re-review finding).
      logger.warn(
        { err, reservationId: reservation.id, depositId },
        "Lost the deposit-transition race on no-show; the winning request owns reconciliation"
      );
      return { outcome: "concurrent-retry" };
    }
    if (err instanceof DepositRefundLegIncompleteError) {
      // Capture succeeded but the refund never went out — never treat this
      // as resolved just because the row's DB-first status already reads
      // `partial_refunded` (#5722 H1).
      logger.error(
        { err, reservationId: reservation.id, depositId },
        "Deposit was captured but the guest's refund failed; aborting the no-show so a retry can complete the refund"
      );
      return { outcome: "refund-leg-incomplete" };
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
    if (outcome.outcome === "concurrent-retry") {
      return DEPOSIT_CONCURRENT_RETRY_RESULT;
    }
    if (outcome.outcome === "refund-leg-incomplete") {
      return DEPOSIT_REFUND_LEG_INCOMPLETE_RESULT;
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
      if (err instanceof DepositRefundLegIncompleteError) {
        return DEPOSIT_REFUND_LEG_INCOMPLETE_RESULT;
      }
      // A re-entrant capture-leg replay that couldn't confirm itself (#5722
      // R4 LOW-1) — the card was almost certainly already charged (this row
      // only reaches partial_refunded via a prior successful DB-first
      // transition), so DEPOSIT_FAILURE_RESULT's "could not process the
      // deposit" wording would misleadingly suggest nothing happened.
      return err instanceof DepositCaptureAmbiguousError
        ? DEPOSIT_CAPTURE_UNVERIFIED_RESULT
        : DEPOSIT_FAILURE_RESULT;
    }
    forfeitedDepositId = deposit.id;
  } else if (deposit?.status === "forfeited" || deposit?.status === "applied") {
    // Retry guard: a previous no-show's capture reconciliation couldn't
    // confirm the charge with Stripe (DepositCaptureAmbiguousError, #5722
    // M3) and left the row at this optimistic terminal status without ever
    // proving it. The old code had no branch for this status and would have
    // written NO_SHOW straight off the row's own status — trusting a status
    // this invocation never itself verified is exactly the ghost-charge risk
    // (#5722 R4 MED-1). Re-verify against Stripe before proceeding.
    const action = deposit.status === "forfeited" ? "forfeit" : "apply";
    const verification = await depositService.verifyCaptureCompleted(deposit.id, action);
    if (verification === "failed") {
      logger.error(
        { reservationId: reservation.id, depositId: deposit.id, depositStatus: deposit.status },
        "Could not verify a previously-ambiguous deposit capture before recording a no-show; aborting to avoid a ghost charge"
      );
      return DEPOSIT_CAPTURE_UNVERIFIED_RESULT;
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
