import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { assessGuestReliability } from "./guest-reliability.js";

describe("assessGuestReliability", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("escalation (trusted → standard → risky)", () => {
    it("returns trusted for a guest with 0 no-shows", () => {
      expect(
        assessGuestReliability({ noShowCount: 0, visitCount: 3, lastNoShowAt: null }, null)
      ).toBe("trusted");
    });

    it("returns standard for a guest with 1 no-show (below default threshold of 2)", () => {
      const lastNoShow = new Date();
      expect(
        assessGuestReliability({ noShowCount: 1, visitCount: 5, lastNoShowAt: lastNoShow }, null)
      ).toBe("standard");
    });

    it("returns risky for a guest at the default threshold of 2 no-shows", () => {
      const lastNoShow = new Date();
      expect(
        assessGuestReliability({ noShowCount: 2, visitCount: 5, lastNoShowAt: lastNoShow }, null)
      ).toBe("risky");
    });
  });

  describe("threshold resolution from VenueSettings", () => {
    it("uses the venue-configured autoDepositAfterNoShows threshold", () => {
      const lastNoShow = new Date();
      expect(
        assessGuestReliability(
          { noShowCount: 2, visitCount: 5, lastNoShowAt: lastNoShow },
          { autoDepositAfterNoShows: 3 }
        )
      ).toBe("standard");
      expect(
        assessGuestReliability(
          { noShowCount: 3, visitCount: 5, lastNoShowAt: lastNoShow },
          { autoDepositAfterNoShows: 3 }
        )
      ).toBe("risky");
    });

    it("falls back to the shared default threshold when venue settings are null", () => {
      const lastNoShow = new Date();
      expect(
        assessGuestReliability({ noShowCount: 2, visitCount: 5, lastNoShowAt: lastNoShow }, null)
      ).toBe("risky");
    });

    it("falls back to the shared default threshold when venue settings omit autoDepositAfterNoShows", () => {
      const lastNoShow = new Date();
      expect(
        assessGuestReliability({ noShowCount: 2, visitCount: 5, lastNoShowAt: lastNoShow }, {})
      ).toBe("risky");
    });
  });

  describe("decay — no-shows older than 12 months are weighted at 50%", () => {
    it("2 no-shows older than 12 months decay to 1.0 effective — standard, not risky", () => {
      const thirteenMonthsAgo = new Date();
      thirteenMonthsAgo.setMonth(thirteenMonthsAgo.getMonth() - 13);
      expect(
        assessGuestReliability(
          { noShowCount: 2, visitCount: 5, lastNoShowAt: thirteenMonthsAgo },
          null
        )
      ).toBe("standard");
    });

    it("recent no-shows (within 12 months) do not decay", () => {
      const elevenMonthsAgo = new Date();
      elevenMonthsAgo.setMonth(elevenMonthsAgo.getMonth() - 11);
      expect(
        assessGuestReliability(
          { noShowCount: 2, visitCount: 5, lastNoShowAt: elevenMonthsAgo },
          null
        )
      ).toBe("risky");
    });
  });

  describe("field selection — owns lastNoShowAt regardless of caller's date representation", () => {
    it("accepts lastNoShowAt as an ISO string (the shape the mapped Guest type carries)", () => {
      const thirteenMonthsAgo = new Date();
      thirteenMonthsAgo.setMonth(thirteenMonthsAgo.getMonth() - 13);
      expect(
        assessGuestReliability(
          { noShowCount: 2, visitCount: 5, lastNoShowAt: thirteenMonthsAgo.toISOString() },
          null
        )
      ).toBe("standard");
    });

    it("treats a null lastNoShowAt as no-decay context", () => {
      expect(
        assessGuestReliability({ noShowCount: 2, visitCount: 5, lastNoShowAt: null }, null)
      ).toBe("risky");
    });
  });

  describe("deposit cutoff boundaries (risky ⇔ requiresDeposit)", () => {
    // Documented rule: risky "at or above" autoDepositAfterNoShows (default 2).
    const NOW = new Date("2026-10-10T12:00:00.000Z");

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
    });

    it.each([
      { cutoff: "default 2", noShowCount: 1, settings: null, expected: "standard" },
      { cutoff: "default 2", noShowCount: 2, settings: null, expected: "risky" },
      { cutoff: "default 2", noShowCount: 3, settings: null, expected: "risky" },
      {
        cutoff: "venue 3",
        noShowCount: 2,
        settings: { autoDepositAfterNoShows: 3 },
        expected: "standard",
      },
      {
        cutoff: "venue 3",
        noShowCount: 3,
        settings: { autoDepositAfterNoShows: 3 },
        expected: "risky",
      },
      {
        cutoff: "venue 3",
        noShowCount: 4,
        settings: { autoDepositAfterNoShows: 3 },
        expected: "risky",
      },
      {
        cutoff: "venue 1",
        noShowCount: 0,
        settings: { autoDepositAfterNoShows: 1 },
        expected: "trusted",
      },
      {
        cutoff: "venue 1",
        noShowCount: 1,
        settings: { autoDepositAfterNoShows: 1 },
        expected: "risky",
      },
    ])(
      "$cutoff cutoff: $noShowCount no-show(s) → $expected",
      ({ noShowCount, settings, expected }) => {
        expect(
          assessGuestReliability({ noShowCount, visitCount: 5, lastNoShowAt: NOW }, settings)
        ).toBe(expected);
      }
    );

    it.each([
      { label: "zero visits, zero no-shows", noShowCount: 0, visitCount: 0, expected: "trusted" },
      {
        label: "zero visits, one no-show (all no-shows)",
        noShowCount: 1,
        visitCount: 0,
        expected: "standard",
      },
      {
        label: "zero visits, two no-shows (all no-shows)",
        noShowCount: 2,
        visitCount: 0,
        expected: "risky",
      },
      { label: "many visits, one no-show", noShowCount: 1, visitCount: 500, expected: "standard" },
      { label: "many visits, two no-shows", noShowCount: 2, visitCount: 500, expected: "risky" },
    ])("visit-count edge — $label → $expected", ({ noShowCount, visitCount, expected }) => {
      expect(assessGuestReliability({ noShowCount, visitCount, lastNoShowAt: NOW }, null)).toBe(
        expected
      );
    });

    it("decays at the exact 12-month cutoff only when strictly older", () => {
      const exactlyTwelveMonthsAgo = new Date(NOW);
      exactlyTwelveMonthsAgo.setMonth(NOW.getMonth() - 12);
      const oneMsOlder = new Date(exactlyTwelveMonthsAgo.getTime() - 1);

      // 3 no-shows: undecayed → risky; decayed (×0.5 = 1.5) → standard.
      expect(
        assessGuestReliability(
          { noShowCount: 3, visitCount: 5, lastNoShowAt: exactlyTwelveMonthsAgo },
          null
        )
      ).toBe("risky");
      expect(
        assessGuestReliability({ noShowCount: 3, visitCount: 5, lastNoShowAt: oneMsOlder }, null)
      ).toBe("standard");
    });

    it.each([
      {
        label: "4 no-shows exactly 12 months old (undecayed)",
        noShowCount: 4,
        age: "exact",
        expected: "risky",
      },
      {
        label: "4 no-shows 1 ms older than 12 months (decays to 2.0)",
        noShowCount: 4,
        age: "older",
        expected: "risky",
      },
      {
        label: "3 no-shows 11 months old (undecayed)",
        noShowCount: 3,
        age: "recent",
        expected: "risky",
      },
      {
        label: "1 no-show 1 ms older than 12 months (decays to 0.5)",
        noShowCount: 1,
        age: "older",
        expected: "standard",
      },
    ])("decayed-count edge — $label → $expected", ({ noShowCount, age, expected }) => {
      const exactlyTwelveMonthsAgo = new Date(NOW);
      exactlyTwelveMonthsAgo.setMonth(NOW.getMonth() - 12);
      const lastNoShowAt =
        age === "exact"
          ? exactlyTwelveMonthsAgo
          : age === "older"
            ? new Date(exactlyTwelveMonthsAgo.getTime() - 1)
            : new Date(new Date(NOW).setMonth(NOW.getMonth() - 11));
      expect(assessGuestReliability({ noShowCount, visitCount: 5, lastNoShowAt }, null)).toBe(
        expected
      );
    });
  });
});
