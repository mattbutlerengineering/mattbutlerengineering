import { describe, expect, it } from "vitest";
import { normalizeGuestRisk, normalizeReservationStatus } from "./booking-vocabulary";

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
