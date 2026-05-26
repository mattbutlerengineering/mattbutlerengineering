import { describe, it, expect } from "vitest";
import { computeGuestRisk } from "./guest-risk.js";
import type { NoShowRecord } from "./guest-risk.js";

// Recent no-show (within 12 months) — counts as 1.0
function recentNoShow(): NoShowRecord {
  return { reservationDate: new Date("2026-01-01T00:00:00Z") };
}

// Old no-show (older than 12 months) — counts as 0.5
function oldNoShow(): NoShowRecord {
  return { reservationDate: new Date("2024-01-01T00:00:00Z") };
}

describe("computeGuestRisk", () => {
  describe("zero no-shows", () => {
    it("returns trusted when no no-shows", () => {
      expect(computeGuestRisk([], 10)).toBe("trusted");
    });

    it("returns trusted when totalReservations is 0", () => {
      expect(computeGuestRisk([], 0)).toBe("trusted");
    });
  });

  describe("weight decay", () => {
    it("counts recent no-show (< 12 months) as 1.0", () => {
      // 1 recent no-show < threshold of 2 → standard
      expect(computeGuestRisk([recentNoShow()], 5)).toBe("standard");
    });

    it("counts old no-show (> 12 months) as 0.5", () => {
      // 1 old no-show = 0.5 weighted → below threshold of 2 → standard
      expect(computeGuestRisk([oldNoShow()], 5)).toBe("standard");
    });

    it("two old no-shows = 1.0 weighted → standard (below default threshold 2)", () => {
      expect(computeGuestRisk([oldNoShow(), oldNoShow()], 10)).toBe("standard");
    });

    it("four old no-shows = 2.0 weighted → risky (meets default threshold 2)", () => {
      expect(computeGuestRisk([oldNoShow(), oldNoShow(), oldNoShow(), oldNoShow()], 10)).toBe(
        "risky"
      );
    });
  });

  describe("risk thresholds", () => {
    it("returns standard when weighted no-shows < threshold", () => {
      // 1 recent = 1.0 weighted, threshold = 2 → standard
      expect(computeGuestRisk([recentNoShow()], 5, 2)).toBe("standard");
    });

    it("returns risky when weighted no-shows >= threshold", () => {
      // 2 recent = 2.0 weighted, threshold = 2 → risky
      expect(computeGuestRisk([recentNoShow(), recentNoShow()], 10, 2)).toBe("risky");
    });

    it("respects custom threshold", () => {
      // 1 recent = 1.0 weighted, threshold = 1 → risky
      expect(computeGuestRisk([recentNoShow()], 5, 1)).toBe("risky");
    });

    it("returns trusted when zero weighted no-shows even with history", () => {
      expect(computeGuestRisk([], 20)).toBe("trusted");
    });
  });

  describe("boundary conditions", () => {
    it("no-show exactly 12 months ago is old (counts as 0.5)", () => {
      // Exactly 12 months before our 'now' date 2026-05-26 → 2025-05-26
      const twelveMonthsAgo = new Date("2025-05-26T00:00:00Z");
      const record: NoShowRecord = { reservationDate: twelveMonthsAgo };
      // 0.5 weighted < 2 threshold → standard
      expect(computeGuestRisk([record], 5)).toBe("standard");
    });

    it("no-show 11 months ago is recent (counts as 1.0)", () => {
      const elevenMonthsAgo = new Date("2025-06-26T00:00:00Z");
      const record: NoShowRecord = { reservationDate: elevenMonthsAgo };
      // 1.0 weighted < 2 threshold → standard
      expect(computeGuestRisk([record], 5)).toBe("standard");
    });

    it("mixed recent and old no-shows aggregate correctly", () => {
      // 1 recent (1.0) + 2 old (2 * 0.5 = 1.0) = 2.0 total → risky at threshold 2
      expect(
        computeGuestRisk([recentNoShow(), oldNoShow(), oldNoShow()], 15, 2)
      ).toBe("risky");
    });
  });
});
