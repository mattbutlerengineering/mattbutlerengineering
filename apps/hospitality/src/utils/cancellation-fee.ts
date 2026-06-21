/**
 * Cancellation fee evaluation for staff-facing dialogs.
 *
 * Copied verbatim from services/reservations/src/services/cancellation-policy.ts
 * (pure functions, no IO). DO NOT add fee math here — keep in sync with the service.
 */

export interface CancellationPolicy {
  depositAmountCents: number;
  freeCancellationHours: number | null;
  lateCancellationFeePercent: number | null;
  noShowFeePercent: number | null;
}

export type FeeType = "none" | "late" | "noshow";

export interface CancellationFeeResult {
  feeType: FeeType;
  feeAmountCents: number;
  refundAmountCents: number;
}

/**
 * Evaluates the cancellation fee given a policy, the reservation time, and the
 * current time (i.e. when the cancellation is happening).
 *
 * Money is always integer cents; fractional cents are floored.
 * Returns a "none/full-refund" result when policy is null.
 */
export function evaluateCancellationFee(
  policy: CancellationPolicy | null,
  reservationTime: Date,
  cancellationTime: Date
): CancellationFeeResult {
  if (policy === null || policy.freeCancellationHours === null) {
    return {
      feeType: "none",
      feeAmountCents: 0,
      refundAmountCents: policy?.depositAmountCents ?? 0,
    };
  }

  const reservationMs = reservationTime.getTime();
  const cancellationMs = cancellationTime.getTime();
  const deposit = policy.depositAmountCents;

  if (cancellationMs >= reservationMs) {
    const feePercent = policy.noShowFeePercent ?? 100;
    const feeAmountCents = Math.floor((deposit * feePercent) / 100);
    return {
      feeType: "noshow",
      feeAmountCents,
      refundAmountCents: deposit - feeAmountCents,
    };
  }

  const freeCutoffMs = reservationMs - policy.freeCancellationHours * 60 * 60 * 1000;
  if (cancellationMs <= freeCutoffMs) {
    return {
      feeType: "none",
      feeAmountCents: 0,
      refundAmountCents: deposit,
    };
  }

  const feePercent = policy.lateCancellationFeePercent ?? 0;
  const feeAmountCents = Math.floor((deposit * feePercent) / 100);
  return {
    feeType: "late",
    feeAmountCents,
    refundAmountCents: deposit - feeAmountCents,
  };
}
