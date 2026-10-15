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
 * Structured, locale-free description of a cancellation policy. Carries no
 * prose and no currency formatting: callers render it through their own
 * message catalog and venue formatters.
 */
export type CancellationPolicyDescription =
  | { kind: "no-fees" }
  | {
      kind: "free-window";
      freeHours: number;
      lateFeePercent: number;
      lateFeeAmountCents: number;
      noShowFeePercent: number;
      noShowFeeAmountCents: number;
    };

/**
 * Describes the policy's terms as data. Defaults mirror evaluateCancellationFee:
 * a null late fee is 0%, a null no-show fee is a full 100% forfeit — the
 * disclosure must reflect that or guests authorize a hold without seeing the
 * real term. Fractional cents are floored.
 */
export function describeCancellationPolicy(
  policy: CancellationPolicy | null
): CancellationPolicyDescription {
  if (policy === null || policy.freeCancellationHours === null) {
    return { kind: "no-fees" };
  }

  const lateFeePercent = policy.lateCancellationFeePercent ?? 0;
  const noShowFeePercent = policy.noShowFeePercent ?? 100;
  return {
    kind: "free-window",
    freeHours: policy.freeCancellationHours,
    lateFeePercent,
    lateFeeAmountCents: Math.floor((policy.depositAmountCents * lateFeePercent) / 100),
    noShowFeePercent,
    noShowFeeAmountCents: Math.floor((policy.depositAmountCents * noShowFeePercent) / 100),
  };
}

/**
 * Returns an English plain-language summary of cancellation terms, for server
 * callers (SMS) until Phase 2 localizes them. UI callers should render
 * describeCancellationPolicy() through the message catalog instead.
 *
 * Example: "Free cancellation until 24 hours before your reservation.
 *           After that, a 50% fee ($50.00) applies. If you don't show up
 *           for your reservation, a 100% no-show fee ($100.00) applies."
 */
export function formatCancellationTerms(
  policy: CancellationPolicy | null,
  currency: string
): string {
  const d = describeCancellationPolicy(policy);
  if (d.kind === "no-fees") {
    return "No cancellation fees apply.";
  }

  return (
    `Free cancellation up to ${d.freeHours} hours before your reservation. ` +
    `After that, a ${d.lateFeePercent}% fee (${formatCents(d.lateFeeAmountCents, currency)}) applies. ` +
    `If you don't show up for your reservation, a ${d.noShowFeePercent}% no-show fee ` +
    `(${formatCents(d.noShowFeeAmountCents, currency)}) applies.`
  );
}

function formatCents(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(cents / 100);
}
