import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";
import type { VenueMembershipLookup } from "@mbe/auth/fastify";
import { createMockJWTPayload } from "../test/mocks.js";

vi.mock("../services/autopilot-proposals.js", () => ({
  autopilotProposalsService: { getProposals: vi.fn() },
}));

vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(),
}));

import { autopilotProposalsService } from "../services/autopilot-proposals.js";
import { jwtVerify } from "jose";

const URL_BASE = "/api/v1/reservations/metrics/autopilot-proposals";
const proposals = { date: "2026-06-19", venueId: "venue-abc", moves: [] };

describe("GET /api/v1/reservations/metrics/autopilot-proposals", () => {
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
    vi.mocked(autopilotProposalsService.getProposals).mockResolvedValue(proposals);
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

  it("returns tonight's proposals for a member of the venue", async () => {
    const lookup = vi.fn<VenueMembershipLookup>().mockResolvedValue(true);
    await buildAs(["staff"], lookup);

    const response = await app.inject({
      method: "GET",
      url: `${URL_BASE}?venueId=venue-abc`,
      headers: { authorization: "Bearer t" },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ data: proposals });
    expect(lookup).toHaveBeenCalledWith("auth0|operator", "venue-abc");
    // No date: the service resolves the venue's current service date (still last night's after midnight).
    expect(autopilotProposalsService.getProposals).toHaveBeenCalledWith({ venueId: "venue-abc" });
  });

  it("passes the service date the Timeline is showing", async () => {
    await buildAs(["staff"], vi.fn<VenueMembershipLookup>().mockResolvedValue(true));

    await app.inject({
      method: "GET",
      url: `${URL_BASE}?venueId=venue-abc&date=2026-06-19`,
      headers: { authorization: "Bearer t" },
    });

    expect(autopilotProposalsService.getProposals).toHaveBeenCalledWith({
      venueId: "venue-abc",
      date: "2026-06-19",
    });
  });

  it("returns 400 for a date that is not a real calendar day", async () => {
    await buildAs(["admin"]);

    const response = await app.inject({
      method: "GET",
      url: `${URL_BASE}?venueId=venue-abc&date=2026-02-31`,
      headers: { authorization: "Bearer t" },
    });

    expect(response.statusCode).toBe(400);
    expect(autopilotProposalsService.getProposals).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-member and never reads proposals", async () => {
    await buildAs(["staff"], vi.fn<VenueMembershipLookup>().mockResolvedValue(false));

    const response = await app.inject({
      method: "GET",
      url: `${URL_BASE}?venueId=venue-abc`,
      headers: { authorization: "Bearer t" },
    });

    expect(response.statusCode).toBe(403);
    expect(autopilotProposalsService.getProposals).not.toHaveBeenCalled();
  });
});
