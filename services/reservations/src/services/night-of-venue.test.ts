import { describe, it, expect } from "vitest";
import { nightOfVenueFields } from "./night-of-venue.js";

const ADDRESS = {
  line1: "1 Oak St",
  city: "Portland",
  region: "OR",
  postalCode: "97201",
  country: "US",
};

describe("nightOfVenueFields", () => {
  it("returns the validated public address and the trimmed tonight note", () => {
    expect(
      nightOfVenueFields({
        tonightNote: "  Patio's open, dress warm  ",
        profile: { address: { ...ADDRESS, ownerSsn: "000" }, website: "https://oak.example" },
      })
    ).toEqual({ address: ADDRESS, tonightNote: "Patio's open, dress warm" });
  });

  it("allows a note of exactly 200 characters", () => {
    expect(nightOfVenueFields({ tonightNote: "x".repeat(200) }).tonightNote).toBe("x".repeat(200));
  });

  it.each([
    ["no settings", null],
    ["empty settings", {}],
    ["blank note", { tonightNote: "   " }],
    ["non-string note", { tonightNote: 42 }],
    ["note over 200 characters", { tonightNote: "x".repeat(201) }],
    ["invalid address", { profile: { address: { line1: "" } } }],
    ["non-object profile", { profile: "nope" }],
  ])("omits both fields for %s", (_name, settings) => {
    const fields = nightOfVenueFields(settings);
    expect(fields.address).toBeUndefined();
    expect(fields.tonightNote).toBeUndefined();
  });
});
