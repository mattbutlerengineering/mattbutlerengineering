import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";
import type { WaitlistEntry } from "../services/waitlist.js";

// Mock waitlist service
vi.mock("../services/waitlist.js", () => ({
  waitlistService: {
    add: vi.fn(),
    listWaiting: vi.fn(),
    getById: vi.fn(),
    updateStatus: vi.fn(),
    remove: vi.fn(),
    getNext: vi.fn(),
    updatePosition: vi.fn(),
  },
}));

// Mock waitlist-sms
vi.mock("../services/waitlist-sms.js", () => ({
  buildAddedSms: vi
    .fn()
    .mockReturnValue("You're #1, est. 0 min wait. We'll text when your table is ready."),
  buildPositionUpdateSms: vi.fn().mockReturnValue("Update: you're now #1, est. 0 min."),
  buildTableReadySms: vi
    .fn()
    .mockReturnValue("Your table is ready! Please check in within 5 minutes."),
  estimateWaitMinutes: vi.fn().mockReturnValue(0),
  sendWaitlistSms: vi.fn().mockResolvedValue(undefined),
  scheduleClaimWindow: vi.fn(),
}));

// Mock table service
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

// Mock events service
vi.mock("../services/events.js", () => ({
  emitTableUpdated: vi.fn(),
  emitReservationCreated: vi.fn(),
  emitReservationUpdated: vi.fn(),
  emitReservationCancelled: vi.fn(),
  emitHoldCreated: vi.fn(),
  emitHoldReleased: vi.fn(),
  emitHoldConfirmed: vi.fn(),
}));

// Mock reservation service
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

// Mock venue service
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

// Mock guest service
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

// Mock floor plan service
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

// Mock database
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

// Mock jose
vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(),
}));

import { waitlistService } from "../services/waitlist.js";
import {
  buildAddedSms,
  estimateWaitMinutes,
  sendWaitlistSms,
  buildTableReadySms,
  scheduleClaimWindow,
} from "../services/waitlist-sms.js";
import { jwtVerify } from "jose";

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

const NOW = new Date().toISOString();

function makeEntry(overrides: Partial<WaitlistEntry> = {}): WaitlistEntry {
  return {
    id: "entry-1",
    venueId: "venue-1",
    guestName: "Alice",
    guestPhone: "+15555550001",
    partySize: 2,
    status: "WAITING",
    position: 1,
    notifyJobId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

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
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
    process.env = originalEnv;
  });

  describe("POST /api/v1/waitlist", () => {
    it("adds entry and sends SMS on waitlist add", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);
      vi.mocked(waitlistService.add).mockResolvedValueOnce(makeEntry({ position: 1 }));
      vi.mocked(estimateWaitMinutes).mockReturnValueOnce(0);
      vi.mocked(buildAddedSms).mockReturnValueOnce(
        "You're #1, est. 0 min wait. We'll text when your table is ready."
      );

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/waitlist",
        headers: { "x-auth-bypass": "true" },
        payload: {
          venueId: "venue-1",
          guestName: "Alice",
          guestPhone: "+15555550001",
          partySize: 2,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.data.position).toBe(1);
      expect(body.data.guestPhone).toBe("+15555550001");
      expect(sendWaitlistSms).toHaveBeenCalledWith(
        expect.anything(),
        "+15555550001",
        expect.stringContaining("#1"),
        expect.anything()
      );
    });

    it("returns 400 when phone is missing", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/waitlist",
        headers: { "x-auth-bypass": "true" },
        payload: {
          venueId: "venue-1",
          guestName: "Alice",
          partySize: 2,
          // guestPhone intentionally omitted
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("returns 400 when partySize is missing", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/waitlist",
        headers: { "x-auth-bypass": "true" },
        payload: {
          venueId: "venue-1",
          guestName: "Alice",
          guestPhone: "+15555550001",
          // partySize intentionally omitted
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("returns 401 without auth", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/waitlist",
        payload: {
          venueId: "venue-1",
          guestName: "Alice",
          guestPhone: "+15555550001",
          partySize: 2,
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("GET /api/v1/waitlist", () => {
    it("returns waiting entries for a venue", async () => {
      vi.mocked(waitlistService.listWaiting).mockResolvedValueOnce([
        makeEntry({ position: 1 }),
        makeEntry({ id: "entry-2", position: 2, guestName: "Bob", guestPhone: "+15555550002" }),
      ]);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/waitlist?venueId=venue-1",
        headers: { "x-auth-bypass": "true" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(2);
      expect(body.data[0].position).toBe(1);
    });

    it("returns 400 when venueId missing", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/waitlist",
        headers: { "x-auth-bypass": "true" },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("PUT /api/v1/waitlist/:id/notify", () => {
    it("sends table-ready SMS and schedules claim window", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);
      vi.mocked(waitlistService.getById).mockResolvedValueOnce(makeEntry({ status: "WAITING" }));
      vi.mocked(waitlistService.updateStatus).mockResolvedValueOnce(
        makeEntry({ status: "NOTIFIED" })
      );
      vi.mocked(buildTableReadySms).mockReturnValueOnce(
        "Your table is ready! Please check in within 5 minutes."
      );

      const response = await app.inject({
        method: "PUT",
        url: "/api/v1/waitlist/entry-1/notify",
        headers: { "x-auth-bypass": "true" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.status).toBe("NOTIFIED");
      expect(sendWaitlistSms).toHaveBeenCalledWith(
        expect.anything(),
        "+15555550001",
        expect.stringContaining("table is ready"),
        expect.anything()
      );
      // smsAdapter is null in tests (no TWILIO_* env vars) — that's valid
      expect(scheduleClaimWindow).toHaveBeenCalledWith(
        "entry-1",
        expect.toSatisfy((v: unknown) => v === null || typeof v === "object"),
        expect.anything()
      );
    });

    it("returns 404 when entry not found", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);
      vi.mocked(waitlistService.getById).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: "PUT",
        url: "/api/v1/waitlist/missing/notify",
        headers: { "x-auth-bypass": "true" },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("DELETE /api/v1/waitlist/:id", () => {
    it("removes entry and returns 204", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);
      vi.mocked(waitlistService.remove).mockResolvedValueOnce(true);

      const response = await app.inject({
        method: "DELETE",
        url: "/api/v1/waitlist/entry-1",
        headers: { "x-auth-bypass": "true" },
      });

      expect(response.statusCode).toBe(204);
    });

    it("returns 404 when entry not found", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: mockJWTPayload,
        protectedHeader: { alg: "RS256" },
      } as never);
      vi.mocked(waitlistService.remove).mockResolvedValueOnce(false);

      const response = await app.inject({
        method: "DELETE",
        url: "/api/v1/waitlist/missing",
        headers: { "x-auth-bypass": "true" },
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
