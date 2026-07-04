import { describe, it, expect } from "vitest";
import { validateSettings } from "./SettingsStep.js";

describe("validateSettings", () => {
  it("allows all fields to be blank", () => {
    const errors = validateSettings({
      defaultReservationDuration: "",
      maxPartySize: "",
      advanceBookingDays: "",
    });
    expect(errors).toEqual({});
  });

  it("rejects a non-positive reservation duration", () => {
    const errors = validateSettings({
      defaultReservationDuration: "-5",
      maxPartySize: "",
      advanceBookingDays: "",
    });
    expect(errors.defaultReservationDuration).toBe("Duration must be a positive number");
  });

  it("rejects a non-positive max party size", () => {
    const errors = validateSettings({
      defaultReservationDuration: "",
      maxPartySize: "0",
      advanceBookingDays: "",
    });
    expect(errors.maxPartySize).toBe("Party size must be a positive number");
  });

  it("rejects a non-positive advance booking window", () => {
    const errors = validateSettings({
      defaultReservationDuration: "",
      maxPartySize: "",
      advanceBookingDays: "abc",
    });
    expect(errors.advanceBookingDays).toBe("Advance days must be a positive number");
  });

  it("returns no errors for valid positive values", () => {
    const errors = validateSettings({
      defaultReservationDuration: "60",
      maxPartySize: "8",
      advanceBookingDays: "30",
    });
    expect(errors).toEqual({});
  });
});
