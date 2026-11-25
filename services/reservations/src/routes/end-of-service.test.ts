import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";
import type { VenueMembershipLookup } from "@mbe/auth/fastify";
import { createMockJWTPayload } from "../test/mocks.js";

vi.mock("../services/end-of-service-summary.js", () => ({
  endOfServiceSummaryService: {
    getSummary: vi.fn(),
    defaultServiceDate: vi.fn(),
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

import { endOfServiceSummaryService } from "../services/end-of-service-summary.js";
import { jwtVerify } from "jose";

const URL_BASE = "/api/v1/reservations/metrics/end-of-service";

const summary = {
  date: "2026-06-19",
  venueId: "venue-abc",
  covers: 9,
  tableTurns: 3,
  noShows: 1,
  turnedAway: null,
};

describe("GET /api/v1/reservations/metrics/end-of-service", () => {
  let app: FastifyInstance;
  const originalEnv = process.env;

  async function buildAs(permissions: string[], lookup?: VenueMembershipLookup) {
    process.env = {
      ...originalEnv,
      AUTH_AUTHORITY: "https://test.auth0.com",
      AUTH_AUDIENCE: "https://api.example.com",
    };
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: createMockJWTPayload({ sub: "auth0|operator", permissions }),
      protectedHeader: { alg: "RS256" },
    } as never);
    app = await buildApp({ logger: false, ...(lookup && { venueMembershipLookup: lookup }) });
    await app.ready();
  }

  beforeEach(() => {
    vi.mocked(endOfServiceSummaryService.getSummary).mockResolvedValue(summary);
    vi.mocked(endOfServiceSummaryService.defaultServiceDate).mockResolvedValue("2026-06-19");
  });

  afterEach(async () => {
    await app?.close();
    vi.clearAllMocks();
    process.env = originalEnv;
  });

  it("returns 401 when not authenticated", async () => {
    await buildAs(["staff"], vi.fn<VenueMembershipLookup>().mockResolvedValue(true));
    const response = await app.inject({ method: "GET", url: `${URL_BASE}?venueId=venue-abc` });
    expect(response.statusCode).toBe(401);
  });

  it("returns the counts for a member of the venue", async () => {
    const lookup = vi.fn<VenueMembershipLookup>().mockResolvedValue(true);
    await buildAs(["staff"], lookup);

    const response = await app.inject({
      method: "GET",
      url: `${URL_BASE}?venueId=venue-abc&date=2026-06-19`,
      headers: { authorization: "Bearer t" },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ data: summary });
    expect(lookup).toHaveBeenCalledWith("auth0|operator", "venue-abc");
    expect(endOfServiceSummaryService.getSummary).toHaveBeenCalledWith({
      venueId: "venue-abc",
      date: "2026-06-19",
    });
    expect(endOfServiceSummaryService.defaultServiceDate).not.toHaveBeenCalled();
  });

  it("defaults the date to today in the venue's time zone", async () => {
    await buildAs(["staff"], vi.fn<VenueMembershipLookup>().mockResolvedValue(true));

    await app.inject({
      method: "GET",
      url: `${URL_BASE}?venueId=venue-abc`,
      headers: { authorization: "Bearer t" },
    });

    expect(endOfServiceSummaryService.defaultServiceDate).toHaveBeenCalledWith("venue-abc");
    expect(endOfServiceSummaryService.getSummary).toHaveBeenCalledWith({
      venueId: "venue-abc",
      date: "2026-06-19",
    });
  });

  it("returns 403 for a non-member and never reads the summary", async () => {
    await buildAs(["staff"], vi.fn<VenueMembershipLookup>().mockResolvedValue(false));

    const response = await app.inject({
      method: "GET",
      url: `${URL_BASE}?venueId=venue-abc&date=2026-06-19`,
      headers: { authorization: "Bearer t" },
    });

    expect(response.statusCode).toBe(403);
    expect(endOfServiceSummaryService.getSummary).not.toHaveBeenCalled();
  });

  it("returns 400 for a date that is not a real calendar day", async () => {
    await buildAs(["admin"]);

    const response = await app.inject({
      method: "GET",
      url: `${URL_BASE}?venueId=venue-abc&date=2026-02-31`,
      headers: { authorization: "Bearer t" },
    });

    expect(response.statusCode).toBe(400);
    expect(endOfServiceSummaryService.getSummary).not.toHaveBeenCalled();
  });

  it("returns 400 when the date has the wrong format", async () => {
    await buildAs(["admin"]);

    const response = await app.inject({
      method: "GET",
      url: `${URL_BASE}?venueId=venue-abc&date=06-19-2026`,
      headers: { authorization: "Bearer t" },
    });

    expect(response.statusCode).toBe(400);
  });
});
