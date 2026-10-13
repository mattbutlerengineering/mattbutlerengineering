import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { createServiceApp } from "@mbe/service-bootstrap";
import { buildApp } from "../app.js";
import { db } from "../services/database.js";
import {
  FIXTURES as STAFF_FIXTURES,
  INFRA_ROUTES,
  normalizeRouteKey,
  parsePrintedRoutes,
} from "./rls-route-sweep.fixtures.js";
import { PUBLIC_FIXTURES } from "./rls-route-sweep.fixtures-public.js";

vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});

const FIXTURES = { ...STAFF_FIXTURES, ...PUBLIC_FIXTURES };

/**
 * Local, DB-free proof that every `/api/v1` route declares its venue scope
 * through `venueScoped` or is listed below with a reason
 * (docs/fixes/venue-scoped-routes/architecture.md § Local coverage test).
 * It reads the `venueScopes` registry `buildApp` fills from an `onRoute`
 * hook, so a new route that forgets to declare its scope fails here, in the
 * ordinary `test` job, instead of only in the Postgres-backed RLS job.
 *
 * There is no "pending-migration" reason any more: the run that migrated the
 * routes is over, so a route either declares its scope or has a real reason.
 */
type UnscopedReason =
  | "cross-venue fan-out"
  | "cross-venue fan-out (admin)"
  | "venue-create"
  | "venue-group (no RLS)"
  | "user-scoped (/me)"
  | "infra (no venue data)"
  | "webhook (signature-verified)";

const UNSCOPED_ROUTES: Readonly<Record<string, UnscopedReason>> = {
  // Not venue-addressed by design (architecture.md § Call-site fit, "Not migrated").
  "GET /api/v1/floor-plans": "cross-venue fan-out",
  "GET /api/v1/venues": "cross-venue fan-out",
  "POST /api/v1/venues": "venue-create",
  "GET /api/v1/venues/groups": "venue-group (no RLS)",
  "POST /api/v1/venues/groups": "venue-group (no RLS)",
  "GET /api/v1/venues/groups/:id": "venue-group (no RLS)",
  "PATCH /api/v1/venues/groups/:id": "venue-group (no RLS)",
  "DELETE /api/v1/venues/groups/:id": "venue-group (no RLS)",
  "GET /api/v1/reservations/me": "user-scoped (/me)",
  "POST /api/v1/stripe/webhook": "webhook (signature-verified)",
  // Matt ruling 2026-10-10: an admin with no venueId gets an unfiltered
  // all-venue stream (#4016), which venueScoped cannot express. The route keeps
  // its own requireVenueAccess guard.
  "GET /api/v1/events/stream": "cross-venue fan-out (admin)",
  // Matt ruling 2026-10-10 (same as the stream): venueId is optional on both,
  // and an admin who names no venue gets an unfiltered all-venue list / creates
  // a venue-less table, which venueScoped cannot express. Both keep their own
  // requireVenueAccess guard.
  "GET /api/v1/tables": "cross-venue fan-out (admin)",
  "POST /api/v1/tables": "cross-venue fan-out (admin)",
  // Matt ruling 2026-10-11 (same as the stream and tables): venueId is
  // optional on both, and an admin who names no venue gets an unfiltered
  // all-venue list / creates a venue-less reservation, which venueScoped cannot
  // express. Both keep their own requireVenueAccess guard.
  "GET /api/v1/reservations": "cross-venue fan-out (admin)",
  "POST /api/v1/reservations": "cross-venue fan-out (admin)",
};

describe("venue-scope coverage (no database)", () => {
  const originalEnv = process.env;
  let app: FastifyInstance;
  let printed: string[];
  /**
   * Routes `createServiceApp` registers itself (docs, API reference, CORS
   * preflight, health, /ready) before `buildApp` can install its `onRoute` hook. None is an
   * `/api/v1` route; they are measured from a bare bootstrap app rather than
   * listed, so a new bootstrap route cannot hide a missing registry entry.
   */
  let bootstrapRoutes: Set<string>;

  const routesOf = (instance: FastifyInstance) =>
    parsePrintedRoutes(instance.printRoutes({ commonPrefix: false }))
      .filter((route) => !route.startsWith("HEAD "))
      .map(normalizeRouteKey);

  beforeAll(async () => {
    process.env = {
      ...originalEnv,
      AUTH_AUTHORITY: "https://test.auth0.com",
      AUTH_AUDIENCE: "https://api.example.com",
      AUTH_BYPASS_IN_TESTS: "true",
    };
    const bootstrap = await createServiceApp(
      {
        swagger: { title: "bootstrap", description: "bootstrap", serverUrl: "http://localhost" },
        // Health and /ready are registered by createServiceApp itself once it
        // owns the database (#6373), before buildApp's onRoute hook exists, so
        // they are bootstrap routes - never entries in the venue-scope registry.
        database: {
          db,
          healthRoutes: [
            { path: "/health", operationId: "getHealth" },
            { path: "/api/health", operationId: "getHealthApi" },
            { path: "/api/v1/reservations/health", operationId: "getHealthApiReservations" },
          ],
        },
      },
      { logger: false }
    );
    await bootstrap.ready();
    bootstrapRoutes = new Set(routesOf(bootstrap));
    await bootstrap.close();

    app = await buildApp({ logger: false });
    await app.ready();
    printed = routesOf(app);
  });

  afterAll(async () => {
    await app.close();
    process.env = originalEnv;
  });

  const registered = () =>
    [...app.venueScopes.keys()]
      .filter((route) => !route.startsWith("HEAD "))
      .map(normalizeRouteKey);

  it("records every route buildApp registers, and nothing else", () => {
    expect(app.venueScopes.size).toBeGreaterThan(0);
    expect(bootstrapRoutes.size).toBeGreaterThan(0);
    const fromBuildApp = printed.filter((route) => !bootstrapRoutes.has(route));
    expect(new Set(registered())).toEqual(new Set(fromBuildApp));
  });

  it("every /api/v1 route declares its venue scope or is listed with a reason", () => {
    const undeclared = registered().filter(
      (route) =>
        route.includes(" /api/v1/") &&
        app.venueScopes.get(route) == null &&
        !(route in UNSCOPED_ROUTES)
    );
    expect(undeclared, "declare the scope with venueScoped, or add a reason here").toEqual([]);
  });

  it("no route is both declared and listed as unscoped", () => {
    const both = registered().filter(
      (route) => app.venueScopes.get(route) != null && route in UNSCOPED_ROUTES
    );
    expect(both, "a migrated route must leave UNSCOPED_ROUTES").toEqual([]);
  });

  it("no unscoped entry is still marked pending-migration", () => {
    const pending = Object.entries(UNSCOPED_ROUTES).filter(
      ([, reason]) => (reason as string) === "pending-migration"
    );
    expect(pending, "declare the scope with venueScoped or give a real reason").toEqual([]);
  });

  it("no unscoped entry names a route that no longer exists", () => {
    const live = new Set(registered());
    const stale = Object.keys(UNSCOPED_ROUTES).filter((route) => !live.has(route));
    expect(stale).toEqual([]);
  });

  it("a declared route's sweep fixture is not still marked broken", () => {
    const mismatched = registered().filter(
      (route) => app.venueScopes.get(route) != null && FIXTURES[route]?.kind === "broken"
    );
    expect(mismatched, "declaring the scope should have fixed it: update the fixture").toEqual([]);
  });

  it("records the declared descriptor for each migrated route (stamp → registry)", () => {
    const expected: Record<string, string> = {
      "GET /api/v1/guests": "query.venueId/member",
      "GET /api/v1/guests/search": "query.venueId/member",
      "GET /api/v1/guests/segments": "query.venueId/member",
      "GET /api/v1/guests/lapsing": "query.venueId/member",
      "POST /api/v1/guests": "body.venueId/member",
      "POST /api/v1/guests/find-or-create": "body.venueId/member",
      "GET /api/v1/guests/:id": "entity:guest/member",
      "PATCH /api/v1/guests/:id": "entity:guest/member",
      "POST /api/v1/guests/:id/notes": "entity:guest/member",
      "POST /api/v1/guests/:id/win-back": "entity:guest/member",
      "DELETE /api/v1/guests/:id": "entity:guest/member",
      "POST /api/v1/waitlist": "body.venueId/member",
      "GET /api/v1/waitlist": "query.venueId/member",
      "GET /api/v1/waitlist/:id": "entity:waitlist_entry/member",
      "PUT /api/v1/waitlist/:id/notify": "entity:waitlist_entry/member",
      "PUT /api/v1/waitlist/:id/seat": "entity:waitlist_entry/member",
      "PUT /api/v1/waitlist/:id/cancel": "entity:waitlist_entry/member",
      "PUT /api/v1/waitlist/:id/expire": "entity:waitlist_entry/member",
      "GET /api/v1/briefing": "query.venueId/member",
      "GET /api/v1/reservations/metrics/daily": "query.venueId/member",
      "POST /api/v1/floor-plans": "body.venueId/member",
      "GET /api/v1/floor-plans/:id": "entity:floor_plan/member",
      "GET /api/v1/floor-plans/venue/:venueId/active": "params.venueId/member",
      "PATCH /api/v1/floor-plans/:id": "entity:floor_plan/member",
      "DELETE /api/v1/floor-plans/:id": "entity:floor_plan/member",
      "POST /api/v1/floor-plans/:id/activate": "entity:floor_plan/member",
      "POST /api/v1/floor-plans/:id/clone": "entity:floor_plan/member",
      "POST /api/v1/floor-plans/tables/positions": "entity:floor_plan/member",
      "POST /api/v1/floor-plans/tables/:tableId/assign": "entity:table/member",
      "POST /api/v1/floor-plans/tables/:tableId/remove": "entity:table/member",
      "GET /api/v1/venues/:id": "params.id/member",
      "GET /api/v1/venues/:id/table-statuses": "params.id/member",
      "PATCH /api/v1/venues/:id": "params.id/member",
      "DELETE /api/v1/venues/:id": "params.id/member",
      "GET /api/v1/tables/:id": "entity:table/member",
      "PATCH /api/v1/tables/:id": "entity:table/member",
      "PATCH /api/v1/tables/:id/status": "entity:table/member",
      "DELETE /api/v1/tables/:id": "entity:table/member",
      "POST /api/v1/reservations/walk-in": "body.venueId/member",
      "GET /api/v1/reservations/:id": "entity:reservation/owner",
      "PATCH /api/v1/reservations/:id": "entity:reservation/owner",
      "DELETE /api/v1/reservations/:id": "entity:reservation/owner",
      "POST /api/v1/deposits": "entity:reservation/member",
      "GET /api/v1/deposits": "resolve:reservationId|venueId/member",
      "GET /api/v1/deposits/:id": "entity:deposit/member",
      "POST /api/v1/deposits/:id/capture": "entity:deposit/member",
      "POST /api/v1/deposits/:id/refund": "entity:deposit/member",
      "POST /api/v1/deposits/:id/forfeit": "entity:deposit/member",
      "GET /api/v1/availability/:venueId": "params.venueId/member",
      "GET /api/v1/availability/:venueId/dates": "params.venueId/member",
      "POST /api/v1/holds": "body.venueId/member",
      "GET /api/v1/holds/:id": "resolve:hold.venueId/member",
      "DELETE /api/v1/holds/:id": "resolve:hold.venueId/member",
      "POST /api/v1/holds/:id/confirm": "resolve:hold.venueId/member",
      // Public-slug and manage-token sources (authority is the slug / token, not membership).
      "GET /api/v1/venues/by-slug/:slug": "slug/public",
      "GET /public/v1/venues/:slug": "slug/public",
      "GET /public/v1/venues/:slug/availability": "slug/public",
      "POST /public/v1/venues/:slug/deposits/payment-intent": "slug/public",
      "POST /public/v1/venues/:slug/holds": "slug/public",
      "GET /public/v1/venues/:slug/holds/:holdId": "slug/public",
      "POST /public/v1/venues/:slug/holds/:holdId/confirm": "slug/public",
      "POST /public/v1/venues/:slug/reservations": "slug/public",
      "GET /public/v1/reservations/manage": "token:manage/public",
      "PATCH /public/v1/reservations/manage": "token:manage/public",
      "DELETE /public/v1/reservations/manage": "token:manage/public",
      "PATCH /public/v1/reservations/confirm": "token:manage/public",
    };
    const actual = Object.fromEntries(
      Object.keys(expected).map((route) => [route, app.venueScopes.get(route)])
    );
    expect(actual).toEqual(expected);
  });

  it("is read-only to callers", () => {
    expect(() => (app.venueScopes as Map<string, string | null>).set("GET /x", null)).toThrow();
  });
});

/**
 * The RLS sweep's two-way completeness checks, moved verbatim out of
 * `rls-route-sweep.integration.test.ts`, which is gated on a database URL, so
 * they only ever ran in the Postgres job. They read nothing but the router and
 * the fixture keys, so they run here on every `test` job.
 */
describe("RLS route sweep fixture completeness (no database)", () => {
  const originalEnv = process.env;
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env = {
      ...originalEnv,
      AUTH_AUTHORITY: "https://test.auth0.com",
      AUTH_AUDIENCE: "https://api.example.com",
      AUTH_BYPASS_IN_TESTS: "true",
    };
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    process.env = originalEnv;
  });

  it("has a fixture for every registered route (drift guard)", () => {
    // HEAD is Fastify's auto-mirror of GET (`exposeHeadRoutes`, default on) —
    // same handler, same guards, same RLS behavior. It needs no fixture of
    // its own; the GET entry already proves it.
    const registered = new Set(
      parsePrintedRoutes(app.printRoutes({ commonPrefix: false }))
        .filter((route) => !route.startsWith("HEAD "))
        .map(normalizeRouteKey)
    );

    const uncovered = [...registered].filter(
      (route) => !INFRA_ROUTES.has(route) && !(normalizeRouteKey(route) in FIXTURES)
    );

    expect(
      uncovered,
      "every non-infra registered route needs an RLS-sweep fixture (or an INFRA_ROUTES entry)"
    ).toEqual([]);
  });

  it("every declared fixture actually corresponds to a live route", () => {
    const registered = new Set(
      parsePrintedRoutes(app.printRoutes({ commonPrefix: false })).map(normalizeRouteKey)
    );
    const stale = Object.keys(FIXTURES).filter((key) => !registered.has(normalizeRouteKey(key)));

    expect(stale, "a fixture whose route no longer exists — remove or rename it").toEqual([]);
  });
});
