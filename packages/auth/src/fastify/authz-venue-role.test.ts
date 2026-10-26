import { describe, it, expect, vi, afterEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance, FastifyPluginAsync } from "fastify";

const mockJwtVerify = vi.hoisted(() => vi.fn());

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: mockJwtVerify,
}));

import { authPlugin, requireAuth } from "./plugin.js";
import { hasVenueRole, requireVenueRole, type VenueRole, type VenueRoleLookup } from "./authz.js";

const makeJWTPayload = (permissions: string[]) => ({
  sub: "auth0|operator-A",
  iss: "https://test.auth0.com/",
  aud: "https://api.example.com",
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
  email: "test@example.com",
  permissions,
});

function signInAs(permissions: string[]) {
  mockJwtVerify.mockResolvedValue({
    payload: makeJWTPayload(permissions),
    protectedHeader: { alg: "RS256" },
  });
}

/** A manager-gated route, plus the same guard without requireAuth. */
function buildRoleApp(lookupRole: VenueRoleLookup) {
  const app = Fastify({ logger: false });
  const venueFromQuery = (req: { query: unknown }) =>
    (req.query as { venueId?: string }).venueId ?? null;

  const routesPlugin: FastifyPluginAsync = async (fastify) => {
    await fastify.register(authPlugin, {
      authority: "https://test.auth0.com",
      audience: "https://api.example.com",
    });
    fastify.patch(
      "/config",
      { preHandler: [requireAuth, requireVenueRole("manager", lookupRole, venueFromQuery)] },
      async () => ({ ok: true })
    );
    fastify.patch(
      "/config-no-auth",
      { preHandler: [requireVenueRole("manager", lookupRole, venueFromQuery)] },
      async () => ({ ok: true })
    );
  };

  app.register(routesPlugin);
  return app;
}

describe("hasVenueRole", () => {
  it("orders roles owner ⊇ manager ⊇ staff", () => {
    expect(hasVenueRole("owner", "manager")).toBe(true);
    expect(hasVenueRole("manager", "manager")).toBe(true);
    expect(hasVenueRole("staff", "manager")).toBe(false);
    expect(hasVenueRole("staff", "staff")).toBe(true);
    expect(hasVenueRole("manager", "owner")).toBe(false);
  });

  it("denies a non-member (null role) at every level", () => {
    expect(hasVenueRole(null, "staff")).toBe(false);
  });
});

describe("requireVenueRole('manager')", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app?.close();
    vi.clearAllMocks();
  });

  async function patchConfig(url = "/config?venueId=venue-1") {
    return app.inject({ method: "PATCH", url, headers: { authorization: "Bearer t" } });
  }

  it.each<VenueRole>(["owner", "manager"])("admits a venue %s", async (role) => {
    signInAs(["staff"]);
    const lookup = vi.fn<VenueRoleLookup>().mockResolvedValue(role);
    app = buildRoleApp(lookup);
    await app.ready();

    expect((await patchConfig()).statusCode).toBe(200);
    expect(lookup).toHaveBeenCalledWith("auth0|operator-A", "venue-1");
  });

  it("refuses a staff member with 403 and a Manager-specific detail", async () => {
    signInAs(["staff"]);
    app = buildRoleApp(vi.fn<VenueRoleLookup>().mockResolvedValue("staff"));
    await app.ready();

    const response = await patchConfig();

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).detail).toBe("Manager role required for this venue");
  });

  it("refuses a non-member with the same 403 requireVenueAccess sends", async () => {
    signInAs(["staff"]);
    app = buildRoleApp(vi.fn<VenueRoleLookup>().mockResolvedValue(null));
    await app.ready();

    const response = await patchConfig();

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).detail).toBe("You do not have access to this venue");
  });

  it("lets a platform admin bypass WITHOUT a role lookup", async () => {
    signInAs(["admin"]);
    const lookup = vi.fn<VenueRoleLookup>();
    app = buildRoleApp(lookup);
    await app.ready();

    expect((await patchConfig()).statusCode).toBe(200);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("returns 403 without a lookup when the venue is undeterminable", async () => {
    signInAs(["staff"]);
    const lookup = vi.fn<VenueRoleLookup>();
    app = buildRoleApp(lookup);
    await app.ready();

    expect((await patchConfig("/config")).statusCode).toBe(403);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("returns 401 when request.user is unset (requireAuth did not run)", async () => {
    const lookup = vi.fn<VenueRoleLookup>();
    app = buildRoleApp(lookup);
    await app.ready();

    const response = await app.inject({ method: "PATCH", url: "/config-no-auth?venueId=v" });

    expect(response.statusCode).toBe(401);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("fails closed when the role lookup rejects", async () => {
    signInAs(["staff"]);
    app = buildRoleApp(vi.fn<VenueRoleLookup>().mockRejectedValue(new Error("db is down")));
    await app.ready();

    expect((await patchConfig()).statusCode).toBeGreaterThanOrEqual(500);
  });
});
