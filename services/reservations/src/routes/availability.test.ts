import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";

// Mock the availability service
vi.mock("../services/availability.js", () => ({
  availabilityService: {
    generateTimeSlots: vi.fn(),
    getAvailableDates: vi.fn(),
    findBestTable: vi.fn(),
    checkConflict: vi.fn(),
    estimateDuration: vi.fn(),
  },
}));

// Mock the venue service
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

// Mock the table service
vi.mock("../services/table.js", () => ({
  tableService: {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock the reservation service
vi.mock("../services/reservation.js", () => ({
  reservationService: {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    listByUserId: vi.fn(),
    cancel: vi.fn(),
  },
}));

// Mock the guest service
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

// Mock the floor plan service
vi.mock("../services/floor-plan.js", () => ({
  floorPlanService: {
    list: vi.fn(),
    getById: vi.fn(),
    getActiveByVenueId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    setActive: vi.fn(),
    updateTablePosition: vi.fn(),
    bulkUpdateTablePositions: vi.fn(),
    assignTableToFloorPlan: vi.fn(),
    removeTableFromFloorPlan: vi.fn(),
  },
}));

// Mock the hold service
vi.mock("../services/hold.js", () => ({
  holdService: {
    create: vi.fn(),
    getById: vi.fn(),
    release: vi.fn(),
    convertToReservation: vi.fn(),
    cleanupExpired: vi.fn(),
  },
}));

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

import { availabilityService } from "../services/availability.js";
import { venueService } from "../services/venue.js";

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
  beforeEach(async () => {
    process.env.AUTH_BYPASS_IN_TESTS = "true";
    app = await buildApp({ logger: false });
    await app.ready();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe("GET /v1/availability/:venueId", () => {
    it("should return time slots for a valid request", async () => {
      vi.mocked(venueService.getById).mockResolvedValueOnce(mockVenue);
      vi.mocked(availabilityService.generateTimeSlots).mockResolvedValueOnce(mockTimeSlots);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/availability/venue-123?date=2024-02-15&partySize=4",
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
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Not Found");
    });

    it("should return 400 for invalid date format", async () => {
      vi.mocked(venueService.getById).mockResolvedValueOnce(mockVenue);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/availability/venue-123?date=02-15-2024&partySize=4",
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      // Fastify's schema validation returns its own error message for format validation
      expect(body.message).toContain("date");
    });

    it("should return 400 for invalid party size", async () => {
      vi.mocked(venueService.getById).mockResolvedValueOnce(mockVenue);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/availability/venue-123?date=2024-02-15&partySize=0",
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toContain("Invalid party size");
    });

    it("should return 400 for invalid duration", async () => {
      vi.mocked(venueService.getById).mockResolvedValueOnce(mockVenue);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/availability/venue-123?date=2024-02-15&partySize=4&duration=10",
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toContain("Invalid duration");
    });
  });

  describe("GET /v1/availability/:venueId/dates", () => {
    it("should return date availability for a valid request", async () => {
      vi.mocked(venueService.getById).mockResolvedValue(mockVenue);
      vi.mocked(availabilityService.getAvailableDates).mockResolvedValue(mockDateAvailability);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/availability/venue-123/dates?startDate=2024-02-15&endDate=2024-02-17&partySize=4",
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

    it("should return 404 for non-existent venue", async () => {
      vi.mocked(venueService.getById).mockResolvedValue(null);
      vi.mocked(availabilityService.getAvailableDates).mockResolvedValue([]);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/availability/non-existent/dates?startDate=2024-02-15&endDate=2024-02-17&partySize=4",
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Not Found");
    });

    it("should return 400 for invalid date range", async () => {
      vi.mocked(venueService.getById).mockResolvedValue(mockVenue);
      vi.mocked(availabilityService.getAvailableDates).mockResolvedValue([]);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/availability/venue-123/dates?startDate=2024-02-20&endDate=2024-02-15&partySize=4",
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toContain("startDate must be before");
    });

    it("should return 400 for invalid party size", async () => {
      vi.mocked(venueService.getById).mockResolvedValue(mockVenue);
      vi.mocked(availabilityService.getAvailableDates).mockResolvedValue([]);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/availability/venue-123/dates?startDate=2024-02-15&endDate=2024-02-17&partySize=-1",
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toContain("Invalid party size");
    });
  });
});
