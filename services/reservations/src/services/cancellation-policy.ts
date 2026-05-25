/**
 * Cancellation Policy Engine
 *
 * Pure functions — no IO, no DB calls.
 * Takes policy config and timestamps, returns fee calculations.
 */

export interface CancellationPolicy {
  /** Hours before reservation within which cancellation is free (inclusive boundary). */
  freeCancellationHours: number;
  /** Percentage of deposit charged for late cancellation (0–100). */
  lateCancellationFeePercent: number;
  /** Percentage of deposit charged for no-shows (0–100). */
  noShowFeePercent: number;
  /** Deposit amount in cents. */
  depositAmountCents: number;
}

export type FeeType = "none" | "late" | "noshow";
export type DepositAction = "refund_full" | "refund_partial" | "forfeit";

export interface CancellationFeeResult {
  feeAmountCents: number;
  feeType: FeeType;
  refundAmountCents: number;
  depositAction: DepositAction;
}

/**
 * Derive deposit action from fee amount relative to deposit amount.
 */
function depositAction(feeAmountCents: number, depositAmountCents: number): DepositAction {
  if (feeAmountCents <= 0) return "refund_full";
  if (feeAmountCents >= depositAmountCents) return "forfeit";
  return "refund_partial";
}

/**
 * Calculate the cancellation fee for a reservation.
 *
 * @param policy  Venue cancellation policy. Null/undefined → no fee.
 * @param reservationTime  When the reservation starts.
 * @param cancellationTime  When the guest is cancelling.
 * @returns Fee calculation — no IO performed.
 */
export function evaluateCancellationFee(
  policy: CancellationPolicy | null | undefined,
  reservationTime: Date,
  cancellationTime: Date
): CancellationFeeResult {
  // No policy or no deposit → always full refund
  if (!policy || policy.depositAmountCents <= 0) {
    return {
      feeAmountCents: 0,
      feeType: "none",
      refundAmountCents: 0,
      depositAction: "refund_full",
    };
  }

  const {
    freeCancellationHours,
    lateCancellationFeePercent,
    noShowFeePercent,
    depositAmountCents,
  } = policy;

  const reservationMs = reservationTime.getTime();
  const cancellationMs = cancellationTime.getTime();

  // No-show: cancelled at or after reservation start time
  if (cancellationMs >= reservationMs) {
    const feeAmountCents = Math.round((depositAmountCents * noShowFeePercent) / 100);
    const refundAmountCents = depositAmountCents - feeAmountCents;
    return {
      feeAmountCents,
      feeType: "noshow",
      refundAmountCents,
      depositAction: depositAction(feeAmountCents, depositAmountCents),
    };
  }

  // Free window boundary (inclusive): reservationTime - freeCancellationHours
  const freeWindowBoundaryMs = reservationMs - freeCancellationHours * 60 * 60 * 1000;

  // Within free window (cancelled at or before the boundary)
  if (cancellationMs <= freeWindowBoundaryMs) {
    return {
      feeAmountCents: 0,
      feeType: "none",
      refundAmountCents: depositAmountCents,
      depositAction: "refund_full",
    };
  }

  // Late cancellation: inside the window but before reservation time
  const feeAmountCents = Math.round((depositAmountCents * lateCancellationFeePercent) / 100);
  const refundAmountCents = depositAmountCents - feeAmountCents;
  return {
    feeAmountCents,
    feeType: "late",
    refundAmountCents,
    depositAction: depositAction(feeAmountCents, depositAmountCents),
  };
}

/**
 * Human-readable summary of cancellation policy for UI display.
 * Returns empty string when no policy is set.
 */
export function formatPolicySummary(policy: CancellationPolicy | null | undefined): string {
  if (!policy) return "";

  const { freeCancellationHours, lateCancellationFeePercent } = policy;

  if (lateCancellationFeePercent <= 0) {
    return `Free cancellation up to ${freeCancellationHours} hours before your reservation.`;
  }

  return (
    `Free cancellation up to ${freeCancellationHours} hours before your reservation. ` +
    `After that, a ${lateCancellationFeePercent}% cancellation fee applies.`
  );
}
