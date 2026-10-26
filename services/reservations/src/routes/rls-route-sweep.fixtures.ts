import { expect } from "vitest";
import { randomUUID } from "node:crypto";
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from "fastify";
import { AVAILABILITY_CONFIG_PREFIX } from "@mbe/types";

/**
 * #5369 PR 2 — the route-sweep completeness data. Kept out of the `.test.ts`
 * file (which owns setup/teardown and the loop that runs these) so the
 * per-route registry stays readable as data, not interleaved with hooks.
 *
 * ## Parsing the route tree
 *
 * A literal `onRoute` hook cannot see these routes: `buildApp()` awaits every
 * `fastify.register(...)` call internally, and each `await` drains that
 * plugin's own avvio boot step (registering its routes) before the next
 * `fastify.register` call even runs — verified empirically against this
 * Fastify version (5.12.5) by adding an `onRoute` hook immediately after
 * `buildApp()` returns and observing zero routes collected. There is no
 * point from OUTSIDE `buildApp()` where a hook could attach before ANY of
 * its routes register. `printRoutes({ commonPrefix: false })` instead
 * mechanically enumerates Fastify's own router tree (find-my-way's
 * character-level prefix-compressed radix tree) — {@link parsePrintedRoutes}
 * walks it back into `METHOD /path` pairs, giving the same completeness
 * guarantee an `onRoute` hook would have, sourced from Fastify's router
 * introspection instead of a registration-time event.
 */
export function parsePrintedRoutes(tree: string): string[] {
  const lines = tree.split("\n").filter((line) => line.length > 0);
  // stack[depth] holds the accumulated path string for that tree depth;
  // depth 0 is the (unused) virtual root.
  const stack: string[] = [""];
  const routes: string[] = [];

  for (const line of lines) {
    const marker = line.match(/(├── |└── )/);
    if (!marker || marker.index === undefined) continue;
    const depth = marker.index / 4 + 1;
    const rest = line.slice(marker.index + 4);

    const withMethods = rest.match(/^(.*?)\s\(([A-Z, ]+)\)$/);
    const segment = withMethods ? (withMethods[1] ?? "") : rest;
    const methods = withMethods ? (withMethods[2] ?? "").split(", ") : null;

    const full = (stack[depth - 1] ?? "") + segment;
    stack[depth] = full;
    stack.length = depth + 1;

    if (methods) {
      for (const method of methods) routes.push(`${method} ${full}`);
    }
  }
  return routes;
}

/**
 * Fastify's default `ignoreTrailingSlash` still matches a route registered
 * as `"/"` under a prefix at BOTH `<prefix>` and `<prefix>/` — confirmed by
 * injecting both against a real built app (both 200). find-my-way's merged
 * pretty-print tree renders this as two nodes with identical methods. Since
 * they are the same route in every way that matters here, normalize away
 * one trailing slash so the fixture registry doesn't need a byte-identical
 * duplicate entry for each list/create route.
 */
export function normalizeRouteKey(key: string): string {
  return key.endsWith("/") && key.length > 1 ? key.slice(0, -1) : key;
}

const HOLDS_URL = "/api/v1/holds";

/** Settings → Team routes (#7510), addressed by the venue's own id. */
const teamUrl = (venueId: string, suffix = "") => `/api/v1/venues/${venueId}/team${suffix}`;

/** Routes with no venue-scoped data at all — excluded from the sweep by design. */
export const INFRA_ROUTES: ReadonlySet<string> = new Set([
  "GET /docs",
  "GET /docs/*",
  "GET /docs/json",
  "GET /docs/yaml",
  "GET /docs/static/index.html",
  "GET /docs/static/swagger-initializer.js",
  "GET /reference",
  "GET /reference/js/scalar.js",
  "GET /reference/openapi.json",
  "GET /reference/openapi.yaml",
  "GET /ready",
  "GET /health",
  "GET /api/health",
  "GET /api/v1/reservations/health",
  "OPTIONS *",
  // SSE: no RLS-scoped Prisma read at all (broadcasts an in-memory emitter),
  // and `.inject()` cannot exercise a long-lived stream meaningfully.
  "GET /api/v1/events/stream",
]);

export type FixtureKind = "not-rls" | "ok" | "broken";

export interface RouteFixture {
  kind: FixtureKind;
  /** ADR-026 §3.3 blocker item this documents, for "broken" fixtures. */
  blocker?: string;
  run: (ctx: SweepContext) => Promise<void>;
}

export interface SweepContext {
  app: FastifyInstance;
  memberSub: string;
  venueA: { id: string; slug: string };
  venueB: { id: string; slug: string };
  /**
   * A second venue `memberSub` belongs to (#5369 PR 6), used only to prove
   * `venueService.listForMember` returns every venue a multi-venue member
   * belongs to, not just one. Never touched by any other fixture — `memberSub`
   * deliberately stays a non-member of `venueB` everywhere else in this sweep.
   */
  venueC: { id: string };
  tableA: string;
  tableB: string;
  guestA: string;
  guestB: string;
  floorPlanA: string;
  floorPlanB: string;
  reservationA: string;
  reservationB: string;
  reservationAGuestEmail: string;
  /**
   * Two reservations booked by the same diner (the platform-admin bypass
   * identity, `asAdmin`'s sub) at venue A and venue B respectively, and one
   * booked by a DIFFERENT diner — #5369 PR 6's proof that
   * `GET /api/v1/reservations/me` returns a diner's bookings across every
   * venue they visited, and never another diner's.
   */
  reservationMineA: string;
  reservationMineB: string;
  reservationOtherUser: string;
  waitlistA: string;
  waitlistB: string;
  /**
   * A row dedicated to the "seat" fixture (#5369 PR 3), never read by any
   * other fixture or suite. `waitlistA` is also read by the item-7
   * WAITLIST_EXPIRY non-HTTP test (`rls-route-sweep.integration.test.ts`),
   * which expires it (it is seeded `notified`) after its own call — sharing it with
   * a fixture that writes (even one that 404s before reaching the DB today,
   * per the tripwire) would couple the two the moment item-2's fix makes
   * `seat` actually succeed.
   */
  waitlistSeatTarget: string;
  depositA: string;
  /**
   * A deposit carrying a real `stripe_payment_intent_id`, on its own
   * dedicated reservation (#5369 PR 8) — `depositA` deliberately carries no
   * PaymentIntent id (item-6 is its own, unrelated concern). Used only by
   * the Stripe webhook's item-4 fixture.
   */
  depositWithPiA: string;
  depositWithPiAPaymentIntentId: string;
  holdA: string;
  /** The real session id `holdA` was created with — needed by every route
   * that requires the `x-session-id` capability header before it will even
   * look at the hold (staff `/confirm`, and all three public hold routes). */
  holdSessionId: string;
  /**
   * Mutated by the `onError` hook the test file installs on `app`, reset to
   * `null` before every `inject()` call below. Fastify only fires `onError`
   * for a genuinely THROWN error (never a plain `reply.code(x).send(...)`),
   * so this is how `expectBroken` tells "the RLS tripwire actually fired"
   * apart from an unrelated 4xx/5xx that happens to share a status code —
   * the response body alone can't: `RlsUnscopedQueryError` classifies through
   * `classify-error.ts`'s generic fallback, which attaches no `extensions`.
   */
  lastRlsErrorName: string | null;
}

/** `x-auth-bypass` short-circuits `requireAuth`/`requireVenueAccess` to a hardcoded platform-admin identity. */
/**
 * A YYYY-MM-DD date `daysAhead` days from today (UTC). Hold creation enforces
 * the venue booking window (not in the past, within min/max advance), so hold
 * fixtures must request a time relative to now rather than a fixed calendar
 * date that will eventually be in the past.
 */
export function inWindowDate(daysAhead: number): string {
  return new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export const ADMIN_HEADERS: Record<string, string> = { "x-auth-bypass": "true" };
/** Matched by the `jose` mock in the test file to a non-admin member of venue A. */
export const MEMBER_HEADERS: Record<string, string> = { authorization: "Bearer member-a-token" };
/**
 * Matched by the `jose` mock in the test file to a diner whose verified email
 * equals `reservationA`'s `guestEmail` — `requireReservationOwnerOrAdmin`'s
 * non-admin, non-staff identity space (#5369 PR 7 / PR 5 carry-forward: the
 * `/reservations/:id` sweep used to prove only the admin path, never the
 * former `loadInVenueContext`-wrapped owner resolver a genuine diner exercises).
 */
export const DINER_A_HEADERS: Record<string, string> = { authorization: "Bearer diner-a-token" };

/**
 * A fresh, unique `remoteAddress` per call. `@fastify/rate-limit`'s default
 * `keyGenerator` is `request.ip`, and the whole sweep issues far more than
 * the service-wide 100/min budget from what Fastify (with no `trustProxy`
 * configured) sees as ONE caller — `light-my-request`'s default injected
 * socket. Without this every fixture after roughly the seventeenth started
 * failing on 429, not the RLS assertion it exists to make. Giving each call
 * its own address is the sweep's own concern, not something worth changing
 * the shared rate-limit config for.
 */
function inject(
  ctx: SweepContext,
  headers: Record<string, string>,
  opts: InjectOptions
): Promise<LightMyRequestResponse> {
  // Reset before every call: `expectBroken` reads this back immediately
  // after the awaited inject() resolves, and by then the `onError` hook (if
  // it fired) has already run — see SweepContext.lastRlsErrorName's doc.
  ctx.lastRlsErrorName = null;
  return ctx.app.inject({
    ...opts,
    remoteAddress: randomUUID(),
    headers: { ...headers, ...opts.headers },
  });
}

export const asAdmin = (ctx: SweepContext, opts: InjectOptions): Promise<LightMyRequestResponse> =>
  inject(ctx, ADMIN_HEADERS, opts);
export const asMember = (ctx: SweepContext, opts: InjectOptions): Promise<LightMyRequestResponse> =>
  inject(ctx, MEMBER_HEADERS, opts);
export const asDiner = (ctx: SweepContext, opts: InjectOptions): Promise<LightMyRequestResponse> =>
  inject(ctx, DINER_A_HEADERS, opts);

/** A successful response (< 300) — the RLS + venue-context plumbing did not interfere. */
export function expectOk(res: LightMyRequestResponse, label: string): void {
  expect(
    res.statusCode,
    `${label}: expected success, got ${res.statusCode}: ${res.body}`
  ).toBeLessThan(300);
}

/** Membership/entity-resolution denial — a non-member reaching for venue B's data. */
export function expectDenied(res: LightMyRequestResponse, label: string): void {
  expect([403, 404], `${label}: expected 403/404, got ${res.statusCode}: ${res.body}`).toContain(
    res.statusCode
  );
}

/** Options for the documented shapes of KNOWN_BROKEN that are NOT a cleanly-propagated tripwire error. */
export interface ExpectBrokenOptions {
  /**
   * Covers two distinct non-tripwire shapes, both of which skip the
   * thrown-error-name assertion and just check the status code:
   *   1. A genuinely wrong-tenant RLS denial (a scoped read that resolves to
   *      the WRONG venue, so the row is invisible) rather than an unscoped
   *      read the tripwire catches — e.g. the public-waitlist
   *      slug/body-venueId mismatch fixture (404).
   *   2. A route or service function that catches the tripwire's thrown
   *      error itself and manually formats its own response — either
   *      swallowing it into an unrelated status (e.g. waitlist
   *      seat/cancel/expire's try/catch-return-null turns it into a 404)
   *      or re-emitting the SAME status (500) but via `reply.send(plainObject)`
   *      rather than a re-thrown Error, so Fastify's `onError` hook never
   *      fires (e.g. the unsubscribe and Stripe-webhook routes' own
   *      try/catch blocks). Either way, the caught status is the only
   *      evidence available — set this to that documented status.
   */
  deniedStatus?: number;
  /**
   * For the rare fixture whose tripwire-equivalent evidence is a genuinely
   * DIFFERENT thrown error class than RlsUnscopedQueryError — e.g.
   * `venueService.create()`'s admin path writes via an unwrapped
   * `prisma.$transaction(...)` ($-prefixed methods pass through the
   * venue-scoped-Prisma proxy unwrapped), so the write reaches real
   * Postgres with no `app.venue_id` set and the FORCE'd RLS policy's
   * `WITH CHECK` clause rejects it at the DB layer, surfacing as a plain
   * `PrismaClientKnownRequestError` — still a 500, just not the app-level
   * tripwire's own error class. Still requires 500; checks the thrown
   * error's name against this instead of "RlsUnscopedQueryError".
   */
  expectedErrorName?: string;
}

/**
 * A KNOWN_BROKEN assertion (ADR-026 §3.3 items 1-8, plus anything else this
 * sweep found broken along the way). Under `RLS_CONTEXT_MODE=throw`, the
 * shared tripwire converts every unscoped RLS-model read into a thrown
 * `RlsUnscopedQueryError` before Postgres is even asked — so asserting the
 * status code alone (any 4xx/5xx) cannot tell that throw apart from an
 * unrelated 401/404 the fixture happened to trip first (a missing auth
 * header, a not-yet-reached business check). This requires BOTH the 500
 * `classify-error.ts`'s generic fallback gives an uncaught error, AND that
 * the error the `onError` hook captured really was `RlsUnscopedQueryError` —
 * see `SweepContext.lastRlsErrorName`'s doc for how that's captured.
 */
export function expectBroken(
  res: LightMyRequestResponse,
  label: string,
  ctx: SweepContext,
  options: ExpectBrokenOptions = {}
): void {
  if (options.deniedStatus !== undefined) {
    expect(res.statusCode, `${label}: expected the documented wrong-tenant denial status`).toBe(
      options.deniedStatus
    );
    return;
  }
  const expectedErrorName = options.expectedErrorName ?? "RlsUnscopedQueryError";
  expect(
    res.statusCode,
    `${label}: expected the RLS tripwire to fire (500), got ${res.statusCode}: ${res.body}`
  ).toBe(500);
  expect(
    ctx.lastRlsErrorName,
    `${label}: expected ${expectedErrorName}, got ${ctx.lastRlsErrorName ?? "no thrown error captured"} — ` +
      `remove it from KNOWN_BROKEN (and its ADR-026 §3.3 item) now that it's fixed`
  ).toBe(expectedErrorName);
}

function ok(run: RouteFixture["run"]): RouteFixture {
  return { kind: "ok", run };
}
function notRls(run: RouteFixture["run"]): RouteFixture {
  return { kind: "not-rls", run };
}

/**
 * Generic "ok" fixture for a `?venueId=`-filtered list route
 * (the route names its venue in the query and enters that venue's context itself):
 * both venues answer for admin, venue A answers for the member, venue B is
 * denied for the member.
 */
function okScopedByQuery(path: string, extraQuery = ""): RouteFixture {
  const url = (venueId: string) => `${path}?venueId=${venueId}${extraQuery}`;
  return ok(async (ctx) => {
    expectOk(
      await asAdmin(ctx, { method: "GET", url: url(ctx.venueA.id) }),
      `admin venue A ${path}`
    );
    expectOk(
      await asAdmin(ctx, { method: "GET", url: url(ctx.venueB.id) }),
      `admin venue B ${path}`
    );
    expectOk(
      await asMember(ctx, { method: "GET", url: url(ctx.venueA.id) }),
      `member venue A ${path}`
    );
    expectDenied(
      await asMember(ctx, { method: "GET", url: url(ctx.venueB.id) }),
      `member venue B ${path}`
    );
  });
}

/**
 * Generic "ok" fixture for a `body.venueId`-scoped create route
 * (the venue is named in the body): each call gets a fresh body (via `bodyFor`, so
 * unique-constrained fields like a table/guest name never collide) — both
 * venues succeed for admin, venue A succeeds for the member, venue B is
 * denied for the member (before any row is even attempted).
 */
function okCreateByBody(path: string, bodyFor: (venueId: string) => object): RouteFixture {
  return ok(async (ctx) => {
    expectOk(
      await asAdmin(ctx, { method: "POST", url: path, payload: bodyFor(ctx.venueA.id) }),
      `admin venue A ${path}`
    );
    expectOk(
      await asAdmin(ctx, { method: "POST", url: path, payload: bodyFor(ctx.venueB.id) }),
      `admin venue B ${path}`
    );
    expectOk(
      await asMember(ctx, { method: "POST", url: path, payload: bodyFor(ctx.venueA.id) }),
      `member venue A ${path}`
    );
    expectDenied(
      await asMember(ctx, { method: "POST", url: path, payload: bodyFor(ctx.venueB.id) }),
      `member venue B ${path}`
    );
  });
}

/**
 * Generic "ok" fixture for a read-only entity-addressed route (ADR-026 §3.3
 * item 2, fixed by #5369 PR 5's `resolveVenueId`/former `loadInVenueContext`): both
 * the seeded venue-A and venue-B rows are safe to read repeatedly (no
 * mutation), so this reuses `idA`/`idB` directly rather than creating
 * disposable rows the way the mutating variant below has to.
 */
function okEntityRead(
  urlFor: (id: string) => string,
  idA: (ctx: SweepContext) => string,
  idB: (ctx: SweepContext) => string
): RouteFixture {
  return ok(async (ctx) => {
    expectOk(await asAdmin(ctx, { method: "GET", url: urlFor(idA(ctx)) }), "admin venue A");
    expectOk(await asAdmin(ctx, { method: "GET", url: urlFor(idB(ctx)) }), "admin venue B");
    expectOk(await asMember(ctx, { method: "GET", url: urlFor(idA(ctx)) }), "member venue A");
    expectDenied(await asMember(ctx, { method: "GET", url: urlFor(idB(ctx)) }), "member venue B");
  });
}

/**
 * Generic "ok" fixture for a mutating entity-addressed route (ADR-026 §3.3
 * item 2, fixed by #5369 PR 5). Reusing the shared seeded rows across a
 * write assertion would corrupt state for whichever fixture runs next (a
 * `DELETE` in particular), so `createEntity` makes a disposable row in the
 * given venue via an already-proven `ok` create route for each of the
 * admin/member-own-venue success legs; the member-denied leg addresses
 * `otherVenueId`'s row, which is never reached (denied before any write).
 */
function okEntityMutation(
  createEntity: (ctx: SweepContext, venueId: string) => Promise<string>,
  buildRequest: (id: string) => Pick<InjectOptions, "method" | "url" | "payload">,
  otherVenueId: (ctx: SweepContext) => string
): RouteFixture {
  return ok(async (ctx) => {
    const adminEntity = await createEntity(ctx, ctx.venueA.id);
    expectOk(await asAdmin(ctx, buildRequest(adminEntity)), "admin venue A");

    const memberEntity = await createEntity(ctx, ctx.venueA.id);
    expectOk(await asMember(ctx, buildRequest(memberEntity)), "member venue A");

    expectDenied(await asMember(ctx, buildRequest(otherVenueId(ctx))), "member venue B");
  });
}

/** Extracts `data.id` from a successful `inject()` response body. */
function extractId(res: LightMyRequestResponse): string {
  return (JSON.parse(res.body) as { data: { id: string } }).data.id;
}

/** Creates a disposable table in `venueId` via the already-proven create route. */
async function createDisposableTable(ctx: SweepContext, venueId: string): Promise<string> {
  const res = await asAdmin(ctx, {
    method: "POST",
    url: "/api/v1/tables",
    payload: { name: `RLS Sweep Item-2 Table ${randomUUID()}`, capacity: 4, venueId },
  });
  return extractId(res);
}

/** Creates a disposable guest in `venueId` via the already-proven create route. */
async function createDisposableGuest(ctx: SweepContext, venueId: string): Promise<string> {
  const res = await asAdmin(ctx, {
    method: "POST",
    url: "/api/v1/guests",
    payload: { venueId, name: `RLS Sweep Item-2 Guest ${randomUUID()}` },
  });
  return extractId(res);
}

/** Creates a disposable floor plan in `venueId` via the already-proven create route. */
async function createDisposableFloorPlan(ctx: SweepContext, venueId: string): Promise<string> {
  const res = await asAdmin(ctx, {
    method: "POST",
    url: "/api/v1/floor-plans",
    payload: { venueId, name: `RLS Sweep Item-2 Floor Plan ${randomUUID()}`, layoutJson: {} },
  });
  return extractId(res);
}

/** Creates a disposable waitlist entry in `venueId` via the already-proven create route. */
async function createDisposableWaitlistEntry(ctx: SweepContext, venueId: string): Promise<string> {
  const res = await asAdmin(ctx, {
    method: "POST",
    url: "/api/v1/waitlist",
    payload: {
      venueId,
      partySize: 2,
      guestName: `RLS Sweep Item-2 Waitlist ${randomUUID()}`,
      guestPhone: "+15550009999",
    },
  });
  return extractId(res);
}

/**
 * A disposable waitlist entry already in the `notified` state. `expire` only
 * transitions notified -> expired (#6492), so its [ok] cases need this shape.
 * Notified via the real `waitlistService.markNotified` inside the venue's RLS
 * context (what the notify route does, minus the SMS/Redis job), so the write
 * still goes through the production scoping path.
 */
async function createDisposableNotifiedWaitlistEntry(
  ctx: SweepContext,
  venueId: string
): Promise<string> {
  const id = await createDisposableWaitlistEntry(ctx, venueId);
  const { waitlistService } = await import("../services/waitlist.js");
  const { runWithVenueContext } = await import("../services/venue-context-store.js");
  const notified = await runWithVenueContext(venueId, () => waitlistService.markNotified(id));
  expect(notified?.status, "seed: entry should be notified").toBe("notified");
  return id;
}

/**
 * Creates a disposable reservation in `venueId` on its own fresh table, so
 * repeated calls never collide on a table/time slot. `guestEmail` defaults to
 * a fresh disposable address; pass the diner's own email (#5369 PR 7) to seed
 * a reservation `requireReservationOwnerOrAdmin`'s owner resolver will admit
 * for that diner.
 */
async function createDisposableReservation(
  ctx: SweepContext,
  venueId: string,
  guestEmail = `rls-sweep-disposable-${randomUUID()}@example.com`
): Promise<string> {
  const tableId = await createDisposableTable(ctx, venueId);
  const res = await asAdmin(ctx, {
    method: "POST",
    url: "/api/v1/reservations",
    payload: {
      date: "2026-10-07",
      startTime: "2026-10-07T18:00:00Z",
      endTime: "2026-10-07T20:00:00Z",
      partySize: 2,
      tableId,
      venueId,
      guestName: "RLS Sweep Disposable Guest",
      guestEmail,
    },
  });
  return extractId(res);
}

/**
 * Creates a disposable staff hold in `venueId` (admin, on its own fresh
 * table so repeated calls never collide on a slot) and returns its id plus
 * the `x-session-id` capability the `/:id` routes require. Exported for the
 * staff `/confirm` fixture in `rls-route-sweep.fixtures-public.ts`.
 */
export async function createDisposableStaffHold(
  ctx: SweepContext,
  venueId: string
): Promise<{ id: string; sessionId: string }> {
  const tableId = await createDisposableTable(ctx, venueId);
  const sessionId = `rls-sweep-staff-hold-${randomUUID()}`;
  const res = await asAdmin(ctx, {
    method: "POST",
    url: HOLDS_URL,
    headers: { "x-session-id": sessionId },
    payload: {
      venueId,
      date: inWindowDate(8),
      time: `${inWindowDate(8)}T18:00:00Z`,
      partySize: 2,
      tableId,
    },
  });
  expectOk(res, `create disposable staff hold in ${venueId}`);
  return { id: extractId(res), sessionId };
}

/**
 * venue_groups CRUD (`requireAdmin`-only): `venue_groups` carries no RLS
 * policy at all (ADR-026 §3, "Not an RLS problem at all" table row) — a
 * plain admin smoke check, not part of the venue-isolation matrix.
 */
const notRlsFixtures: Record<string, RouteFixture> = {
  "GET /api/v1/venues/groups": notRls(async (ctx) => {
    expectOk(await asAdmin(ctx, { method: "GET", url: "/api/v1/venues/groups" }), "list groups");
  }),
  "POST /api/v1/venues/groups": notRls(async (ctx) => {
    const res = await asAdmin(ctx, {
      method: "POST",
      url: "/api/v1/venues/groups",
      payload: { name: "RLS Sweep Group", slug: `rls-sweep-group-${Date.now()}` },
    });
    expectOk(res, "create group");
  }),
  "GET /api/v1/venues/groups/:id": notRls(async (ctx) => {
    expectDenied(
      await asAdmin(ctx, { method: "GET", url: "/api/v1/venues/groups/does-not-exist" }),
      "get group (404, not a venue-isolation case)"
    );
  }),
  "PATCH /api/v1/venues/groups/:id": notRls(async (ctx) => {
    expectDenied(
      await asAdmin(ctx, {
        method: "PATCH",
        url: "/api/v1/venues/groups/does-not-exist",
        payload: { name: "x" },
      }),
      "patch group (404)"
    );
  }),
  "DELETE /api/v1/venues/groups/:id": notRls(async (ctx) => {
    expectDenied(
      await asAdmin(ctx, { method: "DELETE", url: "/api/v1/venues/groups/does-not-exist" }),
      "delete group (404)"
    );
  }),

  // `reservation_holds` is explicitly OUT of ADR-026 §1's seven-table list —
  // no RLS policy applies to it regardless of `app.venue_id`, hence
  // "not-rls". The staff routes are still membership-gated (ADR-020): create
  // checks the body's `venueId`, the `/:id` routes the hold's own `venueId`,
  // so each fixture also proves the member/non-member legs. (The staff
  // `/confirm` fixture lives in `rls-route-sweep.fixtures-public.ts`.)
  "POST /api/v1/holds": notRls(async (ctx) => {
    const res = await asAdmin(ctx, {
      method: "POST",
      url: HOLDS_URL,
      payload: {
        venueId: ctx.venueA.id,
        date: inWindowDate(3),
        time: `${inWindowDate(3)}T18:00:00Z`,
        partySize: 2,
        tableId: ctx.tableA,
      },
    });
    expectOk(res, "create hold");
    const crossVenueTable = await asAdmin(ctx, {
      method: "POST",
      url: HOLDS_URL,
      payload: {
        venueId: ctx.venueA.id,
        date: inWindowDate(3),
        time: `${inWindowDate(3)}T18:00:00Z`,
        partySize: 2,
        tableId: ctx.tableB,
      },
    });
    expect(crossVenueTable.statusCode, `venue A + venue-B table: ${crossVenueTable.body}`).toBe(
      403
    );

    const memberTable = await createDisposableTable(ctx, ctx.venueA.id);
    expectOk(
      await asMember(ctx, {
        method: "POST",
        url: HOLDS_URL,
        payload: {
          venueId: ctx.venueA.id,
          date: inWindowDate(3),
          time: `${inWindowDate(3)}T18:00:00Z`,
          partySize: 2,
          tableId: memberTable,
        },
      }),
      "member venue A"
    );

    const denied = await asMember(ctx, {
      method: "POST",
      url: HOLDS_URL,
      payload: {
        venueId: ctx.venueB.id,
        date: inWindowDate(3),
        time: `${inWindowDate(3)}T18:00:00Z`,
        partySize: 2,
        tableId: ctx.tableB,
      },
    });
    expect(denied.statusCode, `member venue B: ${denied.body}`).toBe(403);
  }),
  "GET /api/v1/holds/:id": notRls(async (ctx) => {
    expectDenied(
      await asAdmin(ctx, { method: "GET", url: `${HOLDS_URL}/does-not-exist` }),
      "get hold (admin, unknown id: 404)"
    );

    const holdA = await createDisposableStaffHold(ctx, ctx.venueA.id);
    expectOk(
      await asMember(ctx, { method: "GET", url: `${HOLDS_URL}/${holdA.id}` }),
      "member venue A"
    );

    const holdB = await createDisposableStaffHold(ctx, ctx.venueB.id);
    const denied = await asMember(ctx, { method: "GET", url: `${HOLDS_URL}/${holdB.id}` });
    expect(denied.statusCode, `member venue B: ${denied.body}`).toBe(403);

    const unknown = await asMember(ctx, { method: "GET", url: `${HOLDS_URL}/does-not-exist` });
    expect(unknown.statusCode, `member, unknown id (no existence leak): ${unknown.body}`).toBe(403);
  }),
  "DELETE /api/v1/holds/:id": notRls(async (ctx) => {
    expectDenied(
      await asAdmin(ctx, {
        method: "DELETE",
        url: `${HOLDS_URL}/does-not-exist`,
        headers: { "x-session-id": "rls-sweep-session" },
      }),
      "release hold (admin, unknown id: 404)"
    );

    const holdA = await createDisposableStaffHold(ctx, ctx.venueA.id);
    expectOk(
      await asMember(ctx, {
        method: "DELETE",
        url: `${HOLDS_URL}/${holdA.id}`,
        headers: { "x-session-id": holdA.sessionId },
      }),
      "member venue A"
    );

    const holdB = await createDisposableStaffHold(ctx, ctx.venueB.id);
    const denied = await asMember(ctx, {
      method: "DELETE",
      url: `${HOLDS_URL}/${holdB.id}`,
      headers: { "x-session-id": holdB.sessionId },
    });
    expect(denied.statusCode, `member venue B: ${denied.body}`).toBe(403);
  }),
};

/**
 * Tables: list/create scope by `?venueId=`/`body.venueId`; every entity-
 * addressed `:id` route (ADR-026 §3.3 item 2) resolves its venue via
 * former `venueIdFromEntity`/former `loadInVenueContext` (#5369 PR 5) — fixed.
 */
const tableFixtures: Record<string, RouteFixture> = {
  "GET /api/v1/tables": okScopedByQuery("/api/v1/tables"),
  "POST /api/v1/tables": okCreateByBody("/api/v1/tables", (venueId) => ({
    name: `RLS Sweep Table ${randomUUID()}`,
    capacity: 4,
    venueId,
  })),
  "GET /api/v1/tables/:id": okEntityRead(
    (id) => `/api/v1/tables/${id}`,
    (ctx) => ctx.tableA,
    (ctx) => ctx.tableB
  ),
  "PATCH /api/v1/tables/:id": ok(async (ctx) => {
    const adminEntity = await createDisposableTable(ctx, ctx.venueA.id);
    expectOk(
      await asAdmin(ctx, {
        method: "PATCH",
        url: `/api/v1/tables/${adminEntity}`,
        payload: { name: `RLS Sweep Renamed ${randomUUID()}` },
      }),
      "admin venue A"
    );

    const memberEntity = await createDisposableTable(ctx, ctx.venueA.id);
    expectOk(
      await asMember(ctx, {
        method: "PATCH",
        url: `/api/v1/tables/${memberEntity}`,
        payload: { name: `RLS Sweep Renamed ${randomUUID()}` },
      }),
      "member venue A"
    );

    expectDenied(
      await asMember(ctx, {
        method: "PATCH",
        url: `/api/v1/tables/${ctx.tableB}`,
        payload: { name: `RLS Sweep Renamed ${randomUUID()}` },
      }),
      "member venue B"
    );

    // PR 5 carry-forward (#5369 PR 7): the floor-plan reassignment pre-check
    // in routes/tables.ts now runs inside the table's own resolved venue
    // context too (moved there from two unscoped reads) — prove both legs,
    // not just the plain rename above.
    const sameVenueTable = await createDisposableTable(ctx, ctx.venueA.id);
    const sameVenueFloorPlan = await createDisposableFloorPlan(ctx, ctx.venueA.id);
    expectOk(
      await asAdmin(ctx, {
        method: "PATCH",
        url: `/api/v1/tables/${sameVenueTable}`,
        payload: { floorPlanId: sameVenueFloorPlan },
      }),
      "admin same-venue floorPlanId reassignment"
    );

    // Under FORCE, once the pre-check's own read runs inside the table's
    // resolved venue context (venueA), a genuinely cross-venue floor plan
    // (venueB) is invisible under RLS rather than "found, wrong venue" — the
    // 403 branch in tables.ts never fires, and the attempt still fails, but
    // as the plain 404 from the update's own nested `connect` instead
    // (identical, already-documented consequence to
    // `floor-plans.ts`'s `/tables/positions` route — see its own comment).
    const crossVenueTable = await createDisposableTable(ctx, ctx.venueA.id);
    const otherVenueFloorPlan = await createDisposableFloorPlan(ctx, ctx.venueB.id);
    const crossVenueRes = await asAdmin(ctx, {
      method: "PATCH",
      url: `/api/v1/tables/${crossVenueTable}`,
      payload: { floorPlanId: otherVenueFloorPlan },
    });
    expect(
      crossVenueRes.statusCode,
      `cross-venue floorPlanId: expected 404 (floor plan invisible under RLS), got ${crossVenueRes.statusCode}: ${crossVenueRes.body}`
    ).toBe(404);
  }),
  "DELETE /api/v1/tables/:id": okEntityMutation(
    createDisposableTable,
    (id) => ({ method: "DELETE", url: `/api/v1/tables/${id}` }),
    (ctx) => ctx.tableB
  ),
  "PATCH /api/v1/tables/:id/status": okEntityMutation(
    createDisposableTable,
    (id) => ({
      method: "PATCH",
      url: `/api/v1/tables/${id}/status`,
      payload: { status: "OCCUPIED" },
    }),
    (ctx) => ctx.tableB
  ),
};

/** Creates a disposable, dependency-free venue owned by admin. Used for item-5's
 * PATCH/DELETE and item-8's own fixtures — the addressed entity IS the venue
 * itself, so unlike `createDisposableTable` et al. there is no parent venue to
 * nest it inside, and (unlike a table/guest/floor-plan) there is no HTTP path
 * that can grant `memberSub` ownership of a freshly created venue: `POST
 * /api/v1/venues` denies a non-admin caller who already holds a membership
 * (`requireVenueCreateAccess`), which `memberSub` does (venue A and C). */
async function createDisposableVenue(ctx: SweepContext): Promise<string> {
  const res = await asAdmin(ctx, {
    method: "POST",
    url: "/api/v1/venues",
    payload: {
      name: `RLS Sweep Item-5 Venue ${randomUUID()}`,
      slug: `rls-sweep-item-5-venue-${randomUUID()}`,
      ianaTimezone: "UTC",
    },
  });
  return extractId(res);
}

/**
 * Venues. `GET /` was the ONE mixed case in this sweep: the admin branch
 * (`venueService.list`) is RESOLVED by ADR-026 §3.1's `app_cross_venue_venues()`
 * hatch, and the non-admin branch (`venueService.listForMember`) — item 1 — is
 * now RESOLVED too (#5369 PR 6), via a per-venue fan-out over
 * `venue_memberships` (no RLS policy) instead of a single cross-venue
 * `venue.findMany`. Item 5 (venue-self-addressed `:id` routes — the global
 * preHandler only reads a `venueId` KEY, and these routes address the venue by
 * its own `:id`) and item 8 (`POST /` inserts a venue row with no context to
 * satisfy its own `WITH CHECK`) are now RESOLVED too (#5369 PR 7), via
 * `resolveVenueId`/former `loadInVenueContext` for item 5 and a generated-up-front id
 * plus `setVenueContext` on the create's own transaction for item 8. Item 3
 * (public-shaped slug lookup, reused by the authenticated `by-slug` route too)
 * remains open.
 */
const venueFixtures: Record<string, RouteFixture> = {
  "GET /api/v1/venues": ok(async (ctx) => {
    const admin = await asAdmin(ctx, { method: "GET", url: "/api/v1/venues" });
    expectOk(admin, "admin list (app_cross_venue_venues hatch)");
    const body = JSON.parse(admin.body) as { data: Array<{ id: string }> };
    const ids = body.data.map((v) => v.id);
    expect(ids, "admin list must include both venues, not just one").toEqual(
      expect.arrayContaining([ctx.venueA.id, ctx.venueB.id])
    );

    // #5369 PR 6: listForMember's per-venue fan-out (venue_memberships has no
    // RLS policy) must return BOTH of a multi-venue member's venues, and must
    // not leak venue B — `memberSub` is never a member of it.
    const member = await asMember(ctx, { method: "GET", url: "/api/v1/venues" });
    expectOk(member, "member list (item-1: listForMember, per-venue fan-out)");
    const memberIds = (JSON.parse(member.body) as { data: Array<{ id: string }> }).data.map(
      (v) => v.id
    );
    expect(memberIds, "member list must include both of the member's venues").toEqual(
      expect.arrayContaining([ctx.venueA.id, ctx.venueC.id])
    );
    expect(
      memberIds,
      "member list must not include a venue the member does not belong to"
    ).not.toContain(ctx.venueB.id);
  }),
  "POST /api/v1/venues": ok(async (ctx) => {
    // Admin-only in practice: a non-admin who already holds a membership
    // (every `memberSub` in this sweep) is refused by
    // `requireVenueCreateAccess` before the handler — and thus before
    // item-8's fix — is ever reached, so there is no member leg to prove
    // here (same shape as the deposits family below).
    expectOk(
      await asAdmin(ctx, {
        method: "POST",
        url: "/api/v1/venues",
        payload: {
          name: "RLS Sweep New Venue",
          slug: `rls-sweep-new-${randomUUID()}`,
          ianaTimezone: "UTC",
        },
      }),
      "create venue"
    );
  }),
  // ADR-026 §3.3 item 3 — closed by #5369 PR 8, which resolves the slug via
  // the SECURITY DEFINER `app_resolve_venue_id` (services/resolve-venue.ts)
  // rather than an unscoped `venues` read, then runs the lookup inside that
  // venue's RLS context.
  "GET /api/v1/venues/by-slug/:slug": ok(async (ctx) => {
    const res = await asAdmin(ctx, {
      method: "GET",
      url: `/api/v1/venues/by-slug/${ctx.venueA.slug}`,
    });
    expectOk(res, "get venue by slug");
    const body = JSON.parse(res.body) as { data: { slug: string } };
    expect(body.data.slug, "must serve the venue matching the slug").toBe(ctx.venueA.slug);

    expectDenied(
      await asAdmin(ctx, {
        method: "GET",
        url: "/api/v1/venues/by-slug/rls-sweep-no-such-slug",
      }),
      "unknown slug"
    );
  }),
  "GET /api/v1/venues/:id": okEntityRead(
    (id) => `/api/v1/venues/${id}`,
    (ctx) => ctx.venueA.id,
    (ctx) => ctx.venueB.id
  ),
  "PATCH /api/v1/venues/:id": ok(async (ctx) => {
    // The addressed entity IS the venue, so — unlike `okEntityMutation`'s
    // disposable-row-inside-venueA pattern — there is nowhere to nest a
    // disposable row for the member-own leg; it reuses venueA directly (a
    // rename is safe to repeat: only `id`/`slug` are asserted elsewhere in
    // this sweep). The admin leg still gets its own fresh, dependency-free
    // venue via `createDisposableVenue`, matching every other admin-only
    // create/mutate leg in this sweep.
    const adminVenue = await createDisposableVenue(ctx);
    expectOk(
      await asAdmin(ctx, {
        method: "PATCH",
        url: `/api/v1/venues/${adminVenue}`,
        payload: { name: `RLS Sweep Item-5 Renamed ${randomUUID()}` },
      }),
      "admin disposable venue"
    );
    expectOk(
      await asMember(ctx, {
        method: "PATCH",
        url: `/api/v1/venues/${ctx.venueA.id}`,
        payload: { name: `RLS Sweep Venue A ${randomUUID()}` },
      }),
      "member venue A (own venue)"
    );
    expectDenied(
      await asMember(ctx, {
        method: "PATCH",
        url: `/api/v1/venues/${ctx.venueB.id}`,
        payload: { name: "should not apply" },
      }),
      "member venue B (not a member)"
    );
  }),
  // DELETE /:id is requireAdmin-only (no requireVenueAccess), so there is no
  // member-own-venue or member-denial leg to prove — unlike GET/PATCH above.
  // Both legs use disposable, dependency-free venues: venueA/B carry
  // tables/reservations/etc., so a real DELETE against either would hit
  // has_dependents (409) instead of proving the RLS write, and deleting them
  // would corrupt every other fixture in this sweep.
  "DELETE /api/v1/venues/:id": ok(async (ctx) => {
    const disposableVenue = await createDisposableVenue(ctx);
    expectOk(
      await asAdmin(ctx, { method: "DELETE", url: `/api/v1/venues/${disposableVenue}` }),
      "admin disposable venue"
    );
  }),
  "GET /api/v1/venues/:id/table-statuses": okEntityRead(
    (id) => `/api/v1/venues/${id}/table-statuses`,
    (ctx) => ctx.venueA.id,
    (ctx) => ctx.venueB.id
  ),
  // Settings → Team (#7510). The member is venue A's manager, so both writes
  // are Manager-gated own-venue writes; each is idempotent (the grant stays
  // off, the member stays a Manager) so no later fixture sees a changed venue.
  "GET /api/v1/venues/:id/team": okEntityRead(
    (id) => teamUrl(id),
    (ctx) => ctx.venueA.id,
    (ctx) => ctx.venueB.id
  ),
  "PATCH /api/v1/venues/:id/team": ok(async (ctx) => {
    const request = (venueId: string) => ({
      method: "PATCH" as const,
      url: teamUrl(venueId),
      payload: { hostEmergencyClose: false },
    });
    expectOk(await asAdmin(ctx, request(ctx.venueB.id)), "admin venue B");
    expectOk(await asMember(ctx, request(ctx.venueA.id)), "member venue A (own venue)");
    expectDenied(await asMember(ctx, request(ctx.venueB.id)), "member venue B (not a member)");
  }),
  "PATCH /api/v1/venues/:id/team/members/:userSub": ok(async (ctx) => {
    const request = (venueId: string) => ({
      method: "PATCH" as const,
      url: teamUrl(venueId, `/members/${encodeURIComponent(ctx.memberSub)}`),
      payload: { role: "manager" },
    });
    expectOk(await asAdmin(ctx, request(ctx.venueA.id)), "admin venue A");
    expectOk(await asMember(ctx, request(ctx.venueA.id)), "member venue A (own venue)");
    expectDenied(await asMember(ctx, request(ctx.venueB.id)), "member venue B (not a member)");
  }),
};

/**
 * Availability is `member`-scoped by its `:venueId` PARAM (`venueScoped`, the
 * docs/fixes/venue-scoped-routes PR 5 ruling). Any authenticated caller used to
 * read any venue's slots, and a member of venue A now gets a 403 on venue B.
 */
function okAvailabilityByParam(urlFor: (venueId: string) => string): RouteFixture {
  return ok(async (ctx) => {
    expectOk(await asAdmin(ctx, { method: "GET", url: urlFor(ctx.venueA.id) }), "admin venue A");
    expectOk(await asAdmin(ctx, { method: "GET", url: urlFor(ctx.venueB.id) }), "admin venue B");
    expectOk(await asMember(ctx, { method: "GET", url: urlFor(ctx.venueA.id) }), "member venue A");
    expectDenied(
      await asMember(ctx, { method: "GET", url: urlFor(ctx.venueB.id) }),
      "member venue B"
    );
  });
}

const availabilityFixtures: Record<string, RouteFixture> = {
  "GET /api/v1/availability/:venueId": okAvailabilityByParam(
    (venueId) => `/api/v1/availability/${venueId}?date=2026-10-01&partySize=2`
  ),
  "GET /api/v1/availability/:venueId/dates": okAvailabilityByParam(
    (venueId) =>
      `/api/v1/availability/${venueId}/dates?startDate=2026-10-01&endDate=2026-10-07&partySize=2`
  ),
  "GET /api/v1/venues/:id/availability/config": okAvailabilityByParam(
    (venueId) => `${AVAILABILITY_CONFIG_PREFIX}/${venueId}/availability/config`
  ),
  "GET /api/v1/venues/:id/availability/days": okAvailabilityByParam(
    (venueId) =>
      `${AVAILABILITY_CONFIG_PREFIX}/${venueId}/availability/days?from=2026-10-01&to=2026-10-07`
  ),
  // Read-only (the draft is never saved), so it may run against the shared
  // venues. The member leg proves the cross-venue denial; the Manager-role admission
  // is pinned by `venue-scope-manager.test.ts`.
  "POST /api/v1/venues/:id/closures/impact": ok(async (ctx) => {
    const impact = (venueId: string) => ({
      method: "POST" as const,
      url: `${AVAILABILITY_CONFIG_PREFIX}/${venueId}/closures/impact`,
      payload: {
        rule: {
          id: "rls-sweep-impact",
          kind: "closure",
          targetKind: "venue",
          startsOn: "2026-12-24",
          endsOn: "2026-12-24",
        },
      },
    });
    expectOk(await asAdmin(ctx, impact(ctx.venueA.id)), "admin venue A");
    expectOk(await asAdmin(ctx, impact(ctx.venueB.id)), "admin venue B");
    expectDenied(await asMember(ctx, impact(ctx.venueB.id)), "member venue B");
  }),
  // A closure save rewrites the venue's operating hours, so it lands only on a
  // disposable venue, after a config save gives it a week to close. The empty
  // venue has no bookings to decide on. The reopen is the same venue's rule.
  "POST /api/v1/venues/:id/closures": ok(async (ctx) => {
    const { base, version } = await sharedAvailabilityVenue(ctx);
    const idempotencyKey = `rls-sweep-1-${randomUUID()}`;
    const closureRuleId = `rls-sweep-closure-${randomUUID()}`;
    const closure = {
      expectedVersion: version,
      rule: {
        id: closureRuleId,
        kind: "closure",
        targetKind: "venue",
        startsOn: "2026-12-24",
        endsOn: "2026-12-24",
      },
      decisions: [],
    };
    const saved = await asAdmin(ctx, {
      method: "POST",
      url: `${base}/closures`,
      headers: { "idempotency-key": idempotencyKey },
      payload: closure,
    });
    expectOk(saved, "admin closure");
    const replayed = await asAdmin(ctx, {
      method: "POST",
      url: `${base}/closures`,
      headers: { "idempotency-key": idempotencyKey },
      payload: closure,
    });
    expect(JSON.parse(replayed.body), "replay returns the first result").toEqual(
      JSON.parse(saved.body)
    );
    expectDenied(
      await asMember(ctx, {
        method: "POST",
        url: `${AVAILABILITY_CONFIG_PREFIX}/${ctx.venueB.id}/closures`,
        headers: { "idempotency-key": `${idempotencyKey}-b` },
        payload: closure,
      }),
      "member venue B"
    );
  }),
  "DELETE /api/v1/venues/:id/closures/:ruleId": ok(async (ctx) => {
    const { base, version } = await sharedAvailabilityVenue(ctx);
    const reopenRuleId = `rls-sweep-reopen-${randomUUID()}`;
    expectOk(
      await asAdmin(ctx, {
        method: "POST",
        url: `${base}/closures`,
        headers: { "idempotency-key": `rls-sweep-3-${randomUUID()}` },
        payload: {
          expectedVersion: version,
          rule: {
            id: reopenRuleId,
            kind: "closure",
            targetKind: "venue",
            startsOn: "2026-12-25",
            endsOn: "2026-12-25",
          },
          decisions: [],
        },
      }),
      "admin closure"
    );
    expectOk(
      await asAdmin(ctx, {
        method: "DELETE",
        url: `${base}/closures/${reopenRuleId}`,
        payload: { tellCancelledGuests: false },
      }),
      "admin reopen"
    );
    expectDenied(
      await asMember(ctx, {
        method: "DELETE",
        url: `${AVAILABILITY_CONFIG_PREFIX}/${ctx.venueB.id}/closures/${reopenRuleId}`,
        payload: { tellCancelledGuests: false },
      }),
      "member venue B"
    );
  }),
  // A read-only verdict over POST: members of the venue are admitted, other
  // venues are denied, exactly like the GET availability reads.
  "POST /api/v1/venues/:id/availability/check": ok(async (ctx) => {
    const check = (venueId: string) => ({
      method: "POST" as const,
      url: `${AVAILABILITY_CONFIG_PREFIX}/${venueId}/availability/check`,
      payload: { start: "2026-10-01T19:00:00.000Z", partySize: 2, channel: "phone" },
    });
    expectOk(await asAdmin(ctx, check(ctx.venueA.id)), "admin venue A");
    expectOk(await asAdmin(ctx, check(ctx.venueB.id)), "admin venue B");
    expectOk(await asMember(ctx, check(ctx.venueA.id)), "member venue A");
    expectDenied(await asMember(ctx, check(ctx.venueB.id)), "member venue B");
  }),
  // Read-only, but Manager-gated like the save: the member leg proves the
  // denial. Its stranded scan reads reservations under RLS.
  "POST /api/v1/venues/:id/availability/preview": ok(async (ctx) => {
    const request = (venueId: string) => ({
      method: "POST" as const,
      url: `${AVAILABILITY_CONFIG_PREFIX}/${venueId}/availability/preview`,
      payload: {
        draft: { changes: { upsert: {}, remove: {} }, scopeConflicts: "keep" },
        scope: { from: "2026-10-01" },
        focusDate: "2026-10-01",
      },
    });
    const preview = await asAdmin(ctx, request(ctx.venueA.id));
    expectOk(preview, "admin venue A");
    expect(JSON.parse(preview.body).data.days).toHaveLength(30);
    expectOk(await asAdmin(ctx, request(ctx.venueB.id)), "admin venue B");
    expectDenied(await asMember(ctx, request(ctx.venueB.id)), "member venue B (not a member)");
  }),
  // The write lands only on a disposable venue: venue A's operating hours feed
  // the hold and availability fixtures, and a save rewrites them. The member
  // leg proves the denial; the Manager-role admission is pinned by
  // `venue-scope-manager.test.ts`.
  "PUT /api/v1/venues/:id/availability/config": ok(async (ctx) => {
    const venueId = await createDisposableVenue(ctx);
    const url = `${AVAILABILITY_CONFIG_PREFIX}/${venueId}/availability/config`;
    const changes = sweepConfigChanges();
    const saved = await asAdmin(ctx, {
      method: "PUT",
      url,
      payload: { expectedVersion: 0, changes, scopeConflicts: "keep" },
    });
    expectOk(saved, "admin disposable venue");
    // The rows, audit row and version bump landed under RLS: the read sees
    // them, and a second save from the same stale version names the first.
    const read = await asAdmin(ctx, { method: "GET", url });
    expect(JSON.parse(read.body).data).toMatchObject({ version: 1, source: "rows" });
    const stale = await asAdmin(ctx, {
      method: "PUT",
      url,
      payload: { expectedVersion: 0, changes: { upsert: {}, remove: {} }, scopeConflicts: "keep" },
    });
    expect(stale.statusCode).toBe(409);
    expect(JSON.parse(stale.body).winningChange.id).toBe(JSON.parse(saved.body).data.changeId);
    // Another venue reusing those ids cannot see them (RLS), so the primary
    // key refuses the write; that is a 422 naming the row, never a 500.
    const otherVenue = await createDisposableVenue(ctx);
    const reused = await asAdmin(ctx, {
      method: "PUT",
      url: `${AVAILABILITY_CONFIG_PREFIX}/${otherVenue}/availability/config`,
      payload: { expectedVersion: 0, changes, scopeConflicts: "keep" },
    });
    expect(reused.statusCode, reused.body).toBe(422);
    expect(JSON.parse(reused.body).issues[0]).toMatchObject({
      path: "schedules[0].id",
      code: "id_taken",
    });
    expectDenied(
      await asMember(ctx, {
        method: "PUT",
        url: `${AVAILABILITY_CONFIG_PREFIX}/${ctx.venueB.id}/availability/config`,
        payload: { expectedVersion: 0, changes: sweepConfigChanges(), scopeConflicts: "keep" },
      }),
      "member venue B"
    );
  }),
  "GET /api/v1/venues/:id/availability/changes": okAvailabilityByParam(
    (venueId) => `${AVAILABILITY_CONFIG_PREFIX}/${venueId}/availability/changes`
  ),
  // Like the save, the write lands off venue A (on shared venue C). The second
  // save is the change to undo (undo is offered on the newest change only).
  "POST /api/v1/venues/:id/availability/changes/:changeId/revert": ok(async (ctx) => {
    const { base: venueBase, version } = await sharedAvailabilityVenue(ctx);
    const base = `${venueBase}/availability`;
    expectOk(
      await asAdmin(ctx, {
        method: "PUT",
        url: `${base}/config`,
        payload: {
          expectedVersion: version,
          changes: sweepConfigChanges({ alternate: true }),
          scopeConflicts: "keep",
        },
      }),
      "admin first save"
    );
    const extra = `rls-sweep-vs-${randomUUID()}`;
    const second = await asAdmin(ctx, {
      method: "PUT",
      url: `${base}/config`,
      payload: {
        expectedVersion: version + 1,
        changes: {
          upsert: { venueServices: [{ id: extra, name: "Brunch", position: 1 }] },
          remove: {},
        },
        scopeConflicts: "keep",
      },
    });
    expectOk(second, "admin second save");
    const changeId = JSON.parse(second.body).data.changeId as string;
    const revert = (expectedVersion: number) => ({
      method: "POST" as const,
      url: `${base}/changes/${changeId}/revert`,
      payload: { expectedVersion },
    });
    const reverted = await asAdmin(ctx, revert(version + 2));
    expect(reverted.statusCode, reverted.body).toBe(200);
    expect(JSON.parse(reverted.body).data.version).toBe(version + 3);
    // The inverse landed as rows under RLS, and the original now points at the revert.
    const history = await asAdmin(ctx, { method: "GET", url: `${base}/changes` });
    const items = JSON.parse(history.body).data.items as {
      id: string;
      revertedById: string | null;
    }[];
    expect(items.find((i) => i.id === changeId)?.revertedById).toBe(
      JSON.parse(reverted.body).data.changeId
    );
    const again = await asAdmin(ctx, revert(version + 3));
    expect(again.statusCode).toBe(409);
    expect(JSON.parse(again.body).code).toBe("already-reverted");
    expectDenied(
      await asMember(ctx, {
        method: "POST",
        url: `${AVAILABILITY_CONFIG_PREFIX}/${ctx.venueB.id}/availability/changes/nope/revert`,
        payload: { expectedVersion: 0 },
      }),
      "member venue B"
    );
  }),
};

/**
 * A venue fixtures can write availability rows to without creating one.
 * `POST /venues` is capped at 5 a minute per caller and the sweep already uses
 * all 5, so these share venue C (which no other fixture writes to). Each
 * caller reads the current version, since every save (and closure) bumps it.
 */
async function sharedAvailabilityVenue(
  ctx: SweepContext
): Promise<{ base: string; version: number }> {
  const base = `${AVAILABILITY_CONFIG_PREFIX}/${ctx.venueC.id}`;
  const read = await asAdmin(ctx, { method: "GET", url: `${base}/availability/config` });
  expectOk(read, "admin config read");
  return { base, version: JSON.parse(read.body).data.version as number };
}

/** A one-schedule, one-service week: the smallest config `validateConfig` accepts. Fresh ids per call (they are table-wide keys). `alternate` adds it as a non-regular schedule for a venue that already has a regular week. */
function sweepConfigChanges(options: { alternate?: boolean } = {}) {
  const alternate = options.alternate === true;
  const id = (row: string) => `rls-sweep-${row}-${randomUUID()}`;
  const [schedule, service] = [id("sch"), id("vs")];
  return {
    upsert: {
      schedules: [
        alternate
          ? { id: schedule, name: "Alternate", kind: "alternate", isRegular: false }
          : { id: schedule, name: "Regular", kind: "regular", isRegular: true },
      ],
      venueServices: [{ id: service, name: "Dinner", position: 0 }],
      scheduleServices: [
        {
          id: id("ss"),
          scheduleId: schedule,
          venueServiceId: service,
          opensAt: 1020,
          lastSeatingAt: 1260,
          closesAt: 1320,
          seating: { version: 1, interval: 15 },
          bookingTypes: ["online", "phone"],
        },
      ],
      assignments: [
        {
          id: id("as"),
          scheduleId: schedule,
          weekdays: [0, 1, 2, 3, 4, 5, 6],
          precedence: alternate ? 1 : 0,
        },
      ],
    },
    remove: {},
  };
}

/** A minimal valid `TableShapeMetadata` for the positions/assign fixtures below. */
const DISPOSABLE_SHAPE = { x: 0, y: 0, width: 80, height: 80, shape: "rectangle" as const };

/**
 * Floor plans. `GET /` is the sweep's SECOND mixed case: with `?venueId=`
 * the route enters that venue's context and both `list`/`listForMember`
 * run scoped (ok); without it, `listForMember` (and, for an admin, `list`
 * itself) is an unscoped `floorPlan.findMany` — item 1's third bullet.
 * Every other route here was item 2 (former `venueIdFromEntity` on the floor
 * plan's own `:id`, its `body.floorPlanId`, or a table's `:tableId`) —
 * fixed by #5369 PR 5.
 */
const floorPlanFixtures: Record<string, RouteFixture> = {
  "GET /api/v1/floor-plans": ok(async (ctx) => {
    expectOk(
      await asAdmin(ctx, { method: "GET", url: `/api/v1/floor-plans?venueId=${ctx.venueA.id}` }),
      "admin, venueId given"
    );
    expectOk(
      await asMember(ctx, { method: "GET", url: `/api/v1/floor-plans?venueId=${ctx.venueA.id}` }),
      "member, venueId given"
    );
    expectBroken(
      await asAdmin(ctx, { method: "GET", url: "/api/v1/floor-plans" }),
      "admin, no venueId (item-1: unscoped floorPlan.findMany)",
      ctx
    );
  }),
  "POST /api/v1/floor-plans": okCreateByBody("/api/v1/floor-plans", (venueId) => ({
    venueId,
    name: `RLS Sweep Floor Plan ${randomUUID()}`,
    layoutJson: {},
  })),
  "GET /api/v1/floor-plans/venue/:venueId/active": ok(async (ctx) => {
    const url = (venueId: string) => `/api/v1/floor-plans/venue/${venueId}/active`;
    expectOk(await asAdmin(ctx, { method: "GET", url: url(ctx.venueA.id) }), "admin venue A");
    expectOk(await asMember(ctx, { method: "GET", url: url(ctx.venueA.id) }), "member venue A");
    expectDenied(await asMember(ctx, { method: "GET", url: url(ctx.venueB.id) }), "member venue B");
  }),
  "POST /api/v1/floor-plans/tables/positions": ok(async (ctx) => {
    const positionsPayload = async (venueId: string) => ({
      floorPlanId: await createDisposableFloorPlan(ctx, venueId),
      positions: [
        { tableId: await createDisposableTable(ctx, venueId), shapeMetadata: DISPOSABLE_SHAPE },
      ],
    });
    expectOk(
      await asAdmin(ctx, {
        method: "POST",
        url: "/api/v1/floor-plans/tables/positions",
        payload: await positionsPayload(ctx.venueA.id),
      }),
      "admin venue A"
    );
    expectOk(
      await asMember(ctx, {
        method: "POST",
        url: "/api/v1/floor-plans/tables/positions",
        payload: await positionsPayload(ctx.venueA.id),
      }),
      "member venue A"
    );
    expectDenied(
      await asMember(ctx, {
        method: "POST",
        url: "/api/v1/floor-plans/tables/positions",
        payload: { floorPlanId: ctx.floorPlanB, positions: [] },
      }),
      "member venue B"
    );
  }),
  "POST /api/v1/floor-plans/tables/:tableId/assign": ok(async (ctx) => {
    const assignRequest = async (venueId: string) => {
      const floorPlanId = await createDisposableFloorPlan(ctx, venueId);
      const tableId = await createDisposableTable(ctx, venueId);
      return {
        method: "POST" as const,
        url: `/api/v1/floor-plans/tables/${tableId}/assign`,
        payload: { floorPlanId },
      };
    };
    expectOk(await asAdmin(ctx, await assignRequest(ctx.venueA.id)), "admin venue A");
    expectOk(await asMember(ctx, await assignRequest(ctx.venueA.id)), "member venue A");
    expectDenied(
      await asMember(ctx, {
        method: "POST",
        url: `/api/v1/floor-plans/tables/${ctx.tableB}/assign`,
        payload: { floorPlanId: ctx.floorPlanB },
      }),
      "member venue B"
    );
  }),
  "POST /api/v1/floor-plans/tables/:tableId/remove": okEntityMutation(
    createDisposableTable,
    (id) => ({ method: "POST", url: `/api/v1/floor-plans/tables/${id}/remove` }),
    (ctx) => ctx.tableB
  ),
  "GET /api/v1/floor-plans/:id": okEntityRead(
    (id) => `/api/v1/floor-plans/${id}`,
    (ctx) => ctx.floorPlanA,
    (ctx) => ctx.floorPlanB
  ),
  "PATCH /api/v1/floor-plans/:id": okEntityMutation(
    createDisposableFloorPlan,
    (id) => ({ method: "PATCH", url: `/api/v1/floor-plans/${id}`, payload: { name: "renamed" } }),
    (ctx) => ctx.floorPlanB
  ),
  "DELETE /api/v1/floor-plans/:id": okEntityMutation(
    createDisposableFloorPlan,
    (id) => ({ method: "DELETE", url: `/api/v1/floor-plans/${id}` }),
    (ctx) => ctx.floorPlanB
  ),
  "POST /api/v1/floor-plans/:id/clone": okEntityMutation(
    createDisposableFloorPlan,
    (id) => ({ method: "POST", url: `/api/v1/floor-plans/${id}/clone` }),
    (ctx) => ctx.floorPlanB
  ),
  "POST /api/v1/floor-plans/:id/activate": okEntityMutation(
    createDisposableFloorPlan,
    (id) => ({ method: "POST", url: `/api/v1/floor-plans/${id}/activate` }),
    (ctx) => ctx.floorPlanB
  ),
};

const SECTIONS_PATH = "/api/v1/floor-plan-sections";

interface SectionIds {
  sectionId: string;
  floorPlanId: string;
  tableId: string;
}

/**
 * Seeds a floor plan with one section and one table assigned to that plan in
 * `venueId`, through the API itself (as the bypass admin), so the fixtures
 * below need no direct DB access and use the same venue-scoped write path
 * operators use.
 */
async function seedSection(ctx: SweepContext, venueId: string): Promise<SectionIds> {
  const floorPlanId = await createDisposableFloorPlan(ctx, venueId);
  const tableId = await createDisposableTable(ctx, venueId);
  expectOk(
    await asAdmin(ctx, {
      method: "POST",
      url: `/api/v1/floor-plans/tables/${tableId}/assign`,
      payload: { floorPlanId },
    }),
    "seed table onto floor plan"
  );
  const res = await asAdmin(ctx, {
    method: "POST",
    url: `${SECTIONS_PATH}?venueId=${venueId}`,
    payload: { floorPlanId, name: "Sweep section" },
  });
  expectOk(res, "seed floor plan section");
  return { sectionId: res.json<{ data: { id: string } }>().data.id, floorPlanId, tableId };
}

/**
 * Section routes name their venue in the query and address section ids inside
 * it. Proves: admin and member act on venue A's own section; a member is denied
 * venue B outright; and venue A's ids are not reachable through venue B even
 * for the platform admin (the id is invisible there, not just forbidden).
 */
function okSectionRoute(
  build: (ids: SectionIds, venueId: string) => Pick<InjectOptions, "method" | "url" | "payload">
): RouteFixture {
  return ok(async (ctx) => {
    expectOk(
      await asAdmin(ctx, build(await seedSection(ctx, ctx.venueA.id), ctx.venueA.id)),
      "admin venue A"
    );
    expectOk(
      await asMember(ctx, build(await seedSection(ctx, ctx.venueA.id), ctx.venueA.id)),
      "member venue A"
    );
    const ids = await seedSection(ctx, ctx.venueA.id);
    expectDenied(await asMember(ctx, build(ids, ctx.venueB.id)), "member venue B");
    expectDenied(await asAdmin(ctx, build(ids, ctx.venueB.id)), "admin venue B, venue A's ids");
  });
}

const floorPlanSectionFixtures: Record<string, RouteFixture> = {
  "GET /api/v1/floor-plan-sections": okScopedByQuery(SECTIONS_PATH),
  "POST /api/v1/floor-plan-sections": ok(async (ctx) => {
    const create = async (venueId: string) => ({
      method: "POST" as const,
      url: `${SECTIONS_PATH}?venueId=${venueId}`,
      payload: {
        floorPlanId: await createDisposableFloorPlan(ctx, venueId),
        name: "Sweep section",
      },
    });
    expectOk(await asAdmin(ctx, await create(ctx.venueA.id)), "admin venue A");
    expectOk(await asAdmin(ctx, await create(ctx.venueB.id)), "admin venue B");
    expectOk(await asMember(ctx, await create(ctx.venueA.id)), "member venue A");
    expectDenied(await asMember(ctx, await create(ctx.venueB.id)), "member venue B");
  }),
  "PUT /api/v1/floor-plan-sections/order": okSectionRoute(
    ({ sectionId, floorPlanId }, venueId) => ({
      method: "PUT",
      url: `${SECTIONS_PATH}/order?venueId=${venueId}`,
      payload: { floorPlanId, ids: [sectionId] },
    })
  ),
  "PATCH /api/v1/floor-plan-sections/:sectionId": okSectionRoute(({ sectionId }, venueId) => ({
    method: "PATCH",
    url: `${SECTIONS_PATH}/${sectionId}?venueId=${venueId}`,
    payload: { name: "Renamed", color: "#112233" },
  })),
  "DELETE /api/v1/floor-plan-sections/:sectionId": okSectionRoute(({ sectionId }, venueId) => ({
    method: "DELETE",
    url: `${SECTIONS_PATH}/${sectionId}?venueId=${venueId}`,
  })),
  "PUT /api/v1/floor-plan-sections/:sectionId/tables": okSectionRoute(
    ({ sectionId, tableId }, venueId) => ({
      method: "PUT",
      url: `${SECTIONS_PATH}/${sectionId}/tables?venueId=${venueId}`,
      payload: { tableIds: [tableId] },
    })
  ),
};

const MENUS_PATH = "/api/v1/menus";

interface MenuTreeIds {
  menuId: string;
  sectionId: string;
  itemId: string;
}

/**
 * Seeds a menu with one section and one item in `venueId` through the API
 * itself (as the bypass admin), so the fixtures below need no direct DB access
 * and exercise the same venue-scoped write path operators use.
 */
async function seedMenuTree(ctx: SweepContext, venueId: string): Promise<MenuTreeIds> {
  const q = `?venueId=${venueId}`;
  const menuRes = await asAdmin(ctx, {
    method: "POST",
    url: `${MENUS_PATH}${q}`,
    payload: { name: "Sweep menu", slug: `sweep-${randomUUID().slice(0, 8)}` },
  });
  expectOk(menuRes, "seed menu");
  const menuId = menuRes.json<{ data: { id: string } }>().data.id;
  const sectionRes = await asAdmin(ctx, {
    method: "POST",
    url: `${MENUS_PATH}/${menuId}/sections${q}`,
    payload: { name: "Starters" },
  });
  expectOk(sectionRes, "seed menu section");
  const sectionId = sectionRes.json<{ data: { id: string } }>().data.id;
  const itemRes = await asAdmin(ctx, {
    method: "POST",
    url: `${MENUS_PATH}/${menuId}/sections/${sectionId}/items${q}`,
    payload: { name: "Soup", priceCents: 850 },
  });
  expectOk(itemRes, "seed menu item");
  const itemId = itemRes.json<{ data: { id: string } }>().data.id;
  return { menuId, sectionId, itemId };
}

/**
 * Menu routes name their venue in the query and address menu/section/item ids
 * inside it. Proves: admin and member act on venue A's own tree; a member is
 * denied venue B outright; and venue A's ids are not reachable through venue B
 * even for the platform admin (the id is invisible there, not just forbidden).
 */
function okMenuRoute(
  build: (ids: MenuTreeIds, venueId: string) => Pick<InjectOptions, "method" | "url" | "payload">
): RouteFixture {
  return ok(async (ctx) => {
    const adminTree = await seedMenuTree(ctx, ctx.venueA.id);
    expectOk(await asAdmin(ctx, build(adminTree, ctx.venueA.id)), "admin venue A");

    const memberTree = await seedMenuTree(ctx, ctx.venueA.id);
    expectOk(await asMember(ctx, build(memberTree, ctx.venueA.id)), "member venue A");

    const tree = await seedMenuTree(ctx, ctx.venueA.id);
    expectDenied(await asMember(ctx, build(tree, ctx.venueB.id)), "member venue B");
    expectDenied(await asAdmin(ctx, build(tree, ctx.venueB.id)), "admin venue B, venue A's ids");
  });
}

const menuFixtures: Record<string, RouteFixture> = {
  "GET /api/v1/menus": okScopedByQuery(MENUS_PATH),
  "POST /api/v1/menus": ok(async (ctx) => {
    const create = (venueId: string) => ({
      method: "POST" as const,
      url: `${MENUS_PATH}?venueId=${venueId}`,
      payload: { name: "Sweep menu", slug: `sweep-${randomUUID().slice(0, 8)}` },
    });
    expectOk(await asAdmin(ctx, create(ctx.venueA.id)), "admin venue A");
    expectOk(await asAdmin(ctx, create(ctx.venueB.id)), "admin venue B");
    expectOk(await asMember(ctx, create(ctx.venueA.id)), "member venue A");
    expectDenied(await asMember(ctx, create(ctx.venueB.id)), "member venue B");
  }),
  "GET /api/v1/menus/:menuId": okMenuRoute(({ menuId }, venueId) => ({
    method: "GET",
    url: `${MENUS_PATH}/${menuId}?venueId=${venueId}`,
  })),
  "PATCH /api/v1/menus/:menuId": okMenuRoute(({ menuId }, venueId) => ({
    method: "PATCH",
    url: `${MENUS_PATH}/${menuId}?venueId=${venueId}`,
    payload: { name: "renamed" },
  })),
  "DELETE /api/v1/menus/:menuId": okMenuRoute(({ menuId }, venueId) => ({
    method: "DELETE",
    url: `${MENUS_PATH}/${menuId}?venueId=${venueId}`,
  })),
  "POST /api/v1/menus/:menuId/sections": okMenuRoute(({ menuId }, venueId) => ({
    method: "POST",
    url: `${MENUS_PATH}/${menuId}/sections?venueId=${venueId}`,
    payload: { name: "Mains" },
  })),
  "PUT /api/v1/menus/:menuId/sections/order": okMenuRoute(({ menuId, sectionId }, venueId) => ({
    method: "PUT",
    url: `${MENUS_PATH}/${menuId}/sections/order?venueId=${venueId}`,
    payload: { ids: [sectionId] },
  })),
  "PATCH /api/v1/menus/:menuId/sections/:sectionId": okMenuRoute(
    ({ menuId, sectionId }, venueId) => ({
      method: "PATCH",
      url: `${MENUS_PATH}/${menuId}/sections/${sectionId}?venueId=${venueId}`,
      payload: { name: "renamed" },
    })
  ),
  "DELETE /api/v1/menus/:menuId/sections/:sectionId": okMenuRoute(
    ({ menuId, sectionId }, venueId) => ({
      method: "DELETE",
      url: `${MENUS_PATH}/${menuId}/sections/${sectionId}?venueId=${venueId}`,
    })
  ),
  "POST /api/v1/menus/:menuId/sections/:sectionId/items": okMenuRoute(
    ({ menuId, sectionId }, venueId) => ({
      method: "POST",
      url: `${MENUS_PATH}/${menuId}/sections/${sectionId}/items?venueId=${venueId}`,
      payload: { name: "Stew", priceCents: 1200 },
    })
  ),
  "PUT /api/v1/menus/:menuId/sections/:sectionId/items/order": okMenuRoute(
    ({ menuId, sectionId, itemId }, venueId) => ({
      method: "PUT",
      url: `${MENUS_PATH}/${menuId}/sections/${sectionId}/items/order?venueId=${venueId}`,
      payload: { ids: [itemId] },
    })
  ),
  "PATCH /api/v1/menus/:menuId/sections/:sectionId/items/:itemId": okMenuRoute(
    ({ menuId, sectionId, itemId }, venueId) => ({
      method: "PATCH",
      url: `${MENUS_PATH}/${menuId}/sections/${sectionId}/items/${itemId}?venueId=${venueId}`,
      payload: { status: "SOLD_OUT" },
    })
  ),
  "DELETE /api/v1/menus/:menuId/sections/:sectionId/items/:itemId": okMenuRoute(
    ({ menuId, sectionId, itemId }, venueId) => ({
      method: "DELETE",
      url: `${MENUS_PATH}/${menuId}/sections/${sectionId}/items/${itemId}?venueId=${venueId}`,
    })
  ),
};

/** Guests: list/create scope by `?venueId=`/`body.venueId`; every entity-addressed `:id` route was item 2, fixed by #5369 PR 5. */
const guestFixtures: Record<string, RouteFixture> = {
  "GET /api/v1/guests": okScopedByQuery("/api/v1/guests"),
  "GET /api/v1/guests/search": okScopedByQuery("/api/v1/guests/search"),
  "GET /api/v1/guests/segments": okScopedByQuery("/api/v1/guests/segments"),
  "GET /api/v1/guests/lapsing": okScopedByQuery("/api/v1/guests/lapsing"),
  "POST /api/v1/guests": okCreateByBody("/api/v1/guests", (venueId) => ({
    venueId,
    name: `RLS Sweep Guest ${randomUUID()}`,
  })),
  "POST /api/v1/guests/find-or-create": okCreateByBody(
    "/api/v1/guests/find-or-create",
    (venueId) => ({
      venueId,
      name: `RLS Sweep FoC Guest ${randomUUID()}`,
      email: `${randomUUID()}@example.com`,
    })
  ),
  "GET /api/v1/guests/:id": okEntityRead(
    (id) => `/api/v1/guests/${id}`,
    (ctx) => ctx.guestA,
    (ctx) => ctx.guestB
  ),
  "PATCH /api/v1/guests/:id": okEntityMutation(
    createDisposableGuest,
    (id) => ({ method: "PATCH", url: `/api/v1/guests/${id}`, payload: { name: "renamed" } }),
    (ctx) => ctx.guestB
  ),
  "DELETE /api/v1/guests/:id": okEntityMutation(
    createDisposableGuest,
    (id) => ({ method: "DELETE", url: `/api/v1/guests/${id}` }),
    (ctx) => ctx.guestB
  ),
  "POST /api/v1/guests/:id/notes": okEntityMutation(
    createDisposableGuest,
    (id) => ({
      method: "POST",
      url: `/api/v1/guests/${id}/notes`,
      payload: { text: "sweep note" },
    }),
    (ctx) => ctx.guestB
  ),
  // No email on the disposable guest (createDisposableGuest sets only
  // `name`) — sendWinBack's own guard returns `false` before ever reaching
  // the notification port, so this stays a real, no-network 200.
  "POST /api/v1/guests/:id/win-back": okEntityMutation(
    createDisposableGuest,
    (id) => ({ method: "POST", url: `/api/v1/guests/${id}/win-back` }),
    (ctx) => ctx.guestB
  ),
};

/**
 * Reservations. `GET /` is a THIRD mixed case: `?venueId=` is scoped
 * correctly (ok), but `?guestId=` resolves via an unscoped `guestService.getById`
 * (item 2's own text names this). `/me` was item 1 (`listByUserId`, cross-venue
 * by construction — a diner's bookings span whatever venues they visited) and
 * is now RESOLVED (#5369 PR 6) via a per-venue fan-out over
 * `app_reservation_venue_ids_for_user()`. `/:id` (GET/PATCH/DELETE) is item 2 via `requireReservationOwnerOrAdmin`'s
 * own unscoped lookup — admin-only here, since the guard's non-admin path is
 * ownership (guest-email match), a different axis than the staff-membership
 * identity this sweep's "member" represents. `POST /` and `/walk-in` are
 * body-scoped (ok); `POST /` is intentionally open to non-members too (no
 * `requireVenueAccess` at all — anyone may book), so it gets one smoke
 * assertion rather than the 4-way matrix.
 */
const reservationFixtures: Record<string, RouteFixture> = {
  "GET /api/v1/reservations": ok(async (ctx) => {
    expectOk(
      await asAdmin(ctx, {
        method: "GET",
        url: `/api/v1/reservations?venueId=${ctx.venueA.id}`,
      }),
      "admin, venueId"
    );
    expectBroken(
      await asAdmin(ctx, { method: "GET", url: `/api/v1/reservations?guestId=${ctx.guestA}` }),
      "admin, guestId (item-2: unscoped guestService.getById)",
      ctx
    );
  }),
  "GET /api/v1/reservations/me": ok(async (ctx) => {
    // `asAdmin`'s bypass identity is the diner who booked reservationMineA
    // (venue A) and reservationMineB (venue B); reservationOtherUser is a
    // different diner's booking and must never appear.
    const res = await asAdmin(ctx, { method: "GET", url: "/api/v1/reservations/me" });
    expectOk(res, "listByUserId, per-venue fan-out (item-1: #5369 PR 6)");
    const ids = (JSON.parse(res.body) as { data: Array<{ id: string }> }).data.map((r) => r.id);
    expect(ids, "must include reservations from both of the diner's venues").toEqual(
      expect.arrayContaining([ctx.reservationMineA, ctx.reservationMineB])
    );
    expect(ids, "must not include another diner's reservation").not.toContain(
      ctx.reservationOtherUser
    );
  }),
  // A walk-in flips its table to OCCUPIED, so reusing `ctx.tableA` across the
  // 4-way matrix would 409 on the second call — each assertion creates its
  // own disposable table first (via the already-proven-ok `POST /tables`).
  "POST /api/v1/reservations/walk-in": ok(async (ctx) => {
    async function walkIn(
      as: typeof asAdmin,
      venueId: string,
      label: string
    ): Promise<LightMyRequestResponse> {
      const table = await as(ctx, {
        method: "POST",
        url: "/api/v1/tables",
        payload: { name: `RLS Sweep Walk-in Table ${randomUUID()}`, capacity: 4, venueId },
      });
      const { data } = JSON.parse(table.body) as { data: { id: string } };
      return as(ctx, {
        method: "POST",
        url: "/api/v1/reservations/walk-in",
        payload: { venueId, partySize: 2, tableId: data.id },
      }).then((res) => {
        expectOk(res, label);
        return res;
      });
    }

    await walkIn(asAdmin, ctx.venueA.id, "admin venue A");
    await walkIn(asAdmin, ctx.venueB.id, "admin venue B");
    await walkIn(asMember, ctx.venueA.id, "member venue A");
    expectDenied(
      await asMember(ctx, {
        method: "POST",
        url: "/api/v1/reservations/walk-in",
        payload: { venueId: ctx.venueB.id, partySize: 2, tableId: ctx.tableB },
      }),
      "member venue B"
    );
    const crossVenueTable = await asMember(ctx, {
      method: "POST",
      url: "/api/v1/reservations/walk-in",
      payload: { venueId: ctx.venueA.id, partySize: 2, tableId: ctx.tableB },
    });
    expect(
      crossVenueTable.statusCode,
      `member venue A + venue-B table: ${crossVenueTable.body}`
    ).toBe(403);
  }),
  // Reservation `/:id` routes authorize owner-or-admin
  // (`requireReservationOwnerOrAdmin`): admin always short-circuits past the
  // resolver entirely (`requireOwnershipOrAdmin`'s `isAdmin` branch), so the
  // admin-only legs below prove the HANDLER'S OWN former `loadInVenueContext` read
  // resolves in both venues, but never exercise the owner resolver's
  // identical former `loadInVenueContext` wrap — the actual non-admin path (#5369
  // PR 5 carry-forward). The diner-owner leg does: `asDiner` authenticates as
  // the guest whose verified email matches `reservationA`'s `guestEmail`, a
  // genuine non-admin owner. The non-owner-member leg proves the opposite —
  // a venue STAFF member who is not the guest is still refused, the same
  // result as before this PR, now actually asserted rather than assumed.
  "GET /api/v1/reservations/:id": ok(async (ctx) => {
    for (const [id, label] of [
      [ctx.reservationA, "admin venue A"],
      [ctx.reservationB, "admin venue B"],
    ] as const) {
      expectOk(await asAdmin(ctx, { method: "GET", url: `/api/v1/reservations/${id}` }), label);
    }
    expectOk(
      await asDiner(ctx, { method: "GET", url: `/api/v1/reservations/${ctx.reservationA}` }),
      "diner (owner)"
    );
    expectDenied(
      await asMember(ctx, { method: "GET", url: `/api/v1/reservations/${ctx.reservationA}` }),
      "member (not the owner, not admin)"
    );
  }),
  "PATCH /api/v1/reservations/:id": ok(async (ctx) => {
    for (const venueId of [ctx.venueA.id, ctx.venueB.id]) {
      const id = await createDisposableReservation(ctx, venueId);
      expectOk(
        await asAdmin(ctx, {
          method: "PATCH",
          url: `/api/v1/reservations/${id}`,
          payload: { notes: "sweep" },
        }),
        `admin ${venueId}`
      );
    }
    const dinerOwned = await createDisposableReservation(
      ctx,
      ctx.venueA.id,
      ctx.reservationAGuestEmail
    );
    expectOk(
      await asDiner(ctx, {
        method: "PATCH",
        url: `/api/v1/reservations/${dinerOwned}`,
        payload: { notes: "sweep (diner)" },
      }),
      "diner (owner)"
    );
    expectDenied(
      await asMember(ctx, {
        method: "PATCH",
        url: `/api/v1/reservations/${ctx.reservationA}`,
        payload: { notes: "should not apply" },
      }),
      "member (not the owner, not admin)"
    );
  }),
  "DELETE /api/v1/reservations/:id": ok(async (ctx) => {
    for (const venueId of [ctx.venueA.id, ctx.venueB.id]) {
      const id = await createDisposableReservation(ctx, venueId);
      expectOk(
        await asAdmin(ctx, { method: "DELETE", url: `/api/v1/reservations/${id}` }),
        `admin ${venueId}`
      );
    }
    const dinerOwned = await createDisposableReservation(
      ctx,
      ctx.venueA.id,
      ctx.reservationAGuestEmail
    );
    expectOk(
      await asDiner(ctx, { method: "DELETE", url: `/api/v1/reservations/${dinerOwned}` }),
      "diner (owner)"
    );
    expectDenied(
      await asMember(ctx, { method: "DELETE", url: `/api/v1/reservations/${ctx.reservationA}` }),
      "member (not the owner, not admin)"
    );
  }),
  "POST /api/v1/reservations": ok(async (ctx) => {
    const bodyFor = (venueId: string, tableId: string) => ({
      date: "2026-10-06",
      startTime: "2026-10-06T18:00:00Z",
      endTime: "2026-10-06T20:00:00Z",
      partySize: 2,
      tableId,
      venueId,
      guestName: "RLS Sweep Guest",
      guestEmail: `rls-sweep-create-${randomUUID()}@example.com`,
    });
    expectOk(
      await asAdmin(ctx, {
        method: "POST",
        url: "/api/v1/reservations",
        payload: bodyFor(ctx.venueA.id, ctx.tableA),
      }),
      "admin venue A (body-scoped, requireVenueAccess)"
    );
    // A fresh table so the member's create does not conflict with the admin's slot.
    const memberTableA = await createDisposableTable(ctx, ctx.venueA.id);
    expectOk(
      await asMember(ctx, {
        method: "POST",
        url: "/api/v1/reservations",
        payload: bodyFor(ctx.venueA.id, memberTableA),
      }),
      "member venue A"
    );
    expectDenied(
      await asMember(ctx, {
        method: "POST",
        url: "/api/v1/reservations",
        payload: bodyFor(ctx.venueB.id, ctx.tableB),
      }),
      "member venue B"
    );
    // Membership of the body's venue is not enough: the table must be that
    // venue's too, refused before any conflict check could answer for venue B.
    const crossVenueTable = await asMember(ctx, {
      method: "POST",
      url: "/api/v1/reservations",
      payload: bodyFor(ctx.venueA.id, ctx.tableB),
    });
    expect(
      crossVenueTable.statusCode,
      `member venue A + venue-B table: ${crossVenueTable.body}`
    ).toBe(403);
  }),
};

/** Waitlist: list/create scope by `?venueId=`/`body.venueId`; every entity-addressed `:id` route is item 2. */
const waitlistFixtures: Record<string, RouteFixture> = {
  "POST /api/v1/waitlist": okCreateByBody("/api/v1/waitlist", (venueId) => ({
    venueId,
    partySize: 2,
    guestName: `RLS Sweep Waitlist ${randomUUID()}`,
    guestPhone: "+15550001111",
  })),
  "GET /api/v1/waitlist": okScopedByQuery("/api/v1/waitlist"),
  "GET /api/v1/waitlist/:id": okEntityRead(
    (id) => `/api/v1/waitlist/${id}`,
    (ctx) => ctx.waitlistA,
    (ctx) => ctx.waitlistB
  ),
  // notify's success path enqueues a WAITLIST_EXPIRY job (BullMQ/Redis),
  // which this suite's CI job does not provision, so it asserts only the RLS
  // half: the venue resolves for both own-venue identities (no 403/404 and no
  // tripwire) and the member is denied on the other venue.
  "PUT /api/v1/waitlist/:id/notify": ok(async (ctx) => {
    for (const [as, label] of [
      [asAdmin, "admin venue A"],
      [asMember, "member venue A"],
    ] as const) {
      const id = await createDisposableWaitlistEntry(ctx, ctx.venueA.id);
      const res = await as(ctx, { method: "PUT", url: `/api/v1/waitlist/${id}/notify` });
      expect([403, 404], `${label}: venue must resolve, got ${res.statusCode}`).not.toContain(
        res.statusCode
      );
      expect(ctx.lastRlsErrorName, `${label}: RLS tripwire fired`).not.toBe(
        "RlsUnscopedQueryError"
      );
    }
    expectDenied(
      await asMember(ctx, { method: "PUT", url: `/api/v1/waitlist/${ctx.waitlistB}/notify` }),
      "member venue B"
    );
  }),
  "PUT /api/v1/waitlist/:id/seat": okEntityMutation(
    createDisposableWaitlistEntry,
    (id) => ({ method: "PUT", url: `/api/v1/waitlist/${id}/seat` }),
    (ctx) => ctx.waitlistB
  ),
  "PUT /api/v1/waitlist/:id/cancel": okEntityMutation(
    createDisposableWaitlistEntry,
    (id) => ({ method: "PUT", url: `/api/v1/waitlist/${id}/cancel` }),
    (ctx) => ctx.waitlistB
  ),
  "PUT /api/v1/waitlist/:id/expire": okEntityMutation(
    createDisposableNotifiedWaitlistEntry,
    (id) => ({ method: "PUT", url: `/api/v1/waitlist/${id}/expire` }),
    (ctx) => ctx.waitlistB
  ),
};

const briefingFixtures: Record<string, RouteFixture> = {
  "GET /api/v1/briefing": okScopedByQuery("/api/v1/briefing", "&date=2026-10-01"),
};

const reservationEventFixtures: Record<string, RouteFixture> = {
  "GET /api/v1/reservations/:id/events": okEntityRead(
    (id) => `/api/v1/reservations/${id}/events`,
    (ctx) => ctx.reservationA,
    (ctx) => ctx.reservationB
  ),
};

const bookingMetricsFixtures: Record<string, RouteFixture> = {
  "GET /api/v1/reservations/metrics/daily": okScopedByQuery(
    "/api/v1/reservations/metrics/daily",
    "&date=2026-10-01"
  ),
};

/**
 * Deposits (ADR-026 §3.2/§3.3 item 6, closed #5369 PR 7): `requireAdmin`
 * only — no `requireVenueAccess`, so there is no member leg to prove for any
 * route in this family — addressed by an opaque deposit/reservation id.
 * `resolveVenueId("reservation", …)` (`../services/resolve-venue.ts`) and the
 * capture/refund/forfeit family now resolve through the `SECURITY DEFINER`
 * `app_resolve_venue_id` function (`resolveVenueId`/former `loadInVenueContext`)
 * instead of an unscoped `reservation.findUnique`/`deposit.findUnique` read.
 */
const depositFixtures: Record<string, RouteFixture> = {
  "POST /api/v1/deposits": ok(async (ctx) => {
    // reservationB, not A: reservationA already owns depositA (Deposit.reservationId
    // is unique), so creating a second deposit for it would fail on the
    // constraint rather than prove anything about venue resolution.
    expectOk(
      await asAdmin(ctx, {
        method: "POST",
        url: "/api/v1/deposits",
        payload: { reservationId: ctx.reservationB, amountCents: 1000 },
      }),
      "create deposit"
    );
  }),
  "GET /api/v1/deposits": ok(async (ctx) => {
    expectOk(
      await asAdmin(ctx, {
        method: "GET",
        url: `/api/v1/deposits?reservationId=${ctx.reservationA}`,
      }),
      "get deposit by reservationId"
    );
  }),
  "GET /api/v1/deposits/:id": ok(async (ctx) => {
    expectOk(
      await asAdmin(ctx, { method: "GET", url: `/api/v1/deposits/${ctx.depositA}` }),
      "get deposit by id"
    );
  }),
  // capture/refund/forfeit all require a `held` deposit; depositA seeds as
  // `pending` (never transitioned elsewhere in this sweep, so it stays safe
  // to read repeatedly from the GET fixtures above), so each of these throws
  // DepositTransitionError (422) before ever reaching Stripe — this suite
  // provisions no Stripe key. Asserting the exact 422 (not merely "not
  // 403/404") is the point: a bare `not.toContain([403, 404])` also passes on
  // an unrelated 500, which would let a genuine regression slip through
  // silently (#5369 PR 7 review). 422 is only reachable once
  // `resolveVenueId("deposit", id)` resolves the venue and the deposit load
  // inside that context succeeds, so it is still exactly the RLS-relevant
  // evidence the waitlist `/notify` fixture's own unprovisioned-dependency
  // pattern is after — just precise about which non-403/404 status counts.
  "POST /api/v1/deposits/:id/capture": ok(async (ctx) => {
    const res = await asAdmin(ctx, {
      method: "POST",
      url: `/api/v1/deposits/${ctx.depositA}/capture`,
    });
    expect(res.statusCode, `capture: expected the pending-deposit 422, got ${res.statusCode}`).toBe(
      422
    );
  }),
  "POST /api/v1/deposits/:id/refund": ok(async (ctx) => {
    const res = await asAdmin(ctx, {
      method: "POST",
      url: `/api/v1/deposits/${ctx.depositA}/refund`,
    });
    expect(res.statusCode, `refund: expected the pending-deposit 422, got ${res.statusCode}`).toBe(
      422
    );
  }),
  "POST /api/v1/deposits/:id/forfeit": ok(async (ctx) => {
    const res = await asAdmin(ctx, {
      method: "POST",
      url: `/api/v1/deposits/${ctx.depositA}/forfeit`,
    });
    expect(res.statusCode, `forfeit: expected the pending-deposit 422, got ${res.statusCode}`).toBe(
      422
    );
  }),
};

export const FIXTURES: Record<string, RouteFixture> = {
  ...notRlsFixtures,
  ...tableFixtures,
  ...venueFixtures,
  ...availabilityFixtures,
  ...floorPlanFixtures,
  ...floorPlanSectionFixtures,
  ...menuFixtures,
  ...guestFixtures,
  ...reservationFixtures,
  ...waitlistFixtures,
  ...briefingFixtures,
  ...bookingMetricsFixtures,
  ...reservationEventFixtures,
  ...depositFixtures,
};
