import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";

// Mock all services needed for app registration
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

vi.mock("../services/table.js", () => ({
  tableService: {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

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
    bulkUpdatePositions: vi.fn(),
    assignTable: vi.fn(),
    removeTable: vi.fn(),
  },
}));

vi.mock("../services/guest-recognition.js", () => ({
  recognizeGuest: vi.fn(),
}));

vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});

vi.mock("jose", () => ({
  jwtVerify: vi.fn(),
  createRemoteJWKSet: vi.fn(() => vi.fn()),
}));

import { venueService } from "../services/venue.js";
import { recognizeGuest } from "../services/guest-recognition.js";
import { GuestRecognitionSchema } from "@mbe/types/schemas";

const mockVenue = {
  id: "venue-123",
  venueGroupId: "group-1",
  name: "The Oak Table",
  slug: "the-oak-table",
  ianaTimezone: "America/Los_Angeles",
  currencyCode: "USD",
  operatingHours: null,
  settings: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("GET /public/v1/venues/:slug/guests/recognize", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    process.env.AUTH_BYPASS_IN_TESTS = "true";
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
    delete process.env.AUTH_BYPASS_IN_TESTS;
  });

  it("returns recognized guest data for known email (no phone)", async () => {
    vi.mocked(venueService.getBySlug).mockResolvedValueOnce(mockVenue);
    vi.mocked(recognizeGuest).mockResolvedValueOnce({
      recognized: true,
      firstName: "Jane",
      visitCount: 7,
      hasPreferences: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/public/v1/venues/the-oak-table/guests/recognize?email=jane@example.com",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toEqual({
      recognized: true,
      firstName: "Jane",
      visitCount: 7,
      hasPreferences: false,
    });
    expect(body.data).not.toHaveProperty("phone");
  });

  it("returns { recognized: false } for unknown email (not 404)", async () => {
    vi.mocked(venueService.getBySlug).mockResolvedValueOnce(mockVenue);
    vi.mocked(recognizeGuest).mockResolvedValueOnce({
      recognized: false,
      firstName: null,
      visitCount: 0,
      hasPreferences: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/public/v1/venues/the-oak-table/guests/recognize?email=nobody@example.com",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.recognized).toBe(false);
    expect(body.data.firstName).toBeNull();
  });

  it("returns 404 for invalid venue slug", async () => {
    vi.mocked(venueService.getBySlug).mockResolvedValueOnce(null);

    const response = await app.inject({
      method: "GET",
      url: "/public/v1/venues/no-such-venue/guests/recognize?email=test@example.com",
    });

    expect(response.statusCode).toBe(404);
  });

  it("returns an RFC 7807 problem-details body for a 404 (ADR-008)", async () => {
    vi.mocked(venueService.getBySlug).mockResolvedValueOnce(null);

    const response = await app.inject({
      method: "GET",
      url: "/public/v1/venues/no-such-venue/guests/recognize?email=test@example.com",
    });

    const body = response.json();
    expect(body).toMatchObject({
      type: expect.any(String),
      title: expect.any(String),
      status: 404,
    });
    expect(body.detail).toContain("no-such-venue");
    expect(body).not.toHaveProperty("success");
  });

  it("returns 400 when email query param is missing", async () => {
    vi.mocked(venueService.getBySlug).mockResolvedValueOnce(mockVenue);

    const response = await app.inject({
      method: "GET",
      url: "/public/v1/venues/the-oak-table/guests/recognize",
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns an RFC 7807 problem-details body for a 400 (ADR-008)", async () => {
    vi.mocked(venueService.getBySlug).mockResolvedValueOnce(mockVenue);

    const response = await app.inject({
      method: "GET",
      url: "/public/v1/venues/the-oak-table/guests/recognize",
    });

    // The querystring schema marks `email` required, so ajv rejects the
    // request before the handler's own `if (!email)` check ever runs — the
    // body below comes from the service's shared error handler, not the
    // route's createProblemDetails call. Assert shape + a meaningful detail
    // rather than the route's exact literal string.
    const body = response.json();
    expect(body).toMatchObject({
      type: expect.any(String),
      title: expect.any(String),
      status: 400,
    });
    expect(body.detail).toContain("email");
    expect(body).not.toHaveProperty("success");
  });

  it("does not require authentication", async () => {
    delete process.env.AUTH_BYPASS_IN_TESTS;

    vi.mocked(venueService.getBySlug).mockResolvedValueOnce(mockVenue);
    vi.mocked(recognizeGuest).mockResolvedValueOnce({
      recognized: false,
      firstName: null,
      visitCount: 0,
      hasPreferences: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/public/v1/venues/the-oak-table/guests/recognize?email=test@example.com",
    });

    // Should NOT be 401
    expect(response.statusCode).not.toBe(401);
    expect(response.statusCode).toBe(200);
  });

  it("never exposes sensitive guest data in response", async () => {
    vi.mocked(venueService.getBySlug).mockResolvedValueOnce(mockVenue);
    vi.mocked(recognizeGuest).mockResolvedValueOnce({
      recognized: true,
      firstName: "Jane",
      visitCount: 7,
      hasPreferences: true,
    });

    const response = await app.inject({
      method: "GET",
      url: "/public/v1/venues/the-oak-table/guests/recognize?email=jane@example.com",
    });

    const body = response.json();
    expect(body.data).not.toHaveProperty("id");
    expect(body.data).not.toHaveProperty("email");
    expect(body.data).not.toHaveProperty("phone");
    expect(body.data).not.toHaveProperty("notes");
    expect(body.data).not.toHaveProperty("lifetimeSpend");
    expect(body.data).not.toHaveProperty("tags");
    expect(body.data).not.toHaveProperty("venueId");
    // lastVisit is a precise, unauthenticated-disclosable date the booking
    // widget never reads — dropped from the public response entirely.
    expect(body.data).not.toHaveProperty("lastVisit");
  });

  it("has rate limiting configured at 10 req/min", async () => {
    vi.mocked(venueService.getBySlug).mockResolvedValue(mockVenue);
    vi.mocked(recognizeGuest).mockResolvedValue({
      recognized: false,
      firstName: null,
      visitCount: 0,
      hasPreferences: false,
    });

    // Send 11 requests — the 11th should be rate-limited
    const responses = [];
    for (let i = 0; i < 11; i++) {
      const response = await app.inject({
        method: "GET",
        url: "/public/v1/venues/the-oak-table/guests/recognize?email=test@example.com",
      });
      responses.push(response);
    }

    // First 10 should succeed
    for (let i = 0; i < 10; i++) {
      const response = responses[i];
      if (!response) throw new Error(`expected response at index ${i}`);
      expect(response.statusCode).toBe(200);
    }
    // 11th should be rate limited (429)
    const eleventh = responses[10];
    if (!eleventh) throw new Error("expected an 11th response");
    expect(eleventh.statusCode).toBe(429);
  });

  it("contract: live response validates against the shared GuestRecognition Zod schema", async () => {
    vi.mocked(venueService.getBySlug).mockResolvedValueOnce(mockVenue);
    vi.mocked(recognizeGuest).mockResolvedValueOnce({
      recognized: true,
      firstName: "Jane",
      visitCount: 7,
      hasPreferences: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/public/v1/venues/the-oak-table/guests/recognize?email=jane@example.com",
    });

    const body = response.json() as { data: unknown };
    const result = GuestRecognitionSchema.safeParse(body.data);
    expect(result.success).toBe(true);
  });
});
