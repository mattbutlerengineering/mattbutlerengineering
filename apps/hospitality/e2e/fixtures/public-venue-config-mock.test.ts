import { describe, it, expect } from "vitest";
import { PublicVenueConfigSchema } from "@mbe/types/schemas";
import { buildPublicVenueConfigFixture } from "../api-mocks.js";

// Pins the public/v1/venues/:slug E2E mock (api-mocks.ts) to the
// PublicVenueConfig contract useBookingFlow.ts validates against client-side
// (#4035). Without this, the mock can silently drift back to serving the
// full internal Venue shape (no `deposit`, flat `settings`) and nothing
// would catch it — the client-side zod parse failure is swallowed as
// "non-fatal" (useBookingFlow.ts fetchDepositConfig), so venueConfig stays
// null and ConfirmationView's "Add to Calendar" section silently never
// renders instead of the fetch erroring loudly.
describe("public/v1/venues/:slug E2E mock — PublicVenueConfig contract", () => {
  it("parses against PublicVenueConfigSchema", () => {
    const fixture = buildPublicVenueConfigFixture();

    expect(() => PublicVenueConfigSchema.parse(fixture)).not.toThrow();
  });

  it("returns exactly the fields PublicVenueConfigSchema declares", () => {
    const fixture = buildPublicVenueConfigFixture();

    expect(Object.keys(fixture).sort()).toEqual(Object.keys(PublicVenueConfigSchema.shape).sort());
  });

  it("includes a deposit object matching PublicVenueDepositSchema", () => {
    const fixture = buildPublicVenueConfigFixture();

    expect(fixture.deposit).toEqual({
      enabled: false,
      depositType: null,
      amountCents: null,
      freeCancellationHours: null,
      lateCancellationFeePercent: null,
      noShowFeePercent: null,
    });
  });

  it("omits internal-only fields (id, venueGroup, venueGroupId, timestamps)", () => {
    const fixture = buildPublicVenueConfigFixture();

    expect(fixture).not.toHaveProperty("id");
    expect(fixture).not.toHaveProperty("venueGroup");
    expect(fixture).not.toHaveProperty("venueGroupId");
    expect(fixture).not.toHaveProperty("createdAt");
    expect(fixture).not.toHaveProperty("updatedAt");
  });
});
