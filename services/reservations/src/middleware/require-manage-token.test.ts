import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";
import { generateManageToken } from "../routes/public-reservations.js";

// Minimal app-level integration test for the requireManageToken preHandler.
// We test via the manage-reservation GET route (simplest passthrough).

vi.mock("../services/reservation.js", () => ({
  reservationService: {
    getById: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    cancel: vi.fn(),
    updateWithConflictCheck: vi.fn(),
  },
}));

vi.mock("../services/venue.js", () => ({
  venueService: {
    list: vi.fn(),
    getById: vi.fn(),
    getBySlug: vi.fn(),
  },
}));

vi.mock("jose", () => ({
  jwtVerify: vi.fn(),
  createRemoteJWKSet: vi.fn(() => vi.fn()),
}));

import { reservationService } from "../services/reservation.js";
import { venueService } from "../services/venue.js";

const mockReservation = {
  id: "res_1",
  venueId: "venue_1",
  date: "2026-06-15",
  startTime: "19:00",
  endTime: "21:00",
  partySize: 4,
  guestName: "Jane Doe",
  guestEmail: "jane@example.com",
  guestPhone: null,
  status: "PENDING",
  notes: null,
  cancellationReason: null,
  cancellationNote: null,
  guestId: null,
  userId: null,
  tableId: "table_1",
  table: null,
  createdAt: "2026-06-01T00:00:00Z",
  updatedAt: "2026-06-01T00:00:00Z",
};

const mockVenue = {
  id: "venue_1",
  name: "The Oak Table",
  slug: "the-oak-table",
  ianaTimezone: "America/Los_Angeles",
};

describe("requireManageToken preHandler", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.AUTH_BYPASS_IN_TESTS = "true";
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.AUTH_BYPASS_IN_TESTS;
  });

  it("returns 400 RFC 7807 when token query param is missing", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/public/v1/reservations/manage",
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.type).toBe("about:blank");
    expect(body.title).toBe("Missing Token");
    expect(body.status).toBe(400);
  });

  it("returns 410 RFC 7807 for expired token", async () => {
    const { createHmac } = await import("crypto");
    const secret = process.env.MANAGE_TOKEN_SECRET || "dev-secret-do-not-use-in-prod";
    const expiry = Date.now() - 1000;
    const payload = `res_1:jane@example.com:${expiry}`;
    const signature = createHmac("sha256", secret).update(payload).digest("hex");
    const expiredToken = Buffer.from(`${payload}:${signature}`).toString("base64url");

    const response = await app.inject({
      method: "GET",
      url: `/public/v1/reservations/manage?token=${expiredToken}`,
    });

    expect(response.statusCode).toBe(410);
    const body = response.json();
    expect(body.type).toBe("about:blank");
    expect(body.title).toBe("Token Expired");
    expect(body.status).toBe(410);
  });

  it("returns 401 RFC 7807 for invalid token", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/public/v1/reservations/manage?token=garbage-token",
    });

    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.type).toBe("about:blank");
    expect(body.title).toBe("Invalid Token");
    expect(body.status).toBe(401);
  });

  it("decorates request.managedReservationId and passes through for valid token", async () => {
    const token = generateManageToken("res_1", "jane@example.com");

    vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation as never);
    vi.mocked(venueService.getById).mockResolvedValueOnce(mockVenue as never);

    const response = await app.inject({
      method: "GET",
      url: `/public/v1/reservations/manage?token=${token}`,
    });

    // Handler ran (uses managedReservationId) — reservation returned successfully
    expect(response.statusCode).toBe(200);
    expect(response.json().data.reservation.id).toBe("res_1");
  });
});
