import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";

// Mock the hold service
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

import { holdService } from "../services/hold.js";
import { confirmHold } from "../services/confirm-hold.js";

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
    process.env.AUTH_BYPASS_IN_TESTS = "true";
    app = await buildApp({ logger: false });
    await app.ready();
    vi.clearAllMocks();
    // Default maybeCleanup to do nothing
    vi.mocked(holdService.maybeCleanup).mockResolvedValue(false);
  });

  afterEach(async () => {
    await app.close();
  });

  describe("POST /v1/holds", () => {
    it("should create a hold successfully", async () => {
      vi.mocked(holdService.create).mockResolvedValue({
        success: true,
        hold: mockHold,
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/holds",
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

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/holds",
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

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/holds",
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
      expect(body.error).toBe("Conflict");
    });

    it("should return 404 when venue not found", async () => {
      vi.mocked(holdService.create).mockResolvedValue({
        success: false,
        error: "Venue not found",
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/holds",
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
      expect(body.error).toBe("Not Found");
    });
  });

  describe("GET /v1/holds/:id", () => {
    it("should return hold by ID", async () => {
      vi.mocked(holdService.getById).mockResolvedValue(mockHold);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/holds/hold-123",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toEqual(mockHold);
    });

    it("should return 404 for non-existent hold", async () => {
      vi.mocked(holdService.getById).mockResolvedValue(null);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/holds/non-existent",
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Not Found");
    });
  });

  describe("DELETE /v1/holds/:id", () => {
    it("should release hold successfully", async () => {
      vi.mocked(holdService.release).mockResolvedValue(true);

      const response = await app.inject({
        method: "DELETE",
        url: "/api/v1/holds/hold-123",
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
      const response = await app.inject({
        method: "DELETE",
        url: "/api/v1/holds/hold-123",
      });

      // Fastify schema validation returns 400 for missing required header
      expect(response.statusCode).toBe(400);
    });

    it("should return 404 when hold not found or wrong session", async () => {
      vi.mocked(holdService.release).mockResolvedValue(false);

      const response = await app.inject({
        method: "DELETE",
        url: "/api/v1/holds/hold-123",
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

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/holds/hold-123/confirm",
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
      expect(confirmHold).toHaveBeenCalledWith({
        holdId: "hold-123",
        sessionId: "session-abc",
        guestDetails: {
          guestName: "John Doe",
          guestEmail: "john@example.com",
        },
      });
    });

    it("should return 400 without session ID", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/holds/hold-123/confirm",
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

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/holds/hold-123/confirm",
        headers: {
          "x-session-id": "session-abc",
        },
        payload: {
          guestName: "John Doe",
        },
      });

      expect(response.statusCode).toBe(410);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Hold Expired");
      expect(body.message).toBe("Hold has expired");
    });

    it("should return 404 for nonexistent hold", async () => {
      vi.mocked(confirmHold).mockResolvedValue({
        success: false,
        error: "Hold not found",
        errorCode: "NOT_FOUND",
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/holds/hold-123/confirm",
        headers: {
          "x-session-id": "session-abc",
        },
        payload: {
          guestName: "John Doe",
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Not Found");
      expect(body.message).toBe("Hold not found");
    });

    it("should return 403 for session ID mismatch", async () => {
      vi.mocked(confirmHold).mockResolvedValue({
        success: false,
        error: "Session ID does not match the hold",
        errorCode: "SESSION_MISMATCH",
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/holds/hold-123/confirm",
        headers: {
          "x-session-id": "wrong-session",
        },
        payload: {
          guestName: "John Doe",
        },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Forbidden");
    });

    it("should return 409 when slot no longer available", async () => {
      vi.mocked(confirmHold).mockResolvedValue({
        success: false,
        error: "Time slot is no longer available",
        errorCode: "CONFLICT",
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/holds/hold-123/confirm",
        headers: {
          "x-session-id": "session-abc",
        },
        payload: {
          guestName: "John Doe",
        },
      });

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Conflict");
    });
  });
});
