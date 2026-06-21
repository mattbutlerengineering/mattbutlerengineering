import { describe, it, expect, vi, afterEach } from "vitest";
import { computeGuestRisk } from "./guest-risk.js";

describe("computeGuestRisk", () => {
  describe("trusted (0 no-shows)", () => {
    it("returns trusted for a guest with 0 no-shows and 1 reservation", () => {
      expect(computeGuestRisk(0, 1, null)).toBe("trusted");
    });

    it("returns trusted for a guest with 0 no-shows and many reservations", () => {
      expect(computeGuestRisk(0, 10, null)).toBe("trusted");
    });
  });

  describe("standard (1 no-show)", () => {
    it("returns standard for a guest with 1 no-show", () => {
      const lastNoShow = new Date();
      expect(computeGuestRisk(1, 5, lastNoShow)).toBe("standard");
    });

    it("returns standard for 1 no-show with no total reservations context", () => {
      expect(computeGuestRisk(1, 1, null)).toBe("standard");
    });
  });

  describe("risky (2+ no-shows)", () => {
    it("returns risky for a guest with exactly 2 no-shows", () => {
      const lastNoShow = new Date();
      expect(computeGuestRisk(2, 5, lastNoShow)).toBe("risky");
    });

    it("returns risky for a guest with 3 no-shows", () => {
      const lastNoShow = new Date();
      expect(computeGuestRisk(3, 10, lastNoShow)).toBe("risky");
    });
  });

  describe("configurable threshold", () => {
    it("uses custom threshold of 3 — 2 no-shows is standard", () => {
      const lastNoShow = new Date();
      expect(computeGuestRisk(2, 10, lastNoShow, { riskyThreshold: 3 })).toBe("standard");
    });

    it("uses custom threshold of 3 — 3 no-shows is risky", () => {
      const lastNoShow = new Date();
      expect(computeGuestRisk(3, 10, lastNoShow, { riskyThreshold: 3 })).toBe("risky");
    });
  });

  describe("decay — old no-shows reduce weight by 50%", () => {
    it("1 no-show older than 12 months decays to 0.5 effective — still standard", () => {
      const thirteenMonthsAgo = new Date();
      thirteenMonthsAgo.setMonth(thirteenMonthsAgo.getMonth() - 13);
      // 1 * 0.5 = 0.5, threshold for risky is 2 → standard
      expect(computeGuestRisk(1, 5, thirteenMonthsAgo)).toBe("standard");
    });

    it("2 no-shows all older than 12 months decay to 1.0 effective — standard not risky", () => {
      const thirteenMonthsAgo = new Date();
      thirteenMonthsAgo.setMonth(thirteenMonthsAgo.getMonth() - 13);
      // 2 * 0.5 = 1.0, threshold for risky is 2 → standard
      expect(computeGuestRisk(2, 10, thirteenMonthsAgo)).toBe("standard");
    });

    it("3 no-shows all older than 12 months decay to 1.5 effective — standard", () => {
      const thirteenMonthsAgo = new Date();
      thirteenMonthsAgo.setMonth(thirteenMonthsAgo.getMonth() - 13);
      // 3 * 0.5 = 1.5, threshold for risky is 2 → standard
      expect(computeGuestRisk(3, 10, thirteenMonthsAgo)).toBe("standard");
    });

    it("4 no-shows older than 12 months decay to 2.0 effective — risky", () => {
      const thirteenMonthsAgo = new Date();
      thirteenMonthsAgo.setMonth(thirteenMonthsAgo.getMonth() - 13);
      // 4 * 0.5 = 2.0, threshold for risky is 2 → risky
      expect(computeGuestRisk(4, 10, thirteenMonthsAgo)).toBe("risky");
    });

    it("recent no-show (within 12 months) does not decay", () => {
      const elevenMonthsAgo = new Date();
      elevenMonthsAgo.setMonth(elevenMonthsAgo.getMonth() - 11);
      // 2 * 1.0 = 2.0, threshold for risky is 2 → risky
      expect(computeGuestRisk(2, 5, elevenMonthsAgo)).toBe("risky");
    });
  });

  describe("edge cases", () => {
    it("returns trusted for new guest with 0 reservations", () => {
      expect(computeGuestRisk(0, 0, null)).toBe("trusted");
    });

    it("applies decay when lastNoShowDate is exactly 12 months ago", () => {
      // Freeze time so the test's reference date and applyDecay's internal
      // `new Date()` share the same instant — otherwise the sub-ms gap between
      // them tips the exact-12-month boundary and flips risky→standard (flaky).
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-20T12:00:00.000Z"));
      const twelveMonthsAgo = new Date("2025-06-20T12:00:00.000Z");
      // Exactly 12 months = NOT decayed (decay applies only after 12 months)
      expect(computeGuestRisk(2, 5, twelveMonthsAgo)).toBe("risky");
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});
