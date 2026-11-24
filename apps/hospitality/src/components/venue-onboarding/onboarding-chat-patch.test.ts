import { describe, expect, it } from "vitest";
import { applyOnboardingPatch, type OnboardingPatchTarget } from "./onboarding-chat-patch.js";

const CURRENT: OnboardingPatchTarget = {
  locationTime: { ianaTimezone: "America/New_York", currencyCode: "USD" },
  settings: { defaultReservationDuration: "90", maxPartySize: "8", advanceBookingDays: "30" },
};

describe("applyOnboardingPatch: values the form cannot show", () => {
  it("rejects a time zone that is not in the form's list", () => {
    const result = applyOnboardingPatch(CURRENT, {
      step: "locationTime",
      data: { ianaTimezone: "America/Detroit" },
    });
    expect(result.kind).toBe("rejected");
    if (result.kind === "rejected") expect(result.errors.ianaTimezone).toContain("America/Detroit");
  });

  it("rejects a currency that is not in the form's list", () => {
    const result = applyOnboardingPatch(CURRENT, {
      step: "locationTime",
      data: { currencyCode: "CZK" },
    });
    expect(result.kind).toBe("rejected");
    if (result.kind === "rejected") expect(result.errors.currencyCode).toContain("CZK");
  });

  it("applies a patch whose time zone and currency are both offered", () => {
    const result = applyOnboardingPatch(CURRENT, {
      step: "locationTime",
      data: { ianaTimezone: "Europe/Lisbon", currencyCode: "EUR" },
    });
    expect(result.kind).toBe("applied");
  });
});

describe("applyOnboardingPatch", () => {
  it("merges a valid location patch over the current step data", () => {
    const result = applyOnboardingPatch(CURRENT, {
      step: "locationTime",
      data: { ianaTimezone: "America/Chicago" },
    });

    expect(result).toEqual({
      kind: "applied",
      step: "locationTime",
      data: { ianaTimezone: "America/Chicago", currencyCode: "USD" },
    });
  });

  it("merges a valid settings patch", () => {
    const result = applyOnboardingPatch(CURRENT, {
      step: "settings",
      data: { maxPartySize: "12" },
    });

    expect(result).toEqual({
      kind: "applied",
      step: "settings",
      data: { defaultReservationDuration: "90", maxPartySize: "12", advanceBookingDays: "30" },
    });
  });

  it("rejects a patch the step validator refuses, leaving the current data untouched", () => {
    const result = applyOnboardingPatch(CURRENT, {
      step: "settings",
      data: { defaultReservationDuration: "-5" },
    });

    expect(result.kind).toBe("rejected");
    if (result.kind !== "rejected") return;
    expect(Object.keys(result.errors)).toEqual(["defaultReservationDuration"]);
    expect(CURRENT.settings.defaultReservationDuration).toBe("90");
  });

  it("rejects a location patch that clears a required field", () => {
    const result = applyOnboardingPatch(CURRENT, {
      step: "locationTime",
      data: { currencyCode: "" },
    });

    expect(result.kind).toBe("rejected");
    if (result.kind !== "rejected") return;
    expect(Object.keys(result.errors)).toEqual(["currencyCode"]);
  });

  it("rejects malformed model output at the boundary: unknown step, unknown field, non-string value", () => {
    const malformed: unknown[] = [
      null,
      { step: "floorPlan", data: {} },
      { step: "settings", data: { seats: "60" } },
      { step: "settings", data: { maxPartySize: 12 } },
      { step: "locationTime", data: "America/Chicago" },
    ];

    for (const patch of malformed) {
      const result = applyOnboardingPatch(CURRENT, patch);
      expect(result.kind, JSON.stringify(patch)).toBe("malformed");
    }
  });
});
