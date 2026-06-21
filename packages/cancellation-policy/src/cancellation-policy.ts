/**
 * Cancellation policy engine — pure functions, no IO, no DB calls.
 *
 * Policy fields live on Venue:
 *   freeCancellationHours         – hours before reservation where cancellation is free
 *   lateCancellationFeePercent    – % of deposit charged when cancelled after the free window
 *   noShowFeePercent              – % of deposit forfeited when reservation time has passed
 *
 * Decision tree:
 *   cancellationTime >= reservationTime  → no-show  (forfeit)
 *   cancellationTime  > freeCutoff       → late      (partial refund)
 *   cancellationTime <= freeCutoff       → none      (full refund)
 */

export interface CancellationPolicy {
  depositAmountCents: number;
  freeCancellationHours: number | null;
  lateCancellationFeePercent: number | null;
  noShowFeePercent: number | null;
}

export type FeeType = "none" | "late" | "noshow";
export type DepositAction = "refund_full" | "refund_partial" | "forfeit";

export interface CancellationFeeResult {
  feeType: FeeType;
  feeAmountCents: number;
  refundAmountCents: number;
  depositAction: DepositAction;
}

/**
 * Evaluates the cancellation fee for a reservation.
 *
 * All timestamps are compared in UTC milliseconds — callers must pass
 * Date objects (or ISO strings coercible to Date).
 *
 * Money is always integer cents; fractional cents are floored.
 */
export function evaluateCancellationFee(
  policy: CancellationPolicy | null,
  reservationTime: Date,
  cancellationTime: Date
): CancellationFeeResult {
  // No policy → always free
  if (policy === null || policy.freeCancellationHours === null) {
    return {
      feeType: "none",
      feeAmountCents: 0,
      refundAmountCents: policy?.depositAmountCents ?? 0,
      depositAction: "refund_full",
    };
  }

  const reservationMs = reservationTime.getTime();
  const cancellationMs = cancellationTime.getTime();
  const deposit = policy.depositAmountCents;

  // No-show: cancellation at or after reservation time
  if (cancellationMs >= reservationMs) {
    const feePercent = policy.noShowFeePercent ?? 100;
    const feeAmountCents = Math.floor((deposit * feePercent) / 100);
    const refundAmountCents = deposit - feeAmountCents;
    return {
      feeType: "noshow",
      feeAmountCents,
      refundAmountCents,
      // A full forfeit only applies when nothing is owed back to the guest.
      // When the no-show fee is under 100%, the remainder must be partially
      // refunded — `forfeit` would wrongly capture the entire deposit.
      depositAction: refundAmountCents > 0 ? "refund_partial" : "forfeit",
    };
  }

  // Boundary: exactly freeCancellationHours before reservation is inclusive (free)
  const freeCutoffMs = reservationMs - policy.freeCancellationHours * 60 * 60 * 1000;
  if (cancellationMs <= freeCutoffMs) {
    return {
      feeType: "none",
      feeAmountCents: 0,
      refundAmountCents: deposit,
      depositAction: "refund_full",
    };
  }

  // Late cancellation: after free window, before reservation
  const feePercent = policy.lateCancellationFeePercent ?? 0;
  const feeAmountCents = Math.floor((deposit * feePercent) / 100);
  return {
    feeType: "late",
    feeAmountCents,
    refundAmountCents: deposit - feeAmountCents,
    depositAction: "refund_partial",
  };
}

/**
 * Returns a plain-language summary of cancellation terms for display in the
 * booking widget and cancellation dialog.
 *
 * Example: "Free cancellation until 24 hours before your reservation.
 *           After that, a 50% fee ($50.00) applies."
 */
export function formatCancellationTerms(
  policy: CancellationPolicy | null,
  currency: string
): string {
  if (policy === null || policy.freeCancellationHours === null) {
    return "No cancellation fees apply.";
  }

  const feePercent = policy.lateCancellationFeePercent ?? 0;
  const feeAmount = Math.floor((policy.depositAmountCents * feePercent) / 100);
  const formattedFee = formatCents(feeAmount, currency);

  return (
    `Free cancellation up to ${policy.freeCancellationHours} hours before your reservation. ` +
    `After that, a ${feePercent}% fee (${formattedFee}) applies.`
  );
}

function formatCents(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(cents / 100);
}
