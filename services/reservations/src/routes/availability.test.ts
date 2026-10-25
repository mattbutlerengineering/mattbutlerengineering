import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";
import type { DomainServices } from "../services/domain-services.js";
import type { VenueMembershipLookup } from "@mbe/auth/fastify";
import { createMockJWTPayload } from "../test/mocks.js";
import { jwtVerify } from "jose";

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(),
}));

// Domain services are injected via buildApp({ services }) (issue #3357), so the
// availability route no longer needs a vi.mock ring of sibling service modules to
// register the app. Only the two services this route actually calls are faked.
const availabilityService = {
  generateTimeSlots: vi.fn(),
  getAvailableDates: vi.fn(),
  findBestTable: vi.fn(),
  estimateDuration: vi.fn(),
} as unknown as DomainServices["availabilityService"];

const venueService = {
  getById: vi.fn(),
} as unknown as DomainServices["venueService"];

// Mock the database
vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});

// Mock jose library
vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(),
}));

const mockVenue = {
  id: "venue-123",
  name: "Test Restaurant",
  slug: "test-restaurant",
  ianaTimezone: "America/New_York",
  currencyCode: "USD",
  operatingHours: {
    monday: { open: "11:00", close: "22:00" },
    tuesday: { open: "11:00", close: "22:00" },
    wednesday: { open: "11:00", close: "22:00" },
    thursday: { open: "11:00", close: "22:00" },
    friday: { open: "11:00", close: "23:00" },
    saturday: { open: "11:00", close: "23:00" },
    sunday: { open: "11:00", close: "21:00" },
  },
  settings: {
    slotIntervalMinutes: 15,
    lastSeatingBuffer: 90,
  },
  venueGroupId: null,
  createdAt: "2024-01-15T10:30:00.000Z",
  updatedAt: "2024-01-20T14:45:00.000Z",
};

const mockTimeSlots = [
  {
    time: "2024-02-15T18:00:00.000Z",
    available: true,
    tables: [{ id: "table-1", name: "Table 1", capacity: 4, minCovers: 1, maxCovers: 4 }],
  },
  {
    time: "2024-02-15T18:15:00.000Z",
    available: true,
    tables: [{ id: "table-1", name: "Table 1", capacity: 4, minCovers: 1, maxCovers: 4 }],
  },
  {
    time: "2024-02-15T18:30:00.000Z",
    available: false,
  },
];

const mockDateAvailability = [
  { date: "2024-02-15", hasAvailability: true, slotCount: 12 },
  { date: "2024-02-16", hasAvailability: true, slotCount: 8 },
  { date: "2024-02-17", hasAvailability: false, slotCount: 0 },
];

describe("Availability Routes", () => {
  let app: FastifyInstance;
  const originalEnv = process.env;
  beforeEach(async () => {
    process.env = {
      ...originalEnv,
      AUTH_AUTHORITY: "https://test.auth0.com",
      AUTH_AUDIENCE: "https://api.example.com",
      AUTH_BYPASS_IN_TESTS: "true",
    };
    app = await buildApp({ logger: false, services: { availabilityService, venueService } });
    await app.ready();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
    process.env = originalEnv;
  });

  describe("GET /v1/availability/:venueId", () => {
    it("should return time slots for a valid request", async () => {
      vi.mocked(venueService.getById).mockResolvedValueOnce(mockVenue);
      vi.mocked(availabilityService.generateTimeSlots).mockResolvedValueOnce(mockTimeSlots);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/availability/venue-123?date=2024-02-15&partySize=4",
        headers: { "x-auth-bypass": "true" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toEqual(mockTimeSlots);
      expect(availabilityService.generateTimeSlots).toHaveBeenCalledWith(
        "venue-123",
        "2024-02-15",
        4,
        undefined
      );
    });

    it("should accept optional duration parameter", async () => {
      vi.mocked(venueService.getById).mockResolvedValueOnce(mockVenue);
      vi.mocked(availabilityService.generateTimeSlots).mockResolvedValueOnce(mockTimeSlots);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/availability/venue-123?date=2024-02-15&partySize=4&duration=120",
        headers: { "x-auth-bypass": "true" },
      });

      expect(response.statusCode).toBe(200);
      expect(availabilityService.generateTimeSlots).toHaveBeenCalledWith(
        "venue-123",
        "2024-02-15",
        4,
        120
      );
    });

    it("should return 404 for non-existent venue", async () => {
      vi.mocked(venueService.getById).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/availability/non-existent?date=2024-02-15&partySize=4",
        headers: { "x-auth-bypass": "true" },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.title).toBe("Not Found");
    });

    it("should return 400 for invalid date format", async () => {
      vi.mocked(venueService.getById).mockResolvedValueOnce(mockVenue);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/availability/venue-123?date=02-15-2024&partySize=4",
        headers: { "x-auth-bypass": "true" },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      // Fastify's schema validation returns its own error message for format validation
      expect(body.detail).toContain("date");
    });

    it("should return 400 for invalid party size", async () => {
      vi.mocked(venueService.getById).mockResolvedValueOnce(mockVenue);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/availability/venue-123?date=2024-02-15&partySize=0",
        headers: { "x-auth-bypass": "true" },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.detail).toContain("Invalid party size");
    });

    it("should return 400 for invalid duration", async () => {
      vi.mocked(venueService.getById).mockResolvedValueOnce(mockVenue);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/availability/venue-123?date=2024-02-15&partySize=4&duration=10",
        headers: { "x-auth-bypass": "true" },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.detail).toContain("Invalid duration");
    });
  });

  describe("GET /v1/availability/:venueId/dates", () => {
    it("should return date availability for a valid request", async () => {
      vi.mocked(venueService.getById).mockResolvedValue(mockVenue);
      vi.mocked(availabilityService.getAvailableDates).mockResolvedValue(mockDateAvailability);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/availability/venue-123/dates?startDate=2024-02-15&endDate=2024-02-17&partySize=4",
        headers: { "x-auth-bypass": "true" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toEqual(mockDateAvailability);
      expect(availabilityService.getAvailableDates).toHaveBeenCalledWith(
        "venue-123",
        "2024-02-15",
        "2024-02-17",
        4
      );
    });

    it("keeps a closed date's closure message in the response", async () => {
      vi.mocked(venueService.getById).mockResolvedValue(mockVenue);
      const closed = {
        date: "2024-02-15",
        hasAvailability: false,
        slotCount: 0,
        closure: { message: "Closed for a private event" },
      };
      vi.mocked(availabilityService.getAvailableDates).mockResolvedValue([closed]);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/availability/venue-123/dates?startDate=2024-02-15&endDate=2024-02-15&partySize=4",
        headers: { "x-auth-bypass": "true" },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).data).toEqual([closed]);
    });

    it("should return 404 for non-existent venue", async () => {
      vi.mocked(venueService.getById).mockResolvedValue(null);
      vi.mocked(availabilityService.getAvailableDates).mockResolvedValue([]);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/availability/non-existent/dates?startDate=2024-02-15&endDate=2024-02-17&partySize=4",
        headers: { "x-auth-bypass": "true" },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.title).toBe("Not Found");
    });

    it("should return 400 for invalid date range", async () => {
      vi.mocked(venueService.getById).mockResolvedValue(mockVenue);
      vi.mocked(availabilityService.getAvailableDates).mockResolvedValue([]);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/availability/venue-123/dates?startDate=2024-02-20&endDate=2024-02-15&partySize=4",
        headers: { "x-auth-bypass": "true" },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.detail).toContain("startDate must be before");
    });

    it("should return 400 for invalid party size", async () => {
      vi.mocked(venueService.getById).mockResolvedValue(mockVenue);
      vi.mocked(availabilityService.getAvailableDates).mockResolvedValue([]);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/availability/venue-123/dates?startDate=2024-02-15&endDate=2024-02-17&partySize=-1",
        headers: { "x-auth-bypass": "true" },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.detail).toContain("Invalid party size");
    });
  });

  describe("auth enforcement on reads (#3103)", () => {
    it("returns 401 for anonymous GET /v1/availability/:venueId", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/availability/venue-123?date=2024-02-15&partySize=4",
      });

      expect(response.statusCode).toBe(401);
    });

    it("returns 401 for anonymous GET /v1/availability/:venueId/dates", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/availability/venue-123/dates?startDate=2024-02-15&endDate=2024-02-17&partySize=4",
      });

      expect(response.statusCode).toBe(401);
    });

    it("allows authenticated operator to GET /v1/availability/:venueId", async () => {
      vi.mocked(venueService.getById).mockResolvedValueOnce(mockVenue);
      vi.mocked(availabilityService.generateTimeSlots).mockResolvedValueOnce(mockTimeSlots);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/availability/venue-123?date=2024-02-15&partySize=4",
        headers: { "x-auth-bypass": "true" },
      });

      expect(response.statusCode).toBe(200);
    });

    it("allows authenticated operator to GET /v1/availability/:venueId/dates", async () => {
      vi.mocked(venueService.getById).mockResolvedValueOnce(mockVenue);
      vi.mocked(availabilityService.getAvailableDates).mockResolvedValueOnce(mockDateAvailability);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/availability/venue-123/dates?startDate=2024-02-15&endDate=2024-02-17&partySize=4",
        headers: { "x-auth-bypass": "true" },
      });

      expect(response.statusCode).toBe(200);
    });
  });
});

/**
 * Venue-authorization rulings (docs/fixes/venue-scoped-routes, PR 5): both
 * availability routes require membership of the `:venueId` venue (ADR-020).
 * Before this ruling any signed-in user could read any venue's slots.
 */
describe("availability — venue authorization (ADR-020)", () => {
  const originalEnv = process.env;
  const AVAILABILITY_URL = "/api/v1/availability";
  const SLOTS_URL = `${AVAILABILITY_URL}/venue-123?date=2024-02-15&partySize=4`;
  const DATES_URL = `${AVAILABILITY_URL}/venue-123/dates?startDate=2024-02-15&endDate=2024-02-17&partySize=4`;
  const FORBIDDEN = {
    type: "about:blank",
    title: "Forbidden",
    status: 403,
    detail: "You do not have access to this venue",
  };
  let app: FastifyInstance;

  async function buildAs(permissions: string[], lookup: VenueMembershipLookup) {
    process.env = {
      ...originalEnv,
      AUTH_AUTHORITY: "https://test.auth0.com",
      AUTH_AUDIENCE: "https://api.example.com",
    };
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: createMockJWTPayload({ sub: "auth0|operator", permissions }),
      protectedHeader: { alg: "RS256" },
    } as never);
    app = await buildApp({
      logger: false,
      venueMembershipLookup: lookup,
      services: { availabilityService, venueService },
    });
    await app.ready();
  }

  const get = (url: string) =>
    app.inject({ method: "GET", url, headers: { authorization: "Bearer t" } });

  afterEach(async () => {
    await app?.close();
    vi.clearAllMocks();
    process.env = originalEnv;
  });

  it.each([
    ["slots", SLOTS_URL],
    ["dates", DATES_URL],
  ])("returns 403 on %s for a signed-in non-member", async (_name, url) => {
    const lookup = vi.fn<VenueMembershipLookup>().mockResolvedValue(false);
    await buildAs(["staff"], lookup);

    const response = await get(url);

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body)).toEqual(FORBIDDEN);
    expect(lookup).toHaveBeenCalledWith("auth0|operator", "venue-123");
    expect(availabilityService.generateTimeSlots).not.toHaveBeenCalled();
    expect(availabilityService.getAvailableDates).not.toHaveBeenCalled();
  });

  it("returns 200 on slots and dates for a member of the venue", async () => {
    const lookup = vi.fn<VenueMembershipLookup>().mockResolvedValue(true);
    await buildAs(["staff"], lookup);
    vi.mocked(venueService.getById).mockResolvedValue(mockVenue);
    vi.mocked(availabilityService.generateTimeSlots).mockResolvedValue(mockTimeSlots);
    vi.mocked(availabilityService.getAvailableDates).mockResolvedValue(mockDateAvailability);

    const slots = await get(SLOTS_URL);
    const dates = await get(DATES_URL);

    expect(slots.statusCode).toBe(200);
    expect(JSON.parse(slots.body).data).toEqual(mockTimeSlots);
    expect(dates.statusCode).toBe(200);
    expect(JSON.parse(dates.body).data).toEqual(mockDateAvailability);
  });

  it("still lets a platform admin through without a membership lookup", async () => {
    const lookup = vi.fn<VenueMembershipLookup>().mockResolvedValue(false);
    await buildAs(["admin"], lookup);
    vi.mocked(venueService.getById).mockResolvedValue(mockVenue);
    vi.mocked(availabilityService.generateTimeSlots).mockResolvedValue(mockTimeSlots);

    const response = await get(SLOTS_URL);

    expect(response.statusCode).toBe(200);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("keeps an admin's 404 for an unknown venue", async () => {
    await buildAs(["admin"], vi.fn<VenueMembershipLookup>().mockResolvedValue(false));
    vi.mocked(venueService.getById).mockResolvedValue(null);

    const response = await get(SLOTS_URL);

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).detail).toBe("Venue not found");
  });

  it("still answers 401 to an anonymous caller", async () => {
    await buildAs(["staff"], vi.fn<VenueMembershipLookup>().mockResolvedValue(true));

    const response = await app.inject({ method: "GET", url: SLOTS_URL });

    expect(response.statusCode).toBe(401);
  });
});
