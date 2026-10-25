import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import type { VenueMembershipLookup, VenueRole, VenueRoleLookup } from "@mbe/auth/fastify";
import { buildApp } from "../app.js";
import { LastManagerError } from "../services/venue-team.js";

vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(),
}));

import { jwtVerify } from "jose";

const VENUE = "venue-1";
const TEAM_URL = `/api/v1/venues/${VENUE}/team`;
const MEMBER_URL = `${TEAM_URL}/members/${encodeURIComponent("auth0|host")}`;

const team = {
  members: [
    { userSub: "auth0|manager", role: "manager", isViewer: false },
    { userSub: "auth0|host", role: "host", isViewer: true },
  ],
  hostEmergencyClose: false,
  viewerRole: "host",
};

const svc = { get: vi.fn(), setRole: vi.fn(), setHostEmergencyClose: vi.fn() };

/** Signs the next request in as `sub`, holding `role` at VENUE. */
async function appAs(role: VenueRole): Promise<FastifyInstance> {
  vi.mocked(jwtVerify).mockResolvedValue({
    payload: {
      sub: `auth0|${role}`,
      iss: "https://test.auth0.com/",
      aud: "https://api.example.com",
      permissions: [],
    },
    protectedHeader: { alg: "RS256" },
  } as never);
  const built = await buildApp({
    logger: false,
    venueMembershipLookup: vi.fn<VenueMembershipLookup>().mockResolvedValue(true),
    venueRoleLookup: vi.fn<VenueRoleLookup>().mockResolvedValue(role),
    services: { venueTeamService: svc as never },
  });
  await built.ready();
  return built;
}

const BEARER = { authorization: "Bearer token" };

describe("Venue team routes", () => {
  let app: FastifyInstance;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      AUTH_AUTHORITY: "https://test.auth0.com",
      AUTH_AUDIENCE: "https://api.example.com",
      AUTH_BYPASS_IN_TESTS: "true",
    };
  });

  afterEach(async () => {
    await app?.close();
    vi.resetAllMocks();
    process.env = originalEnv;
  });

  it("lets a Host read the team, with the caller's sub and admin flag", async () => {
    app = await appAs("staff");
    svc.get.mockResolvedValueOnce(team);

    const res = await app.inject({ method: "GET", url: TEAM_URL, headers: BEARER });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual(team);
    expect(svc.get).toHaveBeenCalledWith(VENUE, "auth0|staff", false);
  });

  it("answers 404 when the venue is gone", async () => {
    app = await appAs("manager");
    svc.get.mockResolvedValueOnce(null);

    const res = await app.inject({ method: "GET", url: TEAM_URL, headers: BEARER });

    expect(res.statusCode).toBe(404);
  });

  it("lets a Manager change a member's role", async () => {
    app = await appAs("manager");
    svc.setRole.mockResolvedValueOnce({ userSub: "auth0|host", role: "manager" });

    const res = await app.inject({
      method: "PATCH",
      url: MEMBER_URL,
      headers: BEARER,
      payload: { role: "manager" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ userSub: "auth0|host", role: "manager" });
    expect(svc.setRole).toHaveBeenCalledWith(VENUE, "auth0|host", "manager");
  });

  it("refuses a Host changing a role with 403", async () => {
    app = await appAs("staff");

    const res = await app.inject({
      method: "PATCH",
      url: MEMBER_URL,
      headers: BEARER,
      payload: { role: "manager" },
    });

    expect(res.statusCode).toBe(403);
    expect(svc.setRole).not.toHaveBeenCalled();
  });

  it("rejects a role outside Manager and Host", async () => {
    app = await appAs("owner");

    const res = await app.inject({
      method: "PATCH",
      url: MEMBER_URL,
      headers: BEARER,
      payload: { role: "owner" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("answers 404 for a user who is not a member", async () => {
    app = await appAs("manager");
    svc.setRole.mockResolvedValueOnce(null);

    const res = await app.inject({
      method: "PATCH",
      url: MEMBER_URL,
      headers: BEARER,
      payload: { role: "host" },
    });

    expect(res.statusCode).toBe(404);
  });

  it("answers 409 when the change would leave no Manager", async () => {
    app = await appAs("manager");
    svc.setRole.mockRejectedValueOnce(new LastManagerError());

    const res = await app.inject({
      method: "PATCH",
      url: MEMBER_URL,
      headers: BEARER,
      payload: { role: "host" },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().detail).toBe("A venue needs at least one Manager");
  });

  it("lets a Manager set the Host emergency-close grant", async () => {
    app = await appAs("owner");
    svc.setHostEmergencyClose.mockResolvedValueOnce(true);

    const res = await app.inject({
      method: "PATCH",
      url: TEAM_URL,
      headers: BEARER,
      payload: { hostEmergencyClose: true },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ hostEmergencyClose: true });
    expect(svc.setHostEmergencyClose).toHaveBeenCalledWith(VENUE, true);
  });

  it("refuses a Host setting the grant with 403", async () => {
    app = await appAs("staff");

    const res = await app.inject({
      method: "PATCH",
      url: TEAM_URL,
      headers: BEARER,
      payload: { hostEmergencyClose: true },
    });

    expect(res.statusCode).toBe(403);
    expect(svc.setHostEmergencyClose).not.toHaveBeenCalled();
  });
});
