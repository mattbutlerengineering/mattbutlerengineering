import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";
import type { DomainServices } from "../services/domain-services.js";

// Domain services are injected via buildApp({ services }) (issue #6771), so the
// public venue route needs no vi.mock ring of service modules to register.
const venueService = {
  getBySlug: vi.fn(),
  getPublicConfigBySlug: vi.fn(),
} as unknown as DomainServices["venueService"];

vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});

// ADR-026 §3.3 item 3 / #5369 PR 8: the public slug routes now resolve the
// venue via `resolveVenueId`, a raw `$queryRaw` call this suite's plain
// `createMockDatabaseService()` stub can't answer. Route tests exercise
// application logic, not real RLS resolution (that's
// `rls-route-sweep.integration.test.ts`), so resolve to a constant non-null
// venue id here — each test's own service-layer mock still drives the
// specific-case behavior; the "not found" tests override this per-call.
vi.mock("../services/resolve-venue.js", () => ({
  resolveVenueId: vi.fn().mockResolvedValue("venue-1"),
}));

vi.mock("jose", () => ({
  jwtVerify: vi.fn(),
  createRemoteJWKSet: vi.fn(() => vi.fn()),
}));

import { resolveVenueId } from "../services/resolve-venue.js";
import type { PublicVenueConfig } from "@mbe/types";
import { PublicVenueConfigSchema } from "@mbe/types/schemas";

const mockPublicConfig: PublicVenueConfig = {
  name: "The Oak Table",
  slug: "the-oak-table",
  ianaTimezone: "America/Los_Angeles",
  currencyCode: "USD",
  operatingHours: {
    monday: { open: "11:00", close: "22:00" },
    tuesday: { open: "11:00", close: "22:00" },
    wednesday: { open: "11:00", close: "22:00" },
    thursday: { open: "11:00", close: "22:00" },
    friday: { open: "11:00", close: "23:00" },
    saturday: { open: "10:00", close: "23:00" },
    sunday: { open: "10:00", close: "21:00", closed: true },
  },
  settings: {
    defaultReservationDuration: 90,
    maxPartySize: 12,
    maxAdvanceBooking: 30,
  },
  deposit: {
    enabled: false,
    depositType: null,
    amountCents: null,
    freeCancellationHours: null,
    lateCancellationFeePercent: null,
    noShowFeePercent: null,
  },
};

describe("GET /public/v1/venues/:slug", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.AUTH_BYPASS_IN_TESTS = "true";
    app = await buildApp({ logger: false, services: { venueService } });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.AUTH_BYPASS_IN_TESTS;
  });

  it("returns venue info by slug without authentication", async () => {
    vi.mocked(venueService.getPublicConfigBySlug).mockResolvedValueOnce(mockPublicConfig);

    const response = await app.inject({
      method: "GET",
      url: "/public/v1/venues/the-oak-table",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.name).toBe("The Oak Table");
    expect(body.data.slug).toBe("the-oak-table");
    expect(body.data.ianaTimezone).toBe("America/Los_Angeles");
    expect(body.data.operatingHours).toBeDefined();
    expect(body.data.settings.maxPartySize).toBe(12);
  });

  it("returns 404 for non-existent slug", async () => {
    vi.mocked(resolveVenueId).mockResolvedValueOnce(null);

    const response = await app.inject({
      method: "GET",
      url: "/public/v1/venues/no-such-venue",
    });

    expect(response.statusCode).toBe(404);
  });

  it("returns an RFC 7807 problem-details body for a 404 (ADR-008)", async () => {
    vi.mocked(resolveVenueId).mockResolvedValueOnce(null);

    const response = await app.inject({
      method: "GET",
      url: "/public/v1/venues/no-such-venue",
    });

    const body = response.json();
    expect(body).toMatchObject({
      type: expect.any(String),
      title: expect.any(String),
      status: 404,
    });
    expect(body.detail).toContain("no-such-venue");
    expect(body).not.toHaveProperty("success");
  });

  it("does not expose venueGroupId or internal fields", async () => {
    vi.mocked(venueService.getPublicConfigBySlug).mockResolvedValueOnce(mockPublicConfig);

    const response = await app.inject({
      method: "GET",
      url: "/public/v1/venues/the-oak-table",
    });

    const body = response.json();
    expect(body.data.venueGroupId).toBeUndefined();
    expect(body.data.id).toBeUndefined();
  });

  it("fetches the venue config only via getPublicConfigBySlug — never calls getBySlug", async () => {
    vi.mocked(venueService.getBySlug).mockClear();
    vi.mocked(venueService.getPublicConfigBySlug).mockClear();

    await app.inject({
      method: "GET",
      url: "/public/v1/venues/the-oak-table",
    });

    expect(venueService.getBySlug).not.toHaveBeenCalled();
    expect(venueService.getPublicConfigBySlug).toHaveBeenCalledOnce();
    expect(venueService.getPublicConfigBySlug).toHaveBeenCalledWith("the-oak-table");
  });

  it("contract: live response validates against the shared PublicVenueConfig Zod schema", async () => {
    vi.mocked(venueService.getPublicConfigBySlug).mockResolvedValueOnce(mockPublicConfig);

    const response = await app.inject({
      method: "GET",
      url: "/public/v1/venues/the-oak-table",
    });

    const body = response.json() as { data: unknown };
    const result = PublicVenueConfigSchema.safeParse(body.data);
    expect(result.success).toBe(true);
  });

  // #7250. `Venue.settings` is free-form JSON, so the danger is a careless
  // spread putting an operational setting on an unauthenticated response.
  // These drive the route with a service that returns exactly that and assert
  // the route's own response serializer (derived from PublicVenueConfigSchema,
  // so the schema IS the allow-list) drops every unlisted key.
  describe("public payload allow-list", () => {
    const PROFILE = {
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

    async function fetchWith(config: Record<string, unknown>) {
      vi.mocked(venueService.getPublicConfigBySlug).mockResolvedValueOnce(
        config as unknown as PublicVenueConfig
      );
      const response = await app.inject({
        method: "GET",
        url: "/public/v1/venues/the-oak-table",
      });
      return response.json().data as Record<string, unknown>;
    }

    it("serves every allow-listed profile field", async () => {
      const data = await fetchWith({ ...mockPublicConfig, profile: PROFILE });

      expect(data.profile).toEqual(PROFILE);
    });

    it("declares exactly the keys PublicVenueConfigSchema does, and no others", async () => {
      const data = await fetchWith({
        ...mockPublicConfig,
        profile: PROFILE,
        // Everything below is an unlisted key a leak would surface.
        depositEnabled: true,
        id: "venue-1",
        venueGroupId: "group-1",
        manageTokenSecret: "nope",
      });

      expect(Object.keys(data).sort()).toEqual(Object.keys(PublicVenueConfigSchema.shape).sort());
    });

    it("drops operational settings smuggled inside the profile object", async () => {
      const data = await fetchWith({
        ...mockPublicConfig,
        profile: {
          ...PROFILE,
          autoDepositAfterNoShows: 2,
          guestModificationCutoffHours: 24,
          stripeSecretKey: "sk_live_nope",
        },
      });

      expect(data.profile).toEqual(PROFILE);
    });

    it("drops operational settings smuggled into the settings object", async () => {
      const data = await fetchWith({
        ...mockPublicConfig,
        profile: {},
        settings: {
          ...mockPublicConfig.settings,
          autoDepositAfterNoShows: 2,
          guestModificationCutoffHours: 24,
        },
      });

      expect(Object.keys(data.settings as Record<string, unknown>).sort()).toEqual([
        "defaultReservationDuration",
        "maxAdvanceBooking",
        "maxPartySize",
      ]);
    });

    it("drops undeclared keys nested inside the profile address", async () => {
      const data = await fetchWith({
        ...mockPublicConfig,
        profile: { address: { ...PROFILE.address, ownerSsn: "000-00-0000" } },
      });

      expect(data.profile).toEqual({ address: PROFILE.address });
    });
  });
});
