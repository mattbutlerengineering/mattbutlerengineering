---
stage: decompose
run: maintenance:venue-scoped-routes
date: 2026-10-05
assumptions:
  - "One milestone per PR. architecture.md's 6-PR plan is taken as the milestone cut unchanged: each PR leaves main green and is independently demonstrable, which is the skill's milestone test. Decompose adds no PRs and merges none."
  - "Every PR's last item is the same gate: open the PR, reviewer PASS, CI Gate genuinely green (the core build/test/lint/typecheck jobs executed and concluded success, not skipped), then STOP for Matt. Nothing in this breakdown merges a PR. This is the autorun brief's 'STOP before merging any PR — it is authorization code (ADR-020)', which overrides the brief's general merge authorization."
  - "Byte-identical acceptance: every migrated route returns the same status and the same problem `detail` string it returned on the PR's base, except the routes covered by Matt's confirmed rulings (architecture.md § Security rulings confirmed by Matt). For holds, the baseline is the post-standalone-holds-fix behaviour (member + 403 on unknown hold for non-admins), not today's code, because that fix merges before Implement starts."
  - "Test-first per item (skill/brief default): the item's new or gap test is written and run RED (or, for behaviour-preserving migrations, written GREEN against current code to pin the bytes) before the route moves. The existing per-route 403/404/400 tests listed in architecture.md § Test ordering step 1 must pass unchanged through PRs 2-4."
  - "POST /api/v1/reservations migrates in PR 4 unconditionally, because #6072 is merged (architecture.md ruling). The architecture's 'otherwise it waits for PR 6' branch is dead and is not carried as an item."
  - "events/test deletion sits in PR 5 with the other rulings (architecture.md PR 5 lists it; the ruling says remove route-contract and sweep entries in the same PR). The SSE stream route (events.ts GET) still migrates in PR 2."
  - "PR 5 is not split even though only its availability half depends on #6077: the architecture puts all rulings in one PR. If #6077 is not merged and deployed when the rest of PR 5 is ready, PR 5 waits; splitting it is Matt's call, not a skill default."
  - "PR 6's merge additionally waits for a green `rls-integration` job on its head (architecture.md § Global hook lifecycle step 3); recorded on that PR's gate item."
  - "Line numbers in items are architecture.md's at 96cc7b478 and are pointers only. The first Implement item re-measures them on the rebased head."
  - "No tracker import or export: the brief says 'Tracker: none', and the dispatch says create no GitHub issues."
---

# Breakdown: declare a route's venue scope once — authorize and set RLS context together

Progress lives in the checkboxes below — Implement checks items off as their
acceptance criteria are met.

## Start conditions (Implement may not begin until all hold)

- [x] **Prerequisite security PRs merged** — confirm on origin/main before the first code item.
  - Accept: all three are merged on origin/main, each confirmed by `gh pr view <N> --json state,mergedAt` (or the merge commit present in `git log origin/main`):
    - #6072 — `POST /api/v1/reservations` requires auth + venue membership (already merged and deployed per architecture.md);
    - #6079 — table/venue mismatch on reservation writes (out of this run's scope);
    - the standalone holds `member` security PR (opened after #6079; all four `/api/v1/holds` routes require membership of the hold's venue, unknown hold → 403 for non-admins).
  - Blocked by: —
- [x] **Rebase and re-baseline** — rebase `refactor/venue-scoped-routes` onto origin/main, `pnpm install --frozen-lockfile`, `pnpm build --filter @mbe/cli...`.
  - Accept: branch rebased with no conflicts left; `pnpm --dir services/reservations test` and `pnpm --dir services/reservations typecheck` green on the rebased head; the counts in defect.md § Counts (43 lookups, 29 `loadInVenueContext`, 22 route `runWithVenueContext`, 8 bespoke resolvers) and the line pointers used below are re-measured and any drift is logged under Notes.
  - Blocked by: Prerequisite security PRs merged

Not start conditions, but merge conditions recorded on their PRs: PR 5 may not merge before PR #6077 (booking widget → public slug availability) is merged **and deployed**; PR 6 may not merge before a green `rls-integration` run on its head.

## Milestone 1 (PR 1): `venueScoped` exists, is proven, and every route is visible in a local coverage test

`refactor(reservations): add venueScoped module and local scope coverage`. No route changes, no behaviour change.

- [ ] **Type-inference spike** — `routes/venue-scope.types.test.ts` with `expectTypeOf` for the `fastify.post<RG>(…, opts, venueScoped(…))` slot and the `RegisterEndpointOptions<D>["handler"]` slot.
  - Accept: test written first and failing (module absent); after the module lands, `pnpm --dir services/reservations typecheck` passes with `RG` inferred in both slots, or the chosen fallback (explicit `venueScoped<RG, E>` / curried) is recorded under Notes.
  - Files: `services/reservations/src/routes/venue-scope.types.test.ts` (new).
  - Blocked by: Rebase and re-baseline
- [ ] **`venueScoped` behaviour tests (RED)** — `routes/venue-scope.test.ts` on a bare `Fastify()` with an injected fake membership lookup and `vi.mock("../services/resolve-venue.js")`.
  - Accept: tests exist and fail for absence of the module, covering: every cell of architecture.md's failure-mode table for `member`, `owner`, `authenticated`; `getCurrentVenueId()` equals the resolved venue inside `load` and after several `await`s in the handler; two sequential requests to different venues each see their own; interleaved concurrent requests do not bleed; `resolveVenueId` called exactly once per request; `load` not called on deny; `admitIdentity` called once with the resolved venue before membership; handler carries the `VENUE_SCOPE` descriptor; 401/403 bodies byte-equal to `requireVenueAccess` / `requireOwnershipOrAdmin`'s own.
  - Files: `services/reservations/src/routes/venue-scope.test.ts` (new).
  - Blocked by: Rebase and re-baseline
- [ ] **`venueScoped` module + `admitIdentity` hook** — implement `services/reservations/src/routes/venue-scope.ts` to the architecture's interface and order contract.
  - Accept: `venue-scope.test.ts` and `venue-scope.types.test.ts` green; module reuses `requireVenueAccess` / `requireOwnershipOrAdmin` (no copied decision matrix); `admitIdentity` always returns `null` and contains no demo logic; no `enterWith` added; `@mbe/auth` and `@mbe/service-bootstrap` unchanged.
  - Files: `services/reservations/src/routes/venue-scope.ts` (new).
  - Blocked by: `venueScoped` behaviour tests (RED); Type-inference spike
- [ ] **Coverage registry + local coverage test** — `onRoute` registry installed in `buildApp` before the first `fastify.register`, exposed as a read-only `venueScopes` decoration; `routes/venue-scope-coverage.test.ts` written first.
  - Accept: test (written RED first) asserts a non-empty registry equal to `printRoutes` (HEAD filtered); every `/api/v1/*` route is stamped or in `UNSCOPED_ROUTES` with a non-empty reason (`cross-venue fan-out`, `venue-create`, `venue-group (no RLS)`, `public slug`, `user-scoped (/me)`, `pending-migration`); every current venue route is listed `pending-migration`; FIXTURES kinds match stamped routes. Runs with no `DATABASE_URL` under `pnpm --dir services/reservations test`.
  - Files: `services/reservations/src/app.ts`, `services/reservations/src/routes/venue-scope-coverage.test.ts` (new).
  - Blocked by: `venueScoped` module + `admitIdentity` hook
- [ ] **Move sweep completeness out of `skipIf`** — move the two-way FIXTURES completeness tests (`rls-route-sweep.integration.test.ts:427-454`) verbatim into `venue-scope-coverage.test.ts`; delete the originals in the same commit.
  - Accept: both checks pass locally without a DB; the originals are gone from the integration file; the PR body states "coverage moved: sweep completeness → venue-scope-coverage.test.ts".
  - Files: `services/reservations/src/routes/rls-route-sweep.integration.test.ts`, `services/reservations/src/routes/venue-scope-coverage.test.ts`.
  - Blocked by: Coverage registry + local coverage test
- [ ] **PR 1 gate** — open PR, reviewer PASS, CI Gate genuinely green (core jobs executed, success), STOP for Matt.
  - Accept: PR open against `main` with Conventional Commit title; `reviewer` verdict PASS posted on the PR; `CI Gate` success on the final head with build/test/lint/typecheck jobs executed (not skipped); session stops and surfaces the PR to Matt without merging.
  - Blocked by: Move sweep completeness out of `skipIf`

## Milestone 2 (PR 2): simple shapes migrated — guests, waitlist, briefing, booking-metrics, events stream

Covers query/body/entity sources and the `registerEndpoint` caller.

- [ ] **Gap tests for waitlist, briefing, booking-metrics** — one route-level non-member 403 and one member 200 per file, against current code.
  - Accept: tests added to `waitlist.test.ts`, `briefing.test.ts`, `booking-metrics.test.ts`; green on current (unmigrated) code, pinning today's status and `detail`.
  - Blocked by: PR 1 gate
- [ ] **Migrate guests (11 `registerEndpoint` endpoints)** — `preHandler: requireAuth` + `handler: venueScoped(…)`; entity endpoints use `{ entity: "guest", key, load?, notFound: "Guest not found" }`.
  - Accept: `guests.test.ts` (incl. :668-760 403/404 block) passes unchanged; `guests.ts` has zero `fastify.venueMembershipLookup`, `loadInVenueContext`, and bespoke resolver uses; coverage test lists the guests routes as stamped (not `pending-migration`); statuses and `detail` byte-identical.
  - Blocked by: PR 1 gate
- [ ] **Migrate waitlist, briefing, booking-metrics** — declare query/body/entity sources.
  - Accept: gap tests and existing tests pass unchanged; the files' membership-lookup and manual-context sites are gone; coverage stamps them; bytes identical.
  - Blocked by: Gap tests for waitlist, briefing, booking-metrics
- [ ] **Migrate events SSE stream** — `GET` stream in `events.ts` becomes `venue: "query"`; only setup runs inside `run`.
  - Accept: `events.integration.test.ts` (incl. :241) passes unchanged; stream route stamped; `events/test` untouched here (deleted in PR 5).
  - Blocked by: PR 1 gate
- [ ] **PR 2 gate** — open PR, reviewer PASS, CI Gate genuinely green (core jobs executed, success), STOP for Matt.
  - Accept: as PR 1 gate.
  - Blocked by: Migrate guests; Migrate waitlist, briefing, booking-metrics; Migrate events SSE stream

## Milestone 3 (PR 3): tables, floor plans, venues migrated

Covers body-entity, `:tableId`, and venue self-route shapes.

- [ ] **Migrate tables** — `{ entity: "table", key: r => r.params.tableId }` etc.; the floor-plan/table venue integrity check (`tables.ts:293`) stays in the handler.
  - Accept: `tables.test.ts` (#4865 block :535-700) passes unchanged; bespoke resolver at `tables.ts:40` deleted; stamped; bytes identical.
  - Blocked by: PR 2 gate
- [ ] **Migrate floor plans** — body entity `{ entity: "floor_plan", key: r => r.body.floorPlanId, load }` collapses the `{kind:…}` union (`:300-338`); `:tableId` routes keep #5008 pinning; cross-venue list (`:54-90`) goes to UNSCOPED `cross-venue fan-out`; integrity check `:311` stays.
  - Accept: `floor-plans.test.ts` (:353, :413, :702, :807) passes unchanged; three bespoke resolvers (`:36,42,48`) deleted; bytes identical.
  - Blocked by: PR 2 gate
- [ ] **Migrate venues `:id` routes + admin DELETE** — `{ from: "params", field: "id" }`; the `venueGroupId` rule uses `scope.isAdmin`; list, create, groups, by-slug go UNSCOPED with reasons.
  - Accept: `venues.test.ts` (:640, :700, :1018, :1405) passes unchanged; bespoke resolver `:48` deleted; UNSCOPED reasons present; bytes identical.
  - Blocked by: PR 2 gate
- [ ] **PR 3 gate** — open PR, reviewer PASS, CI Gate genuinely green (core jobs executed, success), STOP for Matt.
  - Accept: as PR 1 gate.
  - Blocked by: Migrate tables; Migrate floor plans; Migrate venues `:id` routes + admin DELETE

## Milestone 4 (PR 4): reservations and deposits migrated

- [ ] **Migrate reservations list + walk-in** — list uses `resolve` (venueId or guest → venue), fixing the unscoped `guestService.getById` the sweep marks broken; walk-in becomes `venue: "body"`.
  - Accept: `reservations.test.ts` guestId-resolution tests (:1857-1945) pass unchanged; bespoke resolver `:53` deleted; the sweep fixture for the list route (`rls-route-sweep.fixtures.ts:1060-1063`) updated from broken to its correct kind; bytes identical.
  - Blocked by: PR 3 gate
- [ ] **Migrate the 3 owner routes; delete `requireReservationOwnerOrAdmin`** — `{ entity: "reservation", load: getById, notFound: "Reservation not found" }` + `access: { owner: r => r.guestEmail }`; handler re-resolve/second `getById` removed; `request.authorization.isAdmin` → `scope.isAdmin`.
  - Accept: owner tests (:353-1682) pass unchanged, including 401 for no verified email; `requireReservationOwnerOrAdmin` removed from `reservations.ts`; bytes identical.
  - Blocked by: PR 3 gate
- [ ] **Migrate `POST /api/v1/reservations`; delete `isVenueMember`** — re-express #6072's guard as `preHandler: requireAuth` + `venueScoped({ venue: "body" })`.
  - Accept: the POST member-gate tests (:1968-2035, plus #6072's tests) pass unchanged; `isVenueMember` deleted if still present; bytes identical to post-#6072 behaviour.
  - Blocked by: PR 3 gate
- [ ] **Migrate deposits + deposit-transition-handler** — `[requireAuth, requireAdmin]` + `venueScoped`; `GET /deposits` reservationId-or-venueId uses `resolve`; hand resolution (`deposits.ts:107-121,186-202`) removed.
  - Accept: `deposits.test.ts` (non-admin ~:700, ADR-026 context ~:798) and `deposit-transition-handler.test.ts` pass unchanged; bytes identical.
  - Blocked by: PR 3 gate
- [ ] **PR 4 gate** — open PR, reviewer PASS (plus `stripe-flow-reviewer`, since deposits files change), CI Gate genuinely green (core jobs executed, success), STOP for Matt.
  - Accept: as PR 1 gate, with the specialist verdict also posted.
  - Blocked by: the four PR 4 items above

## Milestone 5 (PR 5): Matt's security rulings applied

The only behaviour changes in the run. Each ruling: RED test first, then the declaration.

- [ ] **Availability → `member`** — `GET /api/v1/availability/:venueId` and `/:venueId/dates` become `venueScoped({ venue: "params" })`.
  - Accept: new RED test (signed-in non-member → 403 "You do not have access to this venue") then green; member and admin still 200; anonymous still 401; sweep fixtures' "open route" labels (`rls-route-sweep.fixtures.ts:842-857`) updated; `services/reservations/CLAUDE.md:513,515,305` corrected to the auth truth.
  - Blocked by: PR 4 gate
- [ ] **Holds → re-express via `venueScoped`** — POST (body source) and GET/DELETE/confirm on `/:id` (`resolve: hold.venueId`, session check kept on DELETE and confirm); `confirmHold` now runs in venue context.
  - Accept: the standalone holds PR's tests pass unchanged (statuses and `detail` byte-identical to that PR, incl. non-admin unknown hold → 403); public fixture `POST /api/v1/holds/:id/confirm` (`fixtures-public.ts:434`, "sweep-discovered" broken) updated to its correct kind; stamped in coverage.
  - Blocked by: PR 4 gate
- [ ] **Delete `POST /api/v1/events/test`** — remove the route, its `tools/route-contract/src/fastify-owners.ts:111` entry and its `rls-route-sweep.fixtures.ts:89` INFRA entry.
  - Accept: RED first — a test asserting the route is not registered (404) in a non-production `buildApp`; then green; route-contract tooling tests and coverage test pass; no SSE test depended on it.
  - Blocked by: PR 4 gate
- [ ] **PR 5 gate** — open PR, reviewer PASS, CI Gate genuinely green (core jobs executed, success), STOP for Matt.
  - Accept: as PR 1 gate; the PR body lists each ruling and its behaviour change; **may not merge before PR #6077 is merged and deployed** (stated in the PR body).
  - Blocked by: the three PR 5 items above

## Milestone 6 (PR 6): global hook retired, old tests die, docs teach the real shape

- [ ] **Narrow the global hook** — `resolveGlobalVenueId` returns `null` for any route the registry marks scoped.
  - Accept: RED test first in `app-venue-context.test.ts` / `venue-scope.test.ts` (a scoped route with a caller-supplied `venueId` does not enter context before authorization), then green.
  - Blocked by: PR 5 gate
- [ ] **Forbid `pending-migration`** — coverage test fails if any `pending-migration` entry remains.
  - Accept: the assertion is added and passes, with zero `pending-migration` entries.
  - Blocked by: Narrow the global hook
- [ ] **Delete the hook and its helpers** — delete the hook at `app.ts:269`, `resolveGlobalVenueId`, `venueContextPreHandler` (+ `isThenable`), `enterVenueContext`, `venueIdFromQuery/Body/Params`, `venueIdFromEntity`, `loadInVenueContext`, and `routes/venue-access.ts`.
  - Accept: no `enterWith` left in `services/reservations/src` (grep); the full reservations test suite is green; remaining context sources are `venueScoped` plus explicit `runWithVenueContext` in public/token/webhook/cron/job paths.
  - Blocked by: Forbid `pending-migration`
- [ ] **Old shallow tests die (last)** — delete them per architecture.md § Test ordering step 5; the PR body states where each one's coverage moved.
  - Accept: removed `venue-access.test.ts` (21 + 5 cases, file gone with its module); `middleware/venue-context.test.ts` `venueContextPreHandler` describe (6; `setVenueContext` describes stay); `app-venue-context.test.ts` "venue-context middleware wiring" (2); `venue-context-store.test.ts` `enterVenueContext` cases (≤4; `runWithVenueContext` describe stays); `reservation-owner.test.ts` `requireReservationOwnerOrAdmin` wiring cases (`resolveCurrentUserEmail` cases stay). The PR body carries the moved-to table.
  - Blocked by: Delete the hook and its helpers
- [ ] **ADR amendments + transitions doc** — dated amendments to ADR-026 (part-6 hook retired; context from `venueScoped`) and ADR-020 § requireVenueAccess (declared through `venueScoped`; matrix unchanged); `transitions/index.ts:13` names `venueScoped`.
  - Accept: both ADRs keep `status: active` with a dated amendment section; `check-adr` passes.
  - Blocked by: Delete the hook and its helpers
- [ ] **Rewrite `/new-service-route` skill + reservations CLAUDE.md** — per architecture.md § Docs rewrite.
  - Accept: `.claude/skills/new-service-route/SKILL.md` uses positional `createProblemDetails(status, titleForStatus(status), detail)`, `{ data }`, `fastify.reservationEvents`, `preHandler: requireAuth`, a venue-scope step, an RLS-sweep fixture step, `registerEndpoint`; checklist gains "venue scope declared or UNSCOPED with reason" and "sweep fixture added"; no reference to `sseBroadcaster` or `{ success: true` remains in the skill or `services/reservations/CLAUDE.md` (`:554` fixed); CLAUDE.md gains a "Venue scope" subsection; prettier-formatted.
  - Blocked by: Delete the hook and its helpers
- [ ] **PR 6 gate** — open PR, reviewer PASS, CI Gate genuinely green (core jobs executed, success) **and a green `rls-integration` job on the head**, STOP for Matt.
  - Accept: as PR 1 gate, plus `rls-integration` executed and succeeded on the final head.
  - Blocked by: the five PR 6 items above

## Design gaps found

none. (Sequencing questions the architecture left open — POST /reservations timing, events/test fate, holds baseline — are settled by Matt's rulings and logged as assumptions.)

## Notes

<Deviations discovered during Implement get logged here, dated.>

- **2026-10-06 — start conditions met.** #6072 (`87a9e4724`) and #6079 (`be0dbef6b`) were already on main. The standalone holds `member` PR had been committed on 10-05 (`8cffa9c92`) but never pushed; it was cherry-picked unchanged onto main, opened as #6128, reviewer PASS 9/10, CI Gate + RLS Integration (152/152, 0 skipped) green, and merged by Matt as `ca1538a90`. Two follow-up commits on that PR: one `HOLDS_URL` constant per sweep fixture file (the hardcodedRoutes ratchet rejected 8 new literals) and a JSDoc re-attachment the reviewer flagged.
- **2026-10-06 — re-baseline on `ca1538a90`.** Branch rebased with no conflicts; `services/reservations` 1811 passed / 150 skipped, typecheck clean. Count drift vs defect.md § Counts, all from #6128: `fastify.venueMembershipLookup` 43 → **47** (holds.ts +4); `loadInVenueContext(` call sites 29 → **29**; route `runWithVenueContext(` 22 → **23** (holds confirm); bespoke `VenueIdResolver`s 8 → **9** (`holds.ts:89 holdVenueIdFromParams`; `reservations.ts` resolver moved 53 → 51). Milestone 5's holds item now _re-expresses_ #6128's guards through `venueScoped` rather than introducing them; the `/:id` routes' unknown-hold 403 for non-admins and admin 404 are the behaviour to preserve.
