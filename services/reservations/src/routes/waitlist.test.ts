import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";

// Mock the waitlist service
vi.mock("../services/waitlist.js", () => ({
  waitlistService: {
    create: vi.fn(),
    listWaiting: vi.fn(),
    getById: vi.fn(),
    seat: vi.fn(),
    cancel: vi.fn(),
    expire: vi.fn(),
  },
}));

// Mock the database
vi.mock("../services/database.js", () => ({
  prisma: {
    $queryRaw: vi.fn(),
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

// Mock hold service
vi.mock("../services/hold.js", () => ({
  holdService: {
    create: vi.fn(),
    getById: vi.fn(),
    getBySessionId: vi.fn(),
    release: vi.fn(),
    cleanupExpired: vi.fn(),
    maybeCleanup: vi.fn(),
  },
}));

// Mock confirm-hold
vi.mock("../services/confirm-hold.js", () => ({
  confirmHold: vi.fn(),
}));

// Mock availability service
vi.mock("../services/availability.js", () => ({
  availabilityService: {
    generateTimeSlots: vi.fn(),
    getAvailableDates: vi.fn(),
    findBestTable: vi.fn(),
    checkConflict: vi.fn(),
    checkPacing: vi.fn(),
    estimateDuration: vi.fn(),
  },
}));

// Mock jose library
vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(),
}));

import { waitlistService } from "../services/waitlist.js";
import { holdService } from "../services/hold.js";

const AUTH_HEADERS = { authorization: "Bearer valid-token", "x-auth-bypass": "true" };

const mockEntry = {
  id: "entry-1",
  venueId: "venue-1",
  partySize: 3,
  guestName: "Alice",
  guestPhone: "555-1234",
  position: 1,
  estimatedWaitMinutes: 30,
  status: "waiting",
  notifiedAt: null,
  expiresAt: null,
  createdAt: new Date("2026-05-25T10:00:00.000Z"),
  updatedAt: new Date("2026-05-25T10:00:00.000Z"),
};

const mockEntry2 = {
  id: "entry-2",
  venueId: "venue-1",
  partySize: 2,
  guestName: "Bob",
  guestPhone: "555-5678",
  position: 2,
  estimatedWaitMinutes: 60,
  status: "waiting",
  notifiedAt: null,
  expiresAt: null,
  createdAt: new Date("2026-05-25T10:05:00.000Z"),
  updatedAt: new Date("2026-05-25T10:05:00.000Z"),
};

describe("Waitlist Routes", () => {
  let app: FastifyInstance;
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = {
      ...originalEnv,
      AUTH_AUTHORITY: "https://test.auth0.com",
      AUTH_AUDIENCE: "https://api.example.com",
      AUTH_BYPASS_IN_TESTS: "true",
    };
    app = await buildApp({ logger: false });
    await app.ready();
    vi.clearAllMocks();
    vi.mocked(holdService.maybeCleanup).mockResolvedValue(false);
  });

  afterEach(async () => {
    await app.close();
    process.env = originalEnv;
  });

  describe("POST /api/v1/waitlist", () => {
    it("creates entry and returns 201", async () => {
      vi.mocked(waitlistService.create).mockResolvedValue(mockEntry as never);

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/waitlist",
        headers: AUTH_HEADERS,
        payload: {
          venueId: "venue-1",
          partySize: 3,
          guestName: "Alice",
          guestPhone: "555-1234",
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.data.id).toBe("entry-1");
      expect(body.data.position).toBe(1);
      expect(body.data.venueId).toBe("venue-1");
      expect(waitlistService.create).toHaveBeenCalledWith({
        venueId: "venue-1",
        partySize: 3,
        guestName: "Alice",
        guestPhone: "555-1234",
      });
    });

    it("passes avgTurnTimeMinutes to service", async () => {
      vi.mocked(waitlistService.create).mockResolvedValue({
        ...mockEntry,
        position: 3,
        estimatedWaitMinutes: 45,
      } as never);

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/waitlist",
        headers: AUTH_HEADERS,
        payload: {
          venueId: "venue-1",
          partySize: 4,
          guestName: "Carol",
          guestPhone: "555-9999",
          avgTurnTimeMinutes: 15,
        },
      });

      expect(response.statusCode).toBe(201);
      expect(waitlistService.create).toHaveBeenCalledWith(
        expect.objectContaining({ avgTurnTimeMinutes: 15 })
      );
    });

    it("returns 400 when required fields missing", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/waitlist",
        headers: AUTH_HEADERS,
        payload: {
          venueId: "venue-1",
          // missing partySize, guestName, guestPhone
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("GET /api/v1/waitlist", () => {
    it("lists waiting entries for a venue", async () => {
      vi.mocked(waitlistService.listWaiting).mockResolvedValue([mockEntry, mockEntry2] as never);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/waitlist?venueId=venue-1",
        headers: AUTH_HEADERS,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(2);
      expect(body.data[0].id).toBe("entry-1");
      expect(waitlistService.listWaiting).toHaveBeenCalledWith("venue-1");
    });

    it("returns 400 when venueId missing", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/waitlist",
        headers: AUTH_HEADERS,
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("GET /api/v1/waitlist/:id", () => {
    it("returns single entry", async () => {
      vi.mocked(waitlistService.getById).mockResolvedValue(mockEntry as never);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/waitlist/entry-1",
        headers: AUTH_HEADERS,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.id).toBe("entry-1");
    });

    it("returns 404 when not found", async () => {
      vi.mocked(waitlistService.getById).mockResolvedValue(null);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/waitlist/non-existent",
        headers: AUTH_HEADERS,
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Not Found");
    });
  });

  describe("PUT /api/v1/waitlist/:id/seat", () => {
    it("marks entry as seated and recalculates positions", async () => {
      vi.mocked(waitlistService.seat).mockResolvedValue({ ...mockEntry, status: "seated" } as never);

      const response = await app.inject({
        method: "PUT",
        url: "/api/v1/waitlist/entry-1/seat",
        headers: AUTH_HEADERS,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.status).toBe("seated");
      expect(waitlistService.seat).toHaveBeenCalledWith("entry-1");
    });

    it("returns 404 when entry not found", async () => {
      vi.mocked(waitlistService.seat).mockResolvedValue(null);

      const response = await app.inject({
        method: "PUT",
        url: "/api/v1/waitlist/bad-id/seat",
        headers: AUTH_HEADERS,
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("PUT /api/v1/waitlist/:id/cancel", () => {
    it("marks entry as cancelled and recalculates positions", async () => {
      vi.mocked(waitlistService.cancel).mockResolvedValue({
        ...mockEntry,
        status: "cancelled",
      } as never);

      const response = await app.inject({
        method: "PUT",
        url: "/api/v1/waitlist/entry-1/cancel",
        headers: AUTH_HEADERS,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.status).toBe("cancelled");
      expect(waitlistService.cancel).toHaveBeenCalledWith("entry-1");
    });

    it("returns 404 when entry not found", async () => {
      vi.mocked(waitlistService.cancel).mockResolvedValue(null);

      const response = await app.inject({
        method: "PUT",
        url: "/api/v1/waitlist/bad-id/cancel",
        headers: AUTH_HEADERS,
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("PUT /api/v1/waitlist/:id/expire", () => {
    it("marks entry as expired", async () => {
      vi.mocked(waitlistService.expire).mockResolvedValue({ ...mockEntry, status: "expired" } as never);

      const response = await app.inject({
        method: "PUT",
        url: "/api/v1/waitlist/entry-1/expire",
        headers: AUTH_HEADERS,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.status).toBe("expired");
      expect(waitlistService.expire).toHaveBeenCalledWith("entry-1");
    });

    it("returns 404 when entry not found", async () => {
      vi.mocked(waitlistService.expire).mockResolvedValue(null);

      const response = await app.inject({
        method: "PUT",
        url: "/api/v1/waitlist/bad-id/expire",
        headers: AUTH_HEADERS,
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
