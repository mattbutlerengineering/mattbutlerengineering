import type * as VenueContext from "../middleware/venue-context.js";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";
import type { VenueMembershipLookup } from "@mbe/auth/fastify";
import { createMockJWTPayload } from "../test/mocks.js";

const { mockDepositDb } = vi.hoisted(() => ({
  mockDepositDb: { findUnique: vi.fn() },
}));

vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService({ prisma: { deposit: mockDepositDb } });
});

// The deposit read runs in a venue-scoped transaction; this suite asserts the
// guard and the response shape, not RLS (see rls-route-sweep.integration.test.ts).
vi.mock("../middleware/venue-context.js", async (importOriginal) => ({
  ...(await importOriginal<typeof VenueContext>()),
  setVenueContext: vi.fn(),
}));

vi.mock("../services/resolve-venue.js", () => ({
  resolveVenueId: vi.fn(),
}));

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(),
}));

import { jwtVerify } from "jose";
import { resolveVenueId } from "../services/resolve-venue.js";

const URL = "/api/v1/reservations/res_1/deposit-status";
const AUTH = { authorization: "Bearer valid-token" };

/** A full deposit row, Stripe ids included: the route must never echo them. */
const row = {
  id: "dep_1",
  reservationId: "res_1",
  amountCents: 5000,
  currency: "usd",
  status: "partial_refunded",
  stripePaymentIntentId: "pi_secret",
  stripeCustomerId: "cus_secret",
  heldAt: new Date("2026-11-20T10:00:00.000Z"),
  appliedAt: new Date("2026-11-21T10:00:00.000Z"),
  refundedAt: new Date("2026-11-22T10:00:00.000Z"),
  forfeitedAt: null,
  forfeitOrigin: null,
  uncollectableAt: null,
  feeAmountCents: 1500,
  refundAmountCents: 3500,
  postCaptureRefundCents: null,
  createdAt: new Date("2026-11-20T09:00:00.000Z"),
  updatedAt: new Date("2026-11-22T10:00:00.000Z"),
};

describe("GET /api/v1/reservations/:id/deposit-status", () => {
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
    mockDepositDb.findUnique.mockResolvedValue(row);
    lookup = vi.fn<VenueMembershipLookup>().mockResolvedValue(true);
    asUser([]);
    app = await buildApp({ logger: false, venueMembershipLookup: lookup });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.resetAllMocks();
    process.env = originalEnv;
  });

  it("returns 401 when not authenticated", async () => {
    const response = await app.inject({ method: "GET", url: URL });

    expect(response.statusCode).toBe(401);
  });

  it("lets a venue member read the narrow deposit shape", async () => {
    const response = await app.inject({ method: "GET", url: URL, headers: AUTH });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        status: "partial_refunded",
        amountCents: 5000,
        currency: "usd",
        heldAt: "2026-11-20T10:00:00.000Z",
        appliedAt: "2026-11-21T10:00:00.000Z",
        refundedAt: "2026-11-22T10:00:00.000Z",
        forfeitedAt: null,
        uncollectableAt: null,
        postCaptureRefundCents: null,
        refundAmountCents: 3500,
      },
    });
    expect(lookup).toHaveBeenCalledWith(expect.anything(), "venue_1");
  });

  it("never leaks a stripe key, id or fee in the body", async () => {
    const response = await app.inject({ method: "GET", url: URL, headers: AUTH });

    expect(response.body).not.toMatch(/stripe/i);
    expect(response.body).not.toContain("pi_secret");
    expect(response.body).not.toContain("cus_secret");
    expect(response.json().data).not.toHaveProperty("id");
    expect(response.json().data).not.toHaveProperty("feeAmountCents");
  });

  it("answers data null when the reservation has no deposit", async () => {
    mockDepositDb.findUnique.mockResolvedValue(null);

    const response = await app.inject({ method: "GET", url: URL, headers: AUTH });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: null });
  });

  it("lets a platform admin read it", async () => {
    asUser(["admin"]);

    const response = await app.inject({ method: "GET", url: URL, headers: AUTH });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.status).toBe("partial_refunded");
  });

  it("denies a non-member the reservation of another venue", async () => {
    lookup.mockResolvedValue(false);

    const response = await app.inject({ method: "GET", url: URL, headers: AUTH });

    expect(response.statusCode).toBe(403);
    expect(mockDepositDb.findUnique).not.toHaveBeenCalled();
  });

  it("answers a non-member the same for an unknown reservation as for another venue's", async () => {
    lookup.mockResolvedValue(false);
    const otherVenue = await app.inject({ method: "GET", url: URL, headers: AUTH });

    vi.mocked(resolveVenueId).mockResolvedValue(null);
    const missing = await app.inject({ method: "GET", url: URL, headers: AUTH });

    expect(missing.statusCode).toBe(otherVenue.statusCode);
    expect(missing.json()).toEqual(otherVenue.json());
    expect(mockDepositDb.findUnique).not.toHaveBeenCalled();
  });
});
