import { describe, it, expect, afterEach, vi } from "vitest";
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
});
