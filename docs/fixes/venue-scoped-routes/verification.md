---
stage: verify
run: maintenance:venue-scoped-routes
date: 2026-11-02
assumptions:
  - "There is no prd.md, because this is a maintenance run. The criteria list is the target-state bullets in defect.md § Defect plus the breakdown.md acceptance criteria they do not already cover, as the verify skill says. The uncommitted 2026-10-17 verification (worktree venue-scoped-routes-close) was used ONLY as a criteria and check-command template. Every number and output below comes from commands run on 2026-11-02."
  - "The defect.md bullet '`.claude/skills/new-service-route/SKILL.md` teaches the real shape' is graded RETIRED, not FAIL. Matt decided this on 2026-10-10 (breakdown.md Notes): PR #6219 (`213976793`) deleted the skill, and the docs item was rescoped to `services/reservations/CLAUDE.md` only. Verify checks that the skill is really gone and that the rescoped docs item is met. It does not reopen the decision."
  - "The tree under test is the run branch HEAD `284c482cc` = origin/main `77f84aca5` plus two docs-only commits (brief, implement gate ticks). Only `docs/fixes/venue-scoped-routes/` differs from origin/main, so the code under test is origin/main's. origin/main was re-fetched and was still `77f84aca5` when checks ran."
  - "The RLS integration suites WERE run locally this time: Docker is up (`docker info` printed a Server section) and the `postgres:15` image was present. They ran against a throwaway `postgres:15` container on port 55432, with the same role/DB provisioning and migration step as the CI `rls-integration` job (ci.yml:877-897). The container was removed afterwards. CI evidence for the latest origin/main push is quoted too and labelled as CI evidence."
  - "The host was at load average 25 to 170 during the run. That caused load-induced timeouts in the first full unit run and in five RLS attempts. Each was re-run on its own, per the assignment. Both outcomes are recorded under C1 and C9. No product code was edited."
---

# Verification: declare a route's venue scope once — authorize and set RLS context together

## Summary

**Result: 11 PASS, 0 FAIL, 1 RETIRED (C12; Matt decision, verified as retired, and its rescoped item passes).** C1 and C9 first failed on a loaded host and passed on a clean re-run. The first-pass failures are recorded in each criterion.

The condition has moved, and the move survived the ~689 commits that landed since 2026-10-17. Counts in the non-test route files, from defect.md's 2026-10-05 baseline to now:

- 43 hand-passed `fastify.venueMembershipLookup` sites → **5**
- 29 `loadInVenueContext(` → **0**
- 8 bespoke resolvers → **1** bespoke + 2 shared (`queryVenueId`, `bodyVenueId`) in `named-venue.ts`
- `isVenueMember` → **0**
- the app-wide RLS hook, `venue-access.ts` and every `enterWith` call → **0**

The coverage test enforces 55 `/api/v1` descriptors (54 member/owner/manager, 1 slug/public) and 15 `UNSCOPED_ROUTES` entries. A mutation check shows it goes red when an entry is dropped. The post-2026-10-17 route growth (`menus`, `closures`, `availability-config`, `availability-changes`, `tonight`, `venue-team`, `floor-plan-sections`) all declare their scope through `venueScoped`, so the target state holds as the surface grew. Verdict: the run meets its target state.

## Criteria & evidence

### Setup: tree under test

- Check: `git rev-parse HEAD origin/main`, then `git fetch origin main`, then `git status --short`.
- Evidence:
  ```
  284c482cc905d3aff93e250327c0714851a77bac
  77f84aca5c5c2c53b92df10b9a33390f11a2207f
  (after fetch) 77f84aca5c5c2c53b92df10b9a33390f11a2207f
  git log origin/main..HEAD:
  284c482cc docs(venue-scoped-routes): implement — tick PR 5 and PR 6 gates (merged #6363, #6365), carry reviewer gap to Review
  481183b60 docs(venue-scoped-routes): autorun — brief
  ```
  The worktree status was clean. Workspace dist was present, so no rebuild was needed (`tools/cli/dist` is absent, but `check-adr` runs through `tsx`; see C10).
- Result: PASS (precondition)

### C1 — Reservations service is green: lint, typecheck, full test suite

- Check: `pnpm --dir services/reservations lint`, `typecheck`, then `env -u DATABASE_URL pnpm --dir services/reservations test`.
- Evidence (lint and typecheck):
  ```
  > eslint src/            lint_exit=0
  > tsc --noEmit           tc_exit=0
  ```
- Evidence (full suite, FIRST run, under load average 25-75, with a 15 s default test/hook timeout):
  ```
   Test Files  22 failed | 195 passed | 14 skipped (231)
        Tests  78 failed | 3562 passed | 288 skipped (3928)
     Duration  1234.83s
  test_exit=1
  ```
  Failure kinds in the log: `Error: Hook timed out in 15000ms.` ×19 and `Error: Test timed out in 15000ms.` ×15, with individual tests running 20-115 s. The failing files were: availability-changes, briefing, guests-win-back, public-guest-recognition, tonight, floor-plan-sections, booking-metrics, venue-team, availability-config, transitions/entry-points, stripe-webhook, reservations, holds, floor-plans, confirm-attendance, venues, reservation-events, public-menus, menus, manage-rebook, guests-dietary, deposits.
- Evidence (RE-RUN of exactly those 22 files alone, `env -u DATABASE_URL`, `--maxWorkers=4 --testTimeout=120000 --hookTimeout=120000`):
  ```
  rerun_exit=0
   Test Files  22 passed (22)
        Tests  625 passed (625)
     Duration  1693.67s
  ```
  The 288 skipped are the `DATABASE_URL`-gated RLS integration suites. They were run separately under C9.
- Result: PASS. All 231 files are green across the two runs, and the 22 first-run failures are timeouts under host load that vanished when the files ran alone. I did not re-run the whole suite in one pass on a quiet host, so a clean one-shot full-suite pass was not observed here. CI's `Test (Node 22, reservations)` job on `77f84aca5` was success (see C9 evidence).

### C2 — A route declares its venue scope once (defect.md target 1)

- Check: count `venueScoped` occurrences per non-test, non-fixture route file, and count the descriptors the coverage test pins as "stamp → registry".
- Evidence:
  ```
  venueScoped by file (46 non-test route files scanned):
  availability-changes.ts:3  availability-config.ts:7  availability.ts:3  booking-metrics.ts:3
  briefing.ts:3  closure-caller.ts:1  closures.ts:8  deposit-transition-handler.ts:3
  deposits.ts:8  floor-plan-sections.ts:8  floor-plans.ts:11  guests.ts:13  holds.ts:8
  manage-token-scope.ts:1  menus.ts:15  named-venue.ts:1  public-venue-scope.ts:1
  reservation-events.ts:2  reservations.ts:6  tables.ts:6  tonight.ts:3
  venue-scope.ts:4  venue-team.ts:4  venues.ts:5  waitlist.ts:8

  venue-scope-coverage.test.ts, descriptor map (parsed with a node script):
  unscoped 15 descriptors 55
  { 'query.venueId/member': 7, 'body.venueId/member': 6, 'entity:guest/member': 5,
    'entity:waitlist_entry/member': 5, 'entity:floor_plan/member': 6, 'params.venueId/member': 3,
    'entity:table/member': 6, 'params.id/member': 3, 'params.id/manager': 1,
    'entity:reservation/owner': 3, 'entity:reservation/member': 1,
    'resolve:reservationId|venueId/member': 1, 'entity:deposit/member': 4,
    'resolve:hold.venueId/member': 3, 'slug/public': 1 }
  ```
  Drift against 2026-10-17: 54 → 54 member/owner/manager descriptors plus 1 `slug/public`, and `UNSCOPED_ROUTES` entries 16 → 15. The `venueScoped` file list grew from 13 to 25 files as new venue routes landed (menus, closures, availability-config, availability-changes, tonight, venue-team, floor-plan-sections). Judged against defect.md target 1: the new routes use the declaration, and none was added to `UNSCOPED_ROUTES` as `pending-migration`. The drift is in the target direction.
- Result: PASS

### C3 — The condition moved: defect.md § Counts re-measured (the regression centerpiece)

- Check: `grep -oF` over the 46 non-test, non-fixture `.ts` files directly in `services/reservations/src/routes/`, using the defect.md method.
- Evidence:
  ```
  fastify.venueMembershipLookup    5     (defect.md: 43)
  loadInVenueContext(              0     (29)
  runWithVenueContext(             7     (24 raw / 22 route call sites)
  inNamedVenueContext(             5     (new; explicit context for the UNSCOPED fan-out routes)
  requireVenueAccess(              7     (5 route guards + 2 in venue-scope.ts, which invokes it)
  isVenueMember                    0     (the inline duplicate, gone)
  venueIdFromQuery/Body/Params     0 / 0 / 0
  venueIdFromEntity                1     (a mention of the deleted resolver, not a call)
  enterWith                        0     (grep -rn enterWith src: one doc-comment hit only, see C10)
  VenueIdResolver                  5     (named-venue.ts:1,16,22; reservations.ts:21,51)
  ls src/venue-access.ts           → No such file or directory

  fastify.venueMembershipLookup sites (all five are the Matt-ruled "cross-venue fan-out (admin)" UNSCOPED routes):
  events.ts:73        GET  /api/v1/events/stream
  reservations.ts:144 GET  /api/v1/reservations
  reservations.ts:376 POST /api/v1/reservations
  tables.ts:62        GET  /api/v1/tables
  tables.ts:147       POST /api/v1/tables

  runWithVenueContext( sites:
  manage-token-scope.ts:100  named-venue.ts:32  public-unsubscribe.ts:95
  public-venue-scope.ts:99   stripe-webhook.ts:70  venue-scope.ts:286 (+ :36 doc comment)
  ```
  Every manual `runWithVenueContext` left is in `venue-scope.ts`, `named-venue.ts`, or a public-slug, manage-token, unsubscribe or webhook path. The architecture keeps explicit context on those by design. Drift against 2026-10-17: none in these counts (5 / 0 / 7 / 5 / 7 / 0 / 0 all match the 2026-10-17 numbers, but each was re-measured now).
  Out-of-target drift, recorded and not graded: `createProblemDetails(` now measures **169** (defect.md: 130; 117 at the 2026-10-17 `f3d4f7602`) across the 46 files. The problem-details cleanup is in the brief's condition list but not in defect.md's target state.
- Result: PASS

### C4 — One module: ADR-020 membership, then ADR-026 context, then entity to handler, then standard 403/404 (defect.md target 2)

- Check: `pnpm exec vitest run src/routes/venue-scope src/app-venue-context src/routes/events-test-route-removed src/routes/named-venue --reporter=verbose` in `services/reservations` with `DATABASE_URL` unset.
- Evidence (excerpt from the verbose output):
  ```
  ✓ venue-scope.test.ts > venueScoped — direct sources (member) > denies a non-member with requireVenueAccess's own 403 body
  ✓ venue-scope.test.ts > venueScoped — direct sources (member) > answers 401 with the guard's body when there is no user
  ✓ venue-scope.test.ts > venueScoped — direct sources (member) > admits an admin to any venue with isAdmin set, without a membership lookup
  ✓ venue-scope.test.ts > venueScoped — entity source (member) > resolves once, loads inside the context, and keeps it across awaits in the handler
  ✓ venue-scope.test.ts > venueScoped — entity source (member) > denies a non-member without calling load
  ✓ venue-scope.test.ts > venueScoped — entity source (member) > unresolvable entity: 403 for a non-admin (existence hidden), 404 notFound for an admin
  ✓ venue-scope.test.ts > venueScoped — owner access > denies a non-owner and an unverified email with requireOwnershipOrAdmin's own bodies
  ✓ venue-scope.test.ts > venueScoped — context isolation > interleaved concurrent requests do not bleed
  ✓ venue-scope.test.ts > venueScoped — context isolation > leaves no context behind outside the handler
  ✓ app-venue-context.test.ts > scoped routes: no venue context before authorization > does not enter a caller-supplied query venueId before the membership decision
   Test Files  7 passed (7)
        Tests  64 passed (64)
  c4_exit=0
  ```
  Membership stays a per-request lookup through `requireVenueAccess`, which `venue-scope.ts` invokes (2 `requireVenueAccess(` calls there, from C3). ADR-020's decision code is reused, not copied. Drift: 58 tests in 6 files on 2026-10-17 → 64 in 7 now; the `venue-scope-manager.test.ts` file is new.
- Result: PASS

### C5 — Fits `registerEndpoint` and `fastify.transitions` (defect.md target 3)

- Check: the type-inference tests, plus a grep of the guests endpoints and the transition call sites.
- Evidence:
  ```
  ✓ venue-scope.types.test.ts > venueScoped type inference > infers the route generic from fastify.post's handler slot
  ✓ venue-scope.types.test.ts > venueScoped type inference > types scope.entity from the entity source's load
  ✓ venue-scope.types.test.ts > venueScoped type inference > infers the endpoint's route generic in registerEndpoint's handler slot
  grep -c registerEndpoint src/routes/guests.ts → 12 ; grep -c venueScoped src/routes/guests.ts → 13
  holds.ts:399        fastify.transitions.confirmHold(
  reservations.ts:292 fastify.transitions.createWalkIn(
  reservations.ts:118 / :461 / :607 / :662  fastify.transitions.cancel / createByStaff / noShow / updateByStaff
  ```
- Result: PASS

### C6 — A single hook for a future `demo` restriction, with no demo logic (defect.md target 4)

- Check: the identity-hook tests, plus a grep of `venue-scope.ts` for the hook.
- Evidence:
  ```
  venue-scope.ts:36   * handling → `admitIdentity` → access decision → `runWithVenueContext(load →
  venue-scope.ts:142  admitIdentity(
  venue-scope.ts:274  const problem = venueScopeHooks.admitIdentity(
  ✓ venue-scope.test.ts > venueScoped — identity hook > calls admitIdentity once, with the resolved venue, before the membership decision
  ✓ venue-scope.test.ts > venueScoped — identity hook > a problem from admitIdentity is sent and nothing else runs
  ✓ venue-scope.test.ts > venueScoped — identity hook > admits everyone today
  ```
- Result: PASS

### C7 — Every unchecked-venueId route has a recorded decision and is implemented (defect.md target 5)

- Check: compare the rulings (architecture.md § Security rulings confirmed by Matt) with the coverage descriptors and tests.
- Evidence:
  ```
  venue-scope-coverage.test.ts:225  "GET /api/v1/availability/:venueId": "params.venueId/member",
  venue-scope-coverage.test.ts:226  "GET /api/v1/availability/:venueId/dates": "params.venueId/member",
  venue-scope-coverage.test.ts:227  "POST /api/v1/holds": "body.venueId/member",
  venue-scope-coverage.test.ts:228  "GET /api/v1/holds/:id": "resolve:hold.venueId/member",
  venue-scope-coverage.test.ts:229  "DELETE /api/v1/holds/:id": "resolve:hold.venueId/member",
  venue-scope-coverage.test.ts:230  "POST /api/v1/holds/:id/confirm": "resolve:hold.venueId/member",
  venue-scope-coverage.test.ts:68   "POST /api/v1/reservations": "cross-venue fan-out (admin)",
  ✓ events-test-route-removed.test.ts > POST /api/v1/events/test (deleted) > is not registered in a non-production app
  ```
  Booking-widget precondition for the availability ruling: `useBookingFlow.ts:538` reads "Slots come from the slug-scoped public route: the widget's api client is tokenless, so the staff /api/v1/availability route would 401 every guest." The public path is `packages/api-client/src/availability.ts:554`: ``return `/public/v1/venues/${slug}/availability`;``.
  The `POST /api/v1/reservations` guard stays a per-route `requireVenueAccess(fastify.venueMembershipLookup, bodyVenueId)` (`reservations.ts:376`), as Matt ruled (2026-10-10 and 2026-10-11).
- Result: PASS

### C8 — The RLS route sweep's completeness check runs locally without a DB (defect.md target 6), plus the mutation check

- Check: run `venue-scope-coverage.test.ts` with `DATABASE_URL` unset. Then **mutate**: delete the `"GET /api/v1/venues": "cross-venue fan-out"` entry (line 44) from `UNSCOPED_ROUTES`, re-run, and restore with `git checkout`.
- Evidence (clean run, from the C4 run):
  ```
  ✓ venue-scope-coverage.test.ts > venue-scope coverage (no database) > records every route buildApp registers, and nothing else
  ✓ … > every /api/v1 route declares its venue scope or is listed with a reason
  ✓ … > no route is both declared and listed as unscoped
  ✓ … > no unscoped entry is still marked pending-migration
  ✓ … > no unscoped entry names a route that no longer exists
  ✓ … > a declared route's sweep fixture is not still marked broken
  ✓ … > records the declared descriptor for each migrated route (stamp → registry)
  ✓ … > is read-only to callers
  ✓ … > RLS route sweep fixture completeness (no database) > has a fixture for every registered route (drift guard)
  ✓ … > RLS route sweep fixture completeness (no database) > every declared fixture actually corresponds to a live route
  ```
  Evidence (mutation):
  ```
  mut_exit=1
   × src/routes/venue-scope-coverage.test.ts > venue-scope coverage (no database) > every /api/v1 route declares its venue scope or is listed with a reason 14ms
  AssertionError: declare the scope with venueScoped, or add a reason here: expected [ 'GET /api/v1/venues' ] to deeply equal []
        Tests  1 failed | 9 passed (10)
  ```
  After `git checkout -- src/routes/venue-scope-coverage.test.ts`, `git status --short` on the file printed nothing. The re-run was `Test Files 1 passed (1) / Tests 10 passed (10)`.
- Result: PASS

### C9 — RLS integration (FORCE sweep, owner role) is green on the current tree (PR 6 merge condition)

- Check (local): `postgres:15` container (`-p 55432`), `rls_owner` and `rls_scratch` provisioned as in ci.yml:877-897, then `pnpm --filter @mbe/reservations-service db:migrate:deploy`, then the 15-file suite list from ci.yml:944-961, then `node scripts/assert-vitest-ran.mjs`.
- Evidence (LOCAL, final attempt: fresh `rls_scratch` DB, migrations applied, `--no-file-parallelism --hookTimeout=300000 --testTimeout=300000`):
  ```
  All migrations have been successfully applied.
  rls_exit=0
   ✓ src/routes/rls-venue-resolution.integration.test.ts (30 tests)
   ✓ src/routes/rls-app-reservations.integration.test.ts (7 tests)
   ✓ src/routes/rls-isolation.integration.test.ts (20 tests)
   ✓ src/routes/rls-owner-enforcement.integration.test.ts (7 tests)
   ✓ src/routes/rls-route-sweep.integration.test.ts (144 tests) 45803ms
   ✓ src/services/lapsed-guest-cron.rls.integration.test.ts (12 tests)
   ✓ (plus the other nine service integration files: 1 to 15 tests each)
   Test Files  15 passed (15)
        Tests  269 passed (269)
  Suites ran for real: 269/269 tests passed, 0 skipped.
  assert_exit=0
  ```
  The sweep includes the "UNSCOPED fan-out routes return the right rows" block, which covers the `inNamedVenueContext` replacement for the deleted hook.
- Evidence (LOCAL, earlier failed attempts, recorded and not hidden):
  - Attempt 1, default parallelism, 15 s hook timeout: `Test Files 10 failed | 5 passed (15)`, `Tests 62 passed | 207 skipped`. Hook timeouts waiting on the shared `pg_advisory_lock(5369)` under host load.
  - Attempt 2, sequential, 120 s timeouts, same DB: `Test Files 2 failed | 13 passed`. The route sweep `beforeAll` timed out at 30 s, and the lapsed-guest "simultaneous first sends" test hit `Unable to start a transaction in the given time`.
  - Attempt 3 (those two files alone): 155 passed, 1 failed (`POST /api/v1/floor-plans/:id/activate`, fixture `extractId` on a non-2xx response).
  - Attempt 4 (sweep alone): 142 passed, 2 failed (`GET /api/v1/venues` list lacking both venues; `GET tables` with a venueId answered 500 "Database Error"). Attempts 2-4 reused one DB that earlier killed or timed-out runs had polluted.
  - Attempt 5 (fresh DB, default parallelism, 300 s timeouts, while the full unit run was also loading the host): `Test Files 9 failed | 6 passed`, `Tests 3 failed | 186 passed | 80 skipped`. The failures were `500 Database Error` and `503 preview-timeout "The preview took too long"`, plus Prisma `dateRule.create()` errors.
  - Every failure was a timeout, pool or 5xx under load, and none was a 403/404/scope-assertion failure. The final run, with a fresh DB, sequential files and no concurrent test load, passed 269/269. It matches CI.
- Evidence (**CI evidence, not local**): `gh run list --branch main --workflow CI`, latest push run `41527058354` on head `77f84aca5c5c2c53b92df10b9a33390f11a2207f`, created 2026-11-02T21:17:56Z, conclusion success:
  ```
  RLS Integration (owner role, #5369) | success | job 125563719347 | completed 2026-11-02T21:31:34Z
  Test (Node 22, reservations)        | success | job 125563719273 | completed 2026-11-02T21:40:45Z
  Typecheck | success | 125563719070
  Lint      | success | 125563719111
  CI Gate   | success | job 125569397660 | completed 2026-11-02T21:41:14Z
  (RLS Integration log) Test Files  15 passed (15)
  (RLS Integration log) Suites ran for real: 269/269 tests passed, 0 skipped.
  ```
  Drift against 2026-10-17: 171 tests in 7 files → 269 in 15 files (the CI file list grew with availability and closure suites); sweep 101 → 144 tests.
- Result: PASS (local final run and CI evidence agree; the local attempts that failed under load are listed above)

### C10 — Global hook and helpers deleted; old shallow tests gone; ADRs amended (breakdown Milestone 6)

- Check: grep for the deleted symbols, list the ADR amendments, and run `check-adr`.
- Evidence:
  ```
  git grep -nE 'venueContextPreHandler|resolveGlobalVenueId|enterVenueContext|isThenable' -- services/reservations/src   → (no output; grep_exit=1)
  grep -rn enterWith services/reservations/src
    services/venue-context-store.ts:29: * `run` — not `enterWith` — is load-bearing: `enterWith` mutates the CURRENT
    (a doc comment only; no call)
  app.ts:183  fastify.addHook("onRoute", (route) => {        (the registry; no app-wide venue preHandler)
  docs/adr/ADR-020-hybrid-role-venue-authorization.md:4:  status: active
  docs/adr/ADR-020-hybrid-role-venue-authorization.md:75: ### Amendment 2026-10-12: `requireVenueAccess` is declared through `venueScoped`
  docs/adr/ADR-026-postgres-rls-venue-backstop.md:4:  status: active
  docs/adr/ADR-026-postgres-rls-venue-backstop.md:949: ## Amendment 2026-10-12: the part-6 global hook is retired; context comes from `venueScoped`

  $ pnpm --filter @mbe/cli start check-adr     (tsx src/index.ts "check-adr"; the CLI's dist is not built here)
  Checking codebase against 1 active ADRs...
  ✅ No architectural violations detected.
  adr_exit=0
  ```
- Result: PASS. "No `enterWith` in `services/reservations/src`" holds for code: the only match is the doc comment. The `check-adr` output says "1 active ADRs". I did not investigate why only one active ADR was checked, and the tool passed.

### C11 — `tools/route-contract` still passes after the `events/test` deletion (breakdown PR 5)

- Check: `pnpm --dir tools/route-contract test` and `typecheck`.
- Evidence:
  ```
   Test Files  8 passed (8)
        Tests  94 passed (94)
  rc_exit=0
  rctc_exit=0
  fastify-owners.ts:107 export const ENV_CONDITIONAL_ROUTES: readonly EnvConditionalRoute[] = [
  fastify-owners.ts:108   // Empty since `POST /api/v1/events/test` (reservations, `NODE_ENV !==
  fastify-owners.ts:109   // "production"` only) was deleted by docs/fixes/venue-scoped-routes PR 5.
  ```
- Result: PASS

### C12 — `/new-service-route` teaches the real shape (defect.md target 7), rescoped to reservations CLAUDE.md

- Check: confirm the skill is gone and when it was deleted. Then check the rescoped Accept criteria on `services/reservations/CLAUDE.md`.
- Evidence:
  ```
  ls .claude/skills/new-service-route → No such file or directory
  git log --diff-filter=D -- .claude/skills/new-service-route/SKILL.md → 213976793 chore(claude): prune unused skills and broken MCP servers (#6219)
  services/reservations/CLAUDE.md:163  ### Venue scope
  services/reservations/CLAUDE.md:204  to `UNSCOPED_ROUTES` in `src/routes/venue-scope-coverage.test.ts` with a reason
  services/reservations/CLAUDE.md:212-214  `FIXTURES` in `src/routes/rls-route-sweep.fixtures.ts` (or `rls-route-sweep.fixtures-public.ts`), then run
        `pnpm exec vitest run src/routes/venue-scope-coverage.test.ts` locally. It
  grep -c sseBroadcaster services/reservations/CLAUDE.md → 0
  grep -c "{ success: true" services/reservations/CLAUDE.md → 0
  npx prettier --check services/reservations/CLAUDE.md → All matched files use Prettier code style!
  ```
  The section also documents `venue:` sources (`"query" | "body" | "params"`, `{ entity, key, notFound, load? }`, `{ resolve, label, notFound }`), the `access:` values (`"member"`, `"authenticated"`, `{ owner }`), and `publicVenueScoped` / `manageTokenScoped`. It links to `docs/reference.md § Venue scope example`. I did not open that link target.
- Result: RETIRED as written (Matt decision, 2026-10-10). The rescoped item **PASSES**.

## Failures

none. C1 and C9 each had first-pass failures. They were load-induced (15 s timeouts, pool exhaustion, `503 preview-timeout`) and passed when re-run on their own. Both outcomes are recorded under the criterion.

## Not verified

- **No single-pass, quiet-host full unit suite.** C1 rests on the 3562 passes of the first run plus a clean 625/625 re-run of the 22 files that timed out. A one-shot run that passes end to end was not observed locally, because the host load was 25-170 for the whole session. CI's `Test (Node 22, reservations)` on `77f84aca5` was success.
- **Production behaviour of the PR 5 rulings was not probed.** A signed-in non-member getting 403 on `/api/v1/availability/:venueId` or `/api/v1/holds/:id` in prod needs a non-member staff JWT, and Verify has none. The behaviour is pinned by unit tests and the FORCE sweep only.
- **No reviewer verdict has been recorded for PR 5 (#6363) or PR 6 (#6365).** breakdown.md Notes carries this gap. Verify cannot fill it after the fact, so it goes to Review.
- **Problem-details cleanup** (the brief's 130 `createProblemDetails` calls, 98 literal titles, 7 hand-built objects) is not in defect.md's target state, so it was not graded. Measured now for the record: 169 `createProblemDetails(` calls.
- **The brief's 8 ad-hoc inline checks** were graded only through `isVenueMember` (= 0). Per architecture.md § Requirement trace, the list filters stay UNSCOPED and the cross-entity and public-consistency checks stay in handlers by design. They were not re-audited one by one.
- **`check-adr` scope:** it reported "1 active ADRs", so I did not verify that it checks ADR-020 and ADR-026 specifically. The amendments were checked by grep.
- **Known residuals carried by Matt's rulings (not regressions):**
  - `GET /api/v1/reservations` with only `guestId` still runs with no venue context (the sweep fixture marks it broken).
  - Admins can still create venue-less tables and reservations.
  - The deposit 400/404 bodies reach the wire as `{}` (logged smell, breakdown Notes).
  - I did not re-confirm the three residuals above on today's tree beyond the coverage test staying green.
