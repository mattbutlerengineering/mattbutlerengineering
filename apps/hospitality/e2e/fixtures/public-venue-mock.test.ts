import { describe, it, expect } from "vitest";
import { PublicVenueSchema } from "@mbe/types/schemas";
import { buildPublicVenueFixture } from "../api-mocks.js";

// Pins the by-slug E2E mock (api-mocks.ts) to the PublicVenue contract the
// real server enforces via a Prisma `select` (#4031). Without this, the
// mock can silently drift back to serving the full internal Venue shape
// (venueGroup, venueGroupId, settings, etc.) and nothing would catch it —
// PublicVenueSchema is non-strict, so extra keys are dropped, not rejected
// (#4032).
describe("by-slug E2E mock — PublicVenue projection", () => {
  it("returns exactly the fields PublicVenueSchema declares", () => {
    const fixture = buildPublicVenueFixture();

    expect(Object.keys(fixture).sort()).toEqual(Object.keys(PublicVenueSchema.shape).sort());
  });

  it("omits internal-only fields (venueGroup, venueGroupId, settings, timestamps)", () => {
    const fixture = buildPublicVenueFixture();

    expect(fixture).not.toHaveProperty("venueGroup");
    expect(fixture).not.toHaveProperty("venueGroupId");
    expect(fixture).not.toHaveProperty("settings");
    expect(fixture).not.toHaveProperty("createdAt");
    expect(fixture).not.toHaveProperty("updatedAt");
  });
});
