import { describe, it, expect } from "vitest";
import {
  STATUS_BADGE_VARIANT,
  formatReservationTime,
  specialRequestsText,
} from "./reservation-display.js";

describe("reservation-display", () => {
  describe("STATUS_BADGE_VARIANT", () => {
    it("maps PENDING to warning", () => {
      expect(STATUS_BADGE_VARIANT.PENDING).toBe("warning");
    });

    it("maps CONFIRMED to success", () => {
      expect(STATUS_BADGE_VARIANT.CONFIRMED).toBe("success");
    });

    it("maps CANCELLED to error", () => {
      expect(STATUS_BADGE_VARIANT.CANCELLED).toBe("error");
    });

    it("maps COMPLETED to neutral", () => {
      expect(STATUS_BADGE_VARIANT.COMPLETED).toBe("neutral");
    });

    it("maps NO_SHOW to error", () => {
      expect(STATUS_BADGE_VARIANT.NO_SHOW).toBe("error");
    });
  });

  describe("formatReservationTime", () => {
    it("formats an ISO datetime to HH:MM", () => {
      // Use a fixed UTC time; locale formatting will produce HH:MM
      const result = formatReservationTime("2026-01-15T18:30:00Z");
      expect(result).toMatch(/\d{1,2}:\d{2}/);
    });

    it("returns a non-empty string for a valid ISO string", () => {
      const result = formatReservationTime("2026-06-22T09:00:00Z");
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("specialRequestsText", () => {
    it.each([null, undefined, "", "   ", "\n\t "])("returns null for %j", (notes) => {
      expect(specialRequestsText(notes)).toBeNull();
    });

    it("trims the ends and keeps the interior line break", () => {
      expect(
        specialRequestsText(
          "  Our anniversary.\nWindow seat if you can, and she can't have tree nuts.  \n"
        )
      ).toBe("Our anniversary.\nWindow seat if you can, and she can't have tree nuts.");
    });

    it("keeps interior spaces as typed", () => {
      expect(specialRequestsText("a  b")).toBe("a  b");
    });

    it("returns untrusted text character for character", () => {
      const untrusted = `<script>alert(1)</script>\n<a href="https://x">x</a> &amp; "double" 'single'`;
      expect(specialRequestsText(untrusted)).toBe(untrusted);
    });
  });
});
