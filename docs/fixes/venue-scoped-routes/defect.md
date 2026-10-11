---
stage: capture
run: maintenance:venue-scoped-routes
date: 2026-10-05
re-entry: architect
origin: "/idea-to-prod:deepen review at fcd4be0a1 (2026-10-04), candidate #4; autorun brief docs/fixes/venue-scoped-routes/autorun-brief.md"
assumptions:
  - "Condition-brief variant (degraded, not broken), taken from the brief's own framing; filename stays defect.md per the capture skill."
  - "No tracker intake and no backlog seed claimed: the brief says 'Tracker: none' and the origin is a deepen review, not a seed. The related seed at docs/backlog.md:153 (holds confirm guestId) is noted under Notes, not claimed, because it is a separate defect, and whether to fold it in is Architect's call."
  - "Work items left out: re-entry is architect, so the capture skill's default hands the work items to architecture.md + breakdown.md."
  - "Counts were re-measured with grep over services/reservations/src/routes/*.ts, excluding *.test.ts. The method is stated next to each count. Where a brief count could not be reproduced exactly (literal titles, inline checks, staff fixtures), the measured number and its method are recorded and the gap is not explained away."
  - "In-flight check run with `gh pr list --state open --limit 50` on 2026-10-05. Outcome: nothing matches (details under Notes)."
---

# Condition: a route's venue scope is restated per route, and resolved up to three times per request

## Defect (or Condition)

**Degraded, not broken.** In `services/reservations`, venue authorization (ADR-020) and RLS venue context (ADR-026) are separate modules. Each resolves the same venue on its own, so every venue route restates both by hand. A third resolver, the app-wide RLS preHandler, runs before either of them. Nothing here is a known live leak today: every route that has `requireVenueAccess` still 403s non-members. The cost is three things:

- duplication: 43 hand-passed membership lookups, plus 29 + 24 manual RLS wrappers;
- divergence: 8 bespoke resolvers, ad-hoc inline checks, and 4 to 5 routes that take a venue id with no membership check at all, each needing a security decision;
- a scaffold skill that teaches an API that does not exist.

**Target state that ends the run:**

- A route declares its venue scope once (e.g. `venueScope: fromQuery | fromBody | fromParams | fromEntity("guest")`).
- One module does all of the following, in that order:
  - performs the ADR-020 per-request DB membership check (keep the check; only where it is declared moves);
  - sets the ADR-026 RLS context for the rest of the request;
  - hands the loaded entity to the handler;
  - replies with the standard 403/404 problem envelope.
- It must fit both new route shapes on main: `registerEndpoint` (guests, run #3) and `fastify.transitions.*` calls (run #1). See "Shapes the design must fit".
- It is the natural single hook for a future `demo` restriction (`feature:live-demo-venue` R-S1/R-S2), but demo logic is NOT built here.
- Each unchecked-venueId route has a recorded decision: intended, or defect fixed.
- The RLS route sweep's completeness check runs locally without a DB.
- `.claude/skills/new-service-route/SKILL.md` teaches the real shape.

## Reproduction / Evidence

Measured on the branch after rebasing onto `origin/main` @ `96cc7b478` (2026-10-05). Runs #1/#2/#3 have merged since the deepen review. All counts are over non-test files in `services/reservations/src/routes/` unless stated.

### Counts vs brief

| Item                                        | Brief (fcd4be0a1) | Measured now                 | Same at fcd4be0a1? | Method / note                                                                                                                                                                                                      |
| ------------------------------------------- | ----------------- | ---------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `fastify.venueMembershipLookup` hand-passed | 43                | **43**                       | yes                | `grep -F`. By file: guests 11, floor-plans 10, waitlist 7, tables 6, reservations 3, venues 3, briefing 1, booking-metrics 1, events 1                                                                             |
| `loadInVenueContext(`                       | 29                | **29**                       | yes                | All 29 are call sites (the declaration is `loadInVenueContext<T>(` at `venue-access.ts:74` and does not match): floor-plans 8, guests 5, waitlist 5, tables 4, venues 4, reservations 2, deposits 1                |
| `runWithVenueContext(`                      | 22                | **24** raw                   | yes (24)           | 24 includes `venue-access.ts:82` (inside `loadInVenueContext`) and `rls-route-sweep.fixtures-public.ts:633` (test fixture). 22 route call sites, which matches the brief. Brief's 22 is correct under that reading |
| Bespoke `VenueIdResolver`s                  | 8                 | **8**                        | yes                | floor-plans.ts:36,42,48; guests.ts:21; tables.ts:40; reservations.ts:53; venues.ts:48; waitlist.ts:21. Plus the 3 shared ones and the `venueIdFromEntity` factory in `venue-access.ts:14-58`                       |
| `createProblemDetails(` calls               | 130               | **130**                      | yes                | `grep -F`                                                                                                                                                                                                          |
| ...with a hand-typed literal title          | 98                | **117**                      | 117 at fcd4be0a1   | perl multi-line match on second argument being a string literal. Brief's 98 is **not reproduced** under this method at either commit. The method differs; the number has not moved                                 |
| Hand-built problem objects                  | 7                 | **7** title literals         | n/a                | `load-reservation-for-manage.ts:41,54,59,66,71`, `public-holds.ts:76`, `venues.ts:102`                                                                                                                             |
| Ad-hoc inline venue checks                  | 7                 | **8 candidates** (see below) | n/a                | The brief's list was not preserved, so it is re-enumerated from code                                                                                                                                               |
| RLS sweep staff fixtures / public fixtures  | 67 / 18           | **66 / 18**                  | 66 at fcd4be0a1    | `grep -E '^ +"(GET\|POST\|PATCH\|PUT\|DELETE) /'` minus the 17 `INFRA_ROUTES` entries (`rls-route-sweep.fixtures.ts:68-90`). Off by one from the brief at both commits; not chased                                 |
| Venue routes to migrate                     | 42                | not re-derived               | n/a                | Depends on Architect's definition of "venue route". The 43 lookup sites plus the entity routes are the measurable floor                                                                                            |

### Three resolution paths per request (claim confirmed, and a third path found)

1. **App-wide RLS preHandler.** `app.ts:83-84` `resolveGlobalVenueId = venueIdFromQuery ?? venueIdFromBody ?? venueIdFromParams`. It is registered at `app.ts:249` as `addHook("preHandler", venueContextPreHandler(...))`, which runs **before** each route's own `preHandler` array (comment `app.ts:238-248`). It sets RLS context from whatever `venueId` the caller sent, before any membership check. Entity-addressed routes are a no-op here.
2. **Authorization resolver.** `requireVenueAccess(fastify.venueMembershipLookup, resolver)` from `@mbe/auth/fastify`. It decides authorization only: `venue-access.ts:66-67` says "`requireVenueAccess`'s resolver only decides authorization; it never sets `app.venue_id` for the rest of the request."
3. **Handler-level RLS.** `loadInVenueContext(kind, key, load, fallback)` (`venue-access.ts:74-83`) calls `resolveVenueId` again and then `runWithVenueContext`. Entity routes therefore resolve the venue twice: once in `venueIdFromEntity` for authz (`venue-access.ts:49-58`), once in `loadInVenueContext`. Example: `guests.ts:107-112`.

### Ad-hoc inline venue checks (re-enumerated)

| Site                                    | What it does                                                                                                                     | Kind                                |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `reservations.ts:83-91` `isVenueMember` | Re-implements `requireVenueAccess` (anon → no, admin → yes, else lookup) for the optionalAuth create route. Called at `:424-428` | membership (duplicate of the guard) |
| `floor-plans.ts:84-87`                  | admin → `list`, else `listForMember(sub)`                                                                                        | membership-filtered list            |
| `venues.ts:412-415`                     | admin → `list`, else `listForMember(sub)`                                                                                        | membership-filtered list            |
| `venues.ts:795`                         | non-admin may not change `venueGroupId`                                                                                          | role check layered on membership    |
| `public-deposits.ts:100`                | `reservation.venueId !== policy.id` → reject                                                                                     | entity/venue consistency (public)   |
| `public-holds.ts:208`                   | `hold.venueId !== venueId \|\| hold.sessionId !== sessionId`                                                                     | entity/venue consistency (public)   |
| `floor-plans.ts:311`                    | tables must belong to the floor plan's venue                                                                                     | cross-entity integrity              |
| `tables.ts:293`                         | floor plan and table must share a venue                                                                                          | cross-entity integrity              |

### Unchecked-venueId routes: SECURITY DECISIONS, not decided here

Architect or Matt decides each one: intended, or defect. Capture records only the current behaviour and the risk.

| Route                                                     | Code (current)                                                                                                                                                                                            | Current behaviour                                                                                                                                  | Risk (capture's read, not a finding)                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/availability/:venueId` and `/:venueId/dates` | `availability.ts:78-85` and `:164-171`, `preHandler: requireAuth` only                                                                                                                                    | Any authenticated user gets slots for any venue id. The global hook sets RLS context to the caller-supplied id                                     | **Low.** Slot availability is already public per venue via `/public/v1/venues/:slug/availability`; the delta is enumeration by id. **Doc drift:** `services/reservations/CLAUDE.md:513,515` still says `/api/v1/availability` is unauthenticated; the code requires auth                                      |
| `POST /api/v1/holds`                                      | `holds.ts:101-107`, `preHandler: requireAuth`, route rateLimit 20/min                                                                                                                                     | Any authenticated user creates a slot hold at any `body.venueId`. RLS context comes from that body id                                              | **Medium.** Inventory blocking at venues the caller has no tie to. It has no per-IP active-hold cap, unlike the hardened public sibling (`public-holds.ts`, header comment `holds.ts:80-89`)                                                                                                                  |
| `POST /api/v1/reservations`                               | `reservations.ts:356-362`, `preHandler: optionalAuth`, rateLimit 20/min. `isVenueMember` gates only `guestId` / CRM linking (`:421-447`). Then `fastify.transitions.createByStaff(body, userId)` (`:454`) | **Anonymous** callers create a reservation at any `body.venueId`, through the _staff_ create transition. A non-member supplying `guestId` gets 403 | **Medium to high.** An unauthenticated write into any venue's book via the staff path, bypassing the public slug route's protections. Schema description says "Authentication is optional - guest info can be provided instead" (`:369-370`), so it may be intended for a legacy widget. Needs a caller audit |
| `POST /api/v1/events/test`                                | `events.ts:181-205`, registered only when `NODE_ENV !== "production"`, **no preHandler at all**                                                                                                           | Anyone emits an arbitrary SSE event to any venue's subscribers                                                                                     | **Low in prod:** Pulumi sets `NODE_ENV=production` (`infrastructure/pulumi/index.ts:106`, tested `index.test.ts:298`), and `node.Dockerfile:26` sets it too. **Real in any non-prod deploy** (docker-compose uses `development`)                                                                              |
| _(new since brief)_ `GET /api/v1/holds/:id`               | `holds.ts:161-210`, `[publicRateLimitHook, requireAuth]`                                                                                                                                                  | Any authenticated user reads any hold by id                                                                                                        | **Low.** Entity-addressed rather than venueId-addressed; cuid ids. Listed because the venue-scope design must say whether holds are venue-scoped                                                                                                                                                              |

Related, entity-addressed, session-scoped: `DELETE /holds/:id` and `POST /holds/:id/confirm` (`holds.ts:211-370`) are gated by `x-session-id`, not by venue. `confirmHold` (`:339`) runs with **no** venue context: the id is an entity id, so the global hook does nothing, and it creates a reservation. That is harmless while RLS is not FORCEd (#5369) but would fail under FORCE.

Deposits routes are `requireAdmin` (all-venue under ADR-020), so they need no membership check. They resolve the venue by hand (`deposits.ts:107-121`, `:186-202`).

### Shapes the design must fit

- **Guests after `registerEndpoint` (run #3, #6060).** All 11 guests endpoints now go through `registerEndpoint(fastify, guestsEndpoints.X, { docs, preHandler, handler })` (`packages/service-bootstrap/src/register-endpoint.ts:39-47,95-117`). Each still passes `preHandler: [requireAuth, requireVenueAccess(fastify.venueMembershipLookup, …)]` by hand (e.g. `guests.ts:37,107-109`). Entity endpoints still re-resolve in the handler via `loadInVenueContext` (`guests.ts:112,198,231,284,317`). So `registerEndpoint` is the obvious place for a `venueScope` option, but today it only forwards `preHandler` verbatim (`:116`). `guests.ts` is the only `registerEndpoint` caller in services.
- **`fastify.transitions` (run #1).** Decorated once at `app.ts:203-219`. `transitions/index.ts:13` says transitions "run inside the caller's venue context (ADR-026 `runWithVenueContext`)". So venue context is the caller's job, done three different ways today:
  - explicit `runWithVenueContext` around the call (`reservations.ts:555→593,640`; `cancel-reservation.ts:32→38`; `public-holds.ts:253→259`);
  - implicit, through the global body hook (`reservations.ts:286 createWalkIn`, `:454 createByStaff`);
  - none (`holds.ts:339 confirmHold`).

  A venue-scope module that sets context once before the handler would make all three uniform.

- **PR #6061** (run #1 PR3, draft) is still open on `refactor/transition-effects-pr3`. Implement must not start until it merges (brief START CONDITION).

### Other claims re-verified

- **RLS sweep net exists and is CI-only. Confirmed.**
  - `rls-route-sweep.integration.test.ts:427-445` has the drift guard (every registered route has a fixture) and `:447-454` the reverse check (no stale fixtures). Both use `app.printRoutes`.
  - The whole suite is `describe.skipIf(!DATABASE_URL)` (`:106`).
  - It runs in CI's `rls-integration` job (`.github/workflows/ci.yml:697`), which feeds `ci-gate` (`:1027,1068`). The two completeness tests need no DB themselves, but they sit inside the skipped `describe`.
- **Precedent. Confirmed.** `services/agent/src/routes/gen-route-factory.ts`, `createGenRoute` at about `:34-50`.
- **Stale `/new-service-route` skill. Confirmed.**
  - `.claude/skills/new-service-route/SKILL.md:58` uses object-form `createProblemDetails({` (the real signature is positional: `packages/types/src/api.ts:60-66`).
  - `:67` uses `fastify.sseBroadcaster`, which has zero code references in `services/` or `packages/`.
  - `:68` uses the `{ success: true, data }` envelope.
  - The skill never mentions `requireVenueAccess`, RLS context, or the sweep fixture.
  - `services/reservations/CLAUDE.md:554` also still shows `app.sseBroadcaster`.
- **ADR status. Confirmed.** ADR-020 and ADR-026 are both `status: active`.

## Root-cause hypothesis

**Hypothesis, not a finding.** Authorization and RLS context were added at different times by different work: ADR-020 first, then ADR-026 bolted on in parts (global hook in part 6/7, then `venueIdFromEntity` / `loadInVenueContext` in #5369 PR 5). Each was attached at the narrowest point that closed its own gap, with no shared "this route is scoped to venue X" declaration for both to read. Every new route then copied the nearest neighbour, and the scaffold skill drifted further from the code. As a result, the venue is declared nowhere and inferred up to three times.

## Blast radius

- **Code:** every venue-scoped route in `services/reservations` (about 40+ routes across 10 files), `app.ts`'s global hook, `venue-access.ts`, and the RLS sweep fixtures. `@mbe/service-bootstrap` `registerEndpoint` may gain an option. `@mbe/auth/fastify` `requireVenueAccess` may change if the module wraps it.
- **Users:** today, none directly; behaviour is correct where the guard exists. The 4 to 5 unchecked routes above are the live exposure if any proves to be a defect. `POST /api/v1/reservations` (anonymous writes into any venue) is the largest.
- **Authorization code (ADR-020).** Any regression is a cross-tenant leak. Review and Ship must scale to "sensitive/critical". The brief also says: STOP before merging and surface to Matt.
- **Agents/scaffolding:** every new route built from `/new-service-route` starts wrong.
- **Since:** ADR-026 rollout (#5369 series). The scaffold predates it.

## Ruled out

- **"The authz resolver already sets RLS context."** False; the code says so itself (`venue-access.ts:66-67`).
- **"Runs #1/#3 changed the counts."** They did not. Every count above is identical at `fcd4be0a1` and at current main. Run #3 moved guests to `registerEndpoint` but kept all 11 `fastify.venueMembershipLookup` sites. Run #1 changed how reservations call transitions, not how they authorize.
- **"Deposits routes lack a venue check."** They are `requireAdmin`, which is all-venue under ADR-020. Not an unchecked route.
- **"`events/test` is reachable in prod."** Not with current config: `NODE_ENV=production` is set in both Pulumi and the Dockerfile.

## Notes

- **In-flight check.** Ran `gh pr list --state open --limit 50` on 2026-10-05. Result: **nothing matches.** 20 open PRs: deps, metrics, docs, rialto a11y, chaos, and #6061 (transition effects PR3: Stripe injection, a prerequisite, not this work). None declare venue scope or touch `requireVenueAccess`.
- **Related backlog seed, not claimed:** `docs/backlog.md:153` (caller-supplied `guestId` on `POST /api/v1/holds/:id/confirm`). That seed is now **partly stale**: it says the route is `publicRateLimitHook` only, but `holds.ts:286` is now `[publicRateLimitHook, requireAuth]`. The guestId-without-venue-check concern may still stand. Architect should decide whether the venue-scope module absorbs it.
- **Misleading comments seen in passing** (flagged, not touched): `reservations.ts` has `// List reservations` above the POST create route and `// Update reservation` above `GET /me`.
- **Re-entry: architect.** This is authorization design under binding ADR-020/ADR-026: a new declaration surface, a `registerEndpoint` interaction, and fit with the transitions caller contract. It also carries security decisions owned by Architect/Matt.
- **Brief constraints carried forward:**
  - deepening test order (new interface tests first, old shallow tests deleted last, coverage moves stated in the diff);
  - Implement waits on #6061;
  - STOP before merge;
  - RLS FORCE (#5369), other services, demo role, and side effects are out of scope.
