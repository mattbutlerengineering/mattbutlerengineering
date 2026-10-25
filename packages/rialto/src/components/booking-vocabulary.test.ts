import { describe, expect, it } from "vitest";
import {
  displayClockTime,
  normalizeGuestRisk,
  normalizeReservationStatus,
} from "./booking-vocabulary";

describe("normalizeReservationStatus", () => {
  it.each(["No show", "no-show", "NO_SHOW", "  no show  ", "No-Show"])(
    "%j resolves to noShow with the error tone",
    (raw) => {
      expect(normalizeReservationStatus(raw)).toEqual({ key: "noShow", tone: "error" });
    }
  );

  it.each([
    ["PENDING", "pending", "warning"],
    ["confirmed", "confirmed", "success"],
    ["Cancelled", "cancelled", "error"],
    ["COMPLETED", "completed", "neutral"],
    ["seated", "seated", "neutral"],
  ] as const)("%j resolves to %s with the %s tone", (raw, key, tone) => {
    expect(normalizeReservationStatus(raw)).toEqual({ key, tone });
  });

  it.each(["", "   ", "WAITLISTED", "on its way"])(
    "%j is unknown: no key and the neutral tone",
    (raw) => {
      expect(normalizeReservationStatus(raw)).toEqual({ key: undefined, tone: "neutral" });
    }
  );
});

describe("normalizeGuestRisk", () => {
  it.each([
    ["risky", "risky", "error"],
    ["STANDARD", "standard", "warning"],
    [" Trusted ", "trusted", "neutral"],
  ] as const)("%j resolves to %s with the %s tone", (raw, key, tone) => {
    expect(normalizeGuestRisk(raw)).toEqual({ key, tone });
  });

  it.each(["", "vip", "high-risk"])("%j is unknown: no key and the neutral tone", (raw) => {
    expect(normalizeGuestRisk(raw)).toEqual({ key: undefined, tone: "neutral" });
  });
});

// Live chat batch 8 (F30): the agent's localTime is 24-hour "HH:mm", and the chat
// showed "09:00" and "20:30" to an en-US host.
describe("displayClockTime", () => {
  it("formats a 24-hour HH:mm in the locale's clock", () => {
    expect(displayClockTime("09:26", "en-US")).toMatch(/^9:26\sAM$/);
    expect(displayClockTime("20:30", "en-US")).toMatch(/^8:30\sPM$/);
    expect(displayClockTime("20:30", "es-MX")).toMatch(/^8:30\s?p\.?\s?m\.?$/);
    expect(displayClockTime("20:30", "fr-CA")).toMatch(/^20\sh\s30$/);
  });

  it("passes display text that is not a bare HH:mm through unchanged", () => {
    for (const raw of ["7:30 PM", "24:00", "9:5", "noon", ""]) {
      expect(displayClockTime(raw, "en-US")).toBe(raw);
    }
  });
});
