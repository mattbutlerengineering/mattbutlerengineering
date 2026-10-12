import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";
import { getCurrentVenueId } from "./services/venue-context-store.js";

/**
 * ADR-026: the app has no global venue-context hook. Context comes from
 * `venueScoped` (after authorization) or an explicit `runWithVenueContext`.
 * This file proves a caller-supplied `venueId` is never in context before the
 * membership decision; per-route context (including sequential-request
 * isolation) is covered in `routes/venue-scope.test.ts` and, against a real
 * database, `routes/rls-route-sweep.integration.test.ts`.
 */

vi.mock("./services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});

/**
 * No global hook may pre-authorize: a route that declares its scope
 * through `venueScoped` resolves, authorizes, and only then enters the venue's
 * context. A caller-supplied `venueId` therefore must not be in context when
 * the membership lookup runs (venue-scoped-routes PR 6, item 1).
 */
vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(async () => ({
    payload: {
      sub: "auth0|non-admin",
      iss: "https://test.auth0.com/",
      aud: "https://api.example.com",
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      permissions: [] as string[],
    },
    protectedHeader: { alg: "RS256" },
  })),
}));

describe("scoped routes: no venue context before authorization", () => {
  const originalEnv = process.env;
  let app: FastifyInstance;
  let contextSeenByLookup: string | null | undefined;

  beforeEach(async () => {
    process.env = {
      ...originalEnv,
      AUTH_AUTHORITY: "https://test.auth0.com",
      AUTH_AUDIENCE: "https://api.example.com",
      AUTH_BYPASS_IN_TESTS: "true",
    };
    contextSeenByLookup = undefined;
    app = await buildApp({
      logger: false,
      venueMembershipLookup: async () => {
        contextSeenByLookup = getCurrentVenueId();
        return false;
      },
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    process.env = originalEnv;
  });

  it("does not enter a caller-supplied query venueId before the membership decision", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/waitlist?venueId=someone-elses-venue",
      headers: { authorization: "Bearer non-admin" },
    });

    expect(response.statusCode).toBe(403);
    expect(contextSeenByLookup).toBeNull();
  });
});
