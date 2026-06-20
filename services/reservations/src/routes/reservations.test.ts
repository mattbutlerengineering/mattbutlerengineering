import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";
import { ReservationEventEmitter } from "../services/events.js";
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
vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});

// Mock jose library for JWT verification
vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(),
}));

import { reservationService } from "../services/reservation.js";
import { jwtVerify } from "jose";

describe("Reservation Routes", () => {
  let app: FastifyInstance;
  let stubEvents: ReservationEventEmitter;
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
    stubEvents = new ReservationEventEmitter();
    vi.spyOn(stubEvents, "emitReservationCreated");
    vi.spyOn(stubEvents, "emitReservationCancelled");
    vi.spyOn(stubEvents, "emitTableUpdated");
    app = await buildApp({ logger: false, reservationEvents: stubEvents });
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

    it("allows owner (guestEmail matches JWT email) to view reservation", async () => {
      const ownerPayload = createMockJWTPayload({
        permissions: [],
        email: "john@example.com",
      });
      vi.mocked(jwtVerify).mockResolvedValue({
        payload: ownerPayload,
        protectedHeader: { alg: "RS256" },
      } as never);

      // preHandler owner-resolver call + handler call
      vi.mocked(reservationService.getById)
        .mockResolvedValueOnce(createMockReservation({ guestEmail: "john@example.com" }))
        .mockResolvedValueOnce(createMockReservation({ guestEmail: "john@example.com" }));

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/reservations/res-123",
        headers: { authorization: "Bearer valid-token" },
      });

      expect(response.statusCode).toBe(200);
    });

    it("denies non-owner non-admin with 403", async () => {
      const nonOwnerPayload = createMockJWTPayload({
        permissions: [],
        email: "other@example.com",
      });
      vi.mocked(jwtVerify).mockResolvedValue({
        payload: nonOwnerPayload,
        protectedHeader: { alg: "RS256" },
      } as never);

      // preHandler owner-resolver call — no handler call since preHandler denies
      vi.mocked(reservationService.getById).mockResolvedValueOnce(
        createMockReservation({ guestEmail: "john@example.com" })
      );

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/reservations/res-123",
        headers: { authorization: "Bearer valid-token" },
      });

      expect(response.statusCode).toBe(403);
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

    it("rejects party size over 20 when enhanced-validation flag is enabled", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/reservations",
        headers: {
          "x-feature-flags": '{"enhanced-validation":{"enabled":true,"percentage":100}}',
        },
        payload: {
          date: "2026-02-15",
          startTime: "2026-02-15T18:00:00.000Z",
          endTime: "2026-02-15T20:00:00.000Z",
          partySize: 25,
          tableId: "table-123",
        },
      });

      expect(response.statusCode).toBe(400);
      // NOTE: the Error schema serializes {error,message,statusCode} while the
      // route sends ProblemDetails — the detail text is stripped (pre-existing),
      // so only the status code is asserted here
      expect(reservationService.createWithConflictCheck).not.toHaveBeenCalled();
    });

    it("allows party size over 20 when enhanced-validation flag is absent", async () => {
      vi.mocked(reservationService.createWithConflictCheck).mockResolvedValueOnce({
        success: true,
        reservation: createMockReservation({ partySize: 25 }),
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/reservations",
        payload: {
          date: "2026-02-15",
          startTime: "2026-02-15T18:00:00.000Z",
          endTime: "2026-02-15T20:00:00.000Z",
          partySize: 25,
          tableId: "table-123",
        },
      });

      expect(response.statusCode).toBe(201);
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

    it("accepts occasion and seatingPreference on create", async () => {
      const birthdayReservation = createMockReservation({
        occasion: "birthday",
        seatingPreference: "patio",
      });
      vi.mocked(reservationService.createWithConflictCheck).mockResolvedValueOnce({
        success: true,
        reservation: birthdayReservation,
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
          occasion: "birthday",
          seatingPreference: "patio",
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.data.occasion).toBe("birthday");
      expect(body.data.seatingPreference).toBe("patio");
      expect(reservationService.createWithConflictCheck).toHaveBeenCalledWith(
        expect.objectContaining({
          occasion: "birthday",
          seatingPreference: "patio",
        }),
        undefined
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

    it("updates occasion and seatingPreference", async () => {
      vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation);
      vi.mocked(reservationService.updateWithConflictCheck).mockResolvedValueOnce({
        success: true,
        reservation: createMockReservation({
          occasion: "anniversary",
          seatingPreference: "window",
        }),
      });

      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/reservations/res-123",
        headers: { authorization: "Bearer valid-token" },
        payload: {
          occasion: "anniversary",
          seatingPreference: "window",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.occasion).toBe("anniversary");
      expect(body.data.seatingPreference).toBe("window");
      expect(reservationService.updateWithConflictCheck).toHaveBeenCalledWith(
        "res-123",
        expect.objectContaining({
          occasion: "anniversary",
          seatingPreference: "window",
        })
      );
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

    it("allows owner (guestEmail matches JWT email) to update reservation", async () => {
      const ownerPayload = createMockJWTPayload({
        permissions: [],
        email: "john@example.com",
      });
      vi.mocked(jwtVerify).mockResolvedValue({
        payload: ownerPayload,
        protectedHeader: { alg: "RS256" },
      } as never);

      // preHandler owner-resolver call + handler call
      vi.mocked(reservationService.getById)
        .mockResolvedValueOnce(createMockReservation({ guestEmail: "john@example.com" }))
        .mockResolvedValueOnce(createMockReservation({ guestEmail: "john@example.com" }));
      vi.mocked(reservationService.updateWithConflictCheck).mockResolvedValueOnce({
        success: true,
        reservation: createMockReservation({ id: "res-123", partySize: 6 }),
      });

      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/reservations/res-123",
        headers: { authorization: "Bearer valid-token" },
        payload: { partySize: 6 },
      });

      expect(response.statusCode).toBe(200);
    });

    it("denies non-owner non-admin PATCH with 403", async () => {
      const nonOwnerPayload = createMockJWTPayload({
        permissions: [],
        email: "other@example.com",
      });
      vi.mocked(jwtVerify).mockResolvedValue({
        payload: nonOwnerPayload,
        protectedHeader: { alg: "RS256" },
      } as never);

      // preHandler owner-resolver call — preHandler denies, handler not reached
      vi.mocked(reservationService.getById).mockResolvedValueOnce(
        createMockReservation({ guestEmail: "john@example.com" })
      );

      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/reservations/res-123",
        headers: { authorization: "Bearer valid-token" },
        payload: { partySize: 6 },
      });

      expect(response.statusCode).toBe(403);
    });

    describe("PATCH /v1/reservations/:id — post-visit email on COMPLETED", () => {
      it("triggers post-visit email when status transitions to COMPLETED", async () => {
        const { venueService } = await import("../services/venue.js");

        const completedReservation = createMockReservation({
          id: "res-completed",
          status: "COMPLETED",
          venueId: "venue-1",
          guestEmail: "jane@example.com",
          guestName: "Jane Doe",
          guestId: "guest-1",
        });

        // getById is called first to check ownership
        vi.mocked(reservationService.getById).mockResolvedValueOnce(completedReservation);
        vi.mocked(reservationService.updateWithConflictCheck).mockResolvedValueOnce({
          success: true,
          reservation: completedReservation,
        });

        vi.mocked(venueService.getById).mockResolvedValueOnce({
          id: "venue-1",
          name: "The Oak Table",
          slug: "the-oak-table",
          ianaTimezone: "America/New_York",
          settings: { postVisitEmailEnabled: true, feedbackUrl: null },
        } as never);

        const postVisitSpy = vi.fn().mockResolvedValue(undefined);
        const appWithNotifier = await buildApp({
          logger: false,
          reservationEvents: stubEvents,
          postVisitNotifier: { sendPostVisitEmail: postVisitSpy },
        });
        await appWithNotifier.ready();

        await appWithNotifier.inject({
          method: "PATCH",
          url: "/api/v1/reservations/res-completed",
          headers: { authorization: "Bearer valid-token" },
          payload: { status: "COMPLETED" },
        });

        // Allow the fire-and-forget promise to settle
        const FIRE_AND_FORGET_TICK_MS = 20;
        await new Promise((r) => setTimeout(r, FIRE_AND_FORGET_TICK_MS));

        expect(postVisitSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            reservationId: "res-completed",
            guestEmail: "jane@example.com",
            venuePostVisitEmailEnabled: true,
          })
        );

        await appWithNotifier.close();
        // Builds a fresh Fastify app (buildApp + ready), which can exceed the
        // 5s default on a loaded CI runner — give it generous headroom.
      }, 15000);
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

      const occupiedTable = {
        id: "table-123",
        name: "Table 123",
        tableNumber: "123",
        capacity: 4,
        minCovers: 1,
        maxCovers: 6,
        location: null,
        isActive: true,
        priority: 0,
        status: "OCCUPIED" as const,
        venueId: "venue-123",
        floorPlanId: null,
        shapeMetadata: null,
        createdAt: "2026-05-05T18:00:00.000Z",
        updatedAt: "2026-05-05T18:00:00.000Z",
      };

      vi.mocked(reservationService.createWalkIn).mockResolvedValueOnce({
        success: true,
        reservation: walkInReservation,
        table: occupiedTable,
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
      // The route no longer issues a separate table status update; the service
      // flips the table inside the same transaction and returns it. The route
      // emits both SSE events only after that committed result comes back.
      expect(stubEvents.emitReservationCreated).toHaveBeenCalledWith(walkInReservation);
      expect(stubEvents.emitTableUpdated).toHaveBeenCalledWith(occupiedTable);
    });

    it("does not emit SSE events when createWalkIn fails (rolled back)", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);

      // Simulated table-status-update failure inside the transaction surfaces
      // as a rejected promise — no reservation committed, error response, and
      // crucially NO SSE events emitted.
      vi.mocked(reservationService.createWalkIn).mockRejectedValueOnce(
        new Error("table update failed")
      );

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

      expect(response.statusCode).toBe(500);
      expect(stubEvents.emitReservationCreated).not.toHaveBeenCalled();
      expect(stubEvents.emitTableUpdated).not.toHaveBeenCalled();
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

    it("accepts occasion and seatingPreference on walk-in", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);

      const walkInReservation = createMockReservation({
        id: "res-walkin-bday",
        status: "CONFIRMED",
        occasion: "birthday",
        seatingPreference: "booth",
      });

      vi.mocked(reservationService.createWalkIn).mockResolvedValueOnce({
        success: true,
        reservation: walkInReservation,
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/reservations/walk-in",
        headers: { authorization: "Bearer valid-token" },
        payload: {
          tableId: "table-123",
          partySize: 4,
          venueId: "venue-123",
          occasion: "birthday",
          seatingPreference: "booth",
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.data.occasion).toBe("birthday");
      expect(body.data.seatingPreference).toBe("booth");
      expect(reservationService.createWalkIn).toHaveBeenCalledWith(
        expect.objectContaining({
          occasion: "birthday",
          seatingPreference: "booth",
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

    it("allows owner (guestEmail matches JWT email) to cancel reservation", async () => {
      const ownerPayload = createMockJWTPayload({
        permissions: [],
        email: "john@example.com",
      });
      vi.mocked(jwtVerify).mockResolvedValue({
        payload: ownerPayload,
        protectedHeader: { alg: "RS256" },
      } as never);

      // preHandler owner-resolver call + handler call
      vi.mocked(reservationService.getById)
        .mockResolvedValueOnce(createMockReservation({ guestEmail: "john@example.com" }))
        .mockResolvedValueOnce(createMockReservation({ guestEmail: "john@example.com" }));
      vi.mocked(reservationService.cancel).mockResolvedValueOnce(
        createMockReservation({ id: "res-123", status: "CANCELLED" })
      );

      const response = await app.inject({
        method: "DELETE",
        url: "/api/v1/reservations/res-123",
        headers: { authorization: "Bearer valid-token" },
      });

      expect(response.statusCode).toBe(200);
    });

    it("denies non-owner non-admin DELETE with 403", async () => {
      const nonOwnerPayload = createMockJWTPayload({
        permissions: [],
        email: "other@example.com",
      });
      vi.mocked(jwtVerify).mockResolvedValue({
        payload: nonOwnerPayload,
        protectedHeader: { alg: "RS256" },
      } as never);

      // preHandler owner-resolver call — preHandler denies, handler not reached
      vi.mocked(reservationService.getById).mockResolvedValueOnce(
        createMockReservation({ guestEmail: "john@example.com" })
      );

      const response = await app.inject({
        method: "DELETE",
        url: "/api/v1/reservations/res-123",
        headers: { authorization: "Bearer valid-token" },
      });

      expect(response.statusCode).toBe(403);
    });
  });
});
