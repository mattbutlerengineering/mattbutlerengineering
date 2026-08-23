import { describe, it, expect, vi, afterEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance, FastifyPluginAsync } from "fastify";

// Use vi.hoisted for proper ESM mock hoisting
const mockJwtVerify = vi.hoisted(() => vi.fn());
const mockCreateRemoteJWKSet = vi.hoisted(() => vi.fn(() => "mock-jwks"));

vi.mock("jose", () => ({
  createRemoteJWKSet: mockCreateRemoteJWKSet,
  jwtVerify: mockJwtVerify,
}));

import { authPlugin, requireAuth } from "./plugin.js";
import {
  requireAdmin,
  requireVenueAccess,
  requireVenueCreateAccess,
  type HasAnyVenueMembership,
  type VenueMembershipLookup,
} from "./authz.js";

const makeJWTPayload = (overrides: Record<string, unknown> = {}) => ({
  sub: "auth0|operator-A",
  iss: "https://test.auth0.com/",
  aud: "https://api.example.com",
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
  email: "test@example.com",
  permissions: [] as string[],
  ...overrides,
});

const adminPayload = makeJWTPayload({ permissions: ["admin"] });
// Booking-widget guest: authenticated via the same JWT pool but carries no
// operator permission and (per requireVenueAccess) no venue membership.
const guestPayload = makeJWTPayload({ sub: "auth0|booking-guest", permissions: [] });
const operatorPayload = makeJWTPayload({ sub: "auth0|operator-A", permissions: ["staff"] });

/** Build a test app: an admin-only route and a venue-scoped route. */
function buildTestApp(lookupMembership: VenueMembershipLookup) {
  const app = Fastify({ logger: false });

  const routesPlugin: FastifyPluginAsync = async (fastify) => {
    await fastify.register(authPlugin, {
      authority: "https://test.auth0.com",
      audience: "https://api.example.com",
    });

    fastify.get("/admin-only", { preHandler: [requireAuth, requireAdmin] }, async () => ({
      ok: true,
    }));

    fastify.get<{ Querystring: { venueId?: string } }>(
      "/venue-scoped",
      {
        preHandler: [
          requireAuth,
          requireVenueAccess(lookupMembership, (req) => req.query.venueId ?? null),
        ],
      },
      async () => ({ ok: true })
    );

    // Misconfigured route: requireVenueAccess WITHOUT a preceding requireAuth,
    // to exercise its defensive 401 when request.user is unset.
    fastify.get<{ Querystring: { venueId?: string } }>(
      "/venue-scoped-no-auth",
      {
        preHandler: [requireVenueAccess(lookupMembership, (req) => req.query.venueId ?? null)],
      },
      async () => ({ ok: true })
    );
  };

  app.register(routesPlugin);
  return app;
}

describe("requireAdmin", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app?.close();
    vi.clearAllMocks();
  });

  it("allows a JWT carrying the admin role", async () => {
    mockJwtVerify.mockResolvedValue({ payload: adminPayload, protectedHeader: { alg: "RS256" } });
    app = buildTestApp(vi.fn());
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: "/admin-only",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(response.statusCode).toBe(200);
  });

  it("returns 403 for a non-admin (booking-widget guest) JWT", async () => {
    mockJwtVerify.mockResolvedValue({ payload: guestPayload, protectedHeader: { alg: "RS256" } });
    app = buildTestApp(vi.fn());
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: "/admin-only",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.status).toBe(403);
  });

  it("returns 403 for a coarse staff role (staff is not admin)", async () => {
    mockJwtVerify.mockResolvedValue({
      payload: operatorPayload,
      protectedHeader: { alg: "RS256" },
    });
    app = buildTestApp(vi.fn());
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: "/admin-only",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(response.statusCode).toBe(403);
  });
});

describe("requireVenueAccess", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app?.close();
    vi.clearAllMocks();
  });

  it("allows a platform admin without consulting the membership lookup", async () => {
    mockJwtVerify.mockResolvedValue({ payload: adminPayload, protectedHeader: { alg: "RS256" } });
    const lookup = vi.fn<VenueMembershipLookup>();
    app = buildTestApp(lookup);
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: "/venue-scoped?venueId=venue-any",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("allows a non-admin operator who is a member of the venue", async () => {
    mockJwtVerify.mockResolvedValue({
      payload: operatorPayload,
      protectedHeader: { alg: "RS256" },
    });
    const lookup = vi.fn<VenueMembershipLookup>().mockResolvedValue(true);
    app = buildTestApp(lookup);
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: "/venue-scoped?venueId=venue-in-group-A",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(lookup).toHaveBeenCalledWith("auth0|operator-A", "venue-in-group-A");
  });

  it("returns 403 for a signed-in booking-widget guest (no membership)", async () => {
    mockJwtVerify.mockResolvedValue({ payload: guestPayload, protectedHeader: { alg: "RS256" } });
    const lookup = vi.fn<VenueMembershipLookup>().mockResolvedValue(false);
    app = buildTestApp(lookup);
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: "/venue-scoped?venueId=venue-any",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(response.statusCode).toBe(403);
    expect(lookup).toHaveBeenCalledWith("auth0|booking-guest", "venue-any");
  });

  it("returns 403 when an operator hits a venue outside their groups", async () => {
    mockJwtVerify.mockResolvedValue({
      payload: operatorPayload,
      protectedHeader: { alg: "RS256" },
    });
    // Membership lookup denies venues the operator is not a member of.
    const lookup = vi
      .fn<VenueMembershipLookup>()
      .mockImplementation(async (_sub, venueId) => venueId === "venue-in-group-A");
    app = buildTestApp(lookup);
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: "/venue-scoped?venueId=venue-in-group-B",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(response.statusCode).toBe(403);
  });

  it("returns 403 when the venue id cannot be resolved", async () => {
    mockJwtVerify.mockResolvedValue({
      payload: operatorPayload,
      protectedHeader: { alg: "RS256" },
    });
    const lookup = vi.fn<VenueMembershipLookup>().mockResolvedValue(true);
    app = buildTestApp(lookup);
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: "/venue-scoped",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(response.statusCode).toBe(403);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("returns 401 from its own guard when request.user is unset (no requireAuth)", async () => {
    const lookup = vi.fn<VenueMembershipLookup>();
    app = buildTestApp(lookup);
    await app.ready();

    // Route omits requireAuth and no Authorization header is sent, so
    // request.user is undefined when requireVenueAccess runs.
    const response = await app.inject({
      method: "GET",
      url: "/venue-scoped-no-auth?venueId=venue-any",
    });

    expect(response.statusCode).toBe(401);
    expect(lookup).not.toHaveBeenCalled();
  });
});

/**
 * Build a test app exposing one venue-CREATE route guarded by
 * requireVenueCreateAccess, plus a deliberately misconfigured variant with no
 * preceding requireAuth so the defensive 401 branch is reachable.
 */
function buildCreateApp(hasAnyMembership: HasAnyVenueMembership) {
  const app = Fastify({ logger: false });

  const routesPlugin: FastifyPluginAsync = async (fastify) => {
    await fastify.register(authPlugin, {
      authority: "https://test.auth0.com",
      audience: "https://api.example.com",
    });

    fastify.post(
      "/venues",
      { preHandler: [requireAuth, requireVenueCreateAccess(hasAnyMembership)] },
      async () => ({ ok: true })
    );

    fastify.post(
      "/venues-no-auth",
      { preHandler: [requireVenueCreateAccess(hasAnyMembership)] },
      async () => ({ ok: true })
    );
  };

  app.register(routesPlugin);
  return app;
}

describe("requireVenueCreateAccess", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app?.close();
    vi.clearAllMocks();
  });

  it("admits a platform admin WITHOUT querying membership", async () => {
    mockJwtVerify.mockResolvedValue({ payload: adminPayload, protectedHeader: { alg: "RS256" } });
    const lookup = vi.fn<HasAnyVenueMembership>();
    app = buildCreateApp(lookup);
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/venues",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(response.statusCode).toBe(200);
    // The stateless role check must short-circuit before any I/O — an admin
    // creating a venue costs zero database round-trips, same as requireAdmin.
    expect(lookup).not.toHaveBeenCalled();
  });

  it("admits a non-admin holding NO venue membership (the bootstrap case)", async () => {
    mockJwtVerify.mockResolvedValue({
      payload: operatorPayload,
      protectedHeader: { alg: "RS256" },
    });
    const lookup = vi.fn<HasAnyVenueMembership>().mockResolvedValue(false);
    app = buildCreateApp(lookup);
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/venues",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(lookup).toHaveBeenCalledWith("auth0|operator-A");
  });

  it("refuses a non-admin who already holds a venue membership", async () => {
    mockJwtVerify.mockResolvedValue({
      payload: operatorPayload,
      protectedHeader: { alg: "RS256" },
    });
    const lookup = vi.fn<HasAnyVenueMembership>().mockResolvedValue(true);
    app = buildCreateApp(lookup);
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/venues",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.status).toBe(403);
    expect(body.title).toBeDefined();
  });

  it("returns 401 when request.user is unset (requireAuth did not run)", async () => {
    const lookup = vi.fn<HasAnyVenueMembership>();
    app = buildCreateApp(lookup);
    await app.ready();

    const response = await app.inject({ method: "POST", url: "/venues-no-auth" });

    expect(response.statusCode).toBe(401);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("FAILS CLOSED when the membership lookup rejects — never admits", async () => {
    mockJwtVerify.mockResolvedValue({
      payload: operatorPayload,
      protectedHeader: { alg: "RS256" },
    });
    const lookup = vi.fn<HasAnyVenueMembership>().mockRejectedValue(new Error("db is down"));
    app = buildCreateApp(lookup);
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/venues",
      headers: { authorization: "Bearer valid-token" },
    });

    // The specific code matters less than the guarantee: a lookup failure must
    // NOT reach the handler. Coercing a rejection to `false` would turn a
    // database outage into open venue minting for every authenticated identity.
    expect(response.statusCode).not.toBe(200);
    expect(response.statusCode).toBeGreaterThanOrEqual(500);
  });

  it("reads sub from the verified JWT only, ignoring client-supplied identifiers", async () => {
    mockJwtVerify.mockResolvedValue({
      payload: operatorPayload,
      protectedHeader: { alg: "RS256" },
    });
    const lookup = vi.fn<HasAnyVenueMembership>().mockResolvedValue(true);
    app = buildCreateApp(lookup);
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/venues?sub=auth0|attacker-has-no-venues",
      headers: {
        authorization: "Bearer valid-token",
        "x-user-sub": "auth0|attacker-has-no-venues",
      },
      payload: { sub: "auth0|attacker-has-no-venues", userSub: "auth0|attacker-has-no-venues" },
    });

    // Forged identifiers in body, query and headers must not change who is
    // looked up, and must not flip the outcome.
    expect(lookup).toHaveBeenCalledWith("auth0|operator-A");
    expect(response.statusCode).toBe(403);
  });
});
