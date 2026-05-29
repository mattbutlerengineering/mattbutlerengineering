import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";

// Mock all services needed for app registration
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

vi.mock("../services/guest-recognition.js", () => ({
  recognizeGuest: vi.fn(),
}));

vi.mock("../services/database.js", () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]),
  },
  getSlowQueryStats: vi.fn().mockReturnValue({ count5min: 0, slowestMs: 0 }),
  getServiceStatus: vi.fn().mockReturnValue("ok"),
  getPoolMetrics: vi.fn().mockReturnValue({
    active: 1,
    idle: 4,
    busy: 1,
    size: 5,
    utilization: 0.2,
    isDegraded: false,
  }),
}));

vi.mock("jose", () => ({
  jwtVerify: vi.fn(),
  createRemoteJWKSet: vi.fn(() => vi.fn()),
}));

import { venueService } from "../services/venue.js";
import { recognizeGuest } from "../services/guest-recognition.js";

const mockVenue = {
  id: "venue-123",
  venueGroupId: "group-1",
  name: "The Oak Table",
  slug: "the-oak-table",
  ianaTimezone: "America/Los_Angeles",
  currencyCode: "USD",
  operatingHours: null,
  settings: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("GET /public/v1/venues/:slug/guests/recognize", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    process.env.AUTH_BYPASS_IN_TESTS = "true";
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
    delete process.env.AUTH_BYPASS_IN_TESTS;
  });

  it("returns recognized guest data for known email", async () => {
    vi.mocked(venueService.getBySlug).mockResolvedValueOnce(mockVenue);
    vi.mocked(recognizeGuest).mockResolvedValueOnce({
      recognized: true,
      firstName: "Jane",
      phone: "+1-555-999-1234",
      visitCount: 7,
      hasPreferences: false,
      lastVisit: "2026-05-01T18:00:00.000Z",
    });

    const response = await app.inject({
      method: "GET",
      url: "/public/v1/venues/the-oak-table/guests/recognize?email=jane@example.com",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toEqual({
      recognized: true,
      firstName: "Jane",
      phone: "+1-555-999-1234",
      visitCount: 7,
      hasPreferences: false,
      lastVisit: "2026-05-01T18:00:00.000Z",
    });
  });

  it("returns { recognized: false } for unknown email (not 404)", async () => {
    vi.mocked(venueService.getBySlug).mockResolvedValueOnce(mockVenue);
    vi.mocked(recognizeGuest).mockResolvedValueOnce({
      recognized: false,
      firstName: null,
      phone: null,
      visitCount: 0,
      hasPreferences: false,
      lastVisit: null,
    });

    const response = await app.inject({
      method: "GET",
      url: "/public/v1/venues/the-oak-table/guests/recognize?email=nobody@example.com",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.recognized).toBe(false);
    expect(body.data.firstName).toBeNull();
  });

  it("returns 404 for invalid venue slug", async () => {
    vi.mocked(venueService.getBySlug).mockResolvedValueOnce(null);

    const response = await app.inject({
      method: "GET",
      url: "/public/v1/venues/no-such-venue/guests/recognize?email=test@example.com",
    });

    expect(response.statusCode).toBe(404);
  });

  it("returns 400 when email query param is missing", async () => {
    vi.mocked(venueService.getBySlug).mockResolvedValueOnce(mockVenue);

    const response = await app.inject({
      method: "GET",
      url: "/public/v1/venues/the-oak-table/guests/recognize",
    });

    expect(response.statusCode).toBe(400);
  });

  it("does not require authentication", async () => {
    delete process.env.AUTH_BYPASS_IN_TESTS;

    vi.mocked(venueService.getBySlug).mockResolvedValueOnce(mockVenue);
    vi.mocked(recognizeGuest).mockResolvedValueOnce({
      recognized: false,
      firstName: null,
      phone: null,
      visitCount: 0,
      hasPreferences: false,
      lastVisit: null,
    });

    const response = await app.inject({
      method: "GET",
      url: "/public/v1/venues/the-oak-table/guests/recognize?email=test@example.com",
    });

    // Should NOT be 401
    expect(response.statusCode).not.toBe(401);
    expect(response.statusCode).toBe(200);
  });

  it("never exposes sensitive guest data in response", async () => {
    vi.mocked(venueService.getBySlug).mockResolvedValueOnce(mockVenue);
    vi.mocked(recognizeGuest).mockResolvedValueOnce({
      recognized: true,
      firstName: "Jane",
      phone: "+1-555-999-1234",
      visitCount: 7,
      hasPreferences: true,
      lastVisit: "2026-05-01T18:00:00.000Z",
    });

    const response = await app.inject({
      method: "GET",
      url: "/public/v1/venues/the-oak-table/guests/recognize?email=jane@example.com",
    });

    const body = response.json();
    expect(body.data).not.toHaveProperty("id");
    expect(body.data).not.toHaveProperty("email");
    expect(body.data).not.toHaveProperty("notes");
    expect(body.data).not.toHaveProperty("lifetimeSpend");
    expect(body.data).not.toHaveProperty("tags");
    expect(body.data).not.toHaveProperty("venueId");
  });

  it("has rate limiting configured at 10 req/min", async () => {
    vi.mocked(venueService.getBySlug).mockResolvedValue(mockVenue);
    vi.mocked(recognizeGuest).mockResolvedValue({
      recognized: false,
      firstName: null,
      phone: null,
      visitCount: 0,
      hasPreferences: false,
      lastVisit: null,
    });

    // Send 11 requests — the 11th should be rate-limited
    const responses = [];
    for (let i = 0; i < 11; i++) {
      const response = await app.inject({
        method: "GET",
        url: "/public/v1/venues/the-oak-table/guests/recognize?email=test@example.com",
      });
      responses.push(response);
    }

    // First 10 should succeed
    for (let i = 0; i < 10; i++) {
      expect(responses[i].statusCode).toBe(200);
    }
    // 11th should be rate limited (429)
    expect(responses[10].statusCode).toBe(429);
  });
});
