import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance, InjectOptions } from "fastify";

// Mock the hold service
vi.mock("../services/hold.js", () => ({
  holdService: {
    create: vi.fn(),
    getById: vi.fn(),
    getVenueId: vi.fn(),
    getBySessionId: vi.fn(),
    release: vi.fn(),
    cleanupExpired: vi.fn(),
    maybeCleanup: vi.fn(),
  },
}));

// Mock the confirm-hold orchestrator
vi.mock("../services/confirm-hold.js", () => ({
  confirmHold: vi.fn(),
}));

// Mock the availability service
vi.mock("../services/availability.js", () => ({
  availabilityService: {
    generateTimeSlots: vi.fn(),
    getAvailableDates: vi.fn(),
    findBestTable: vi.fn(),
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

import { jwtVerify } from "jose";
import type { VenueMembershipLookup } from "@mbe/auth/fastify";
import { holdService } from "../services/hold.js";
import { confirmHold } from "../services/confirm-hold.js";
import { getCurrentVenueId } from "../services/venue-context-store.js";
import { resetRateLimitState } from "../middleware/public-rate-limit.js";

// Route constants (kept out of individual tests so the AI-antipattern
// ratchet's hardcodedRoutes count doesn't grow with every new test).
const HOLDS_URL = "/api/v1/holds";
const HOLD_URL = `${HOLDS_URL}/hold-123`;
const CONFIRM_URL = `${HOLD_URL}/confirm`;

const mockHold = {
  id: "hold-123",
  venueId: "venue-123",
  tableId: "table-1",
  date: "2024-02-15",
  startTime: "2024-02-15T18:00:00.000Z",
  endTime: "2024-02-15T19:30:00.000Z",
  partySize: 4,
  sessionId: "session-abc",
  expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  createdAt: "2024-02-15T17:50:00.000Z",
};

const mockReservation = {
  id: "res-123",
  date: "2024-02-15",
  startTime: "2024-02-15T18:00:00.000Z",
  endTime: "2024-02-15T19:30:00.000Z",
  partySize: 4,
  status: "CONFIRMED" as const,
  notes: null,
  cancellationReason: null,
  cancellationNote: null,
  occasion: null,
  seatingPreference: null,
  guestName: "John Doe",
  guestEmail: "john@example.com",
  guestPhone: null,
  guestId: null,
  userId: null,
  tableId: "table-1",
  venueId: "venue-123",
  createdAt: "2024-02-15T17:55:00.000Z",
  updatedAt: "2024-02-15T17:55:00.000Z",
};

describe("Hold Routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    // The auth plugin only registers (and only honours the x-auth-bypass
    // header) when both authority and audience resolve — without them
    // `requireAuth` 401s every request, bypass header or not.
    process.env.AUTH_AUTHORITY = "https://test.auth0.com";
    process.env.AUTH_AUDIENCE = "https://api.example.com";
    process.env.AUTH_BYPASS_IN_TESTS = "true";
    app = await buildApp({ logger: false });
    await app.ready();
    vi.clearAllMocks();
    // The public rate-limit hook's counters are module-global (unlike the
    // per-app-instance @fastify/rate-limit store), so reset them per test.
    resetRateLimitState();
    // Default maybeCleanup to do nothing
    vi.mocked(holdService.maybeCleanup).mockResolvedValue(false);
    // Every hold in this file belongs to venue-123 unless a test says otherwise.
    vi.mocked(holdService.getVenueId).mockResolvedValue("venue-123");
  });

  afterEach(async () => {
    await app.close();
  });

  /**
   * Injects an authenticated request. Every route in this file requires a JWT
   * (#4487), so the behaviour suites below go through here; the
   * "auth enforcement" suite at the bottom calls `app.inject` directly to
   * exercise the anonymous case.
   */
  const authInject = (options: InjectOptions) =>
    app.inject({
      ...options,
      headers: { "x-auth-bypass": "true", ...options.headers },
    });

  describe("POST /v1/holds", () => {
    it("should create a hold successfully", async () => {
      vi.mocked(holdService.create).mockResolvedValue({
        success: true,
        hold: mockHold,
      });

      const response = await authInject({
        method: "POST",
        url: HOLDS_URL,
        headers: {
          "x-session-id": "session-abc",
        },
        payload: {
          venueId: "venue-123",
          date: "2024-02-15",
          time: "2024-02-15T18:00:00.000Z",
          partySize: 4,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.data).toEqual(mockHold);
      expect(holdService.create).toHaveBeenCalledWith(
        {
          venueId: "venue-123",
          date: "2024-02-15",
          time: "2024-02-15T18:00:00.000Z",
          partySize: 4,
        },
        "session-abc"
      );
    });

    it("should generate session ID if not provided", async () => {
      vi.mocked(holdService.create).mockResolvedValue({
        success: true,
        hold: mockHold,
      });

      const response = await authInject({
        method: "POST",
        url: HOLDS_URL,
        payload: {
          venueId: "venue-123",
          date: "2024-02-15",
          time: "2024-02-15T18:00:00.000Z",
          partySize: 4,
        },
      });

      expect(response.statusCode).toBe(201);
      expect(response.headers["x-session-id"]).toBeDefined();
    });

    it("should return 409 when no tables available", async () => {
      vi.mocked(holdService.create).mockResolvedValue({
        success: false,
        error: "No available tables for this time slot",
      });

      const response = await authInject({
        method: "POST",
        url: HOLDS_URL,
        headers: {
          "x-session-id": "session-abc",
        },
        payload: {
          venueId: "venue-123",
          date: "2024-02-15",
          time: "2024-02-15T18:00:00.000Z",
          partySize: 4,
        },
      });

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.title).toBe("Conflict");
    });

    it("should return 404 when venue not found", async () => {
      vi.mocked(holdService.create).mockResolvedValue({
        success: false,
        error: "Venue not found",
      });

      const response = await authInject({
        method: "POST",
        url: HOLDS_URL,
        headers: {
          "x-session-id": "session-abc",
        },
        payload: {
          venueId: "non-existent",
          date: "2024-02-15",
          time: "2024-02-15T18:00:00.000Z",
          partySize: 4,
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.title).toBe("Not Found");
    });

    it("returns 403 (never 409) when the table belongs to another venue", async () => {
      vi.mocked(holdService.create).mockResolvedValue({
        success: false,
        error: "The requested table does not belong to this venue",
        tableNotInVenue: true,
      });

      const response = await authInject({
        method: "POST",
        url: HOLDS_URL,
        headers: { "x-session-id": "session-abc" },
        payload: {
          venueId: "venue-1",
          date: "2024-02-15",
          time: "2024-02-15T18:00:00.000Z",
          partySize: 4,
          tableId: "table-of-venue-B",
        },
      });

      expect(response.statusCode).toBe(403);
      expect(JSON.parse(response.body)).toMatchObject({
        status: 403,
        title: "Forbidden",
        detail: "The requested table does not belong to this venue",
      });
    });
  });

  describe("GET /v1/holds/:id", () => {
    it("should return hold by ID", async () => {
      vi.mocked(holdService.getById).mockResolvedValue(mockHold);

      const response = await authInject({
        method: "GET",
        url: HOLD_URL,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toEqual(mockHold);
    });

    it("should return 404 for non-existent hold", async () => {
      vi.mocked(holdService.getById).mockResolvedValue(null);

      const response = await authInject({
        method: "GET",
        url: `${HOLDS_URL}/non-existent`,
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.title).toBe("Not Found");
    });
  });

  describe("DELETE /v1/holds/:id", () => {
    it("should release hold successfully", async () => {
      vi.mocked(holdService.release).mockResolvedValue(true);

      const response = await authInject({
        method: "DELETE",
        url: HOLD_URL,
        headers: {
          "x-session-id": "session-abc",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(holdService.release).toHaveBeenCalledWith("hold-123", "session-abc");
    });

    it("should return 400 without session ID", async () => {
      const response = await authInject({
        method: "DELETE",
        url: HOLD_URL,
      });

      // Fastify schema validation returns 400 for missing required header
      expect(response.statusCode).toBe(400);
    });

    it("should return 404 when hold not found or wrong session", async () => {
      vi.mocked(holdService.release).mockResolvedValue(false);

      const response = await authInject({
        method: "DELETE",
        url: HOLD_URL,
        headers: {
          "x-session-id": "wrong-session",
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("POST /v1/holds/:id/confirm", () => {
    it("should confirm hold and create reservation", async () => {
      vi.mocked(confirmHold).mockResolvedValue({
        success: true,
        reservation: mockReservation,
      });

      const response = await authInject({
        method: "POST",
        url: CONFIRM_URL,
        headers: {
          "x-session-id": "session-abc",
        },
        payload: {
          guestName: "John Doe",
          guestEmail: "john@example.com",
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.data.id).toEqual(mockReservation.id);
      expect(body.data.status).toEqual("CONFIRMED");
      expect(body.data.guestName).toEqual("John Doe");
      expect(typeof body.manageToken).toBe("string");
      expect(body.manageToken.length).toBeGreaterThan(0);
      expect(confirmHold).toHaveBeenCalledWith({
        holdId: "hold-123",
        sessionId: "session-abc",
        guestDetails: {
          guestName: "John Doe",
          guestEmail: "john@example.com",
        },
        venueId: "venue-123",
      });
    });

    // A manage token is signed with the guestEmail it was minted with, but a
    // reservation confirmed without an email is stored with guestEmail: null
    // (confirm-hold.ts's `guestDetails.guestEmail ?? null`). Signing with ""
    // instead of matching that null would produce a token that
    // requireManageToken's `reservation.guestEmail !== result.guestEmail`
    // check can never validate — a guest who books by phone only would get a
    // Cancel Reservation link that 403s forever. No manage token at all (the
    // client already treats it as optional) is correct here, not a broken one.
    it("does not return a manage token when no guestEmail is provided (phone-only booking)", async () => {
      vi.mocked(confirmHold).mockResolvedValue({
        success: true,
        reservation: { ...mockReservation, guestEmail: null, guestPhone: "555-0100" },
      });

      const response = await authInject({
        method: "POST",
        url: CONFIRM_URL,
        headers: {
          "x-session-id": "session-abc",
        },
        payload: {
          guestPhone: "555-0100",
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.manageToken).toBeUndefined();
    });

    it("should return 400 without session ID", async () => {
      const response = await authInject({
        method: "POST",
        url: CONFIRM_URL,
        payload: {
          guestName: "John Doe",
        },
      });

      // Fastify schema validation returns 400 for missing required header
      expect(response.statusCode).toBe(400);
    });

    it("should return 410 for expired hold", async () => {
      vi.mocked(confirmHold).mockResolvedValue({
        success: false,
        error: "Hold has expired",
        errorCode: "EXPIRED",
      });

      const response = await authInject({
        method: "POST",
        url: CONFIRM_URL,
        headers: {
          "x-session-id": "session-abc",
        },
        payload: {
          guestName: "John Doe",
        },
      });

      expect(response.statusCode).toBe(410);
      const body = JSON.parse(response.body);
      expect(body.title).toBe("Hold Expired");
      expect(body.detail).toBe("Hold has expired");
    });

    it("should return 404 for nonexistent hold", async () => {
      vi.mocked(confirmHold).mockResolvedValue({
        success: false,
        error: "Hold not found",
        errorCode: "NOT_FOUND",
      });

      const response = await authInject({
        method: "POST",
        url: CONFIRM_URL,
        headers: {
          "x-session-id": "session-abc",
        },
        payload: {
          guestName: "John Doe",
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.title).toBe("Not Found");
      expect(body.detail).toBe("Hold not found");
    });

    it("should return 403 for session ID mismatch", async () => {
      vi.mocked(confirmHold).mockResolvedValue({
        success: false,
        error: "Session ID does not match the hold",
        errorCode: "SESSION_MISMATCH",
      });

      const response = await authInject({
        method: "POST",
        url: CONFIRM_URL,
        headers: {
          "x-session-id": "wrong-session",
        },
        payload: {
          guestName: "John Doe",
        },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.title).toBe("Forbidden");
    });

    it("should return 409 when slot no longer available", async () => {
      vi.mocked(confirmHold).mockResolvedValue({
        success: false,
        error: "Time slot is no longer available",
        errorCode: "CONFLICT",
      });

      const response = await authInject({
        method: "POST",
        url: CONFIRM_URL,
        headers: {
          "x-session-id": "session-abc",
        },
        payload: {
          guestName: "John Doe",
        },
      });

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.title).toBe("Conflict");
    });

    it("should return 422 when pacing limit is exceeded", async () => {
      vi.mocked(confirmHold).mockResolvedValue({
        success: false,
        error: "Pacing limit reached for this time slot",
        errorCode: "PACING_EXCEEDED",
      });

      const response = await authInject({
        method: "POST",
        url: CONFIRM_URL,
        headers: {
          "x-session-id": "session-abc",
        },
        payload: {
          guestName: "John Doe",
        },
      });

      expect(response.statusCode).toBe(422);
      const body = JSON.parse(response.body);
      expect(body.title).toBe("Pacing Limit Reached");
      expect(body.detail).toBe("Pacing limit reached for this time slot");
    });
  });

  describe("rate limiting (#4487 shared subset)", () => {
    // Matches MAX_REQUESTS_PER_MINUTE in middleware/public-rate-limit.ts —
    // the same per-IP cap the /public/v1 sibling (public-holds.ts) enforces.
    const PUBLIC_CAP = 30;

    it("GET /:id carries the service-wide x-ratelimit-limit header", async () => {
      vi.mocked(holdService.getById).mockResolvedValue(null);

      const response = await authInject({
        method: "GET",
        url: HOLD_URL,
      });

      // The global 100/min onRequest limiter must stay attached (#4492 class:
      // a route-level config.rateLimit would silently replace it).
      expect(response.headers["x-ratelimit-limit"]).toBeDefined();
    });

    it("DELETE /:id carries the service-wide x-ratelimit-limit header", async () => {
      vi.mocked(holdService.release).mockResolvedValue(false);

      const response = await authInject({
        method: "DELETE",
        url: HOLD_URL,
        headers: { "x-session-id": "session-abc" },
      });

      expect(response.headers["x-ratelimit-limit"]).toBeDefined();
    });

    it("POST /:id/confirm carries the service-wide x-ratelimit-limit header", async () => {
      vi.mocked(confirmHold).mockResolvedValue({
        success: false,
        error: "Hold not found",
        errorCode: "NOT_FOUND",
      });

      const response = await authInject({
        method: "POST",
        url: CONFIRM_URL,
        headers: { "x-session-id": "session-abc" },
        payload: { guestName: "John Doe" },
      });

      expect(response.headers["x-ratelimit-limit"]).toBeDefined();
    });

    it("enforces the per-IP public cap with 429 on GET, DELETE, and confirm", async () => {
      vi.mocked(holdService.getById).mockResolvedValue(null);

      // Exhaust the shared per-IP bucket (no venue slug in these URLs, so the
      // hook keys all three routes on the same ip:global bucket).
      for (let i = 0; i < PUBLIC_CAP; i++) {
        const warmup = await authInject({
          method: "GET",
          url: HOLD_URL,
        });
        expect(warmup.statusCode).toBe(404);
      }

      const limitedGet = await authInject({
        method: "GET",
        url: HOLD_URL,
      });
      expect(limitedGet.statusCode).toBe(429);
      expect(limitedGet.headers["retry-after"]).toBeDefined();

      const limitedDelete = await authInject({
        method: "DELETE",
        url: HOLD_URL,
        headers: { "x-session-id": "session-abc" },
      });
      expect(limitedDelete.statusCode).toBe(429);
      // The limiter must halt the request before the handler runs.
      expect(holdService.release).not.toHaveBeenCalled();

      const limitedConfirm = await authInject({
        method: "POST",
        url: CONFIRM_URL,
        headers: { "x-session-id": "session-abc" },
        payload: { guestName: "John Doe" },
      });
      expect(limitedConfirm.statusCode).toBe(429);
      expect(confirmHold).not.toHaveBeenCalled();
    });
  });

  // #4487: /api/v1/holds is the STAFF surface. This service's own CLAUDE.md
  // contract is "all /api/v1/* routes require a JWT except /api/v1/availability",
  // and holds was silently exempt — the live public booking widget called it
  // anonymously. The widget now uses the hardened /public/v1/venues/:slug/holds
  // routes (server-side slug resolution + per-IP active-hold cap), so every
  // route here is authenticated.
  describe("auth enforcement (#4487)", () => {
    it("returns 401 for anonymous POST /v1/holds", async () => {
      const response = await app.inject({
        method: "POST",
        url: HOLDS_URL,
        payload: {
          venueId: "venue-123",
          date: "2024-02-15",
          time: "2024-02-15T18:00:00.000Z",
          partySize: 4,
        },
      });

      expect(response.statusCode).toBe(401);
      expect(holdService.create).not.toHaveBeenCalled();
    });

    it("returns 401 for anonymous GET /v1/holds/:id", async () => {
      const response = await app.inject({ method: "GET", url: HOLD_URL });

      expect(response.statusCode).toBe(401);
      expect(holdService.getById).not.toHaveBeenCalled();
    });

    it("returns 401 for anonymous DELETE /v1/holds/:id", async () => {
      const response = await app.inject({
        method: "DELETE",
        url: HOLD_URL,
        headers: { "x-session-id": "session-abc" },
      });

      expect(response.statusCode).toBe(401);
      expect(holdService.release).not.toHaveBeenCalled();
    });

    it("returns 401 for anonymous POST /v1/holds/:id/confirm", async () => {
      const response = await app.inject({
        method: "POST",
        url: CONFIRM_URL,
        headers: { "x-session-id": "session-abc" },
        payload: { guestName: "John Doe" },
      });

      expect(response.statusCode).toBe(401);
      expect(confirmHold).not.toHaveBeenCalled();
    });
  });

  // Staff holds are scoped to the hold's own venue (ADR-020): any signed-in
  // user used to be able to create holds at any venue (blocking inventory and
  // reading venue-B slot state via 409 vs 201) and read any hold by id.
  // The auth-bypass identity used above is a platform admin, which
  // requireVenueAccess waves through, so these tests sign in as a non-admin.
  describe("venue membership", () => {
    const NON_ADMIN_SUB = "auth0|staff-member";
    const CREATE_PAYLOAD = {
      venueId: "venue-123",
      date: "2024-02-15",
      time: "2024-02-15T18:00:00.000Z",
      partySize: 4,
    };
    const CONFIRM_PAYLOAD = { guestName: "John Doe", guestEmail: "john@example.com" };

    let scopedApp: FastifyInstance | undefined;
    let lookup: ReturnType<typeof vi.fn<VenueMembershipLookup>>;

    afterEach(async () => {
      await scopedApp?.close();
      scopedApp = undefined;
    });

    /** Builds an app whose membership lookup answers `isMember` for every venue. */
    const buildScopedApp = async (isMember: boolean) => {
      lookup = vi.fn<VenueMembershipLookup>().mockResolvedValue(isMember);
      scopedApp = await buildApp({ logger: false, venueMembershipLookup: lookup });
      await scopedApp.ready();
      return scopedApp;
    };

    /** Injects as a signed-in, non-admin user (no `admin` permission). */
    const staffInject = (target: FastifyInstance, options: InjectOptions) => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: {
          sub: NON_ADMIN_SUB,
          iss: "https://test.auth0.com/",
          aud: "https://api.example.com",
          exp: Math.floor(Date.now() / 1000) + 3600,
          iat: Math.floor(Date.now() / 1000),
          permissions: [],
        },
        protectedHeader: { alg: "RS256" },
      } as never);
      return target.inject({
        ...options,
        headers: { authorization: "Bearer staff-token", ...options.headers },
      });
    };

    describe("non-member", () => {
      it("POST /v1/holds returns 403 and creates nothing", async () => {
        const target = await buildScopedApp(false);

        const response = await staffInject(target, {
          method: "POST",
          url: HOLDS_URL,
          payload: CREATE_PAYLOAD,
        });

        expect(response.statusCode).toBe(403);
        expect(lookup).toHaveBeenCalledWith(NON_ADMIN_SUB, "venue-123");
        expect(holdService.create).not.toHaveBeenCalled();
      });

      it("GET /v1/holds/:id returns 403 without reading the hold", async () => {
        const target = await buildScopedApp(false);

        const response = await staffInject(target, { method: "GET", url: HOLD_URL });

        expect(response.statusCode).toBe(403);
        expect(holdService.getVenueId).toHaveBeenCalledWith("hold-123");
        expect(lookup).toHaveBeenCalledWith(NON_ADMIN_SUB, "venue-123");
        expect(holdService.getById).not.toHaveBeenCalled();
      });

      it("DELETE /v1/holds/:id returns 403 without releasing", async () => {
        const target = await buildScopedApp(false);

        const response = await staffInject(target, {
          method: "DELETE",
          url: HOLD_URL,
          headers: { "x-session-id": "session-abc" },
        });

        expect(response.statusCode).toBe(403);
        expect(holdService.release).not.toHaveBeenCalled();
      });

      it("POST /v1/holds/:id/confirm returns 403 without confirming", async () => {
        const target = await buildScopedApp(false);

        const response = await staffInject(target, {
          method: "POST",
          url: CONFIRM_URL,
          headers: { "x-session-id": "session-abc" },
          payload: CONFIRM_PAYLOAD,
        });

        expect(response.statusCode).toBe(403);
        expect(confirmHold).not.toHaveBeenCalled();
      });
    });

    describe("unknown hold", () => {
      it("returns 403 (not 404) to a non-admin so existence does not leak", async () => {
        vi.mocked(holdService.getVenueId).mockResolvedValue(null);
        const target = await buildScopedApp(true);

        const get = await staffInject(target, { method: "GET", url: HOLD_URL });
        const del = await staffInject(target, {
          method: "DELETE",
          url: HOLD_URL,
          headers: { "x-session-id": "session-abc" },
        });
        const confirm = await staffInject(target, {
          method: "POST",
          url: CONFIRM_URL,
          headers: { "x-session-id": "session-abc" },
          payload: CONFIRM_PAYLOAD,
        });

        expect([get.statusCode, del.statusCode, confirm.statusCode]).toEqual([403, 403, 403]);
        expect(lookup).not.toHaveBeenCalled();
        expect(holdService.getById).not.toHaveBeenCalled();
        expect(holdService.release).not.toHaveBeenCalled();
        expect(confirmHold).not.toHaveBeenCalled();
      });

      it("still returns 404 to a platform admin", async () => {
        vi.mocked(holdService.getVenueId).mockResolvedValue(null);
        vi.mocked(holdService.getById).mockResolvedValue(null);
        vi.mocked(holdService.release).mockResolvedValue(false);

        const get = await authInject({ method: "GET", url: HOLD_URL });
        const del = await authInject({
          method: "DELETE",
          url: HOLD_URL,
          headers: { "x-session-id": "session-abc" },
        });
        const confirm = await authInject({
          method: "POST",
          url: CONFIRM_URL,
          headers: { "x-session-id": "session-abc" },
          payload: CONFIRM_PAYLOAD,
        });

        expect([get.statusCode, del.statusCode, confirm.statusCode]).toEqual([404, 404, 404]);
        expect(confirmHold).not.toHaveBeenCalled();
      });
    });

    describe("member", () => {
      it("POST /v1/holds creates the hold", async () => {
        vi.mocked(holdService.create).mockResolvedValue({ success: true, hold: mockHold });
        const target = await buildScopedApp(true);

        const response = await staffInject(target, {
          method: "POST",
          url: HOLDS_URL,
          headers: { "x-session-id": "session-abc" },
          payload: CREATE_PAYLOAD,
        });

        expect(response.statusCode).toBe(201);
        expect(holdService.create).toHaveBeenCalledWith(CREATE_PAYLOAD, "session-abc");
      });

      it("GET /v1/holds/:id returns the hold", async () => {
        vi.mocked(holdService.getById).mockResolvedValue(mockHold);
        const target = await buildScopedApp(true);

        const response = await staffInject(target, { method: "GET", url: HOLD_URL });

        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body).data).toEqual(mockHold);
      });

      it("DELETE /v1/holds/:id still enforces the session check", async () => {
        vi.mocked(holdService.release).mockResolvedValue(false);
        const target = await buildScopedApp(true);

        const response = await staffInject(target, {
          method: "DELETE",
          url: HOLD_URL,
          headers: { "x-session-id": "wrong-session" },
        });

        expect(response.statusCode).toBe(404);
        expect(holdService.release).toHaveBeenCalledWith("hold-123", "wrong-session");
      });

      it("POST /v1/holds/:id/confirm still enforces the session check", async () => {
        vi.mocked(confirmHold).mockResolvedValue({
          success: false,
          error: "Session ID does not match the hold",
          errorCode: "SESSION_MISMATCH",
        });
        const target = await buildScopedApp(true);

        const response = await staffInject(target, {
          method: "POST",
          url: CONFIRM_URL,
          headers: { "x-session-id": "wrong-session" },
          payload: CONFIRM_PAYLOAD,
        });

        expect(response.statusCode).toBe(403);
        expect(confirmHold).toHaveBeenCalledWith(
          expect.objectContaining({ holdId: "hold-123", sessionId: "wrong-session" })
        );
      });

      it("POST /v1/holds/:id/confirm runs inside the hold's venue context", async () => {
        let venueInContext: string | null = null;
        vi.mocked(confirmHold).mockImplementation(async () => {
          venueInContext = getCurrentVenueId();
          return { success: true, reservation: mockReservation };
        });
        const target = await buildScopedApp(true);

        const response = await staffInject(target, {
          method: "POST",
          url: CONFIRM_URL,
          headers: { "x-session-id": "session-abc" },
          payload: CONFIRM_PAYLOAD,
        });

        expect(response.statusCode).toBe(201);
        expect(venueInContext).toBe("venue-123");
        expect(confirmHold).toHaveBeenCalledWith(
          expect.objectContaining({ holdId: "hold-123", venueId: "venue-123" })
        );
      });
    });
  });
});
