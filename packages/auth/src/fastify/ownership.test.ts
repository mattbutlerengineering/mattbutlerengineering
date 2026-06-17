import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
import { requireOwnershipOrAdmin } from "./ownership.js";

const makeJWTPayload = (overrides: Record<string, unknown> = {}) => ({
  sub: "auth0|user-123",
  iss: "https://test.auth0.com/",
  aud: "https://api.example.com",
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
  email: "test@example.com",
  permissions: [] as string[],
  ...overrides,
});

const adminPayload = makeJWTPayload({ permissions: ["admin"] });
const nonAdminPayload = makeJWTPayload({ permissions: [] });

/** Build a test app with a route protected by requireOwnershipOrAdmin */
function buildTestApp(
  resolveOwner: (request: any) => Promise<string | null>,
  resolveCurrentId?: (request: any) => Promise<string | null>
) {
  const app = Fastify({ logger: false });

  const routesPlugin: FastifyPluginAsync = async (fastify) => {
    await fastify.register(authPlugin, {
      authority: "https://test.auth0.com",
      audience: "https://api.example.com",
    });

    fastify.get(
      "/resources/:id",
      {
        preHandler: [requireAuth, requireOwnershipOrAdmin(resolveOwner, resolveCurrentId)],
      },
      async (request: any) => {
        return { authorization: request.authorization };
      }
    );
  };

  app.register(routesPlugin);
  return app;
}

describe("requireOwnershipOrAdmin", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app?.close();
    vi.clearAllMocks();
  });

  describe("admin user", () => {
    beforeEach(async () => {
      mockJwtVerify.mockResolvedValue({
        payload: adminPayload,
        protectedHeader: { alg: "RS256" },
      });
      const resolveOwner = vi.fn().mockResolvedValue("resource-owner-id");
      app = buildTestApp(resolveOwner);
      await app.ready();
    });

    it("allows admin to access any resource and sets isAdmin=true", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/resources/other-user-id",
        headers: { authorization: "Bearer valid-token" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.authorization.isAdmin).toBe(true);
      expect(body.authorization.isOwner).toBe(false);
    });

    it("skips owner resolution for admin (does not call resolveOwner)", async () => {
      const resolveOwner = vi.fn().mockResolvedValue("resource-owner-id");
      app = buildTestApp(resolveOwner);
      await app.ready();

      await app.inject({
        method: "GET",
        url: "/resources/resource-id",
        headers: { authorization: "Bearer valid-token" },
      });

      expect(resolveOwner).not.toHaveBeenCalled();
    });
  });

  describe("non-admin user — owner", () => {
    it("allows owner to access their own resource and sets isOwner=true", async () => {
      mockJwtVerify.mockResolvedValue({
        payload: nonAdminPayload,
        protectedHeader: { alg: "RS256" },
      });

      // resolveOwner returns the same id as the JWT sub
      const resolveOwner = vi.fn().mockResolvedValue("auth0|user-123");
      app = buildTestApp(resolveOwner);
      await app.ready();

      const response = await app.inject({
        method: "GET",
        url: "/resources/resource-id",
        headers: { authorization: "Bearer valid-token" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.authorization.isOwner).toBe(true);
      expect(body.authorization.isAdmin).toBe(false);
    });
  });

  describe("non-admin user — not owner", () => {
    it("returns 403 when non-admin tries to access another user's resource", async () => {
      mockJwtVerify.mockResolvedValue({
        payload: nonAdminPayload,
        protectedHeader: { alg: "RS256" },
      });

      // resolveOwner returns a different id than the JWT sub
      const resolveOwner = vi.fn().mockResolvedValue("auth0|different-user");
      app = buildTestApp(resolveOwner);
      await app.ready();

      const response = await app.inject({
        method: "GET",
        url: "/resources/resource-id",
        headers: { authorization: "Bearer valid-token" },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.title).toBe("Forbidden");
    });
  });

  describe("non-admin user — resource not found (owner is null)", () => {
    it("returns 403 when resolveOwner returns null", async () => {
      mockJwtVerify.mockResolvedValue({
        payload: nonAdminPayload,
        protectedHeader: { alg: "RS256" },
      });

      const resolveOwner = vi.fn().mockResolvedValue(null);
      app = buildTestApp(resolveOwner);
      await app.ready();

      const response = await app.inject({
        method: "GET",
        url: "/resources/resource-id",
        headers: { authorization: "Bearer valid-token" },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe("non-admin user — identity unresolvable (resolveCurrentId returns null)", () => {
    it("returns 401 when the custom resolveCurrentId returns null", async () => {
      mockJwtVerify.mockResolvedValue({
        payload: nonAdminPayload,
        protectedHeader: { alg: "RS256" },
      });

      // Simulate a service where the requester can't be found in the DB
      const resolveOwner = vi.fn().mockResolvedValue("resource-owner-id");
      const resolveCurrentId = vi.fn().mockResolvedValue(null);
      app = buildTestApp(resolveOwner, resolveCurrentId);
      await app.ready();

      const response = await app.inject({
        method: "GET",
        url: "/resources/resource-id",
        headers: { authorization: "Bearer valid-token" },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.title).toBe("Unauthorized");
    });
  });

  describe("unauthenticated request (requireAuth ran first)", () => {
    it("returns 401 when no token is provided (requireAuth blocks first)", async () => {
      app = buildTestApp(vi.fn());
      await app.ready();

      const response = await app.inject({
        method: "GET",
        url: "/resources/resource-id",
      });

      // requireAuth preHandler returns 401 before requireOwnershipOrAdmin runs
      expect(response.statusCode).toBe(401);
    });
  });
});
