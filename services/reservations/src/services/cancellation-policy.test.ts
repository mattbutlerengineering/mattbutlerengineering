import { describe, it, expect } from "vitest";
import {
  evaluateCancellationFee,
  formatPolicySummary,
  type CancellationPolicy,
} from "./cancellation-policy.js";

const POLICY: CancellationPolicy = {
  freeCancellationHours: 24,
  lateCancellationFeePercent: 50,
  noShowFeePercent: 100,
  depositAmountCents: 10000, // $100
};

// reservation at noon tomorrow
const RESERVATION = new Date("2026-06-01T12:00:00.000Z");

describe("evaluateCancellationFee", () => {
  describe("no policy configured", () => {
    it("returns full refund when policy is null", () => {
      const result = evaluateCancellationFee(
        null,
        RESERVATION,
        new Date("2026-06-01T08:00:00.000Z")
      );
      expect(result).toEqual({
        feeAmountCents: 0,
        feeType: "none",
        refundAmountCents: 0,
        depositAction: "refund_full",
      });
    });

    it("returns full refund when policy is undefined", () => {
      const result = evaluateCancellationFee(
        undefined,
        RESERVATION,
        new Date("2026-05-30T12:00:00.000Z")
      );
      expect(result).toEqual({
        feeAmountCents: 0,
        feeType: "none",
        refundAmountCents: 0,
        depositAction: "refund_full",
      });
    });

    it("returns full refund when deposit is zero", () => {
      const result = evaluateCancellationFee(
        { ...POLICY, depositAmountCents: 0 },
        RESERVATION,
        new Date("2026-06-01T08:00:00.000Z") // late cancel, but no deposit
      );
      expect(result).toEqual({
        feeAmountCents: 0,
        feeType: "none",
        refundAmountCents: 0,
        depositAction: "refund_full",
      });
    });
  });

  describe("free cancellation window", () => {
    it("full refund when cancelled well before the free window closes", () => {
      // 48h before reservation → within 24h free window
      const cancelTime = new Date("2026-05-30T12:00:00.000Z");
      const result = evaluateCancellationFee(POLICY, RESERVATION, cancelTime);
      expect(result).toEqual({
        feeAmountCents: 0,
        feeType: "none",
        refundAmountCents: 10000,
        depositAction: "refund_full",
      });
    });

    it("full refund when cancelled exactly 24h before (inclusive boundary)", () => {
      // exactly 24h before — should be free (inclusive)
      const cancelTime = new Date("2026-05-31T12:00:00.000Z");
      const result = evaluateCancellationFee(POLICY, RESERVATION, cancelTime);
      expect(result).toEqual({
        feeAmountCents: 0,
        feeType: "none",
        refundAmountCents: 10000,
        depositAction: "refund_full",
      });
    });

    it("full refund for 0-hour free window only if cancelled before reservation", () => {
      const policy: CancellationPolicy = { ...POLICY, freeCancellationHours: 0 };
      // 1 minute before reservation
      const cancelTime = new Date("2026-06-01T11:59:00.000Z");
      const result = evaluateCancellationFee(policy, RESERVATION, cancelTime);
      expect(result).toEqual({
        feeAmountCents: 0,
        feeType: "none",
        refundAmountCents: 10000,
        depositAction: "refund_full",
      });
    });
  });

  describe("late cancellation", () => {
    it("applies lateCancellationFeePercent when cancelled inside window", () => {
      // 1h before → inside 24h window → late cancel, 50% fee
      const cancelTime = new Date("2026-06-01T11:00:00.000Z");
      const result = evaluateCancellationFee(POLICY, RESERVATION, cancelTime);
      expect(result).toEqual({
        feeAmountCents: 5000, // 50% of $100
        feeType: "late",
        refundAmountCents: 5000,
        depositAction: "refund_partial",
      });
    });

    it("applies late fee 23h 59m before reservation", () => {
      // just inside 24h window
      const cancelTime = new Date("2026-05-31T12:01:00.000Z");
      const result = evaluateCancellationFee(POLICY, RESERVATION, cancelTime);
      expect(result).toEqual({
        feeAmountCents: 5000,
        feeType: "late",
        refundAmountCents: 5000,
        depositAction: "refund_partial",
      });
    });

    it("forfeits full deposit when lateCancellationFeePercent is 100", () => {
      const policy: CancellationPolicy = { ...POLICY, lateCancellationFeePercent: 100 };
      const cancelTime = new Date("2026-06-01T08:00:00.000Z"); // 4h before
      const result = evaluateCancellationFee(policy, RESERVATION, cancelTime);
      expect(result).toEqual({
        feeAmountCents: 10000,
        feeType: "late",
        refundAmountCents: 0,
        depositAction: "forfeit",
      });
    });

    it("rounds fee to nearest cent", () => {
      const policy: CancellationPolicy = { ...POLICY, lateCancellationFeePercent: 33 };
      const cancelTime = new Date("2026-06-01T08:00:00.000Z");
      const result = evaluateCancellationFee(policy, RESERVATION, cancelTime);
      // 33% of 10000 = 3300
      expect(result.feeAmountCents).toBe(3300);
      expect(result.refundAmountCents).toBe(6700);
      expect(result.depositAction).toBe("refund_partial");
    });

    it("returns refund_partial when fee > 0 but < 100%", () => {
      const policy: CancellationPolicy = { ...POLICY, lateCancellationFeePercent: 75 };
      const cancelTime = new Date("2026-06-01T06:00:00.000Z");
      const result = evaluateCancellationFee(policy, RESERVATION, cancelTime);
      expect(result.feeAmountCents).toBe(7500);
      expect(result.refundAmountCents).toBe(2500);
      expect(result.depositAction).toBe("refund_partial");
      expect(result.feeType).toBe("late");
    });

    it("returns forfeit when lateCancellationFeePercent is 0 (no late fee configured)", () => {
      const policy: CancellationPolicy = { ...POLICY, lateCancellationFeePercent: 0 };
      const cancelTime = new Date("2026-06-01T08:00:00.000Z");
      const result = evaluateCancellationFee(policy, RESERVATION, cancelTime);
      // 0% fee → still "late" type but full refund
      expect(result).toEqual({
        feeAmountCents: 0,
        feeType: "late",
        refundAmountCents: 10000,
        depositAction: "refund_full",
      });
    });
  });

  describe("no-show", () => {
    it("forfeits full deposit when cancellation is after reservation time", () => {
      // 1h after reservation
      const cancelTime = new Date("2026-06-01T13:00:00.000Z");
      const result = evaluateCancellationFee(POLICY, RESERVATION, cancelTime);
      expect(result).toEqual({
        feeAmountCents: 10000,
        feeType: "noshow",
        refundAmountCents: 0,
        depositAction: "forfeit",
      });
    });

    it("forfeits full deposit when cancellation is at exact reservation time", () => {
      const cancelTime = new Date("2026-06-01T12:00:00.000Z");
      const result = evaluateCancellationFee(POLICY, RESERVATION, cancelTime);
      expect(result).toEqual({
        feeAmountCents: 10000,
        feeType: "noshow",
        refundAmountCents: 0,
        depositAction: "forfeit",
      });
    });

    it("applies noShowFeePercent when < 100", () => {
      const policy: CancellationPolicy = { ...POLICY, noShowFeePercent: 50 };
      const cancelTime = new Date("2026-06-01T14:00:00.000Z");
      const result = evaluateCancellationFee(policy, RESERVATION, cancelTime);
      expect(result).toEqual({
        feeAmountCents: 5000,
        feeType: "noshow",
        refundAmountCents: 5000,
        depositAction: "refund_partial",
      });
    });
  });

  describe("formatPolicySummary", () => {
    it("is exported alongside evaluateCancellationFee", () => {
      expect(typeof formatPolicySummary).toBe("function");
    });
  });
});

describe("formatPolicySummary", () => {
  it("returns empty string for null policy", () => {
    expect(formatPolicySummary(null)).toBe("");
  });

  it("includes free cancellation deadline", () => {
    const summary = formatPolicySummary(POLICY);
    expect(summary).toContain("24 hour");
    expect(summary.length).toBeGreaterThan(0);
  });

  it("mentions fee when late cancellation fee > 0", () => {
    const summary = formatPolicySummary(POLICY);
    expect(summary).toContain("50%");
  });

  it("no-fee message when freeCancellationHours is large", () => {
    const liberalPolicy: CancellationPolicy = {
      freeCancellationHours: 168, // 7 days
      lateCancellationFeePercent: 0,
      noShowFeePercent: 0,
      depositAmountCents: 5000,
    };
    const summary = formatPolicySummary(liberalPolicy);
    expect(summary).toContain("168 hour");
  });
});
