---
stage: architect
run: maintenance:venue-scoped-routes
date: 2026-10-05
ux: not-applicable — maintenance run, no UI surface
assumptions:
  - "Inputs are defect.md (condition brief) and autorun-brief.md. There is no prd.md, because a maintenance run has none. The 'requirements' traced at the end are the target-state bullets in defect.md § Defect plus the required properties in the Architect dispatch."
  - "Line numbers were taken on branch refactor/venue-scoped-routes after rebasing onto origin/main 96cc7b478, which includes run #1 PR3 (#6061). The full route inventory (96 routes, of which 70 are staff and 16 public/token) came from a read-only subagent sweep and was spot-checked against the files cited below."
  - "Three interface shapes were designed in parallel by subagents (minimal handler wrapper / common-caller spread / registerEndpoint-native route metadata), each checked against the real call sites. The chosen shape is the minimal wrapper with two parts borrowed from the others. See Decisions."
  - "No authorization behaviour changes during migration (skill default: behaviour-preserving refactor). Every status code and problem `detail` string that a migrated route returns today is kept byte-for-byte. That covers the admin 400 'venueId is required' on direct-source routes, the non-admin 403 on unresolvable venue, the admin 404 on missing entity, and the owner-route 401 when the caller has no verified email. Every behaviour change in this run is confined to the security rulings under `needs-confirmation`, and those land in their own PR."
  - "The ADR-020 decision code is reused, not rewritten. Membership goes through `requireVenueAccess(lookup, () => venueId)` and ownership through `requireOwnershipOrAdmin(() => ownerOf(entity), resolveCurrentUserEmail)`, both invoked by the module per request. @mbe/auth and its tests are unchanged except for the separately planned demo bypass (live-demo-venue)."
  - "The completeness gate is a local unit test, not a boot-time throw. A missing declaration must fail CI and local `pnpm test`. It must never crash a production boot."
  - "Public slug, manage-token, unsubscribe and webhook routes (inventory rows 71-86, plus `GET /api/v1/venues/by-slug/:slug`) are not migrated. They are outside the brief's '42 venue routes'. They already set context explicitly with `runWithVenueContext`, and their authority is a slug or token, not membership. They are listed in the coverage test's UNSCOPED map with a reason, so the demo work can see them."
  - "Two public-route defects surfaced by the inventory are recorded as seeds, not fixed: `DELETE /public/v1/venues/:slug/holds/:holdId` ignores its slug (public-holds.ts:150-167), and `POST /public/v1/venues/:slug/reservations` calls confirmHold without venueId, so a hold from another venue is not rejected against the slug (public-reservations.ts:148). Out of scope per the brief."
  - "Suspected, not verified: the booking widget's slot fetch calls the AUTHENTICATED `GET /api/v1/availability/:venueId` (apps/hospitality/src/components/booking-widget/useBookingFlow.ts:444 via packages/api-client/src/availability.ts:33). It is rendered on the anonymous PublicBookingPage (apps/hospitality/src/main.tsx:127-132), so it may already be 401ing in prod. Recorded as a seed for Verify to probe. It bears on the availability ruling but does not block it."
  - "ADR handling: no new ADR. PR 6 adds dated amendments to ADR-026 (the part-6 app-wide hook is retired; venue context comes from the route's declaration) and to ADR-020 § requireVenueAccess (call-site convention: declared through `venueScoped`; the decision matrix is unchanged). The decision matrices do not move, so the ADR bar (hard to reverse plus surprising plus real trade-off) is not met for a new record."
  - "PR plan and test ordering are included here because the Architect dispatch asked for them explicitly. Decompose turns them into breakdown.md work items and owns the final sequencing."
  - "Out of scope and unchanged: RLS FORCE (#5369); users/agent services; the `demo` role (only the hook point is designed); POST /api/v1/reservations, which is fixed separately in a security PR. The backlog seed docs/backlog.md:153 (caller-supplied guestId on holds confirm) is not absorbed. The holds ruling below scopes the route to a venue, but guestId-to-venue consistency stays the seed's own fix."
needs-confirmation:
  - "AVAILABILITY GET /api/v1/availability/:venueId and /:venueId/dates (availability.ts:78-85, :164-171; requireAuth only). Recommended: `member` (params source). Reasons: it is an /api/v1 staff surface; the public data has a slug route (/public/v1/venues/:slug/availability); the agent tool forwards the staff caller's own token (services/agent/src/routes/gen-agent.ts:29-34), so staff keep access to their own venues. Behaviour change: a signed-in diner JWT goes from 200 to 403 for any venue. Anonymous callers already 401, so the widget path is unchanged (see the booking-widget suspicion in assumptions). Safe default if unconfirmed: `member`. Alternative: `authenticated` (RLS context only, today's behaviour)."
  - "HOLDS POST /api/v1/holds (holds.ts:101-107; requireAuth only, body venueId). Recommended: `member` (body source). Reasons: the file's own header calls this the staff surface since the widget moved to public-holds (holds.ts:80-89), and without a check any authenticated identity can block inventory at any venue with no per-IP cap. Safe default: `member`."
  - "HOLDS GET /api/v1/holds/:id (holds.ts:161-210; publicRateLimitHook + requireAuth, no session check). Recommended: `member` via the hold resolver (`resolve: hold.venueId`; reservation_hold has no RLS policy). The same ruling covers DELETE /:id and POST /:id/confirm (holds.ts:211-370), which keep their x-session-id check on top. Reason: a staff surface should not let any authenticated identity read or act on any venue's holds by id. Side effect: confirmHold gains venue context (closes the sweep-discovered FORCE break, fixtures-public.ts:434). Missing hold: 404 for admin, 403 for non-admin, the same existence hiding as entity routes. Today GET returns 404 to everyone, so this is a status change for non-admins probing missing ids. Safe default: `member`."
  - "EVENTS POST /api/v1/events/test (events.ts:181-205; NODE_ENV !== production only, NO preHandler at all). Recommended: add requireAuth + `member` (body source). It stays dev-only. Reason: non-prod deploys (docker-compose `development`) let anyone push arbitrary SSE events to any venue. Alternative: delete the route. tools/route-contract/src/fastify-owners.ts:111 lists it and would need the same edit. Safe default: requireAuth + `member`."
  - "POST /api/v1/reservations — NOT a ruling here: fixed separately (security PR, requireAuth + requireVenueAccess(venueIdFromBody)). This design only migrates it to `venueScoped({ venue: 'body' })` after that PR merges, and deletes `isVenueMember` (reservations.ts:83-91)."
---

# Architecture: declare a route's venue scope once — authorize and set RLS context together

## Approach

Add one module, `services/reservations/src/routes/venue-scope.ts`. Its single export, `venueScoped(spec, handler)`, wraps a route handler.

A route declares where its venue comes from (`"query" | "body" | "params"`, an `entity(kind, key)`, or a `resolve` escape hatch for tables with no RLS policy) and who may enter (`member` by default, `authenticated`, or `owner`).

Per request, the wrapper does the following in order:

1. Resolves the venue once.
2. Runs the existing ADR-020 decision (`requireVenueAccess`, or `requireOwnershipOrAdmin` for owner routes) against that venue.
3. Calls the single demo-identity hook.
4. Runs the optional entity `load` and the handler inside `runWithVenueContext(venueId, …)`, which is ALS `run`.
5. Hands the handler a typed `{ venueId, entity, isAdmin }`.

The wrapper returns an ordinary Fastify handler. That makes it fit `fastify.route` and `registerEndpoint` alike, with no change to `@mbe/service-bootstrap`, and every `fastify.transitions.*` call inside it inherits the venue context.

A symbol stamped on the returned handler feeds an `onRoute` registry. A local, DB-free coverage test uses the registry to prove every `/api/v1` route is declared (or listed unscoped with a reason) and to run the RLS sweep's two-way fixture completeness without Postgres.

Once every venue-addressed route declares its scope, the app-wide caller-input hook (`app.ts:269`) is narrowed and then deleted, and `enterWith` leaves the codebase.

**Why this shape.** Venue authz and venue RLS context are one fact, "this request acts on venue X", read twice today by modules that never share an answer. A handler wrapper is the only place in Fastify where:

- the post-`await` venue id can scope the rest of the request (`enterWith` after an `await` is one request late, measured: `middleware/venue-context.ts:112-132`);
- the loaded entity can be typed for the handler.

## Components

### `venueScoped` — `services/reservations/src/routes/venue-scope.ts` (new, policy)

- **Responsibility:** for one route, turn a declaration into "authorized, in context, entity loaded" or a standard problem reply. It owns ordering, the single resolve, and context. It does not own the membership or ownership decision.
- **Collaborators:**
  - `resolveVenueId` (`services/resolve-venue.ts:46-55`, SECURITY DEFINER);
  - `request.server.venueMembershipLookup` (`app.ts:182-184`, already injectable through `buildApp({ venueMembershipLookup })`);
  - `requireVenueAccess` / `requireOwnershipOrAdmin` (`packages/auth/src/fastify/authz.ts:78-120`, `ownership.ts:85-124`), invoked, not copied;
  - `runWithVenueContext` (`services/venue-context-store.ts:57-59`).
- **Deletion test:** without it, the 42 `requireVenueAccess` sites, 29 `loadInVenueContext` calls, 22 route `runWithVenueContext` calls and 8 bespoke resolvers reappear across 10 route files, which is today's state. It earns its keep.

### `admitIdentity` — private function in `venue-scope.ts` (new, the demo hook)

- **Responsibility:** the single place a caller identity is confined to a resolved venue. It is called once per scoped request, after the venue resolves and before membership or load, with `(user, venueId, request.method, routeKey)`. It returns `null` (admit) or a `ProblemDetails`.
- **Today:** always `null`. Nothing demo-related is built.
- **Future live-demo-venue fit (R-S1/R-S2):** "demo identity ⇒ venueId must equal the demo venue" and "deny methods not on the demo allowlist" become two branches here. This covers entity-addressed routes too: the live-demo architecture's step 2 (`resolveGlobalVenueId`, which only sees query/body/params) misses them and leans on membership alone. Unscoped routes are visible to the demo work through the coverage registry's UNSCOPED map, which its default-deny allowlist consumes.

### Venue-scope registry — `onRoute` hook in `buildApp` (new, detail)

- **Responsibility:** record `{method, url, descriptor | null}` for every route. `descriptor` is read from the symbol `venueScoped` stamps on its handler, e.g. `"entity:guest@params.id/member"`.
- **Placement:** installed in `app.ts` before the first `fastify.register` (`app.ts:272`). Child plugins inherit the hook, which answers the "an onRoute hook sees nothing" note at `rls-route-sweep.fixtures.ts:12-22` (that note is true only for hooks added from outside `buildApp`). It is exposed as a `venueScopes` decoration that is read-only.
- **Collaborators:** the coverage test; the narrowed global hook (PR 6, phase 2).

### Local coverage test — `services/reservations/src/routes/venue-scope-coverage.test.ts` (new)

- **Responsibility:** with no DB, do three things:
  1. Every `/api/v1/*` route (HEAD filtered out, as at `rls-route-sweep.integration.test.ts:431-434`) is stamped or appears in an `UNSCOPED_ROUTES` map with a non-empty reason. The reasons are `cross-venue fan-out`, `venue-create`, `venue-group (no RLS)`, `public slug`, `user-scoped (/me)`, and `pending-migration` (allowed only until PR 6).
  2. The two-way FIXTURES completeness checks move here from `rls-route-sweep.integration.test.ts:427-454` unchanged. They read only `printRoutes` plus fixture keys. The fixture modules import vitest, crypto, fastify types and stripe, and connect to nothing at import.
  3. Each FIXTURES entry for a stamped route has the matching kind.
- **How:** `buildApp` with the mocked database used by `app-venue-context.test.ts:34-74`.
- **Collaborators:** the registry, `rls-route-sweep.fixtures*.ts`.

### Existing pieces, changed

- **`routes/venue-access.ts`:**
  - `venueIdFromEntity`, `loadInVenueContext` and the 8 bespoke resolvers are deleted as their routes migrate.
  - `venueIdFromQuery/Body/Params` live until the global hook is deleted (PR 6), then go.
- **`app.ts:85-86,269` global hook:** keep, then narrow, then delete. See Interfaces § Global hook lifecycle.
- **`middleware/venue-context.ts:149-172` `venueContextPreHandler`** and **`venue-context-store.ts:33-35` `enterVenueContext`:** deleted in PR 6. `setVenueContext`, `runWithVenueContext`, `getCurrentVenueId` and the venue-scoped Prisma proxy stay.
- **`reservations.ts:69-74` `requireReservationOwnerOrAdmin`:** deleted once the 3 owner routes migrate. `resolveCurrentUserEmail` (`reservation-owner.ts`) stays and becomes the owner-mode caller-identity input.
- **`transitions/index.ts:13`:** the doc sentence names `venueScoped` as the way callers satisfy "run inside the caller's venue context". No code change.
- **`.claude/skills/new-service-route/SKILL.md`, `services/reservations/CLAUDE.md`:** rewritten (see Docs rewrite).

## Data model

No schema change and no migration.

The only "model" is the per-request scope value, which is immutable and built once per request:

```ts
interface VenueScope<E> {
  readonly venueId: string;
  readonly entity: E;
  readonly isAdmin: boolean;
}
```

Access patterns served, per request, and the queries each costs:

| Route shape                         | Today (non-admin)                                                                        | After                                                              |
| ----------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| direct venueId (query/body/params)  | 0 resolves + 1 membership                                                                | same                                                               |
| entity (22 routes + 3 `venues/:id`) | 2 resolves (guard `venueIdFromEntity`, then `loadInVenueContext`) + 1 membership         | **1 resolve** + 1 membership                                       |
| owner (3 reservation `/:id`)        | 2 resolves + 2 loads (guard LIVC, handler resolve+getById, `reservations.ts:72,548-556`) | **1 resolve + 1 load**                                             |
| admin entity                        | 1 resolve (handler)                                                                      | 1 resolve (in the wrapper; the membership lookup is still skipped) |

**Consistency:** membership is read per request, the same query as today (`venueMembership`, no RLS policy). ADR-020's instant revocation holds. The venue resolve and the handler's reads are separate statements, exactly as today. An entity deleted between the resolve and `load` yields 404 to an authorized caller (see failure modes).

## Interfaces & contracts

### `venueScoped(spec, handler)`

```ts
type VenueSource<RG, E> =
  | "query" | "body" | "params"                              // reads `venueId`
  | { readonly from: "query" | "body" | "params"; readonly field: string } // other key name, e.g. venues `:id`
  | { readonly entity: EntityKind;                           // resolve-venue.ts:10-19 allowlist
      readonly key: (req: FastifyRequest<RG>) => unknown;
      readonly load?: (key: string) => Promise<E | null>;    // runs INSIDE runWithVenueContext
      readonly notFound: string }                            // 404 detail, today's exact text
  | { readonly resolve: (req: FastifyRequest<RG>) => Promise<string | null>; // escape hatch
      readonly label: string; readonly notFound: string };

type VenueAccess<E> =
  | "member"                                                 // default: ADR-020 requireVenueAccess
  | "authenticated"                                          // RLS context only; needs requireAuth before it
  | { readonly owner: (entity: E) => string | null };        // requireOwnershipOrAdmin(owner, resolveCurrentUserEmail)

export function venueScoped<RG extends RouteGenericInterface, E = undefined>(
  spec: { readonly venue: VenueSource<RG, E>; readonly access?: VenueAccess<E> },
  handler: (req: FastifyRequest<RG>, reply: FastifyReply<…, RG>, scope: VenueScope<E>) => unknown,
): RouteHandlerMethod<…, RG>;   // carries a VENUE_SCOPE symbol → descriptor string
```

**Input:**

- the declaration;
- `request.user` (set by `requireAuth`, which stays in the route's own `preHandler`);
- `request.server.venueMembershipLookup`.

**Output:** the handler's return value, with these guarantees:

- `getCurrentVenueId() === scope.venueId` for every `await` inside `load` and the handler, including transitions and the fire-and-forget effects they start;
- `scope.entity` is non-null whenever `load` is declared.

**Order (contract, test-pinned):**

1. Admin check (`hasPermission(user, "admin")`).
2. Resolve: direct is synchronous; `entity` is one `resolveVenueId`; `resolve` is the callback.
3. Null handling.
4. `admitIdentity`.
5. Membership or ownership decision. If the guard sent a reply, stop.
6. `runWithVenueContext(venueId, load → handler)`.

**Failure modes.** Each row is exactly today's status and `detail`.

| Case                                       | member                                                                   | owner                                                                                         | authenticated     |
| ------------------------------------------ | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ----------------- |
| no `request.user`                          | 401 "Authentication required" (from the reused guard)                    | as `requireOwnershipOrAdmin` today                                                            | 401 (requireAuth) |
| direct key missing, non-admin              | 403 "You do not have access to this venue"                               | n/a                                                                                           | 400               |
| direct key missing, admin                  | 400 "venueId is required" (today's handler text, e.g. `guests.ts:40-44`) | n/a                                                                                           | 400               |
| entity unresolvable, non-admin             | 403 (existence hidden)                                                   | ownership guard with owner `null` → 403, or 401 if no verified email (`ownership.ts:107-118`) | 404               |
| entity unresolvable, admin                 | 404 `notFound`                                                           | 404                                                                                           | 404               |
| non-member / non-owner                     | 403                                                                      | 403                                                                                           | n/a               |
| `load` → null after resolve (race/delete)  | 404 `notFound`                                                           | 404                                                                                           | 404               |
| `resolveVenueId` / lookup throws (DB down) | propagates → 500 via `app-error-handler`; fails closed, never admits     | same                                                                                          | same              |

- **Retry:** safe for GETs. Writes behave exactly as today, because the wrapper adds no write.
- **Timeout:** none of its own. Prisma pool timeouts apply as they do today.
- **Envelope:** `createProblemDetails(status, titleForStatus(status), detail)` (`packages/types/src/api.ts:50-75`, ADR-002). The 403 and 401 come out of the reused guards, so their bytes cannot drift.

**What callers must know (not in the signature):**

- `requireAuth` still goes in the route's `preHandler`, along with any rate-limit hook (e.g. `holds.ts:173` `[publicRateLimitHook, requireAuth]`).
- `resolve` is for tables with no RLS policy (holds), or for composites built from `resolveVenueId` calls. It must never read an RLS table through the scoped client, because that resolves `null` under FORCE.
- A second-entity integrity check stays in the handler, e.g. `floor-plans.ts:311` tables vs. floor plan, `tables.ts:293`.

### Call-site fit (checked against real code)

- **`registerEndpoint` (guests, `guests.ts:28-322`):**
  - `preHandler: requireAuth`, `handler: venueScoped({ venue: { entity: "guest", key: r => r.params.id, load: id => guestService.getById(id), notFound: "Guest not found" } }, async (_q, _r, { entity }) => ({ data: entity }))`.
  - `register-endpoint.ts:117` forwards the handler verbatim, and the stamp survives because it is the same function object.
  - The update, delete and notes handlers declare no `load` and call the service with `scope.venueId` already in context.
- **Body entity (`floor-plans.ts:270-340`):** `{ entity: "floor_plan", key: r => r.body.floorPlanId, load }`. The hand-rolled `{kind:"not-found"|"cross-venue"|"ok"}` union at `:300-338` collapses into a plain handler.
- **`:tableId` param (`floor-plans.ts:342-410`):** `{ entity: "table", key: r => r.params.tableId }`, no load. This keeps the #5008 pinning to the mutated table.
- **Venue self-routes (`venues.ts:420-560,729-800`):** `{ from: "params", field: "id" }`. The non-admin `venueGroupId` rule (`:795`) uses `scope.isAdmin` in the handler.
- **Reservations list (`reservations.ts:53-64,129-145`):** `{ resolve: r => q.venueId ?? (q.guestId ? resolveVenueId("guest", q.guestId) : null), label: "venueId|guest", notFound }`. This also fixes the unscoped `guestService.getById` that the sweep marks broken (`rls-route-sweep.fixtures.ts:1060-1063`). The resolved venue is identical, so behaviour does not change.
- **Owner routes (`reservations.ts:297-345,471-680,684-760`):** `{ entity: "reservation", key, load: getById, notFound: "Reservation not found" }` with `access: { owner: r => r.guestEmail }`.
  - The handler's `resolveVenueId` + `runWithVenueContext` + second `getById` + 404 (`:548-562`, `:727-740`) go away.
  - `request.authorization.isAdmin` (`:568,:746`) becomes `scope.isAdmin`.
  - `noShow`/`updateByStaff`/`cancel` already run in context.
- **Admin-only with venue (`deposits.ts:82-360`, `deposit-transition-handler.ts:50`, `venues.ts:837-890`):** `preHandler: [requireAuth, requireAdmin]` plus `venueScoped({ venue: … })`. An admin always passes `member`, so no extra mode is needed.
  - `GET /deposits` with reservationId-or-venueId uses `resolve`.
  - The hand resolution at `deposits.ts:107-121,186-202` goes away.
- **Transitions:** all three caller styles become one.
  - Explicit `runWithVenueContext` (`reservations.ts:548-555`) is deleted.
  - Implicit via the global hook (`reservations.ts:286` createWalkIn) becomes `venue: "body"`.
  - No context (`holds.ts:339` confirmHold) becomes the holds `resolve` source, subject to the holds ruling.
- **`POST /api/v1/reservations`:** fixed separately in a security PR. After it merges, `preHandler: requireAuth`, `venueScoped({ venue: "body" }, …)`, and `isVenueMember` (`:83-91`, `:424-428`) is deleted.
- **SSE `events.ts:89-160`:** `venue: "query"`. Only setup runs inside `run`; emitter callbacks do no DB reads.
- **Not migrated:** they carry UNSCOPED reasons and keep explicit context.
  - Cross-venue lists: `floor-plans.ts:54-90`, `venues.ts:364-415`.
  - `GET /reservations/me` (`reservations.ts:181`).
  - Venue create (`venues.ts:630-700`).
  - Venue groups (`venues.ts:114-330`).
  - `GET /api/v1/venues/by-slug/:slug` (`venues.ts:570`).
  - All `/public/v1/*` routes.

### Global hook lifecycle (`app.ts:85-86,269`)

1. **Keep (PRs 1-5).** Inside a wrapped handler, `run` shadows whatever the hook entered (`venue-context-store.test.ts` "shadows an already-entered null context" already proves this). The only preHandler-phase queries before the wrapper are the membership lookup and SECURITY DEFINER resolves, which touch no RLS table. Unmigrated routes keep today's behaviour.
2. **Narrow (PR 6, step 1).** `resolveGlobalVenueId` returns `null` for any route the registry marks scoped, so caller-supplied venue ids never set context before authorization.
3. **Delete (PR 6, step 2).** This happens once the coverage test has no `pending-migration` entries. Delete the hook, `resolveGlobalVenueId`, `venueContextPreHandler` (+ `isThenable`), `enterVenueContext`, and `venueIdFromQuery/Body/Params`.
   - Remaining context sources: `venueScoped`, and explicit `runWithVenueContext` in public, token, webhook, cron and job paths.
   - Guard: the CI FORCE sweep. A route wrongly left UNSCOPED would lose implicit context, and only the FORCE run sees that, so PR 6 waits for a green `rls-integration` job.

### Coverage registry

- **Input:** `onRoute` route options.
- **Output:** `ReadonlyMap<"METHOD url", descriptor | null>`.
- **Failure modes:** if the hook is installed after `app.ts:272`, the registry is empty. The coverage test asserts both a non-empty registry and registry-vs-`printRoutes` equality, so a misplaced hook fails locally.

## Stack & dependencies

- **Fastify 5 `onRoute` hook plus handler wrapping.** These are existing primitives, and `services/agent/src/routes/gen-route-factory.ts:34-60` is the in-repo precedent for a route factory.
- **`AsyncLocalStorage.run`, through the existing `runWithVenueContext`.** It is already proven safe after `await` (`venue-context-store.ts:41-59`). No `enterWith` is added.
- **No new dependency and no package change.** `@mbe/service-bootstrap` and `@mbe/auth` are untouched by this run.
- **Typing risk (spike first).** `RG` must infer from the contextual handler slot (`fastify.post<RG>(…, opts, venueScoped(…))` and `RegisterEndpointOptions<D>["handler"]`). PR 1 opens with an `expectTypeOf` test. Fallback if inference fails: explicit `venueScoped<RG, E>(…)`. Last resort: curried `venueScoped(spec)(handler)`, which keeps one export.

## Decisions & alternatives

- **Handler wrapper (`venueScoped`) over a preHandler plus a mutable ALS cell.** A cell entered synchronously by the global hook and mutated after the `await` would survive the late-`enterWith` bug. It lost because it couples correctness to the hook we intend to delete, changes the ALS store type for every reader (`venue-scoped-prisma.ts`, `job-worker.ts`, `lapsed-guest-cron.ts`, …), and cannot type the entity.
- **Wrapper returning a handler (minimal design) over a `{preHandler, handler}` spread with a `delegated` escape hatch (common-caller design).**
  - The spread kept owner routes on two resolves (their guard still loads) and needed a `pre` array and a boot check for empty `pre`.
  - Folding ownership in as an access mode that calls `requireOwnershipOrAdmin` gives one resolve with one export.
  - Borrowed from it: string shorthands `"query" | "body" | "params"`, `notFound` text in the declaration, and `access: "admin"` dropped in favour of composing `requireAdmin`.
- **Call-site declaration over route metadata in `config.venueScope` enforced by an `onRoute` plugin (registerEndpoint-native design).**
  - Metadata makes the route's behaviour invisible at the call site (a guard is appended and the handler swapped elsewhere).
  - It loses the entity type through `config` (it needs a runtime accessor that throws).
  - It needs a `config` passthrough in the shared `registerEndpoint`.
  - Its install-order hazard silently passes when the plugin is installed late.
  - Borrowed from it: the `onRoute` registry, the pure-decision test seam, moving the completeness tests out of `skipIf`, and the UNSCOPED-with-reason idea.
- **Coverage as a local test over a boot-time throw on undeclared routes.** A boot throw is stronger, but a declaration slip would then crash a production deploy instead of failing CI. The test runs in every `pnpm test` and in CI's test job.
- **Reuse `requireVenueAccess` / `requireOwnershipOrAdmin` over re-implementing the matrix in the module.** One decision site per ADR-020 rule. The response bytes are the guards' own. The live-demo plan's admin-bypass change (`authz.ts:95` `!demo`) lands in one place.
- **Admins resolve the venue (needed for RLS) over skipping resolution as `authz.ts:96-98` does.** Net query count is unchanged, because today `loadInVenueContext` resolves anyway.
- **`resolve` escape hatch over adding `reservation_hold` to `EntityKind`.** Holds have no RLS policy. Adding a kind means a migration to `app_resolve_venue_id`'s allowlist (`resolve-venue.ts:4-9`) for no FORCE benefit.
- **Security rulings in their own PR (PR 5) over folding each into its file's migration.** The only behaviour changes in the run are then reviewable alone and revertible alone.
- **Amend ADR-020 and ADR-026 over a new ADR.** The decision matrices are unchanged; only the declaration site and the part-6 hook move.

## ADRs

None created. PR 6 adds dated amendments to `docs/adr/ADR-026-postgres-rls-venue-backstop.md` (part-6 app-wide hook retired; context comes from `venueScoped`) and `docs/adr/ADR-020-hybrid-role-venue-authorization.md` § requireVenueAccess (declared through `venueScoped`; matrix unchanged).

## Test ordering

Mandatory per the brief: new interface tests first, deepen, old shallow tests deleted last, with each deleting PR stating where the coverage moved.

1. **The existing net (keep, untouched):**
   - the CI `rls-integration` job (`.github/workflows/ci.yml:697`, feeds `ci-gate`): the per-route FORCE runs of `rls-route-sweep.integration.test.ts`, `rls-isolation`, `rls-venue-resolution`, `rls-owner-enforcement`;
   - every per-route 403/404/400 test that exists today: `tables.test.ts` (#4865 block, :535-700), `guests.test.ts` (:668-760), `floor-plans.test.ts` (:353, :413, :702, :807), `venues.test.ts` (:640, :700, :1018, :1405), `reservations.test.ts` (owner :353-1682, guestId resolution :1857-1945, POST member gate :1968-2035), `events.integration.test.ts` (:241), `deposits.test.ts` (non-admin ~:700, ADR-026 context ~:798).

   These must pass unchanged through every migration PR. A failing one means behaviour moved.

2. **New first, before any route moves (PR 1):**
   - `routes/venue-scope.test.ts`, a bare `Fastify()` with injected fake membership lookup and `vi.mock("../services/resolve-venue.js")`:
     - every cell of the failure-mode table, per access mode;
     - `getCurrentVenueId()` equals the resolved venue inside `load` and after several `await`s in the handler;
     - two sequential requests to different venues each see their own, which is the one-request-late regression;
     - interleaved concurrent requests do not bleed;
     - `resolveVenueId` is called exactly once per request;
     - `load` is not called on deny;
     - `admitIdentity` is called once, with the resolved venue, before membership;
     - the stamp descriptor is present;
     - response bodies are byte-equal to `requireVenueAccess`'s.
   - `routes/venue-scope.types.test.ts`: the `expectTypeOf` inference spike for the `fastify.post<RG>` and `registerEndpoint` slots.
   - `routes/venue-scope-coverage.test.ts`: the registry and UNSCOPED map, with every current route listed (`pending-migration` where applicable), plus the two completeness tests moved verbatim from `rls-route-sweep.integration.test.ts:427-454`. The originals are deleted in the same PR; coverage moves rather than dies.
3. **Fill gaps before migrating those files.** `waitlist.test.ts`, `briefing.test.ts` and `booking-metrics.test.ts` have no non-member 403 test today. Add one route-level non-member 403 and one member 200 per file against current code, before the PR that migrates them.
4. **Security rulings (PR 5).** RED-first tests per ruling, e.g. a non-member gets 403 on `GET /api/v1/availability/:venueId`, then the declaration. Update the sweep fixtures' `"open route"` labels (`rls-route-sweep.fixtures.ts:842-857`) and the public fixture `POST /api/v1/holds/:id/confirm` (broken "sweep-discovered", `fixtures-public.ts:434`) to their new kinds.
5. **Die last (PR 6, after the hook is deleted).** Each one's coverage moves to the place named.

   | Test (file:describe)                                                                                                        | Count | Coverage moved to                                                                                         |
   | --------------------------------------------------------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------- |
   | `routes/venue-access.test.ts` `venueIdFromQuery` :24 / `venueIdFromBody` :68 / `venueIdFromParams` :112                     | 21    | `venue-scope.test.ts` direct-source cells (missing / non-string key)                                      |
   | `routes/venue-access.test.ts` `venueIdFromEntity` :156 / `loadInVenueContext` :189                                          | 5     | `venue-scope.test.ts` entity cells + ALS-in-`load` test                                                   |
   | `middleware/venue-context.test.ts` `venueContextPreHandler` :98 (sync :118, async :160)                                     | 6     | deleted with the hook; the hazard it guards no longer exists. `setVenueContext` describes (:24, :60) stay |
   | `app-venue-context.test.ts` "venue-context middleware wiring" :39 (:83, :104)                                               | 2     | `venue-scope.test.ts` sequential-requests + null-context tests                                            |
   | `services/venue-context-store.test.ts` `enterVenueContext` cases (`venue-context-store` :8)                                 | ≤4    | `runWithVenueContext` describe (:51) stays and covers the remaining API                                   |
   | `routes/reservation-owner.test.ts` cases for `requireReservationOwnerOrAdmin` wiring (keep `resolveCurrentUserEmail` cases) | of 8  | `venue-scope.test.ts` owner cells; `reservations.test.ts` owner 403s stay                                 |
   | `venue-access.ts` itself                                                                                                    | —     | file deleted                                                                                              |

## PR plan (input to Decompose)

Every PR stops before merge for Matt's review, per the brief: authorization code under ADR-020. Each PR rebases on origin/main first and leaves main green on its own.

1. **PR 1, `refactor(reservations): add venueScoped module and local scope coverage`.**
   - `venue-scope.ts`, the registry in `app.ts`, and the three new test files.
   - Completeness tests move out of `skipIf`.
   - No route changes, no behaviour change.
2. **PR 2, guests + waitlist + briefing + booking-metrics + events stream.** Gap tests first (step 3), then migrate. Covers the simple query/body/entity shapes, including the `registerEndpoint` caller.
3. **PR 3, tables + floor-plans + venues (`:id` routes, admin DELETE).** Covers the body-entity, `:tableId` and venue self-route shapes.
4. **PR 4, reservations (list, walk-in, 3 owner routes) + deposits + deposit-transition-handler.**
   - Delete `requireReservationOwnerOrAdmin`.
   - If the separate POST /api/v1/reservations security PR has merged, migrate it here and delete `isVenueMember`. Otherwise it waits for PR 6.
5. **PR 5, security rulings (`needs-confirmation`), as Matt confirms them.**
   - availability ×2, holds ×4 (POST, GET, DELETE, confirm), events/test.
   - Also: `services/reservations/CLAUDE.md:513,515` availability-auth claim, and `tools/route-contract/src/fastify-owners.ts:111` if events/test is deleted.
6. **PR 6, retire the global hook + docs.**
   - Narrow, then delete the hook and its helpers. The coverage test then forbids `pending-migration`.
   - The old tests die (table above).
   - ADR-020/026 amendments; `transitions/index.ts:13` doc.
   - The skill and CLAUDE.md rewrite (below).
   - Waits for a green CI `rls-integration` run on its head.

## Docs rewrite

- **`.claude/skills/new-service-route/SKILL.md`**, rewritten around the real shape:
  - `createProblemDetails(status, titleForStatus(status), detail)`, positional (`packages/types/src/api.ts:60-66`), replacing the object form at `:58`;
  - `{ data }` responses, replacing `{ success: true, data }` at `:68`;
  - events through `fastify.reservationEvents`, replacing the non-existent `fastify.sseBroadcaster` at `:67`;
  - `preHandler: requireAuth` (not `fastify.requireAuth`, `:20`);
  - a **venue scope** step: pick the `venueScoped` source and access, or add an UNSCOPED entry with a reason;
  - an **RLS sweep** step: add a FIXTURES entry in `rls-route-sweep.fixtures.ts`, and run `venue-scope-coverage.test.ts` locally;
  - `registerEndpoint` for routes with a `@mbe/types` endpoint definition.

  The checklist (`:84-94`) gains "venue scope declared or UNSCOPED with reason" and "sweep fixture added".

- **`services/reservations/CLAUDE.md`:**
  - `:513,515` "all `/api/v1/*` except `/api/v1/availability`" / "Unauthenticated: … `/api/v1/availability`" become today's truth: availability requires auth, plus whatever PR 5 rules. Fixed in PR 5.
  - `:305` path → `/api/v1/availability/:venueId`.
  - `:554` example `app.sseBroadcaster.on(...)` → `app.reservationEvents`.
  - A short "Venue scope" subsection pointing at `venueScoped`. Fixed in PR 6.

## Requirement trace

| Requirement (defect.md target state / dispatch)   | Where                                                                                                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Declare venue scope once                          | `venueScoped` spec                                                                                                                                      |
| ADR-020 per-request membership kept               | reused `requireVenueAccess`; membership read per request                                                                                                |
| ADR-026 RLS context set by the same module        | `runWithVenueContext` around load + handler                                                                                                             |
| One resolve per request                           | Order step 2; `venue-scope.test.ts` "exactly once"                                                                                                      |
| Loaded entity handed to handler                   | `load` → `scope.entity`                                                                                                                                 |
| Standard 403/404 envelope                         | failure-mode table; reused guards' bytes                                                                                                                |
| Fits `registerEndpoint` and `fastify.transitions` | Call-site fit                                                                                                                                           |
| Single demo hook, not built                       | `admitIdentity`                                                                                                                                         |
| Unchecked-venueId routes decided                  | `needs-confirmation` + PR 5                                                                                                                             |
| Local non-DB sweep completeness                   | `venue-scope-coverage.test.ts`                                                                                                                          |
| `/new-service-route` teaches the real shape       | Docs rewrite                                                                                                                                            |
| 7-8 inline checks                                 | `isVenueMember` deleted (PR 4/after the security PR); list filters stay UNSCOPED; cross-entity and public-consistency checks stay in handlers by design |
| Test ordering                                     | Test ordering                                                                                                                                           |

## Security rulings confirmed by Matt (2026-10-05)

- **`GET /api/v1/availability/:venueId` and `/:venueId/dates`: `member`.** Precondition: the public booking widget stops calling this route. It was calling it anonymously and getting 401 in production (verified live); a separate maintenance fix (PR #6077) moves the widget to `GET /public/v1/venues/:slug/availability`. PR 5 must not merge before #6077 is merged and deployed.
- **`POST /api/v1/holds` and `GET` / `DELETE` / `POST …/confirm` on `/api/v1/holds/:id`: `member`** of the hold's own venue. The session check stays on DELETE and confirm; `confirmHold` gains venue context; for non-admins an unknown hold returns 403, not 404.
- **`POST /api/v1/reservations`:** fixed separately as a security PR (#6072, merged and deployed; live probe returns 401). PR 4 moves it to `venueScoped({ venue: "body" })` and deletes `isVenueMember` if it remains.
- **Table/venue mismatch on reservation writes:** being fixed separately as a security PR (service-layer check before conflict detection). Not this run's scope.
