import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import type { FastifyInstance } from "fastify";
import { jwtVerify } from "jose";
import { MIGRATIONS_DIR, parseRlsDeclarations } from "../services/rls-force-coverage.js";
import {
  FIXTURES as STAFF_FIXTURES,
  INFRA_ROUTES,
  normalizeRouteKey,
  parsePrintedRoutes,
  type SweepContext,
} from "./rls-route-sweep.fixtures.js";
import { PUBLIC_FIXTURES } from "./rls-route-sweep.fixtures-public.js";

const FIXTURES = { ...STAFF_FIXTURES, ...PUBLIC_FIXTURES };

/**
 * Issue #5369, PR 2/2: the route-sweep integration suite. PR 1 (merged, #5716)
 * added the `RLS_CONTEXT_MODE` tripwire and `RLS_MODELS`; this suite is the
 * first thing that actually exercises it end to end, against a real
 * `buildApp()` connected as the app's OWN owning role (never a probe role —
 * see `rls-owner-enforcement.integration.test.ts`'s module doc for why that
 * distinction is load-bearing).
 *
 * Shares `pg_advisory_lock(5369)` with the two sibling real-Postgres suites
 * (`rls-owner-enforcement.integration.test.ts`,
 * `rls-isolation.integration.test.ts`, `../services/lapsed-guest-cron.rls.integration.test.ts`)
 * — all four toggle or observe `FORCE ROW LEVEL SECURITY`, which is per-table
 * cluster state visible to every connection, and vitest runs test files in
 * parallel workers.
 *
 * Requires a real, migrated Postgres at `DATABASE_URL` whose owning role is a
 * plain non-superuser (the shape DigitalOcean Managed Postgres gives us in
 * production) — see the sibling suites' doc comments for how to provision
 * one locally. Skips loudly (`describe.skipIf`) when `DATABASE_URL` is unset.
 */

const DATABASE_URL = process.env.DATABASE_URL;
const RLS_SUITE_LOCK_KEY = 5369;
const RLS_TABLES = [
  "venues",
  "floor_plans",
  "tables",
  "guests",
  "reservations",
  "deposits",
  "waitlist_entries",
] as const;

const declaredForce = parseRlsDeclarations(
  readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readFileSync(join(MIGRATIONS_DIR, entry.name, "migration.sql"), "utf8"))
).forced;

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(),
}));

/** The one non-admin identity every fixture's "member" leg authenticates as. */
const MEMBER_SUB = "auth0|rls-sweep-member";
const MEMBER_JWT_PAYLOAD = {
  sub: MEMBER_SUB,
  iss: "https://test.auth0.com/",
  aud: "https://api.example.com",
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
  email: "rls-sweep-member@example.com",
  permissions: [] as string[],
};

describe.skipIf(!DATABASE_URL)("RLS route sweep (#5369 PR 2)", () => {
  let lockClient: pg.Client;
  let seedClient: pg.Client;
  let app: FastifyInstance;
  let ctx: SweepContext;

  async function setForce(on: boolean): Promise<void> {
    for (const table of RLS_TABLES) {
      await seedClient.query(
        `ALTER TABLE "${table}" ${on ? "FORCE" : "NO FORCE"} ROW LEVEL SECURITY`
      );
    }
  }

  beforeAll(async () => {
    lockClient = new pg.Client({ connectionString: DATABASE_URL });
    await lockClient.connect();
    await lockClient.query("SELECT pg_advisory_lock($1)", [RLS_SUITE_LOCK_KEY]);

    // A dedicated, non-venue-scoped connection for seeding and FORCE — bypasses
    // the app's own `withVenueScopedQueries` tripwire entirely, matching
    // `rls-isolation.integration.test.ts`'s `ownerPrisma`/`app` pattern.
    seedClient = new pg.Client({ connectionString: DATABASE_URL });
    await seedClient.connect();

    const venueAId = `rls-sweep-venue-a-${randomUUID()}`;
    const venueBId = `rls-sweep-venue-b-${randomUUID()}`;
    const venueASlug = `rls-sweep-a-${randomUUID()}`;
    const venueBSlug = `rls-sweep-b-${randomUUID()}`;

    await seedClient.query(
      `INSERT INTO venues (id, name, slug, iana_timezone, updated_at) VALUES ($1, $2, $3, 'UTC', now())`,
      [venueAId, "RLS Sweep Venue A", venueASlug]
    );
    await seedClient.query(
      `INSERT INTO venues (id, name, slug, iana_timezone, updated_at) VALUES ($1, $2, $3, 'UTC', now())`,
      [venueBId, "RLS Sweep Venue B", venueBSlug]
    );
    await seedClient.query(
      `INSERT INTO venue_memberships (id, user_sub, venue_id, role, updated_at)
       VALUES ($1, $2, $3, 'staff', now())`,
      [`rls-sweep-membership-${randomUUID()}`, MEMBER_SUB, venueAId]
    );

    const tableAId = `rls-sweep-table-a-${randomUUID()}`;
    const tableBId = `rls-sweep-table-b-${randomUUID()}`;
    const guestAId = `rls-sweep-guest-a-${randomUUID()}`;
    const guestBId = `rls-sweep-guest-b-${randomUUID()}`;
    const floorPlanAId = `rls-sweep-fp-a-${randomUUID()}`;
    const floorPlanBId = `rls-sweep-fp-b-${randomUUID()}`;
    const reservationAId = `rls-sweep-res-a-${randomUUID()}`;
    const reservationBId = `rls-sweep-res-b-${randomUUID()}`;
    const waitlistAId = `rls-sweep-wl-a-${randomUUID()}`;
    const waitlistBId = `rls-sweep-wl-b-${randomUUID()}`;
    const depositAId = `rls-sweep-dep-a-${randomUUID()}`;
    const holdAId = `rls-sweep-hold-a-${randomUUID()}`;
    const holdASessionId = `rls-sweep-session-${randomUUID()}`;
    const reservationAGuestEmail = "rls-sweep-guest-a@example.com";

    await seedClient.query(
      `INSERT INTO tables (id, venue_id, name, capacity, min_covers, updated_at)
       VALUES ($1, $2, 'RLS Sweep Table A', 4, 1, now())`,
      [tableAId, venueAId]
    );
    await seedClient.query(
      `INSERT INTO tables (id, venue_id, name, capacity, min_covers, updated_at)
       VALUES ($1, $2, 'RLS Sweep Table B', 4, 1, now())`,
      [tableBId, venueBId]
    );
    await seedClient.query(
      `INSERT INTO guests (id, venue_id, name, updated_at) VALUES ($1, $2, 'RLS Sweep Guest A', now())`,
      [guestAId, venueAId]
    );
    await seedClient.query(
      `INSERT INTO guests (id, venue_id, name, updated_at) VALUES ($1, $2, 'RLS Sweep Guest B', now())`,
      [guestBId, venueBId]
    );
    await seedClient.query(
      `INSERT INTO floor_plans (id, venue_id, name, is_active, layout_json, updated_at)
       VALUES ($1, $2, 'RLS Sweep Floor Plan A', true, '{}'::jsonb, now())`,
      [floorPlanAId, venueAId]
    );
    await seedClient.query(
      `INSERT INTO floor_plans (id, venue_id, name, is_active, layout_json, updated_at)
       VALUES ($1, $2, 'RLS Sweep Floor Plan B', true, '{}'::jsonb, now())`,
      [floorPlanBId, venueBId]
    );
    await seedClient.query(
      `INSERT INTO reservations
         (id, venue_id, table_id, guest_id, guest_email, date, start_time, end_time, party_size, updated_at)
       VALUES ($1, $2, $3, $4, $5, '2026-10-01', '2026-10-01T18:00:00Z', '2026-10-01T20:00:00Z', 2, now())`,
      [reservationAId, venueAId, tableAId, guestAId, reservationAGuestEmail]
    );
    await seedClient.query(
      `INSERT INTO reservations
         (id, venue_id, table_id, guest_id, guest_email, date, start_time, end_time, party_size, updated_at)
       VALUES ($1, $2, $3, $4, 'rls-sweep-guest-b@example.com', '2026-10-01', '2026-10-01T18:00:00Z', '2026-10-01T20:00:00Z', 2, now())`,
      [reservationBId, venueBId, tableBId, guestBId]
    );
    await seedClient.query(
      `INSERT INTO waitlist_entries
         (id, venue_id, party_size, guest_name, guest_phone, position, estimated_wait_minutes, updated_at)
       VALUES ($1, $2, 2, 'RLS Sweep Waitlist A', '+15550000001', 1, 10, now())`,
      [waitlistAId, venueAId]
    );
    await seedClient.query(
      `INSERT INTO waitlist_entries
         (id, venue_id, party_size, guest_name, guest_phone, position, estimated_wait_minutes, updated_at)
       VALUES ($1, $2, 2, 'RLS Sweep Waitlist B', '+15550000002', 1, 10, now())`,
      [waitlistBId, venueBId]
    );
    await seedClient.query(
      `INSERT INTO deposits (id, reservation_id, amount_cents, currency, updated_at)
       VALUES ($1, $2, 5000, 'usd', now())`,
      [depositAId, reservationAId]
    );
    await seedClient.query(
      `INSERT INTO reservation_holds
         (id, venue_id, table_id, date, start_time, end_time, party_size, session_id, expires_at)
       VALUES ($1, $2, $3, '2026-10-02', '2026-10-02T18:00:00Z', '2026-10-02T19:00:00Z', 2, $4, now() + interval '10 minutes')`,
      [holdAId, venueAId, tableAId, holdASessionId]
    );

    ctx = {
      app: undefined as unknown as FastifyInstance,
      memberSub: MEMBER_SUB,
      venueA: { id: venueAId, slug: venueASlug },
      venueB: { id: venueBId, slug: venueBSlug },
      tableA: tableAId,
      tableB: tableBId,
      guestA: guestAId,
      guestB: guestBId,
      floorPlanA: floorPlanAId,
      floorPlanB: floorPlanBId,
      reservationA: reservationAId,
      reservationB: reservationBId,
      reservationAGuestEmail,
      waitlistA: waitlistAId,
      waitlistB: waitlistBId,
      depositA: depositAId,
      holdA: holdAId,
      holdSessionId: holdASessionId,
      lastRlsErrorName: null,
    };

    // FORCE goes on AFTER seeding: owner-side seed writes are themselves
    // subject to RLS once FORCE is set (rls-isolation.integration.test.ts's
    // module doc has the identical ordering note).
    await setForce(true);

    process.env.NODE_ENV = "test";
    process.env.AUTH_AUTHORITY = "https://test.auth0.com";
    process.env.AUTH_AUDIENCE = "https://api.example.com";
    process.env.AUTH_BYPASS_IN_TESTS = "true";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_rls_sweep_test_secret";
    process.env.RLS_CONTEXT_MODE = "throw";

    const { buildApp } = await import("../app.js");
    app = await buildApp({ logger: false });

    // Captures the RAW thrown error's name for `expectBroken` — the response
    // BODY alone can't distinguish `RlsUnscopedQueryError` from any other
    // uncaught error, since `classify-error.ts`'s generic fallback attaches
    // no `extensions` for either. Must register before `app.ready()`;
    // `inject()` (rls-route-sweep.fixtures.ts) resets `ctx.lastRlsErrorName`
    // to `null` before every call, so a fixture with nothing to report reads
    // that reset value, never a stale one from an earlier request.
    app.addHook("onError", async (_request, _reply, error) => {
      ctx.lastRlsErrorName = error.name;
    });

    await app.ready();
    ctx.app = app;

    vi.mocked(jwtVerify).mockResolvedValue({
      payload: MEMBER_JWT_PAYLOAD,
      protectedHeader: { alg: "RS256" },
    } as never);
  }, 30_000);

  afterAll(async () => {
    delete process.env.RLS_CONTEXT_MODE;
    await app?.close();

    // Restore whatever the migrations declare (mirrors the sibling suites):
    // never leave a hardcoded NO FORCE that would silently undo a real
    // migration's FORCE flip on the target database.
    await setForce(declaredForce.has("venues"));

    await seedClient.query("DELETE FROM venue_memberships WHERE user_sub = $1", [MEMBER_SUB]);
    await seedClient.query("DELETE FROM deposits WHERE reservation_id = ANY($1)", [
      [ctx.reservationA, ctx.reservationB].filter(Boolean),
    ]);
    await seedClient.query("DELETE FROM waitlist_entries WHERE venue_id = ANY($1)", [
      [ctx.venueA.id, ctx.venueB.id],
    ]);
    await seedClient.query("DELETE FROM reservations WHERE venue_id = ANY($1)", [
      [ctx.venueA.id, ctx.venueB.id],
    ]);
    await seedClient.query("DELETE FROM reservation_holds WHERE venue_id = ANY($1)", [
      [ctx.venueA.id, ctx.venueB.id],
    ]);
    await seedClient.query("DELETE FROM guests WHERE venue_id = ANY($1)", [
      [ctx.venueA.id, ctx.venueB.id],
    ]);
    await seedClient.query("DELETE FROM tables WHERE venue_id = ANY($1)", [
      [ctx.venueA.id, ctx.venueB.id],
    ]);
    await seedClient.query("DELETE FROM floor_plans WHERE venue_id = ANY($1)", [
      [ctx.venueA.id, ctx.venueB.id],
    ]);
    await seedClient.query("DELETE FROM venues WHERE id = ANY($1)", [
      [ctx.venueA.id, ctx.venueB.id],
    ]);

    await seedClient.end();
    await lockClient.query("SELECT pg_advisory_unlock($1)", [RLS_SUITE_LOCK_KEY]);
    await lockClient.end();
  }, 30_000);

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

  for (const [routeKey, fixture] of Object.entries(FIXTURES)) {
    it(`[${fixture.kind}${fixture.blocker ? `/${fixture.blocker}` : ""}] ${routeKey}`, async () => {
      await fixture.run(ctx);
    });
  }

  /**
   * ADR-026 §3.3 item 7's other two shapes: neither goes through
   * `buildApp()`'s HTTP surface, so neither is (or could be) a `FIXTURES`
   * entry above — the drift guard only ever sees Fastify routes. Both are
   * exercised by calling the SAME production composition functions `app.ts`
   * wires up (`createReservationJobHandlers`, `getAllVenueIds`,
   * `findGuestsForVenue`), not a re-implementation of their internals.
   */
  describe("non-HTTP entry points", () => {
    it("[ok] WAITLIST_EXPIRY job handler expires the entry when the payload carries venueId (item-7, fixed half)", async () => {
      const { createReservationJobHandlers } = await import("../services/job-worker.js");
      const { waitlistService } = await import("../services/waitlist.js");
      const { JOB_TYPES } = await import("@mbe/jobs");

      // `app.ts`'s real wiring is `handleWaitlistExpiry: (input) =>
      // waitlistNotifier.handleExpiry(input)`, and `handleExpiry`'s own first
      // line is `await expireEntry(input.waitlistEntryId)` — i.e.
      // `waitlistService.expire(id)`. That call is the one this test
      // isolates; the SMS/scheduler half of the notifier that runs AFTER a
      // successful expire is exercised by `waitlist-notifier.test.ts`, not
      // here. A job worker consumer has no HTTP request, so it is
      // `handleWaitlistExpiryJob`'s own `runWithVenueContext(payload.venueId,
      // …)` wrap — not any request middleware — that has to make
      // `waitlistService.expire`'s `prisma.waitlistEntry.update` resolve a
      // venue context at all.
      const handlers = createReservationJobHandlers({
        getReservation: async () => null,
        getVenue: async () => null,
        dispatcher: { sendBookingReminder: async () => undefined },
        generateManageToken: () => "unused",
        handleWaitlistExpiry: (input) =>
          waitlistService.expire(input.waitlistEntryId).then(() => undefined),
        logger: { warn: () => undefined },
      });

      // Correct payload: notifyTableReady (waitlist-notifier.ts) enqueues
      // venueId alongside waitlistEntryId, so the handler wraps the whole
      // body in runWithVenueContext(payload.venueId, …) before calling
      // waitlistService.expire.
      await handlers[JOB_TYPES.WAITLIST_EXPIRY]!({
        waitlistEntryId: ctx.waitlistA,
        venueId: ctx.venueA.id,
      });

      // Read it back through the SAME production scoping helper the app
      // itself uses (`runWithVenueContext` + the wrapped `prisma` export),
      // not `seedClient` — FORCE is on for the whole suite, so `seedClient`
      // (connected as the table OWNER, with no `app.venue_id` of its own) is
      // itself subject to RLS here and would see zero rows regardless of
      // what this test is proving.
      const { prisma } = await import("../services/database.js");
      const { runWithVenueContext } = await import("../services/venue-context-store.js");
      const entry = await runWithVenueContext(ctx.venueA.id, () =>
        prisma.waitlistEntry.findUnique({ where: { id: ctx.waitlistA } })
      );
      expect(
        entry?.status,
        "item-7: the venue-context wrap should let waitlistService.expire's update through, expiring the row"
      ).toBe("expired");
    });

    it("[ok] BOOKING_REMINDER / DAY_OF_REMINDER job handler is correctly venue-scoped (item-7, fixed half)", async () => {
      const { createReservationJobHandlers } = await import("../services/job-worker.js");
      const { reservationService } = await import("../services/reservation.js");
      const { venueService } = await import("../services/venue.js");
      const { JOB_TYPES } = await import("@mbe/jobs");

      const sendBookingReminder = vi.fn().mockResolvedValue(undefined);
      const handlers = createReservationJobHandlers({
        getReservation: (id) => reservationService.getById(id),
        getVenue: (id) => venueService.getById(id),
        dispatcher: { sendBookingReminder },
        generateManageToken: () => "fake-manage-token",
        handleWaitlistExpiry: async () => undefined,
        logger: { warn: () => undefined },
      });

      // Correct payload: `deliverReminder` wraps its whole body in
      // `runWithVenueContext(payload.venueId, …)`, so both RLS-scoped reads
      // resolve and the reminder dispatches.
      await handlers[JOB_TYPES.BOOKING_REMINDER]!({
        reservationId: ctx.reservationA,
        venueId: ctx.venueA.id,
      });
      expect(sendBookingReminder).toHaveBeenCalledTimes(1);

      // Mismatched payload (the shape a corrupted/forged job would take): venue
      // B's context makes venue A's reservation invisible under RLS, so
      // `getReservation` resolves null and the handler no-ops — no dispatch,
      // no throw. This is the correct behavior a background job with no
      // request boundary still needs.
      sendBookingReminder.mockClear();
      await handlers[JOB_TYPES.DAY_OF_REMINDER]!({
        reservationId: ctx.reservationA,
        venueId: ctx.venueB.id,
      });
      expect(sendBookingReminder).not.toHaveBeenCalled();
    });

    it("[ok] lapsed-guest cron (getAllVenueIds / findGuestsForVenue) runs without tripping the tripwire", async () => {
      // Full cross-tenant proof (guest qualification, reservation history)
      // lives in `lapsed-guest-cron.rls.integration.test.ts` — this only
      // confirms both functions this sweep's seeded venues actually reach
      // run clean under `RLS_CONTEXT_MODE=throw`, since a cron has no HTTP
      // request either.
      const { getAllVenueIds, findGuestsForVenue } =
        await import("../services/lapsed-guest-cron.js");
      const { prisma } = await import("../services/database.js");

      const venueIds = await getAllVenueIds(prisma);
      expect(venueIds).toEqual(expect.arrayContaining([ctx.venueA.id, ctx.venueB.id]));

      const guestsForA = await findGuestsForVenue(prisma, ctx.venueA.id);
      expect(Array.isArray(guestsForA)).toBe(true);
    });
  });
});
