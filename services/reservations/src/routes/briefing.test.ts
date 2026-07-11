import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";
import type { BriefingService } from "../services/briefing.js";
import { createMockReservation } from "../test/mocks.js";

// Fake injected through the buildApp domain-services seam (#3357) — no
// vi.mock import ring, no jose mock. Auth uses the test bypass (hardcoded
// admin identity), which requireVenueAccess admits without a membership
// lookup; the JWT verification path itself is covered by @mbe/auth's own
// tests.
const briefing = {
  getBriefing: vi.fn(),
} satisfies BriefingService;

const mockReservation = createMockReservation({ venueId: "venue-abc" });

// Destructure to exclude PII fields (guestEmail, guestPhone) that the briefing service omits
const { guestEmail: _email, guestPhone: _phone, ...mockReservationBase } = mockReservation;

const mockBriefingEntry = {
  ...mockReservationBase,
  guest: {
    id: "guest-1",
    name: "Jane Doe",
    visitCount: 5,
    lastVisit: "2026-06-01",
    dietaryRestrictions: ["gluten-free"],
    notes: "VIP guest",
    staffNotes: [{ text: "Prefers window seat", createdBy: "staff-1", createdAt: "2026-01-01" }],
    tags: ["VIP"],
    communicationPreference: "both" as const,
  },
};

describe("GET /api/v1/briefing", () => {
  let app: FastifyInstance;
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = {
      ...originalEnv,
      AUTH_AUTHORITY: "https://test.auth0.com",
      AUTH_AUDIENCE: "https://api.example.com",
      AUTH_BYPASS_IN_TESTS: "true",
    };
    app = await buildApp({ logger: false, services: { briefing } });
    await app.ready();
    vi.resetAllMocks();
  });

  afterEach(async () => {
    await app.close();
    process.env = originalEnv;
  });

  it("returns 401 when not authenticated", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/briefing?date=2026-06-19&venueId=venue-abc",
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns 400 when date param is missing", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/briefing?venueId=venue-abc",
      headers: { "x-auth-bypass": "true" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 400 when venueId param is missing", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/briefing?date=2026-06-19",
      headers: { "x-auth-bypass": "true" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns enriched reservations with guest data", async () => {
    briefing.getBriefing.mockResolvedValueOnce([mockBriefingEntry]);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/briefing?date=2026-06-19&venueId=venue-abc",
      headers: { "x-auth-bypass": "true" },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(mockReservation.id);
    expect(body.data[0].guest).toBeDefined();
    expect(body.data[0].guest.visitCount).toBe(5);
    expect(body.data[0].guest.dietaryRestrictions).toContain("gluten-free");
  });

  it("does not expose guestEmail or guestPhone in briefing response (PII)", async () => {
    briefing.getBriefing.mockResolvedValueOnce([mockBriefingEntry]);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/briefing?date=2026-06-19&venueId=venue-abc",
      headers: { "x-auth-bypass": "true" },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data[0]).not.toHaveProperty("guestEmail");
    expect(body.data[0]).not.toHaveProperty("guestPhone");
  });

  it("passes date and venueId to briefing service", async () => {
    briefing.getBriefing.mockResolvedValueOnce([]);

    await app.inject({
      method: "GET",
      url: "/api/v1/briefing?date=2026-06-19&venueId=venue-abc",
      headers: { "x-auth-bypass": "true" },
    });

    expect(briefing.getBriefing).toHaveBeenCalledWith({
      date: "2026-06-19",
      venueId: "venue-abc",
    });
  });

  it("returns empty data array when no reservations", async () => {
    briefing.getBriefing.mockResolvedValueOnce([]);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/briefing?date=2026-06-19&venueId=venue-abc",
      headers: { "x-auth-bypass": "true" },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data).toEqual([]);
  });
});
