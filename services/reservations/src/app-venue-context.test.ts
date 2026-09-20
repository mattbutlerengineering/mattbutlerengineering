import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";
import type { DomainServices } from "./services/domain-services.js";
import { getCurrentVenueId } from "./services/venue-context-store.js";

/**
 * ADR-026 part 6/7: the venue-context preHandler (built in #5252) is wired
 * into the app bootstrap so the resolved venue id reaches the request's
 * actual queries.
 *
 * This test deliberately does NOT assert on `$executeRaw` being called
 * directly by the preHandler — that was the bug: `set_config(...)` against
 * the un-transacted `prisma` singleton evaporates before the route
 * handler's own query runs (see `middleware/venue-context.ts` and
 * `services/venue-scoped-prisma.ts`'s doc comments). Instead it proves the
 * thing that actually matters — that the resolved venue id survives from
 * the preHandler into the point where the route handler calls a domain
 * service — by reading the real (unmocked) `venue-context-store` from
 * inside a fake domain-service call. The transaction-boundary proof (that
 * `setVenueContext` and the query run on the identical `tx`) lives in
 * `services/venue-scoped-prisma.test.ts`, which is the layer that owns it.
 *
 * Both requests below are exercised in the SAME test file/app instance
 * deliberately: an earlier version of `resolveGlobalVenueId` (app.ts) used
 * `await` before calling `enterVenueContext`, which passed a single-request
 * version of this test but reproducibly showed the wrong (previous
 * request's) venue id starting on a SECOND request against the same app —
 * see `venueContextPreHandler`'s doc comment for the measured root cause.
 * Two sequential requests with different venue ids is what actually catches
 * that class of regression; a single-request test would not.
 */

vi.mock("./services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});

describe("venue-context middleware wiring", () => {
  let app: FastifyInstance;
  let capturedVenueId: string | null | undefined;
  const originalEnv = process.env;

  const tableService = {
    list: vi.fn(async () => {
      capturedVenueId = getCurrentVenueId();
      return {
        data: [],
        pagination: {
          page: 1,
          limit: 10,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
      };
    }),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn(),
    delete: vi.fn(),
  } as unknown as DomainServices["tableService"];

  beforeEach(async () => {
    process.env = {
      ...originalEnv,
      AUTH_AUTHORITY: "https://test.auth0.com",
      AUTH_AUDIENCE: "https://api.example.com",
      AUTH_BYPASS_IN_TESTS: "true",
    };
    capturedVenueId = undefined;
    app = await buildApp({ logger: false, services: { tableService } });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    process.env = originalEnv;
  });

  it("propagates each request's own resolved venue id through to its route handler's domain-service call, across sequential requests", async () => {
    const response1 = await app.inject({
      method: "GET",
      url: "/api/v1/tables?venueId=venue-42",
      headers: { "x-auth-bypass": "true" },
    });
    expect(response1.statusCode).toBe(200);
    expect(capturedVenueId).toBe("venue-42");

    // A second, different request on the SAME app instance — this is what
    // actually catches the one-request-late propagation bug documented on
    // venueContextPreHandler; asserting only the first request would not.
    const response2 = await app.inject({
      method: "GET",
      url: "/api/v1/tables?venueId=venue-99",
      headers: { "x-auth-bypass": "true" },
    });
    expect(response2.statusCode).toBe(200);
    expect(capturedVenueId).toBe("venue-99");
  });

  it("propagates null when no venue id is resolvable (default-deny, ADR-026 §4)", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/tables",
      headers: { "x-auth-bypass": "true" },
    });

    expect(response.statusCode).toBe(200);
    expect(capturedVenueId).toBeNull();
  });
});
