import { describe, expect, it } from "vitest";
import { refundDueCents, refundOwedCents } from "./closure-deposit.js";

const deposit = (over: Record<string, unknown> = {}) => ({
  amountCents: 4000,
  status: "held",
  stripePaymentIntentId: "pi_1" as string | null,
  refundAmountCents: null as number | null,
  postCaptureRefundCents: null as number | null,
  ...over,
});

describe("refundDueCents (what a cancel still owes the guest)", () => {
  it.each(["held", "pending"])("owes the whole of a live %s deposit with a payment intent", (s) => {
    expect(refundDueCents(deposit({ status: s }))).toBe(4000);
  });

  it("owes nothing on a pending deposit with no payment intent: no money was ever taken (#8131)", () => {
    expect(refundDueCents(deposit({ status: "pending", stripePaymentIntentId: null }))).toBe(0);
  });

  it("still owes a held deposit with no payment intent (staff recorded it as held)", () => {
    expect(refundDueCents(deposit({ status: "held", stripePaymentIntentId: null }))).toBe(4000);
  });

  it.each(["applied", "forfeited"])("owes a captured %s deposit less any dashboard refund", (s) => {
    expect(refundDueCents(deposit({ status: s, postCaptureRefundCents: 1500 }))).toBe(2500);
  });

  it("owes nothing on a captured deposit the dashboard already refunded in full", () => {
    expect(refundDueCents(deposit({ status: "applied", postCaptureRefundCents: 4000 }))).toBe(0);
  });

  it("takes the deposit's own partial leg off a partial_refunded deposit", () => {
    expect(refundDueCents(deposit({ status: "partial_refunded", refundAmountCents: 1000 }))).toBe(
      3000
    );
  });

  it("owes nothing on a captured deposit with no payment intent", () => {
    expect(refundDueCents(deposit({ status: "applied", stripePaymentIntentId: null }))).toBe(0);
  });

  it.each(["refunded", "uncollectable"])("owes nothing on a %s deposit", (s) => {
    expect(refundDueCents(deposit({ status: s }))).toBe(0);
  });
});

describe("refundOwedCents", () => {
  it("never goes below zero", () => {
    expect(refundOwedCents(deposit({ status: "applied", postCaptureRefundCents: 9000 }))).toBe(0);
  });
});
