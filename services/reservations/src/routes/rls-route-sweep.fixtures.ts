import { expect } from "vitest";
import { randomUUID } from "node:crypto";
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from "fastify";

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
  // Dev/test-only helper (`process.env.NODE_ENV !== "production"`), no auth,
  // no Prisma call — just re-emits onto the in-memory bus above.
  "POST /api/v1/events/test",
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
   * which asserts it stays `"waiting"` after its own call — sharing it with
   * a fixture that writes (even one that 404s before reaching the DB today,
   * per the tripwire) would couple the two the moment item-2's fix makes
   * `seat` actually succeed.
   */
  waitlistSeatTarget: string;
  depositA: string;
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

/**
 * A payload value, or a factory reading it off {@link SweepContext} — needed
 * wherever a KNOWN_BROKEN fixture's body must reference a seeded id (e.g.
 * `ctx.tableA`) that doesn't exist yet when `FIXTURES` is built (module load
 * time, before `beforeAll` seeds anything). Re-exported by
 * `rls-route-sweep.fixtures-public.ts` rather than redeclared there.
 */
export type PayloadOrFactory =
  InjectOptions["payload"] | ((ctx: SweepContext) => InjectOptions["payload"]);

/** `x-auth-bypass` short-circuits `requireAuth`/`requireVenueAccess` to a hardcoded platform-admin identity. */
export const ADMIN_HEADERS: Record<string, string> = { "x-auth-bypass": "true" };
/** Matched by the `jose` mock in the test file to a non-admin member of venue A. */
export const MEMBER_HEADERS: Record<string, string> = { authorization: "Bearer member-a-token" };

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
function broken(blocker: string, run: RouteFixture["run"]): RouteFixture {
  return { kind: "broken", blocker, run };
}

/**
 * Generic "ok" fixture for a `?venueId=`-filtered list route
 * (`venueIdFromQuery`, ADR-026 §4's global preHandler picks the same key up):
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
 * (`venueIdFromBody`): each call gets a fresh body (via `bodyFor`, so
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
 * item 2, fixed by #5369 PR 5's `resolveVenueId`/`loadInVenueContext`): both
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
 * Generic KNOWN_BROKEN fixture for an entity-addressed route
 * (`venueIdFromEntity` — ADR-026 §3.3 item 2, or one of the other seven
 * items sharing the identical "lookup can't run inside the scope it's
 * computing" shape). One admin request is enough to prove it: the ADR's own
 * §3.3 measurement table is admin-only for the same reason — the failure
 * mode (404 admin / 403 non-admin) is already established there, and running
 * every one of these as both identities would not add information.
 */
function brokenEntity(
  blocker: string,
  method: "GET" | "PATCH" | "DELETE" | "PUT" | "POST",
  urlFor: (ctx: SweepContext) => string,
  payload?: PayloadOrFactory,
  options?: ExpectBrokenOptions
): RouteFixture {
  return broken(blocker, async (ctx) => {
    const url = urlFor(ctx);
    const body = typeof payload === "function" ? payload(ctx) : payload;
    expectBroken(
      await asAdmin(ctx, { method, url, payload: body }),
      `admin ${method} ${url}`,
      ctx,
      options
    );
  });
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
  // no RLS policy applies to it regardless of `app.venue_id`. `requireAuth`
  // only (no `requireVenueAccess`), by design (see holds.ts's own doc
  // comment: this is the staff surface, session-id-capability-gated like its
  // public sibling, not membership-gated).
  "POST /api/v1/holds": notRls(async (ctx) => {
    const res = await asAdmin(ctx, {
      method: "POST",
      url: "/api/v1/holds",
      payload: {
        venueId: ctx.venueA.id,
        date: "2026-10-03",
        time: "2026-10-03T18:00:00Z",
        partySize: 2,
        tableId: ctx.tableA,
      },
    });
    expectOk(res, "create hold");
  }),
  "GET /api/v1/holds/:id": notRls(async (ctx) => {
    expectDenied(
      await asAdmin(ctx, { method: "GET", url: "/api/v1/holds/does-not-exist" }),
      "get hold (404, not a venue-isolation case)"
    );
  }),
  "DELETE /api/v1/holds/:id": notRls(async (ctx) => {
    expectDenied(
      await asAdmin(ctx, {
        method: "DELETE",
        url: "/api/v1/holds/does-not-exist",
        headers: { "x-session-id": "rls-sweep-session" },
      }),
      "release hold (404)"
    );
  }),
};

/**
 * Tables: list/create scope by `?venueId=`/`body.venueId`; every entity-
 * addressed `:id` route (ADR-026 §3.3 item 2) resolves its venue via
 * `venueIdFromEntity`/`loadInVenueContext` (#5369 PR 5) — fixed.
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
  "PATCH /api/v1/tables/:id": okEntityMutation(
    createDisposableTable,
    (id) => ({ method: "PATCH", url: `/api/v1/tables/${id}`, payload: { name: "renamed" } }),
    (ctx) => ctx.tableB
  ),
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

/**
 * Venues. `GET /` was the ONE mixed case in this sweep: the admin branch
 * (`venueService.list`) is RESOLVED by ADR-026 §3.1's `app_cross_venue_venues()`
 * hatch, and the non-admin branch (`venueService.listForMember`) — item 1 — is
 * now RESOLVED too (#5369 PR 6), via a per-venue fan-out over
 * `venue_memberships` (no RLS policy) instead of a single cross-venue
 * `venue.findMany`. Everything else here is item 5 (venue-self-addressed `:id`
 * routes — the global preHandler only reads a `venueId` KEY, and these routes
 * address the venue by its own `:id`) or item 8 (`POST /` inserts a venue row
 * with no context to satisfy its own `WITH CHECK`) or item 3 (public-shaped
 * slug lookup, reused by the authenticated `by-slug` route too).
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
  "POST /api/v1/venues": broken("item-8", async (ctx) => {
    expectBroken(
      await asAdmin(ctx, {
        method: "POST",
        url: "/api/v1/venues",
        payload: {
          name: "RLS Sweep New Venue",
          slug: `rls-sweep-new-${randomUUID()}`,
          ianaTimezone: "UTC",
        },
      }),
      "create venue",
      ctx,
      // venueService.create()'s admin path writes via an unwrapped
      // prisma.$transaction(...) — $-prefixed methods pass through the
      // venue-scoped-Prisma proxy unwrapped, so the app-level tripwire never
      // sees this write. It reaches real Postgres with no app.venue_id set,
      // and the FORCE'd RLS policy's WITH CHECK clause rejects it at the DB
      // layer instead, surfacing as a plain PrismaClientKnownRequestError —
      // equally valid "broken" evidence, just from a different layer.
      { expectedErrorName: "PrismaClientKnownRequestError" }
    );
  }),
  "GET /api/v1/venues/by-slug/:slug": broken("item-3", async (ctx) => {
    expectBroken(
      await asAdmin(ctx, { method: "GET", url: `/api/v1/venues/by-slug/${ctx.venueA.slug}` }),
      "get venue by slug",
      ctx
    );
  }),
  "GET /api/v1/venues/:id": brokenEntity(
    "item-5",
    "GET",
    (ctx) => `/api/v1/venues/${ctx.venueA.id}`
  ),
  "PATCH /api/v1/venues/:id": brokenEntity(
    "item-5",
    "PATCH",
    (ctx) => `/api/v1/venues/${ctx.venueA.id}`,
    { name: "renamed" }
  ),
  // venueB, not venueA: this route is expected to stay broken, but using the
  // venue nothing else in the sweep depends on keeps the blast radius of a
  // surprise fix (a DELETE that actually runs) contained to this one entry.
  "DELETE /api/v1/venues/:id": brokenEntity(
    "item-5",
    "DELETE",
    (ctx) => `/api/v1/venues/${ctx.venueB.id}`
  ),
  "GET /api/v1/venues/:id/table-statuses": brokenEntity(
    "item-5",
    "GET",
    (ctx) => `/api/v1/venues/${ctx.venueA.id}/table-statuses`
  ),
};

/**
 * Availability has NO `requireVenueAccess` at all (any authenticated caller
 * may check any venue's availability, by design) — its `:venueId` PARAM key
 * happens to match `venueIdFromParams`'s expected name, so the GLOBAL
 * preHandler resolves it correctly with no entity lookup. Genuinely "ok" for
 * every caller, including a member on venue B — that is not a bug here.
 */
const availabilityFixtures: Record<string, RouteFixture> = {
  "GET /api/v1/availability/:venueId": ok(async (ctx) => {
    const url = (venueId: string) => `/api/v1/availability/${venueId}?date=2026-10-01&partySize=2`;
    expectOk(await asAdmin(ctx, { method: "GET", url: url(ctx.venueA.id) }), "admin venue A");
    expectOk(
      await asMember(ctx, { method: "GET", url: url(ctx.venueB.id) }),
      "member venue B (open route)"
    );
  }),
  "GET /api/v1/availability/:venueId/dates": ok(async (ctx) => {
    const url = (venueId: string) =>
      `/api/v1/availability/${venueId}/dates?startDate=2026-10-01&endDate=2026-10-07&partySize=2`;
    expectOk(await asAdmin(ctx, { method: "GET", url: url(ctx.venueA.id) }), "admin venue A");
    expectOk(
      await asMember(ctx, { method: "GET", url: url(ctx.venueB.id) }),
      "member venue B (open route)"
    );
  }),
};

/** A minimal valid `TableShapeMetadata` for the positions/assign fixtures below. */
const DISPOSABLE_SHAPE = { x: 0, y: 0, width: 80, height: 80, shape: "rectangle" as const };

/**
 * Floor plans. `GET /` is the sweep's SECOND mixed case: with `?venueId=`
 * the global preHandler resolves context and both `list`/`listForMember`
 * run scoped (ok); without it, `listForMember` (and, for an admin, `list`
 * itself) is an unscoped `floorPlan.findMany` — item 1's third bullet.
 * Every other route here was item 2 (`venueIdFromEntity` on the floor
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
  }),
  "GET /api/v1/reservations/:id": brokenEntity(
    "item-2",
    "GET",
    (ctx) => `/api/v1/reservations/${ctx.reservationA}`
  ),
  "PATCH /api/v1/reservations/:id": brokenEntity(
    "item-2",
    "PATCH",
    (ctx) => `/api/v1/reservations/${ctx.reservationA}`,
    { notes: "sweep" }
  ),
  "DELETE /api/v1/reservations/:id": brokenEntity(
    "item-2",
    "DELETE",
    (ctx) => `/api/v1/reservations/${ctx.reservationB}`
  ),
  "POST /api/v1/reservations": ok(async (ctx) => {
    const res = await asAdmin(ctx, {
      method: "POST",
      url: "/api/v1/reservations",
      payload: {
        date: "2026-10-06",
        startTime: "2026-10-06T18:00:00Z",
        endTime: "2026-10-06T20:00:00Z",
        partySize: 2,
        tableId: ctx.tableA,
        venueId: ctx.venueA.id,
        guestName: "RLS Sweep Guest",
        guestEmail: `rls-sweep-create-${randomUUID()}@example.com`,
      },
    });
    expectOk(res, "create reservation (body-scoped, open route)");
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
  "PUT /api/v1/waitlist/:id/notify": okEntityMutation(
    createDisposableWaitlistEntry,
    (id) => ({ method: "PUT", url: `/api/v1/waitlist/${id}/notify` }),
    (ctx) => ctx.waitlistB
  ),
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
    createDisposableWaitlistEntry,
    (id) => ({ method: "PUT", url: `/api/v1/waitlist/${id}/expire` }),
    (ctx) => ctx.waitlistB
  ),
};

const briefingFixtures: Record<string, RouteFixture> = {
  "GET /api/v1/briefing": okScopedByQuery("/api/v1/briefing", "&date=2026-10-01"),
};

const bookingMetricsFixtures: Record<string, RouteFixture> = {
  "GET /api/v1/reservations/metrics/daily": okScopedByQuery(
    "/api/v1/reservations/metrics/daily",
    "&date=2026-10-01"
  ),
};

/**
 * Deposits (ADR-026 §3.2/§3.3 item 6): `requireAdmin` only, addressed by an
 * opaque deposit/reservation id — every route resolves its venue via
 * `resolveReservationVenueId`'s own unscoped `reservation.findUnique`.
 * `§3.2` resolves the *authorization* gap (#5382); it does not clear these
 * for the FORCE flip, per its own corrected blockquote.
 */
const depositFixtures: Record<string, RouteFixture> = {
  "POST /api/v1/deposits": broken("item-6", async (ctx) => {
    expectBroken(
      await asAdmin(ctx, {
        method: "POST",
        url: "/api/v1/deposits",
        payload: { reservationId: ctx.reservationB, amountCents: 1000 },
      }),
      "create deposit",
      ctx
    );
  }),
  "GET /api/v1/deposits": brokenEntity(
    "item-6",
    "GET",
    (ctx) => `/api/v1/deposits?reservationId=${ctx.reservationA}`
  ),
  "GET /api/v1/deposits/:id": brokenEntity(
    "item-6",
    "GET",
    (ctx) => `/api/v1/deposits/${ctx.depositA}`
  ),
  "POST /api/v1/deposits/:id/capture": brokenEntity(
    "item-6",
    "POST",
    (ctx) => `/api/v1/deposits/${ctx.depositA}/capture`
  ),
  "POST /api/v1/deposits/:id/refund": brokenEntity(
    "item-6",
    "POST",
    (ctx) => `/api/v1/deposits/${ctx.depositA}/refund`
  ),
  "POST /api/v1/deposits/:id/forfeit": brokenEntity(
    "item-6",
    "POST",
    (ctx) => `/api/v1/deposits/${ctx.depositA}/forfeit`
  ),
};

export const FIXTURES: Record<string, RouteFixture> = {
  ...notRlsFixtures,
  ...tableFixtures,
  ...venueFixtures,
  ...availabilityFixtures,
  ...floorPlanFixtures,
  ...guestFixtures,
  ...reservationFixtures,
  ...waitlistFixtures,
  ...briefingFixtures,
  ...bookingMetricsFixtures,
  ...depositFixtures,
};
