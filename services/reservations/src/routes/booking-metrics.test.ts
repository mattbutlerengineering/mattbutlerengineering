import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";
import { createMockJWTPayload } from "../test/mocks.js";

vi.mock("../services/booking-metrics.js", () => ({
  bookingMetricsService: {
    getDailyBookingMetrics: vi.fn(),
  },
}));

// Mock all other services required by buildApp
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

vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(),
}));

import { bookingMetricsService } from "../services/booking-metrics.js";
import { jwtVerify } from "jose";

const mockMetrics = {
  date: "2026-06-19",
  venueId: "venue-abc",
  reservations: { pending: 2, confirmed: 5, cancelled: 1, completed: 3, noShow: 1 },
  deposits: { held: 4, applied: 2, refunded: 1, forfeited: 0 },
};

/** Keys that must never appear anywhere in the metrics response, at any depth. */
const FORBIDDEN_PII_KEYS = [
  "guestName",
  "guestEmail",
  "guestPhone",
  "guestId",
  "id",
  "reservationId",
  "stripeCustomerId",
  "stripePaymentIntentId",
];

/**
 * Recursively walks an arbitrary JSON value and returns the dotted path of
 * the first forbidden key found, or null if none are present at any depth.
 */
function findForbiddenKey(value: unknown, forbidden: string[], path = "$"): string | null {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findForbiddenKey(value[i], forbidden, `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (forbidden.includes(key)) return `${path}.${key}`;
      const hit = findForbiddenKey(nested, forbidden, `${path}.${key}`);
      if (hit) return hit;
    }
  }
  return null;
}

describe("GET /api/v1/reservations/metrics/daily", () => {
  let app: FastifyInstance;
  const originalEnv = process.env;
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

  it("returns 401 when not authenticated", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/reservations/metrics/daily?venueId=venue-abc",
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns 400 problem-details when venueId param is missing", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/reservations/metrics/daily",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body).toMatchObject({
      status: 400,
      title: expect.any(String),
      detail: expect.any(String),
    });
  });

  it("returns 400 when date param has an invalid format", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/reservations/metrics/daily?venueId=venue-abc&date=06-19-2026",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("defaults to today when no date param is given", async () => {
    vi.mocked(bookingMetricsService.getDailyBookingMetrics).mockResolvedValueOnce(mockMetrics);
    const todayIso = new Date().toISOString().slice(0, 10);

    await app.inject({
      method: "GET",
      url: "/api/v1/reservations/metrics/daily?venueId=venue-abc",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(bookingMetricsService.getDailyBookingMetrics).toHaveBeenCalledWith({
      date: todayIso,
      venueId: "venue-abc",
    });
  });

  it("passes an explicit date param through to the service", async () => {
    vi.mocked(bookingMetricsService.getDailyBookingMetrics).mockResolvedValueOnce(mockMetrics);

    await app.inject({
      method: "GET",
      url: "/api/v1/reservations/metrics/daily?venueId=venue-abc&date=2026-06-19",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(bookingMetricsService.getDailyBookingMetrics).toHaveBeenCalledWith({
      date: "2026-06-19",
      venueId: "venue-abc",
    });
  });

  it("returns the aggregated counts from the service", async () => {
    vi.mocked(bookingMetricsService.getDailyBookingMetrics).mockResolvedValueOnce(mockMetrics);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/reservations/metrics/daily?venueId=venue-abc&date=2026-06-19",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data).toEqual(mockMetrics);
  });

  it("never exposes PII fields anywhere in the response body", async () => {
    vi.mocked(bookingMetricsService.getDailyBookingMetrics).mockResolvedValueOnce(mockMetrics);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/reservations/metrics/daily?venueId=venue-abc&date=2026-06-19",
      headers: { authorization: "Bearer valid-token" },
    });

    const raw = response.body;
    for (const forbidden of ["guestName", "guestEmail", "guestPhone", "reservationId", '"id":']) {
      expect(raw).not.toContain(forbidden);
    }
  });

  it("recursively guards against PII keys anywhere in the response body, at any depth", async () => {
    vi.mocked(bookingMetricsService.getDailyBookingMetrics).mockResolvedValueOnce(mockMetrics);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/reservations/metrics/daily?venueId=venue-abc&date=2026-06-19",
      headers: { authorization: "Bearer valid-token" },
    });

    const body = JSON.parse(response.body);
    expect(findForbiddenKey(body, FORBIDDEN_PII_KEYS)).toBeNull();
  });
});
