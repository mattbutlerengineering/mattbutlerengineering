import { describe, it, expect } from "vitest";
import {
  STATUS_BADGE_VARIANT,
  STATUS_LABEL,
  formatReservationTime,
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

  describe("STATUS_LABEL", () => {
    it("maps PENDING to Pending", () => {
      expect(STATUS_LABEL.PENDING).toBe("Pending");
    });

    it("maps CONFIRMED to Confirmed", () => {
      expect(STATUS_LABEL.CONFIRMED).toBe("Confirmed");
    });

    it("maps CANCELLED to Cancelled", () => {
      expect(STATUS_LABEL.CANCELLED).toBe("Cancelled");
    });

    it("maps COMPLETED to Completed", () => {
      expect(STATUS_LABEL.COMPLETED).toBe("Completed");
    });

    it("maps NO_SHOW to No Show", () => {
      expect(STATUS_LABEL.NO_SHOW).toBe("No Show");
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
});
