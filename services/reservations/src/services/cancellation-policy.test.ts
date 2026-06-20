import { describe, it, expect } from "vitest";
import { evaluateCancellationFee, formatCancellationTerms } from "./cancellation-policy.js";
import type { CancellationPolicy } from "./cancellation-policy.js";

const BASE_DEPOSIT_CENTS = 10000; // $100.00

describe("evaluateCancellationFee", () => {
  // Policy: 24h free window, 50% late fee, 100% no-show fee
  const policy: CancellationPolicy = {
    depositAmountCents: BASE_DEPOSIT_CENTS,
    freeCancellationHours: 24,
    lateCancellationFeePercent: 50,
    noShowFeePercent: 100,
  };

  const reservationTime = new Date("2026-06-20T19:00:00Z");

  describe("free cancellation (within window)", () => {
    it("returns feeType 'none' and full refund when cancellation is well within the free window", () => {
      // Cancelled 48h before reservation
      const cancellationTime = new Date("2026-06-18T19:00:00Z");
      const result = evaluateCancellationFee(policy, reservationTime, cancellationTime);

      expect(result.feeType).toBe("none");
      expect(result.feeAmountCents).toBe(0);
      expect(result.refundAmountCents).toBe(BASE_DEPOSIT_CENTS);
      expect(result.depositAction).toBe("refund_full");
    });

    it("returns feeType 'none' at exactly the boundary (inclusive — 24h before)", () => {
      // Cancelled exactly 24h before = boundary, should be within free window
      const cancellationTime = new Date("2026-06-19T19:00:00Z");
      const result = evaluateCancellationFee(policy, reservationTime, cancellationTime);

      expect(result.feeType).toBe("none");
      expect(result.feeAmountCents).toBe(0);
      expect(result.refundAmountCents).toBe(BASE_DEPOSIT_CENTS);
      expect(result.depositAction).toBe("refund_full");
    });
  });

  describe("late cancellation (outside window, before reservation)", () => {
    it("returns feeType 'late' and partial fee when cancellation is after the free window", () => {
      // Cancelled 12h before reservation (inside the 24h late window)
      const cancellationTime = new Date("2026-06-20T07:00:00Z");
      const result = evaluateCancellationFee(policy, reservationTime, cancellationTime);

      expect(result.feeType).toBe("late");
      expect(result.feeAmountCents).toBe(5000); // 50% of $100
      expect(result.refundAmountCents).toBe(5000); // other 50% refunded
      expect(result.depositAction).toBe("refund_partial");
    });

    it("rounds fee amount down to nearest cent (integer math)", () => {
      const oddPolicy: CancellationPolicy = {
        depositAmountCents: 999, // $9.99
        freeCancellationHours: 24,
        lateCancellationFeePercent: 33,
        noShowFeePercent: 100,
      };
      const cancellationTime = new Date("2026-06-20T07:00:00Z");
      const result = evaluateCancellationFee(oddPolicy, reservationTime, cancellationTime);

      // 33% of 999 = 329.67 → floor = 329 cents
      expect(result.feeAmountCents).toBe(329);
      expect(result.refundAmountCents).toBe(999 - 329);
    });
  });

  describe("no-show (cancellation at or after reservation time)", () => {
    it("returns feeType 'noshow' when cancellation is at the reservation time", () => {
      const cancellationTime = new Date("2026-06-20T19:00:00Z");
      const result = evaluateCancellationFee(policy, reservationTime, cancellationTime);

      expect(result.feeType).toBe("noshow");
      expect(result.feeAmountCents).toBe(BASE_DEPOSIT_CENTS); // 100%
      expect(result.refundAmountCents).toBe(0);
      expect(result.depositAction).toBe("forfeit");
    });

    it("returns feeType 'noshow' when cancellation is after the reservation time", () => {
      const cancellationTime = new Date("2026-06-20T21:00:00Z");
      const result = evaluateCancellationFee(policy, reservationTime, cancellationTime);

      expect(result.feeType).toBe("noshow");
      expect(result.feeAmountCents).toBe(BASE_DEPOSIT_CENTS);
      expect(result.refundAmountCents).toBe(0);
      expect(result.depositAction).toBe("forfeit");
    });
  });

  describe("no policy configured", () => {
    it("returns full refund with feeType 'none' when policy is null", () => {
      const cancellationTime = new Date("2026-06-20T07:00:00Z");
      const result = evaluateCancellationFee(null, reservationTime, cancellationTime);

      expect(result.feeType).toBe("none");
      expect(result.feeAmountCents).toBe(0);
      expect(result.refundAmountCents).toBe(0);
      expect(result.depositAction).toBe("refund_full");
    });

    it("returns full refund when policy has no freeCancellationHours (no policy configured)", () => {
      const noWindowPolicy: CancellationPolicy = {
        depositAmountCents: BASE_DEPOSIT_CENTS,
        freeCancellationHours: null,
        lateCancellationFeePercent: null,
        noShowFeePercent: null,
      };
      const cancellationTime = new Date("2026-06-20T18:30:00Z"); // 30 min before
      const result = evaluateCancellationFee(noWindowPolicy, reservationTime, cancellationTime);

      expect(result.feeType).toBe("none");
      expect(result.feeAmountCents).toBe(0);
      expect(result.refundAmountCents).toBe(BASE_DEPOSIT_CENTS);
      expect(result.depositAction).toBe("refund_full");
    });
  });

  describe("100% late cancellation fee", () => {
    it("deposits full forfeit when lateCancellationFeePercent is 100", () => {
      const fullFeePolicy: CancellationPolicy = {
        depositAmountCents: BASE_DEPOSIT_CENTS,
        freeCancellationHours: 24,
        lateCancellationFeePercent: 100,
        noShowFeePercent: 100,
      };
      const cancellationTime = new Date("2026-06-20T07:00:00Z");
      const result = evaluateCancellationFee(fullFeePolicy, reservationTime, cancellationTime);

      expect(result.feeType).toBe("late");
      expect(result.feeAmountCents).toBe(BASE_DEPOSIT_CENTS);
      expect(result.refundAmountCents).toBe(0);
      expect(result.depositAction).toBe("refund_partial");
    });
  });

  describe("zero deposit amount", () => {
    it("returns zero fees when deposit amount is zero", () => {
      const zeroPolicyFee: CancellationPolicy = {
        depositAmountCents: 0,
        freeCancellationHours: 24,
        lateCancellationFeePercent: 50,
        noShowFeePercent: 100,
      };
      const cancellationTime = new Date("2026-06-20T07:00:00Z");
      const result = evaluateCancellationFee(zeroPolicyFee, reservationTime, cancellationTime);

      expect(result.feeAmountCents).toBe(0);
      expect(result.refundAmountCents).toBe(0);
    });
  });
});

describe("formatCancellationTerms", () => {
  it("returns plain-language summary for standard policy", () => {
    const policy: CancellationPolicy = {
      depositAmountCents: 10000,
      freeCancellationHours: 24,
      lateCancellationFeePercent: 50,
      noShowFeePercent: 100,
    };
    const result = formatCancellationTerms(policy, "usd");

    expect(result).toContain("24");
    expect(result).toContain("50%");
  });

  it("returns 'No cancellation fees' when no policy is configured", () => {
    const result = formatCancellationTerms(null, "usd");
    expect(result).toContain("No cancellation fees");
  });

  it("returns 'No cancellation fees' when freeCancellationHours is null", () => {
    const policy: CancellationPolicy = {
      depositAmountCents: 10000,
      freeCancellationHours: null,
      lateCancellationFeePercent: null,
      noShowFeePercent: null,
    };
    const result = formatCancellationTerms(policy, "usd");
    expect(result).toContain("No cancellation fees");
  });
});
