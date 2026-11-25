import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";
import type { VenueMembershipLookup } from "@mbe/auth/fastify";
import type * as ReportModule from "../services/lost-demand-report.js";
import { createMockJWTPayload } from "../test/mocks.js";

vi.mock("../services/lost-demand-report.js", async (importOriginal) => {
  const actual = await importOriginal<typeof ReportModule>();
  return {
    ...actual,
    lostDemandReportService: { getLostDemand: vi.fn(), defaultWindow: vi.fn() },
  };
});

vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(),
}));

import { lostDemandReportService } from "../services/lost-demand-report.js";
import { jwtVerify } from "jose";

const URL_BASE = "/api/v1/reservations/metrics/lost-demand";

const report = {
  venueId: "venue-abc",
  from: "2026-06-01",
  to: "2026-06-28",
  total: 5,
  cells: [{ weekday: 5, hour: 19, searches: 3 }],
  anyTime: [{ weekday: 6, searches: 2 }],
};

describe("GET /api/v1/reservations/metrics/lost-demand", () => {
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

  const get = (query: string) =>
    app.inject({
      method: "GET",
      url: `${URL_BASE}?${query}`,
      headers: { authorization: "Bearer t" },
    });

  beforeEach(() => {
    vi.mocked(lostDemandReportService.getLostDemand).mockResolvedValue(report);
    vi.mocked(lostDemandReportService.defaultWindow).mockResolvedValue({
      from: "2026-06-01",
      to: "2026-06-28",
    });
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

  it("returns the aggregate for a member of the venue", async () => {
    const lookup = vi.fn<VenueMembershipLookup>().mockResolvedValue(true);
    await buildAs(["staff"], lookup);

    const response = await get("venueId=venue-abc&from=2026-06-01&to=2026-06-28");

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ data: report });
    expect(lookup).toHaveBeenCalledWith("auth0|operator", "venue-abc");
    expect(lostDemandReportService.getLostDemand).toHaveBeenCalledWith({
      venueId: "venue-abc",
      from: "2026-06-01",
      to: "2026-06-28",
    });
    expect(lostDemandReportService.defaultWindow).not.toHaveBeenCalled();
  });

  it("defaults the window to the venue's last 28 days", async () => {
    await buildAs(["staff"], vi.fn<VenueMembershipLookup>().mockResolvedValue(true));

    await get("venueId=venue-abc");

    expect(lostDemandReportService.defaultWindow).toHaveBeenCalledWith("venue-abc");
    expect(lostDemandReportService.getLostDemand).toHaveBeenCalledWith({
      venueId: "venue-abc",
      from: "2026-06-01",
      to: "2026-06-28",
    });
  });

  it("returns 403 for a non-member and never reads the ledger", async () => {
    await buildAs(["staff"], vi.fn<VenueMembershipLookup>().mockResolvedValue(false));

    const response = await get("venueId=venue-abc&from=2026-06-01&to=2026-06-28");

    expect(response.statusCode).toBe(403);
    expect(lostDemandReportService.getLostDemand).not.toHaveBeenCalled();
  });

  it("returns 400 for a date that is not a real calendar day", async () => {
    await buildAs(["admin"]);
    const response = await get("venueId=venue-abc&from=2026-02-31&to=2026-03-05");
    expect(response.statusCode).toBe(400);
    expect(lostDemandReportService.getLostDemand).not.toHaveBeenCalled();
  });

  it("returns 400 when from is after to", async () => {
    await buildAs(["admin"]);
    const response = await get("venueId=venue-abc&from=2026-06-28&to=2026-06-01");
    expect(response.statusCode).toBe(400);
    expect(lostDemandReportService.getLostDemand).not.toHaveBeenCalled();
  });

  it("returns 400 when the window is longer than 92 days", async () => {
    await buildAs(["admin"]);
    const response = await get("venueId=venue-abc&from=2026-01-01&to=2026-06-28");
    expect(response.statusCode).toBe(400);
    expect(lostDemandReportService.getLostDemand).not.toHaveBeenCalled();
  });
});
