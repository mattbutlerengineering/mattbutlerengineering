import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";

// Mock the reservation service
vi.mock("../services/reservation.js", () => ({
  reservationService: {
    list: vi.fn(),
    listByUserId: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    cancel: vi.fn(),
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

// Mock the guest service (needed for app registration)
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
}));

// Mock jose library for JWT verification
vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(),
}));

import { reservationService } from "../services/reservation.js";
import { jwtVerify } from "jose";

const mockTable = {
  id: "table-123",
  name: "Table 1",
  tableNumber: "1",
  capacity: 4,
  minCovers: 1,
  maxCovers: null,
  location: "Main Floor",
  isActive: true,
  priority: 0,
  venueId: null,
  floorPlanId: null,
  shapeMetadata: null,
  createdAt: "2026-01-25T00:00:00.000Z",
  updatedAt: "2026-01-25T00:00:00.000Z",
};

const mockReservation = {
  id: "res-123",
  date: "2026-02-15",
  startTime: "2026-02-15T18:00:00.000Z",
  endTime: "2026-02-15T20:00:00.000Z",
  partySize: 4,
  status: "PENDING" as const,
  notes: null,
  guestName: "John Doe",
  guestEmail: "john@example.com",
  guestPhone: null,
  guestId: null,
  userId: null,
  tableId: "table-123",
  table: mockTable,
  venueId: null,
  createdAt: "2026-01-25T00:00:00.000Z",
  updatedAt: "2026-01-25T00:00:00.000Z",
};

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

describe("Reservation Routes", () => {
  let app: FastifyInstance;
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = {
      ...originalEnv,
      AUTH_AUTHORITY: "https://test.auth0.com",
      AUTH_AUDIENCE: "https://api.example.com",
    };
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
    process.env = originalEnv;
  });

  describe("GET /v1/reservations", () => {
    it("returns paginated list of reservations", async () => {
      vi.mocked(reservationService.list).mockResolvedValueOnce({
        data: [mockReservation],
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      });

      const response = await app.inject({
        method: "GET",
        url: "/v1/reservations",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].guestName).toBe("John Doe");
      expect(body.pagination.total).toBe(1);
    });

    it("respects filter query params", async () => {
      vi.mocked(reservationService.list).mockResolvedValueOnce({
        data: [],
        pagination: {
          page: 1,
          limit: 10,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
      });

      await app.inject({
        method: "GET",
        url: "/v1/reservations?date=2026-02-15&status=CONFIRMED&tableId=table-123",
      });

      expect(reservationService.list).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
        date: "2026-02-15",
        status: "CONFIRMED",
        tableId: "table-123",
      });
    });
  });

  describe("GET /v1/reservations/me", () => {
    it("returns user's reservations with valid auth", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);

      const userReservation = { ...mockReservation, userId: "auth0|user-123" };
      vi.mocked(reservationService.listByUserId).mockResolvedValueOnce({
        data: [userReservation],
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      });

      const response = await app.inject({
        method: "GET",
        url: "/v1/reservations/me",
        headers: {
          authorization: "Bearer valid-token",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(1);
      expect(reservationService.listByUserId).toHaveBeenCalledWith(
        "auth0|user-123",
        1,
        10
      );
    });

    it("returns 401 without auth", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/reservations/me",
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("GET /v1/reservations/:id", () => {
    it("returns reservation by ID", async () => {
      vi.mocked(reservationService.getById).mockResolvedValueOnce(
        mockReservation
      );

      const response = await app.inject({
        method: "GET",
        url: "/v1/reservations/res-123",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.id).toBe("res-123");
      expect(body.data.guestName).toBe("John Doe");
    });

    it("returns 404 when reservation not found", async () => {
      vi.mocked(reservationService.getById).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: "GET",
        url: "/v1/reservations/nonexistent",
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Not Found");
    });
  });

  describe("POST /v1/reservations", () => {
    it("creates a guest reservation without auth", async () => {
      vi.mocked(reservationService.create).mockResolvedValueOnce(
        mockReservation
      );

      const response = await app.inject({
        method: "POST",
        url: "/v1/reservations",
        payload: {
          date: "2026-02-15",
          startTime: "2026-02-15T18:00:00.000Z",
          endTime: "2026-02-15T20:00:00.000Z",
          partySize: 4,
          tableId: "table-123",
          guestName: "John Doe",
          guestEmail: "john@example.com",
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.data.guestName).toBe("John Doe");
      expect(reservationService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          guestName: "John Doe",
        }),
        undefined
      );
    });

    it("creates a user reservation with auth", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);

      const userReservation = { ...mockReservation, userId: "auth0|user-123" };
      vi.mocked(reservationService.create).mockResolvedValueOnce(
        userReservation
      );

      const response = await app.inject({
        method: "POST",
        url: "/v1/reservations",
        headers: {
          authorization: "Bearer valid-token",
        },
        payload: {
          date: "2026-02-15",
          startTime: "2026-02-15T18:00:00.000Z",
          endTime: "2026-02-15T20:00:00.000Z",
          partySize: 4,
          tableId: "table-123",
        },
      });

      expect(response.statusCode).toBe(201);
      expect(reservationService.create).toHaveBeenCalledWith(
        expect.any(Object),
        "auth0|user-123"
      );
    });
  });

  describe("PATCH /v1/reservations/:id", () => {
    it("updates reservation", async () => {
      const updatedReservation = { ...mockReservation, partySize: 6 };
      vi.mocked(reservationService.update).mockResolvedValueOnce(
        updatedReservation
      );

      const response = await app.inject({
        method: "PATCH",
        url: "/v1/reservations/res-123",
        payload: {
          partySize: 6,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.partySize).toBe(6);
    });

    it("returns 404 when updating nonexistent reservation", async () => {
      vi.mocked(reservationService.update).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: "PATCH",
        url: "/v1/reservations/nonexistent",
        payload: {
          partySize: 6,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("DELETE /v1/reservations/:id", () => {
    it("cancels reservation and returns 200 with cancelled reservation", async () => {
      const cancelledReservation = {
        ...mockReservation,
        status: "CANCELLED" as const,
      };
      vi.mocked(reservationService.cancel).mockResolvedValueOnce(
        cancelledReservation
      );

      const response = await app.inject({
        method: "DELETE",
        url: "/v1/reservations/res-123",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.status).toBe("CANCELLED");
      expect(reservationService.cancel).toHaveBeenCalledWith("res-123");
    });

    it("returns 404 when cancelling nonexistent reservation", async () => {
      vi.mocked(reservationService.cancel).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: "DELETE",
        url: "/v1/reservations/nonexistent",
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
