/**
 * What a closure cancel owes the guest for a deposit. One reading, shared by the preview, the
 * closure command (which stores the answer on the outcome) and the notice, so they cannot
 * disagree about whether a refund is coming or for how much.
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
 * What a cancel owes right now, in cents; 0 = nothing. A `pending` deposit with no payment intent
 * never reached Stripe, so no money was taken and none is owed (the refund job settles it as
 * `none`). A captured deposit already refunded in full, say from the Stripe dashboard, owes 0.
 */
export function refundDueCents(deposit: RefundableDeposit): number {
  if (deposit.status === "pending" && !deposit.stripePaymentIntentId) return 0;
  if (LIVE_DEPOSIT_STATUSES.has(deposit.status)) return refundOwedCents(deposit);
  if (CAPTURED_DEPOSIT_STATUSES.has(deposit.status) && deposit.stripePaymentIntentId) {
    return refundOwedCents(deposit);
  }
  return 0;
}

export const owesRefund = (deposit: RefundableDeposit): boolean => refundDueCents(deposit) > 0;
