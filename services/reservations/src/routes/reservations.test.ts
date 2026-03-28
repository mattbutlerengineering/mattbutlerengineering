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
    createWithConflictCheck: vi.fn(),
    createWalkIn: vi.fn(),
    update: vi.fn(),
    updateWithConflictCheck: vi.fn(),
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
    updateStatus: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock the events service
vi.mock("../services/events.js", () => ({
  emitTableUpdated: vi.fn(),
  emitReservationCreated: vi.fn(),
  emitReservationUpdated: vi.fn(),
  emitReservationCancelled: vi.fn(),
  emitHoldCreated: vi.fn(),
  emitHoldReleased: vi.fn(),
  emitHoldConfirmed: vi.fn(),
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
import { tableService } from "../services/table.js";
import { emitReservationCancelled, emitReservationCreated } from "../services/events.js";
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
  status: "AVAILABLE" as const,
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
  cancellationReason: null,
  cancellationNote: null,
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
        url: "/api/v1/reservations",
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
        url: "/api/v1/reservations?date=2026-02-15&status=CONFIRMED&tableId=table-123",
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
        url: "/api/v1/reservations/me",
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
        url: "/api/v1/reservations/me",
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
        url: "/api/v1/reservations/res-123",
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
        url: "/api/v1/reservations/nonexistent",
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Not Found");
    });
  });

  describe("POST /v1/reservations", () => {
    it("creates a guest reservation without auth", async () => {
      vi.mocked(reservationService.createWithConflictCheck).mockResolvedValueOnce({
        success: true,
        reservation: mockReservation,
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/reservations",
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
      expect(reservationService.createWithConflictCheck).toHaveBeenCalledWith(
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
      vi.mocked(reservationService.createWithConflictCheck).mockResolvedValueOnce({
        success: true,
        reservation: userReservation,
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/reservations",
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
      expect(reservationService.createWithConflictCheck).toHaveBeenCalledWith(
        expect.any(Object),
        "auth0|user-123"
      );
    });

    it("returns 401 when Bearer token is invalid", async () => {
      vi.mocked(jwtVerify).mockRejectedValueOnce(new Error("invalid signature"));

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/reservations",
        headers: {
          authorization: "Bearer invalid-token",
        },
        payload: {
          date: "2026-02-15",
          startTime: "2026-02-15T18:00:00.000Z",
          endTime: "2026-02-15T20:00:00.000Z",
          partySize: 4,
          tableId: "table-123",
          guestName: "John Doe",
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Unauthorized");
      expect(body.message).toBe("Invalid token");
      expect(reservationService.createWithConflictCheck).not.toHaveBeenCalled();
    });

    it("returns 409 when conflict exists", async () => {
      vi.mocked(reservationService.createWithConflictCheck).mockResolvedValueOnce({
        success: false,
        error: "Time slot has a conflict with an existing reservation or hold",
        conflict: { hasConflict: true, conflictingReservationId: "res-456" },
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/reservations",
        payload: {
          date: "2026-02-15",
          startTime: "2026-02-15T18:00:00.000Z",
          endTime: "2026-02-15T20:00:00.000Z",
          partySize: 4,
          tableId: "table-123",
        },
      });

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Conflict");
    });
  });

  describe("PATCH /v1/reservations/:id", () => {
    it("updates reservation", async () => {
      const updatedReservation = { ...mockReservation, partySize: 6 };
      vi.mocked(reservationService.updateWithConflictCheck).mockResolvedValueOnce({
        success: true,
        reservation: updatedReservation,
      });

      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/reservations/res-123",
        payload: {
          partySize: 6,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.partySize).toBe(6);
    });

    it("returns 404 when updating nonexistent reservation", async () => {
      vi.mocked(reservationService.updateWithConflictCheck).mockResolvedValueOnce({
        success: false,
        error: "Reservation not found",
      });

      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/reservations/nonexistent",
        payload: {
          partySize: 6,
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it("returns 409 when update has conflict", async () => {
      vi.mocked(reservationService.updateWithConflictCheck).mockResolvedValueOnce({
        success: false,
        error: "Time slot has a conflict with an existing reservation or hold",
        conflict: { hasConflict: true, conflictingReservationId: "res-456" },
      });

      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/reservations/res-123",
        payload: {
          startTime: "2026-02-15T19:00:00.000Z",
        },
      });

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Conflict");
    });
  });

  describe("PATCH /v1/reservations/:id — cancellation", () => {
    it("cancels reservation with reason via PATCH status=CANCELLED", async () => {
      const cancelledReservation = {
        ...mockReservation,
        status: "CANCELLED" as const,
        cancellationReason: "no_show",
        cancellationNote: "Guest did not arrive",
      };
      vi.mocked(reservationService.cancel).mockResolvedValueOnce(cancelledReservation);

      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/reservations/res-123",
        payload: {
          status: "CANCELLED",
          cancellationReason: "no_show",
          cancellationNote: "Guest did not arrive",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.status).toBe("CANCELLED");
      expect(body.data.cancellationReason).toBe("no_show");
      expect(body.data.cancellationNote).toBe("Guest did not arrive");
      expect(reservationService.cancel).toHaveBeenCalledWith(
        "res-123",
        "no_show",
        "Guest did not arrive"
      );
      expect(emitReservationCancelled).toHaveBeenCalledWith(cancelledReservation);
    });

    it("cancels reservation without reason", async () => {
      const cancelledReservation = {
        ...mockReservation,
        status: "CANCELLED" as const,
        cancellationReason: null,
        cancellationNote: null,
      };
      vi.mocked(reservationService.cancel).mockResolvedValueOnce(cancelledReservation);

      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/reservations/res-123",
        payload: {
          status: "CANCELLED",
        },
      });

      expect(response.statusCode).toBe(200);
      expect(reservationService.cancel).toHaveBeenCalledWith(
        "res-123",
        undefined,
        undefined
      );
    });

    it("returns 404 when cancelling nonexistent reservation via PATCH", async () => {
      vi.mocked(reservationService.cancel).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/reservations/nonexistent",
        payload: {
          status: "CANCELLED",
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("POST /v1/reservations/walk-in", () => {
    it("creates walk-in reservation with valid auth", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);

      const walkInReservation = {
        ...mockReservation,
        status: "CONFIRMED" as const,
        guestName: "Walk-in",
      };
      vi.mocked(reservationService.createWalkIn).mockResolvedValueOnce(walkInReservation);
      vi.mocked(tableService.updateStatus).mockResolvedValueOnce({
        ...mockTable,
        status: "OCCUPIED" as const,
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/reservations/walk-in",
        headers: {
          authorization: "Bearer valid-token",
        },
        payload: {
          partySize: 4,
          tableId: "table-123",
          venueId: "venue-123",
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.data.status).toBe("CONFIRMED");
      expect(body.data.guestName).toBe("Walk-in");
      expect(reservationService.createWalkIn).toHaveBeenCalledWith(
        expect.objectContaining({ partySize: 4, tableId: "table-123" }),
        "auth0|user-123"
      );
      expect(tableService.updateStatus).toHaveBeenCalledWith("table-123", "OCCUPIED");
      expect(emitReservationCreated).toHaveBeenCalledWith(walkInReservation);
    });

    it("creates walk-in with custom guest name and duration", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);

      const walkInReservation = {
        ...mockReservation,
        status: "CONFIRMED" as const,
        guestName: "Jane Smith",
      };
      vi.mocked(reservationService.createWalkIn).mockResolvedValueOnce(walkInReservation);
      vi.mocked(tableService.updateStatus).mockResolvedValueOnce({
        ...mockTable,
        status: "OCCUPIED" as const,
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/reservations/walk-in",
        headers: {
          authorization: "Bearer valid-token",
        },
        payload: {
          partySize: 2,
          tableId: "table-123",
          venueId: "venue-123",
          guestName: "Jane Smith",
          durationMinutes: 60,
        },
      });

      expect(response.statusCode).toBe(201);
      expect(reservationService.createWalkIn).toHaveBeenCalledWith(
        expect.objectContaining({
          guestName: "Jane Smith",
          durationMinutes: 60,
        }),
        "auth0|user-123"
      );
    });

    it("returns 401 without auth", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/reservations/walk-in",
        payload: {
          partySize: 4,
          tableId: "table-123",
          venueId: "venue-123",
        },
      });

      expect(response.statusCode).toBe(401);
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
        url: "/api/v1/reservations/res-123",
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
        url: "/api/v1/reservations/nonexistent",
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
