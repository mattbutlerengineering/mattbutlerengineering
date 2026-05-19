import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";

vi.mock("../services/venue.js", () => ({
  venueService: {
    list: vi.fn(),
    getById: vi.fn(),
    getBySlug: vi.fn(),
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

vi.mock("../services/database.js", () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]),
  },
  getSlowQueryStats: vi.fn().mockReturnValue({ count5min: 0, slowestMs: 0 }),
  getServiceStatus: vi.fn().mockReturnValue("ok"),
  getPoolMetrics: vi.fn().mockReturnValue({
    active: 1, idle: 4, busy: 1, size: 5, utilization: 0.2, isDegraded: false,
  }),
}));

vi.mock("jose", () => ({
  jwtVerify: vi.fn(),
  createRemoteJWKSet: vi.fn(() => vi.fn()),
}));

import { venueService } from "../services/venue.js";

const mockVenue = {
  id: "venue_1",
  venueGroupId: "group_1",
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
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
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
    vi.mocked(venueService.getBySlug).mockResolvedValueOnce(mockVenue);

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
    vi.mocked(venueService.getBySlug).mockResolvedValueOnce(null);

    const response = await app.inject({
      method: "GET",
      url: "/public/v1/venues/no-such-venue",
    });

    expect(response.statusCode).toBe(404);
  });

  it("does not expose venueGroupId or internal fields", async () => {
    vi.mocked(venueService.getBySlug).mockResolvedValueOnce(mockVenue);

    const response = await app.inject({
      method: "GET",
      url: "/public/v1/venues/the-oak-table",
    });

    const body = response.json();
    expect(body.data.venueGroupId).toBeUndefined();
    expect(body.data.id).toBeUndefined();
  });
});
