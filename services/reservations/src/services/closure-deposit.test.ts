import { describe, expect, it } from "vitest";
import { owesRefund, refundOwedCents } from "./closure-deposit.js";

const deposit = (over: Record<string, unknown> = {}) => ({
  amountCents: 4000,
  status: "held",
  stripePaymentIntentId: "pi_1" as string | null,
  refundAmountCents: null as number | null,
  postCaptureRefundCents: null as number | null,
  ...over,
});

// `owesRefund` decides whether the refund job runs. It never reads the estimate: the job settles
// against Stripe, and a row-based 0 (a failed dashboard refund still counted, a planned leg that
// never landed) must not stop it.
describe("owesRefund (does the refund job run)", () => {
  it.each(["held", "pending"])("runs for a live %s deposit with a payment intent", (s) => {
    expect(owesRefund(deposit({ status: s }))).toBe(true);
  });

  it("does not run for a pending deposit with no payment intent: the job settled it as none", () => {
    expect(owesRefund(deposit({ status: "pending", stripePaymentIntentId: null }))).toBe(false);
  });

  it("still runs for a held deposit with no payment intent", () => {
    expect(owesRefund(deposit({ status: "held", stripePaymentIntentId: null }))).toBe(true);
  });

  it.each(["applied", "forfeited", "partial_refunded"])(
    "runs for a captured %s deposit with a payment intent",
    (s) => {
      expect(owesRefund(deposit({ status: s }))).toBe(true);
    }
  );

  it("runs for a captured deposit whose recorded refunds already cover it, so the job can check Stripe", () => {
    expect(owesRefund(deposit({ status: "applied", postCaptureRefundCents: 4000 }))).toBe(true);
    expect(
      owesRefund(
        deposit({
          status: "partial_refunded",
          refundAmountCents: 3000,
          postCaptureRefundCents: 2000,
        })
      )
    ).toBe(true);
  });

  it("does not run for a captured deposit with no payment intent", () => {
    expect(owesRefund(deposit({ status: "applied", stripePaymentIntentId: null }))).toBe(false);
  });

  it.each(["refunded", "uncollectable"])("does not run for a %s deposit", (s) => {
    expect(owesRefund(deposit({ status: s }))).toBe(false);
  });
});

describe("refundOwedCents (the estimate the notice may promise)", () => {
  it("takes a dashboard refund off a captured deposit", () => {
    expect(refundOwedCents(deposit({ status: "applied", postCaptureRefundCents: 1500 }))).toBe(
      2500
    );
  });

  it("takes the deposit's own partial leg off a partial_refunded deposit", () => {
    expect(refundOwedCents(deposit({ status: "partial_refunded", refundAmountCents: 1000 }))).toBe(
      3000
    );
  });

  it("never goes below zero", () => {
    expect(refundOwedCents(deposit({ status: "applied", postCaptureRefundCents: 9000 }))).toBe(0);
  });
});
