import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";
import type { VenueMembershipLookup } from "@mbe/auth/fastify";
import { createMockJWTPayload } from "../test/mocks.js";

vi.mock("../services/reservation-events.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listForReservation: vi.fn(),
}));

vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});

vi.mock("../services/resolve-venue.js", () => ({
  resolveVenueId: vi.fn(),
}));

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(),
}));

import { jwtVerify } from "jose";
import { resolveVenueId } from "../services/resolve-venue.js";
import { InvalidEventCursorError, listForReservation } from "../services/reservation-events.js";

const EVENTS_URL = "/api/v1/reservations/res_1/events";
const AUTH = { authorization: "Bearer valid-token" };

const events = [
  {
    id: "e1",
    kind: "created",
    actorType: "guest",
    actorId: null,
    fromState: null,
    toState: { status: "PENDING" },
    createdAt: "2026-10-20T10:00:00.000Z",
  },
  {
    id: "e2",
    kind: "status_changed",
    actorType: "staff",
    actorId: "user_1",
    fromState: { status: "PENDING" },
    toState: { status: "CONFIRMED" },
    createdAt: "2026-10-20T11:00:00.000Z",
  },
];

describe("GET /api/v1/reservations/:id/events", () => {
  let app: FastifyInstance;
  let lookup: ReturnType<typeof vi.fn<VenueMembershipLookup>>;
  const originalEnv = process.env;

  const asUser = (permissions: string[]) =>
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: createMockJWTPayload({ permissions }),
      protectedHeader: { alg: "RS256" },
    } as never);

  beforeEach(async () => {
    process.env = {
      ...originalEnv,
      AUTH_AUTHORITY: "https://test.auth0.com",
      AUTH_AUDIENCE: "https://api.example.com",
      AUTH_BYPASS_IN_TESTS: "true",
    };
    vi.mocked(resolveVenueId).mockResolvedValue("venue_1");
    lookup = vi.fn<VenueMembershipLookup>().mockResolvedValue(true);
    asUser(["admin"]);
    app = await buildApp({ logger: false, venueMembershipLookup: lookup });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.resetAllMocks();
    process.env = originalEnv;
  });

  it("returns 401 when not authenticated", async () => {
    const response = await app.inject({ method: "GET", url: EVENTS_URL });

    expect(response.statusCode).toBe(401);
  });

  it("returns the reservation's events oldest-first with the page cursor", async () => {
    vi.mocked(listForReservation).mockResolvedValueOnce({ data: events, nextCursor: "next" });

    const response = await app.inject({ method: "GET", url: EVENTS_URL, headers: AUTH });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: events, nextCursor: "next" });
    expect(resolveVenueId).toHaveBeenCalledWith("reservation", "res_1");
    expect(listForReservation).toHaveBeenCalledWith("res_1", { limit: 50, cursor: undefined });
  });

  it("passes limit and cursor through to the service", async () => {
    vi.mocked(listForReservation).mockResolvedValueOnce({ data: [], nextCursor: null });

    await app.inject({ method: "GET", url: `${EVENTS_URL}?limit=2&cursor=abc`, headers: AUTH });

    expect(listForReservation).toHaveBeenCalledWith("res_1", { limit: 2, cursor: "abc" });
  });

  it("rejects a limit above 200 with 400", async () => {
    const response = await app.inject({
      method: "GET",
      url: `${EVENTS_URL}?limit=201`,
      headers: AUTH,
    });

    expect(response.statusCode).toBe(400);
    expect(listForReservation).not.toHaveBeenCalled();
  });

  it("answers 400 for a malformed cursor", async () => {
    vi.mocked(listForReservation).mockRejectedValueOnce(new InvalidEventCursorError());

    const response = await app.inject({
      method: "GET",
      url: `${EVENTS_URL}?cursor=bad`,
      headers: AUTH,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ status: 400 });
  });

  it("answers 404 to an admin for an unknown reservation", async () => {
    vi.mocked(resolveVenueId).mockResolvedValue(null);

    const response = await app.inject({ method: "GET", url: EVENTS_URL, headers: AUTH });

    expect(response.statusCode).toBe(404);
    expect(listForReservation).not.toHaveBeenCalled();
  });

  it("answers a non-member the same for another venue's reservation as for a missing one", async () => {
    asUser([]);
    lookup.mockResolvedValue(false);
    const otherVenue = await app.inject({ method: "GET", url: EVENTS_URL, headers: AUTH });

    vi.mocked(resolveVenueId).mockResolvedValue(null);
    const missing = await app.inject({ method: "GET", url: EVENTS_URL, headers: AUTH });

    expect(otherVenue.statusCode).toBe(403);
    expect(missing.statusCode).toBe(otherVenue.statusCode);
    expect(missing.json()).toEqual(otherVenue.json());
    expect(listForReservation).not.toHaveBeenCalled();
  });

  it("lets a venue member read its own reservation's events", async () => {
    asUser([]);
    vi.mocked(listForReservation).mockResolvedValueOnce({ data: events, nextCursor: null });

    const response = await app.inject({ method: "GET", url: EVENTS_URL, headers: AUTH });

    expect(response.statusCode).toBe(200);
    expect(lookup).toHaveBeenCalledWith(expect.anything(), "venue_1");
  });
});
