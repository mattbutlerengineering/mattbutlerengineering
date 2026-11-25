import { describe, it, expect, vi, afterEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";
import type { VenueMembershipLookup } from "@mbe/auth/fastify";
import type * as WhatIfModule from "../services/lost-demand-what-if.js";
import { createMockJWTPayload } from "../test/mocks.js";

vi.mock("../services/lost-demand-what-if.js", async (importOriginal) => {
  const actual = await importOriginal<typeof WhatIfModule>();
  return { ...actual, lostDemandWhatIfService: { estimate: vi.fn() } };
});

vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(),
}));

import { lostDemandWhatIfService } from "../services/lost-demand-what-if.js";
import { jwtVerify } from "jose";

const URL_BASE = "/api/v1/reservations/metrics/lost-demand/what-if";

const estimate = {
  venueId: "venue-abc",
  from: "2026-10-28",
  to: "2026-11-24",
  weekday: 2,
  minute: 1290,
  outcome: "estimated" as const,
  searches: 7,
  windowStart: 1260,
  windowEnd: 1320,
  minParty: null,
  maxParty: null,
  anyTimeSearches: 3,
  nights: 4,
  perNight: 1.8,
};

describe("GET /api/v1/reservations/metrics/lost-demand/what-if", () => {
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
    vi.mocked(lostDemandWhatIfService.estimate).mockResolvedValue(estimate);
    app = await buildApp({ logger: false, ...(lookup && { venueMembershipLookup: lookup }) });
    await app.ready();
  }

  const get = (query: string) =>
    app.inject({
      method: "GET",
      url: `${URL_BASE}?${query}`,
      headers: { authorization: "Bearer t" },
    });

  afterEach(async () => {
    await app?.close();
    vi.clearAllMocks();
    process.env = originalEnv;
  });

  it("returns 401 when not authenticated", async () => {
    await buildAs(["staff"], vi.fn<VenueMembershipLookup>().mockResolvedValue(true));
    const response = await app.inject({
      method: "GET",
      url: `${URL_BASE}?venueId=venue-abc&weekday=2&time=21:30`,
    });
    expect(response.statusCode).toBe(401);
  });

  it("returns the estimate for a member and passes the minute and party range", async () => {
    const lookup = vi.fn<VenueMembershipLookup>().mockResolvedValue(true);
    await buildAs(["staff"], lookup);

    const response = await get("venueId=venue-abc&weekday=2&time=21:30&minParty=2&maxParty=4");

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ data: estimate });
    expect(lookup).toHaveBeenCalledWith("auth0|operator", "venue-abc");
    expect(lostDemandWhatIfService.estimate).toHaveBeenCalledWith(
      expect.objectContaining({
        venueId: "venue-abc",
        weekday: 2,
        minute: 21 * 60 + 30,
        minParty: 2,
        maxParty: 4,
      })
    );
  });

  it("returns 403 for a non-member and never estimates", async () => {
    await buildAs(["staff"], vi.fn<VenueMembershipLookup>().mockResolvedValue(false));
    const response = await get("venueId=venue-abc&weekday=2&time=21:30");
    expect(response.statusCode).toBe(403);
    expect(lostDemandWhatIfService.estimate).not.toHaveBeenCalled();
  });

  it.each([
    ["a malformed time", "venueId=venue-abc&weekday=2&time=9:30pm"],
    ["a weekday out of range", "venueId=venue-abc&weekday=7&time=21:30"],
    ["a missing time", "venueId=venue-abc&weekday=2"],
    [
      "a party range that is backwards",
      "venueId=venue-abc&weekday=2&time=21:30&minParty=6&maxParty=2",
    ],
    [
      "a window longer than 92 days",
      "venueId=venue-abc&weekday=2&time=21:30&from=2026-01-01&to=2026-06-28",
    ],
    [
      "a date that is not real",
      "venueId=venue-abc&weekday=2&time=21:30&from=2026-02-31&to=2026-03-05",
    ],
    [
      "only a start date (unbounded window)",
      "venueId=venue-abc&weekday=2&time=21:30&from=2000-01-01",
    ],
    ["only an end date", "venueId=venue-abc&weekday=2&time=21:30&to=2026-11-24"],
  ])("returns 400 for %s", async (_name, query) => {
    await buildAs(["admin"]);
    const response = await get(query);
    expect(response.statusCode).toBe(400);
    expect(lostDemandWhatIfService.estimate).not.toHaveBeenCalled();
  });
});
