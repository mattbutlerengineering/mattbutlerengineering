import { describe, it, expect } from "vitest";
import {
  VENUE_TYPES,
  VENUE_DESCRIPTION_MAX_LENGTH,
  PublicVenueConfigSchema,
  VenueAddressSchema,
  VenueProfileSchema,
  toPublicVenueProfile,
} from "./venue.js";
import { UpdateVenueBodySchema } from "./reservation-requests.js";
import { createVenueBodyJsonSchema, updateVenueBodyJsonSchema } from "./json-schema.js";

const FULL_PROFILE = {
  type: "fine_dining" as const,
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

describe("VenueProfileSchema", () => {
  it("accepts a fully-populated profile", () => {
    expect(VenueProfileSchema.parse(FULL_PROFILE)).toEqual(FULL_PROFILE);
  });

  it("accepts an empty profile — a venue with no profile is valid", () => {
    expect(VenueProfileSchema.parse({})).toEqual({});
  });

  it("lists exactly the four venue types eat-sheet's tenants.type allowed", () => {
    expect([...VENUE_TYPES]).toEqual(["fine_dining", "casual", "bar", "cafe"]);
  });

  it.each([...VENUE_TYPES])("accepts the %s venue type", (type) => {
    expect(VenueProfileSchema.safeParse({ type }).success).toBe(true);
  });

  it("rejects an unknown venue type", () => {
    expect(VenueProfileSchema.safeParse({ type: "food_truck" }).success).toBe(false);
  });

  it("rejects a description over the 280-character cap", () => {
    const tooLong = "x".repeat(VENUE_DESCRIPTION_MAX_LENGTH + 1);
    expect(VenueProfileSchema.safeParse({ description: tooLong }).success).toBe(false);
    expect(VenueProfileSchema.safeParse({ description: tooLong.slice(0, -1) }).success).toBe(true);
  });

  it.each(["https://example.com", "http://example.com/menu?x=1"])(
    "accepts the http(s) website %s",
    (website) => {
      expect(VenueProfileSchema.safeParse({ website }).success).toBe(true);
    }
  );

  it.each([
    "example.com",
    "not a url",
    "ftp://example.com",
    "javascript:alert(1)",
    "https://exa mple.com",
    "",
  ])("rejects the non-http(s)-URL website %j", (website) => {
    expect(VenueProfileSchema.safeParse({ website }).success).toBe(false);
  });

  it("rejects a cuisine list with a blank entry", () => {
    expect(VenueProfileSchema.safeParse({ cuisines: ["Italian", ""] }).success).toBe(false);
  });

  it("strips keys it does not declare, so a profile can only ever carry known fields", () => {
    const parsed = VenueProfileSchema.parse({
      ...FULL_PROFILE,
      internalNote: "staff only",
      stripeSecretKey: "sk_live_nope",
    });

    expect(parsed).toEqual(FULL_PROFILE);
  });

  it("strips undeclared keys nested inside the address too", () => {
    const parsed = VenueProfileSchema.parse({
      address: { ...FULL_PROFILE.address, ownerSsn: "000-00-0000" },
    });

    expect(parsed.address).toEqual(FULL_PROFILE.address);
  });
});

describe("VenueAddressSchema", () => {
  it("accepts an address without the optional second line", () => {
    const { line2: _line2, ...withoutLine2 } = FULL_PROFILE.address;
    expect(VenueAddressSchema.safeParse(withoutLine2).success).toBe(true);
  });

  it.each(["line1", "city", "region", "postalCode", "country"])("requires %s", (field) => {
    const partial = { ...FULL_PROFILE.address } as Record<string, unknown>;
    delete partial[field];
    expect(VenueAddressSchema.safeParse(partial).success).toBe(false);
  });

  it("requires country to be a two-letter ISO 3166-1 alpha-2 code", () => {
    expect(VenueAddressSchema.safeParse({ ...FULL_PROFILE.address, country: "USA" }).success).toBe(
      false
    );
    expect(VenueAddressSchema.safeParse({ ...FULL_PROFILE.address, country: "ca" }).success).toBe(
      true
    );
  });
});

describe("toPublicVenueProfile", () => {
  it("passes through every allow-listed field", () => {
    expect(toPublicVenueProfile(FULL_PROFILE)).toEqual(FULL_PROFILE);
  });

  it("drops operational settings a careless caller handed it", () => {
    expect(
      toPublicVenueProfile({
        type: "casual",
        autoDepositAfterNoShows: 2,
        guestModificationCutoffHours: 24,
        stripeSecretKey: "sk_live_nope",
      })
    ).toEqual({ type: "casual" });
  });

  it("returns an empty profile for an absent or unusable stored value", () => {
    expect(toPublicVenueProfile(undefined)).toEqual({});
    expect(toPublicVenueProfile(null)).toEqual({});
    expect(toPublicVenueProfile("not an object")).toEqual({});
    // Fail closed: one invalid field drops the whole profile rather than
    // publishing a half-validated one.
    expect(toPublicVenueProfile({ type: "casual", website: "javascript:alert(1)" })).toEqual({});
  });

  it("returns a new object rather than the input", () => {
    const input = { type: "bar" as const };
    expect(toPublicVenueProfile(input)).not.toBe(input);
  });
});

describe("PublicVenueConfigSchema.profile", () => {
  const BASE = {
    name: "The Oak Table",
    slug: "the-oak-table",
    ianaTimezone: "America/Los_Angeles",
    currencyCode: "USD",
    operatingHours: null,
    settings: {},
    deposit: {
      enabled: false,
      depositType: null,
      amountCents: null,
      freeCancellationHours: null,
      lateCancellationFeePercent: null,
      noShowFeePercent: null,
    },
  };

  it("declares profile, so the public config can carry venue identity", () => {
    expect(Object.keys(PublicVenueConfigSchema.shape)).toContain("profile");
  });

  it("accepts a config with no profile at all (older service, newer client)", () => {
    expect(PublicVenueConfigSchema.safeParse(BASE).success).toBe(true);
  });

  it("strips any key the profile allow-list does not declare", () => {
    const parsed = PublicVenueConfigSchema.parse({
      ...BASE,
      profile: { type: "cafe", autoDepositAfterNoShows: 2 },
    });

    expect(parsed.profile).toEqual({ type: "cafe" });
  });
});

describe("UpdateVenueBodySchema.settings.profile — the PATCH boundary", () => {
  it("still accepts arbitrary operational settings alongside the profile", () => {
    const parsed = UpdateVenueBodySchema.safeParse({
      settings: { maxPartySize: 12, profile: { type: "bar" } },
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.settings).toEqual({
      maxPartySize: 12,
      profile: { type: "bar" },
    });
  });

  it.each([
    ["a bad type", { type: "food_truck" }],
    ["a non-URL website", { website: "not a url" }],
    ["a javascript: website", { website: "javascript:alert(1)" }],
    ["an over-length description", { description: "x".repeat(VENUE_DESCRIPTION_MAX_LENGTH + 1) }],
    ["an address missing its city", { address: { line1: "1 Market St" } }],
  ])("rejects %s", (_label, profile) => {
    expect(UpdateVenueBodySchema.safeParse({ settings: { profile } }).success).toBe(false);
  });

  type JsonSchemaNode = Record<string, unknown>;

  function at(node: JsonSchemaNode, path: readonly string[]): JsonSchemaNode {
    return path.reduce<JsonSchemaNode>((current, key) => {
      const next = current[key];
      if (next === null || typeof next !== "object") {
        throw new Error(`Missing JSON Schema node at ${path.join(".")} (stopped at ${key})`);
      }
      return next as JsonSchemaNode;
    }, node);
  }

  /** `settings` is `.nullable()` on update, so Zod derives an `anyOf` pair. */
  function settingsObjectBranch(body: JsonSchemaNode): JsonSchemaNode {
    const settings = at(body, ["properties", "settings"]);
    const branches = settings.anyOf;
    if (!Array.isArray(branches)) return settings;
    const objectBranch = (branches as JsonSchemaNode[]).find((b) => b.type === "object");
    if (!objectBranch) throw new Error("settings has no object branch");
    return objectBranch;
  }

  it.each([
    ["createVenueBodyJsonSchema", createVenueBodyJsonSchema],
    ["updateVenueBodyJsonSchema", updateVenueBodyJsonSchema],
  ])("%s constrains the profile for Fastify's AJV", (_label, body) => {
    const profile = at(settingsObjectBranch(body), ["properties", "profile", "properties"]);

    expect(at(profile, ["type"]).enum).toEqual([...VENUE_TYPES]);
    expect(at(profile, ["description"]).maxLength).toBe(VENUE_DESCRIPTION_MAX_LENGTH);
    // The pattern must survive: it is the only thing stopping a `javascript:`
    // href at the HTTP boundary, and `stripRequestOverConstraints` would drop
    // it if a `format` sat next to it.
    expect(at(profile, ["website"]).pattern).toContain("https?");
    expect(at(profile, ["website"]).format).toBeUndefined();
  });

  it("keeps the rest of settings free-form (no AJV constraint beyond profile)", () => {
    const branch = settingsObjectBranch(updateVenueBodyJsonSchema);

    expect(Object.keys(at(branch, ["properties"]))).toEqual(["profile"]);
    // `toRequestJsonSchema` strips `additionalProperties`, so every other
    // operational key still reaches the service untouched.
    expect(branch.additionalProperties).toBeUndefined();
  });
});
