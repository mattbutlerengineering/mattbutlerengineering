import { describe, it, expect } from "vitest";
import type { VenueProfile } from "@mbe/types";
import {
  EMPTY_VENUE_PROFILE_FORM,
  parseVenueProfileForm,
  toVenueProfileForm,
  type VenueProfileForm,
} from "./venue-profile-form.js";

const PROFILE: VenueProfile = {
  type: "fine_dining",
  cuisines: ["Italian", "Seafood"],
  address: {
    line1: "1 Market St",
    line2: "Suite 400",
    city: "Seattle",
    region: "WA",
    postalCode: "98101",
    country: "US",
  },
  website: "https://theoaktable.example.com",
  description: "A small room with a long bar.",
};

function form(overrides: Partial<VenueProfileForm> = {}): VenueProfileForm {
  return { ...EMPTY_VENUE_PROFILE_FORM, ...overrides };
}

describe("toVenueProfileForm", () => {
  it("seeds every field from a stored profile", () => {
    expect(toVenueProfileForm(PROFILE)).toEqual({
      type: "fine_dining",
      cuisines: "Italian, Seafood",
      line1: "1 Market St",
      line2: "Suite 400",
      city: "Seattle",
      region: "WA",
      postalCode: "98101",
      country: "US",
      website: "https://theoaktable.example.com",
      description: "A small room with a long bar.",
    });
  });

  it("returns an all-empty form for a venue with no profile", () => {
    expect(toVenueProfileForm(undefined)).toEqual(EMPTY_VENUE_PROFILE_FORM);
    expect(toVenueProfileForm({})).toEqual(EMPTY_VENUE_PROFILE_FORM);
  });

  it("does not mutate the profile it was handed", () => {
    const original = structuredClone(PROFILE);
    toVenueProfileForm(PROFILE);
    expect(PROFILE).toEqual(original);
  });
});

describe("parseVenueProfileForm", () => {
  it("round-trips a full profile", () => {
    const result = parseVenueProfileForm(toVenueProfileForm(PROFILE));

    expect(result).toEqual({ ok: true, profile: PROFILE });
  });

  it("maps an all-empty form onto an empty profile — clearing is allowed", () => {
    expect(parseVenueProfileForm(EMPTY_VENUE_PROFILE_FORM)).toEqual({ ok: true, profile: {} });
  });

  it("omits a field left blank rather than storing an empty string", () => {
    const result = parseVenueProfileForm(form({ description: "   ", website: "" }));

    expect(result).toEqual({ ok: true, profile: {} });
  });

  it("splits cuisines on commas and drops blank entries", () => {
    const result = parseVenueProfileForm(form({ cuisines: " Italian ,, Seafood , " }));

    expect(result).toEqual({ ok: true, profile: { cuisines: ["Italian", "Seafood"] } });
  });

  it("treats the address as all-or-nothing and reports the missing parts", () => {
    const result = parseVenueProfileForm(form({ line1: "1 Market St" }));

    expect(result).toEqual({
      ok: false,
      errors: {
        city: "required",
        region: "required",
        postalCode: "required",
        country: "required",
      },
    });
  });

  it("accepts an address without the optional second line", () => {
    const result = parseVenueProfileForm(
      form({
        line1: "1 Market St",
        city: "Seattle",
        region: "WA",
        postalCode: "98101",
        country: "US",
      })
    );

    expect(result).toEqual({
      ok: true,
      profile: {
        address: {
          line1: "1 Market St",
          city: "Seattle",
          region: "WA",
          postalCode: "98101",
          country: "US",
        },
      },
    });
  });

  it.each(["example.com", "javascript:alert(1)", "ftp://example.com"])(
    "rejects the website %j",
    (website) => {
      expect(parseVenueProfileForm(form({ website }))).toEqual({
        ok: false,
        errors: { website: "invalid" },
      });
    }
  );

  it("rejects a description over the cap as tooLong", () => {
    const result = parseVenueProfileForm(form({ description: "x".repeat(281) }));

    expect(result).toEqual({ ok: false, errors: { description: "tooLong" } });
  });

  it("rejects a country code that is not two letters", () => {
    const result = parseVenueProfileForm(
      form({
        line1: "1 Market St",
        city: "Seattle",
        region: "WA",
        postalCode: "98101",
        country: "USA",
      })
    );

    expect(result).toEqual({ ok: false, errors: { country: "invalid" } });
  });

  it("does not mutate the form it was handed", () => {
    const input = form({ cuisines: "Italian", description: "  padded  " });
    const snapshot = { ...input };

    parseVenueProfileForm(input);

    expect(input).toEqual(snapshot);
  });
});
