import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";
import {
  createMockReservation,
  createMockJWTPayload,
  createMockPagination,
  ERROR_UNAUTHORIZED,
  ERROR_CONFLICT,
} from "../test/mocks.js";

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

import { reservationService } from "../services/reservation.js";
import { tableService } from "../services/table.js";
import { emitReservationCreated } from "../services/events.js";
import { jwtVerify } from "jose";

describe("Reservation Routes", () => {
  let app: FastifyInstance;
  const originalEnv = process.env;

  // Fresh fixtures per test — factories return frozen objects,
  // so spreading into new objects is required for mutation.
  const mockReservation = createMockReservation();
  const mockJWTPayload = createMockJWTPayload();

  beforeEach(async () => {
    process.env = {
      ...originalEnv,
      AUTH_AUTHORITY: "https://test.auth0.com",
      AUTH_AUDIENCE: "https://api.example.com",
      AUTH_BYPASS_IN_TESTS: "true",
    };
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: mockJWTPayload,
      protectedHeader: { alg: "RS256" },
    } as never);
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
        pagination: createMockPagination({ total: 1 }),
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/reservations",
        headers: {
          authorization: "Bearer valid-token",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].id).toBe(mockReservation.id);
    });

    it("returns 401 without auth", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/reservations",
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("GET /v1/reservations/me", () => {
    it("returns user's reservations with valid auth", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);

      const userReservation = createMockReservation({ userId: "auth0|user-123" });
      vi.mocked(reservationService.listByUserId).mockResolvedValueOnce({
        data: [userReservation],
        pagination: createMockPagination({ total: 1 }),
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
      expect(body.data[0].userId).toBe("auth0|user-123");
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
      // Use admin user so ownership check passes
      const adminPayload = createMockJWTPayload({ permissions: ["admin"] });
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: adminPayload,
        protectedHeader: { alg: "RS256" },
      } as never);

      vi.mocked(reservationService.getById).mockResolvedValueOnce(
        createMockReservation({ guestName: "John Doe" })
      );

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/reservations/res-123",
        headers: {
          authorization: "Bearer valid-token",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.guestName).toBe("John Doe");
    });

    it("returns 404 when reservation not found", async () => {
      const adminPayload = createMockJWTPayload({ permissions: ["admin"] });
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: adminPayload,
        protectedHeader: { alg: "RS256" },
      } as never);

      vi.mocked(reservationService.getById).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/reservations/res-nonexistent",
        headers: {
          authorization: "Bearer valid-token",
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it("returns 401 without auth", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/reservations/res-123",
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("POST /v1/reservations", () => {
    it("creates a new reservation", async () => {
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
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.data.id).toBe(mockReservation.id);
    });

    it("creates a guest reservation without auth", async () => {
      vi.mocked(reservationService.createWithConflictCheck).mockResolvedValueOnce({
        success: true,
        reservation: createMockReservation({ guestName: "John Doe" }),
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

      const userReservation = createMockReservation({ userId: "auth0|user-123" });
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
          authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.invalid",
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
      expect(body.title).toBe(ERROR_UNAUTHORIZED);
      expect(body.detail).toBe("Invalid token");
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
      expect(body.error).toBe(ERROR_CONFLICT);
    });
  });

  describe("PATCH /v1/reservations/:id", () => {
    it("updates reservation", async () => {
      vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation);
      vi.mocked(reservationService.updateWithConflictCheck).mockResolvedValueOnce({
        success: true,
        reservation: createMockReservation({ id: "res-123", partySize: 6 }),
      });

      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/reservations/res-123",
        headers: {
          authorization: "Bearer valid-token",
        },
        payload: {
          partySize: 6,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.partySize).toBe(6);
    });

    it("returns 404 when updating nonexistent reservation", async () => {
      vi.mocked(reservationService.getById).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/reservations/res-nonexistent",
        headers: {
          authorization: "Bearer valid-token",
        },
        payload: {
          partySize: 6,
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it("returns 409 when update has conflict", async () => {
      vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation);
      vi.mocked(reservationService.updateWithConflictCheck).mockResolvedValueOnce({
        success: false,
        error: "Update conflicts with another reservation",
        conflict: { hasConflict: true, conflictingReservationId: "res-456" },
      });

      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/reservations/res-123",
        headers: {
          authorization: "Bearer valid-token",
        },
        payload: {
          startTime: "2026-02-15T19:00:00.000Z",
        },
      });

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.error).toBe(ERROR_CONFLICT);
    });

    describe("PATCH /v1/reservations/:id — cancellation", () => {
      it("cancels reservation with reason via PATCH status=CANCELLED", async () => {
        vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation);
        vi.mocked(reservationService.cancel).mockResolvedValueOnce(
          createMockReservation({
            id: "res-123",
            status: "CANCELLED",
            cancellationReason: "Changed mind",
          })
        );

        const response = await app.inject({
          method: "PATCH",
          url: "/api/v1/reservations/res-123",
          headers: {
            authorization: "Bearer valid-token",
          },
          payload: {
            status: "CANCELLED",
            cancellationReason: "Changed mind",
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data.status).toBe("CANCELLED");
        expect(reservationService.cancel).toHaveBeenCalledWith(
          "res-123",
          "Changed mind",
          undefined
        );
      });

      it("cancels reservation without reason", async () => {
        vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation);
        vi.mocked(reservationService.cancel).mockResolvedValueOnce(
          createMockReservation({ id: "res-123", status: "CANCELLED" })
        );

        const response = await app.inject({
          method: "PATCH",
          url: "/api/v1/reservations/res-123",
          headers: {
            authorization: "Bearer valid-token",
          },
          payload: {
            status: "CANCELLED",
          },
        });

        expect(response.statusCode).toBe(200);
        expect(reservationService.cancel).toHaveBeenCalledWith("res-123", undefined, undefined);
      });

      it("returns 404 when cancelling nonexistent reservation via PATCH", async () => {
        vi.mocked(reservationService.getById).mockResolvedValueOnce(null);

        const response = await app.inject({
          method: "PATCH",
          url: "/api/v1/reservations/res-nonexistent",
          headers: {
            authorization: "Bearer valid-token",
          },
          payload: {
            status: "CANCELLED",
          },
        });

        expect(response.statusCode).toBe(404);
      });
    });

    it("returns 401 without auth", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/reservations/res-123",
        payload: {
          partySize: 6,
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("POST /v1/reservations/walk-in", () => {
    it("creates walk-in reservation with valid auth", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);

      const walkInReservation = createMockReservation({
        id: "res-walkin",
        status: "CONFIRMED",
        guestName: "Walk-in Guest",
      });

      vi.mocked(reservationService.createWalkIn).mockResolvedValueOnce({
        success: true,
        reservation: walkInReservation,
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/reservations/walk-in",
        headers: {
          authorization: "Bearer valid-token",
        },
        payload: {
          tableId: "table-123",
          partySize: 2,
          venueId: "venue-123",
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.data.id).toBe("res-walkin");
      expect(tableService.updateStatus).toHaveBeenCalledWith("table-123", "OCCUPIED");
      expect(emitReservationCreated).toHaveBeenCalledWith(walkInReservation);
    });

    it("creates walk-in with custom guest name and duration", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);

      const walkInReservation = createMockReservation({
        id: "res-walkin",
        status: "CONFIRMED",
        guestName: "Sarah Smith",
      });

      vi.mocked(reservationService.createWalkIn).mockResolvedValueOnce({
        success: true,
        reservation: walkInReservation,
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/reservations/walk-in",
        headers: {
          authorization: "Bearer valid-token",
        },
        payload: {
          tableId: "table-123",
          partySize: 2,
          venueId: "venue-123",
          guestName: "Sarah Smith",
          durationMinutes: 90,
        },
      });

      expect(response.statusCode).toBe(201);
      expect(reservationService.createWalkIn).toHaveBeenCalledWith(
        expect.objectContaining({
          tableId: "table-123",
          venueId: "venue-123",
          guestName: "Sarah Smith",
          durationMinutes: 90,
        }),
        "auth0|user-123"
      );
    });

    it("returns 401 without auth", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/reservations/walk-in",
        payload: {
          tableId: "table-123",
          partySize: 2,
          venueId: "venue-123",
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("DELETE /v1/reservations/:id", () => {
    it("cancels reservation and returns 200 with cancelled reservation", async () => {
      vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation);
      vi.mocked(reservationService.cancel).mockResolvedValueOnce(
        createMockReservation({ id: "res-123", status: "CANCELLED" })
      );

      const response = await app.inject({
        method: "DELETE",
        url: "/api/v1/reservations/res-123",
        headers: {
          authorization: "Bearer valid-token",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.status).toBe("CANCELLED");
      expect(reservationService.cancel).toHaveBeenCalledWith("res-123");
    });

    it("returns 404 when cancelling nonexistent reservation", async () => {
      vi.mocked(reservationService.getById).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: "DELETE",
        url: "/api/v1/reservations/res-nonexistent",
        headers: {
          authorization: "Bearer valid-token",
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it("returns 401 without auth", async () => {
      const response = await app.inject({
        method: "DELETE",
        url: "/api/v1/reservations/res-123",
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
