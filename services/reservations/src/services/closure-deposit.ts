/**
 * What a closure cancel owes the guest for a deposit. Two separate questions, never mixed:
 *
 * - {@link owesRefund}: does the CLOSURE_REFUND job run for it. Decided from the deposit's status
 *   alone and never from an amount: the job settles against Stripe's own totals, and the row's
 *   recorded refunds can lie in both directions (a dashboard refund that later failed stays
 *   counted; a planned partial leg can fail to land). An estimate of 0 must not stop the job.
 * - {@link refundOwedCents}: what the notice may promise the guest. An estimate from the row.
 */

export interface RefundableDeposit {
  amountCents: number;
  status: string;
  stripePaymentIntentId: string | null;
  refundAmountCents?: number | null;
  postCaptureRefundCents?: number | null;
}

/** Deposits that still hold or await the guest's money: a cancel owes them a refund or void. */
const LIVE_DEPOSIT_STATUSES: ReadonlySet<string> = new Set(["pending", "held"]);

/**
 * Deposits staff captured (`/deposits/:id/capture` takes any held deposit, seated or not) or
 * forfeited before the closure: the money is gone from the authorization, but a cancel still owes
 * it back through Stripe's refund API. Only with a payment intent; without one there is nothing to
 * refund through Stripe.
 */
const CAPTURED_DEPOSIT_STATUSES: ReadonlySet<string> = new Set([
  "applied",
  "forfeited",
  "partial_refunded",
]);

/**
 * An estimate of what a closure refund still owes, from the row alone: the deposit less its
 * planned partial refund (`refundAmountCents`) and anything refunded after capture. The job
 * itself reads Stripe's totals on the charge, which can differ.
 */
export function refundOwedCents(
  deposit: Pick<
    RefundableDeposit,
    "amountCents" | "status" | "refundAmountCents" | "postCaptureRefundCents"
  >
): number {
  const ownLeg = deposit.status === "partial_refunded" ? (deposit.refundAmountCents ?? 0) : 0;
  return Math.max(0, deposit.amountCents - ownLeg - (deposit.postCaptureRefundCents ?? 0));
}

/**
 * Whether a cancel hands the deposit to the refund job. A `pending` deposit with no payment intent
 * never reached Stripe: the job settles it as `none` without a Stripe call (`resolvePending`), so
 * leaving it out changes no refund.
 */
export function owesRefund(deposit: RefundableDeposit): boolean {
  if (deposit.status === "pending" && !deposit.stripePaymentIntentId) return false;
  return (
    LIVE_DEPOSIT_STATUSES.has(deposit.status) ||
    (CAPTURED_DEPOSIT_STATUSES.has(deposit.status) && Boolean(deposit.stripePaymentIntentId))
  );
}
