import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";

vi.mock("../services/venue.js", () => ({
  venueService: {
    list: vi.fn(),
    getById: vi.fn(),
    getBySlug: vi.fn(),
    getPublicConfigBySlug: vi.fn().mockResolvedValue({
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
    }),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  venueGroupService: {
    list: vi.fn(),
    getById: vi.fn(),
    getBySlug: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../services/table.js", () => ({
  tableService: {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../services/reservation.js", () => ({
  reservationService: {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    listByUserId: vi.fn(),
  },
}));

vi.mock("../services/guest.js", () => ({
  guestService: {
    list: vi.fn(),
    getById: vi.fn(),
    search: vi.fn(),
    findOrCreate: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getSegments: vi.fn(),
  },
}));

vi.mock("../services/floor-plan.js", () => ({
  floorPlanService: {
    list: vi.fn(),
    getById: vi.fn(),
    getActiveByVenueId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    bulkUpdatePositions: vi.fn(),
    assignTable: vi.fn(),
    removeTable: vi.fn(),
  },
}));

vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});

vi.mock("jose", () => ({
  jwtVerify: vi.fn(),
  createRemoteJWKSet: vi.fn(() => vi.fn()),
}));

import { venueService } from "../services/venue.js";
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
    app = await buildApp({ logger: false });
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
    vi.mocked(venueService.getPublicConfigBySlug).mockResolvedValueOnce(null);

    const response = await app.inject({
      method: "GET",
      url: "/public/v1/venues/no-such-venue",
    });

    expect(response.statusCode).toBe(404);
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
});
