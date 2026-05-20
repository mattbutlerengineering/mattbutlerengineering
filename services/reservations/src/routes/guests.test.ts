import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";

// Mock the guest service
vi.mock("../services/guest.js", () => ({
  guestService: {
    list: vi.fn(),
    getById: vi.fn(),
    findByEmail: vi.fn(),
    findByPhone: vi.fn(),
    findOrCreate: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    recordVisit: vi.fn(),
    search: vi.fn(),
    getSegments: vi.fn(),
  },
}));

// Mock the venue service (needed for app registration)
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

// Mock the table service (needed for app registration)
vi.mock("../services/table.js", () => ({
  tableService: {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock the reservation service (needed for app registration)
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

// Mock the floor plan service (needed for app registration)
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

// Mock the database (needed for health check registration)
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

// Mock jose library for JWT verification
vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(),
}));

import { guestService } from "../services/guest.js";
import { jwtVerify } from "jose";

const mockGuest = {
  id: "guest-123",
  venueId: "venue-123",
  email: "john@example.com",
  phone: "+1-555-123-4567",
  name: "John Doe",
  notes: "VIP customer",
  visitCount: 5,
  lifetimeSpend: "500.00",
  lastVisit: "2026-01-25T19:00:00.000Z",
  tags: ["VIP", "Birthday Club"],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-25T00:00:00.000Z",
};

const mockSegments = [
  { name: "All Guests", description: "Total guests in database", count: 100 },
  { name: "VIP", description: "Guests with 5+ visits", count: 15 },
  { name: "Recent", description: "Visited in the last 30 days", count: 40 },
  { name: "At Risk", description: "No visit in 30-90 days", count: 25 },
  { name: "Lapsed", description: "No visit in 90+ days", count: 10 },
  { name: "New", description: "Booked but never visited", count: 10 },
];

const mockJWTPayload = {
  sub: "auth0|user-123",
  iss: "https://test.auth0.com/",
  aud: "https://api.example.com",
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
  email: "test@example.com",
  email_verified: true,
  name: "Test User",
  picture: "https://example.com/pic.jpg",
};

describe("Guest Routes", () => {
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
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
    process.env = originalEnv;
  });

  describe("GET /v1/guests", () => {
    it("returns paginated list of guests", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);
      vi.mocked(guestService.list).mockResolvedValueOnce({
        data: [mockGuest],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/guests?venueId=venue-123",
        headers: { "x-auth-bypass": "true" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].name).toBe("John Doe");
    });

    it("returns 400 without venueId", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/guests",
        headers: { "x-auth-bypass": "true" },
      });

      expect(response.statusCode).toBe(400);
    });

    it("returns 401 without auth", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/guests?venueId=venue-123",
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("GET /v1/guests/search", () => {
    it("searches guests by query", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);
      vi.mocked(guestService.search).mockResolvedValueOnce({
        data: [mockGuest],
        pagination: {
          page: 1,
          limit: 50,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/guests/search?venueId=venue-123&query=john",
        headers: { "x-auth-bypass": "true" },
      });

      expect(response.statusCode).toBe(200);
      expect(guestService.search).toHaveBeenCalledWith({
        venueId: "venue-123",
        query: "john",
        tags: undefined,
        hasNotVisitedInDays: undefined,
      });
    });

    it("filters by hasNotVisitedInDays", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);
      vi.mocked(guestService.search).mockResolvedValueOnce({
        data: [],
        pagination: {
          page: 1,
          limit: 50,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
      });

      await app.inject({
        method: "GET",
        url: "/api/v1/guests/search?venueId=venue-123&hasNotVisitedInDays=30",
        headers: { "x-auth-bypass": "true" },
      });

      expect(guestService.search).toHaveBeenCalledWith({
        venueId: "venue-123",
        query: undefined,
        tags: undefined,
        hasNotVisitedInDays: 30,
      });
    });
  });

  describe("GET /v1/guests/segments", () => {
    it("returns guest segments", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);
      vi.mocked(guestService.getSegments).mockResolvedValueOnce(mockSegments);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/guests/segments?venueId=venue-123",
        headers: { "x-auth-bypass": "true" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(6);
      expect(body.data[0].name).toBe("All Guests");
      expect(body.data[1].name).toBe("VIP");
    });
  });

  describe("GET /v1/guests/:id", () => {
    it("returns guest by ID", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);
      vi.mocked(guestService.getById).mockResolvedValueOnce(mockGuest);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/guests/guest-123",
        headers: { "x-auth-bypass": "true" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.id).toBe("guest-123");
      expect(body.data.name).toBe("John Doe");
    });

    it("returns 404 when guest not found", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);
      vi.mocked(guestService.getById).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/guests/nonexistent",
        headers: { "x-auth-bypass": "true" },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("POST /v1/guests", () => {
    it("creates a new guest", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);
      vi.mocked(guestService.create).mockResolvedValueOnce(mockGuest);

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/guests",
        headers: { "x-auth-bypass": "true" },
        payload: {
          venueId: "venue-123",
          name: "John Doe",
          email: "john@example.com",
          phone: "+1-555-123-4567",
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.data.name).toBe("John Doe");
    });

    it("returns 400 for duplicate email", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);
      vi.mocked(guestService.create).mockRejectedValueOnce(
        new Error("Unique constraint violation")
      );

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/guests",
        headers: { "x-auth-bypass": "true" },
        payload: {
          venueId: "venue-123",
          name: "John Doe",
          email: "john@example.com",
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toContain("already exists");
    });
  });

  describe("POST /v1/guests/find-or-create", () => {
    it("finds existing guest by email", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);
      vi.mocked(guestService.findOrCreate).mockResolvedValueOnce(mockGuest);

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/guests/find-or-create",
        headers: { "x-auth-bypass": "true" },
        payload: {
          venueId: "venue-123",
          name: "John Doe",
          email: "john@example.com",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.id).toBe("guest-123");
    });

    it("returns 400 without email or phone", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/guests/find-or-create",
        headers: { "x-auth-bypass": "true" },
        payload: {
          venueId: "venue-123",
          name: "John Doe",
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toContain("email or phone");
    });
  });

  describe("PATCH /v1/guests/:id", () => {
    it("updates guest", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);
      const updatedGuest = { ...mockGuest, name: "Jane Doe" };
      vi.mocked(guestService.update).mockResolvedValueOnce(updatedGuest);

      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/guests/guest-123",
        headers: { "x-auth-bypass": "true" },
        payload: { name: "Jane Doe" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.name).toBe("Jane Doe");
    });

    it("returns 404 when updating nonexistent guest", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);
      vi.mocked(guestService.update).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/guests/nonexistent",
        headers: { "x-auth-bypass": "true" },
        payload: { name: "Jane Doe" },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("DELETE /v1/guests/:id", () => {
    it("deletes guest and returns 204", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);
      vi.mocked(guestService.delete).mockResolvedValueOnce(true);

      const response = await app.inject({
        method: "DELETE",
        url: "/api/v1/guests/guest-123",
        headers: { "x-auth-bypass": "true" },
      });

      expect(response.statusCode).toBe(204);
      expect(guestService.delete).toHaveBeenCalledWith("guest-123");
    });

    it("returns 404 when deleting nonexistent guest", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);
      vi.mocked(guestService.delete).mockResolvedValueOnce(false);

      const response = await app.inject({
        method: "DELETE",
        url: "/api/v1/guests/nonexistent",
        headers: { "x-auth-bypass": "true" },
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
