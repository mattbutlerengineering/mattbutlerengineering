import { describe, expect, it } from "vitest";
import { DepositStatusViewSchema } from "./reservation.js";

const base = {
  status: "held",
  amountCents: 2500,
  currency: "usd",
  heldAt: "2026-11-20T10:00:00.000Z",
  appliedAt: null,
  refundedAt: null,
  forfeitedAt: null,
  uncollectableAt: null,
  postCaptureRefundCents: null,
  refundAmountCents: null,
};

describe("DepositStatusViewSchema", () => {
  it("accepts the narrow member-facing shape", () => {
    expect(DepositStatusViewSchema.parse(base)).toEqual(base);
  });

  it("strips Stripe ids, deposit ids and timestamps it does not allowlist", () => {
    const parsed = DepositStatusViewSchema.parse({
      ...base,
      id: "dep-1",
      reservationId: "res-1",
      stripePaymentIntentId: "pi_123",
      stripeCustomerId: "cus_123",
    });
    expect(Object.keys(parsed).sort()).toEqual(Object.keys(base).sort());
  });

  it("tolerates a server that predates the optional fields", () => {
    const { uncollectableAt, postCaptureRefundCents, refundAmountCents, ...old } = base;
    void uncollectableAt;
    void postCaptureRefundCents;
    void refundAmountCents;
    expect(DepositStatusViewSchema.safeParse(old).success).toBe(true);
  });

  it("rejects an unknown status", () => {
    expect(DepositStatusViewSchema.safeParse({ ...base, status: "bogus" }).success).toBe(false);
  });
});
