import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";
import type { AvailabilityService } from "../services/availability.js";
import type { VenueService } from "../services/venue.js";

// Fakes injected through the buildApp domain-services seam (#3357) — no
// vi.mock import ring. `satisfies` pins each fake to the real service
// contract, so a renamed or removed service method fails to compile here
// instead of passing against a stale mock.
const availability = {
  generateTimeSlots: vi.fn(),
  getAvailableDates: vi.fn(),
  findBestTable: vi.fn(),
  fetchConflictData: vi.fn(),
} satisfies AvailabilityService;

const venue = {
  list: vi.fn(),
  listForMember: vi.fn(),
  getById: vi.fn(),
  getBySlug: vi.fn(),
  getPolicyById: vi.fn(),
  getPolicyBySlug: vi.fn(),
  getPublicConfigBySlug: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
} satisfies VenueService;

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
    app = await buildApp({ logger: false, services: { availability, venue } });
    await app.ready();
    vi.resetAllMocks();
  });

  afterEach(async () => {
    await app.close();
    process.env = originalEnv;
  });

  describe("GET /v1/availability/:venueId", () => {
    it("should return time slots for a valid request", async () => {
      venue.getById.mockResolvedValueOnce(mockVenue);
      availability.generateTimeSlots.mockResolvedValueOnce(mockTimeSlots);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/availability/venue-123?date=2024-02-15&partySize=4",
        headers: { "x-auth-bypass": "true" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toEqual(mockTimeSlots);
      expect(availability.generateTimeSlots).toHaveBeenCalledWith(
        "venue-123",
        "2024-02-15",
        4,
        undefined
      );
    });

    it("should accept optional duration parameter", async () => {
      venue.getById.mockResolvedValueOnce(mockVenue);
      availability.generateTimeSlots.mockResolvedValueOnce(mockTimeSlots);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/availability/venue-123?date=2024-02-15&partySize=4&duration=120",
        headers: { "x-auth-bypass": "true" },
      });

      expect(response.statusCode).toBe(200);
      expect(availability.generateTimeSlots).toHaveBeenCalledWith(
        "venue-123",
        "2024-02-15",
        4,
        120
      );
    });

    it("should return 404 for non-existent venue", async () => {
      venue.getById.mockResolvedValueOnce(null);

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
      venue.getById.mockResolvedValueOnce(mockVenue);

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
      venue.getById.mockResolvedValueOnce(mockVenue);

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
      venue.getById.mockResolvedValue(mockVenue);
      availability.getAvailableDates.mockResolvedValue(mockDateAvailability);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/availability/venue-123/dates?startDate=2024-02-15&endDate=2024-02-17&partySize=4",
        headers: { "x-auth-bypass": "true" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toEqual(mockDateAvailability);
      expect(availability.getAvailableDates).toHaveBeenCalledWith(
        "venue-123",
        "2024-02-15",
        "2024-02-17",
        4
      );
    });

    it("should return 404 for non-existent venue", async () => {
      venue.getById.mockResolvedValue(null);
      availability.getAvailableDates.mockResolvedValue([]);

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
      venue.getById.mockResolvedValue(mockVenue);
      availability.getAvailableDates.mockResolvedValue([]);

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
      venue.getById.mockResolvedValue(mockVenue);
      availability.getAvailableDates.mockResolvedValue([]);

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
      venue.getById.mockResolvedValueOnce(mockVenue);
      availability.generateTimeSlots.mockResolvedValueOnce(mockTimeSlots);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/availability/venue-123?date=2024-02-15&partySize=4",
        headers: { "x-auth-bypass": "true" },
      });

      expect(response.statusCode).toBe(200);
    });

    it("allows authenticated operator to GET /v1/availability/:venueId/dates", async () => {
      venue.getById.mockResolvedValueOnce(mockVenue);
      availability.getAvailableDates.mockResolvedValueOnce(mockDateAvailability);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/availability/venue-123/dates?startDate=2024-02-15&endDate=2024-02-17&partySize=4",
        headers: { "x-auth-bypass": "true" },
      });

      expect(response.statusCode).toBe(200);
    });
  });
});
