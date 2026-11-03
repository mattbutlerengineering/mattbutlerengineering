---
stage: review
run: maintenance:venue-scoped-routes
date: 2026-11-02
assumptions:
  - "Scope is PR 5 (#6363, `3cf46fd12`) and PR 6 (#6365, `033669bcf`), read in full with `git show <sha>` and re-read on current main. The code under review is origin/main `77f84aca5`, which the run branch equals for all code (verification.md setup). PRs 1-4 carry reviewer PASS verdicts in breakdown.md and were not re-reviewed line by line. The current `venueScoped` surface was checked for consistency only."
  - "No separate reviewer subagents were spawned. The skill's five passes and the security pass were done directly against the diffs, the current files and the ADRs. Every finding below was re-read in the code before it was written."
  - "No finding is graded critical or major. A scenario that needs a code change is recorded with file:line and a proposed handling, and no product code was edited, as assigned. Per the brief, Ship is prepare-and-stop, and any authorization-affecting follow-up needs Matt."
  - "Verdict vocabulary: PASS means no critical or major finding on that PR. It does not mean the PR is free of minors."
---

# Review: declare a route's venue scope once — authorize and set RLS context together

## Scope

- **Verdict gap closed here.** PR 5 (#6363) and PR 6 (#6365) merged with no `reviewer` verdict (breakdown.md Notes 2026-10-17; verification.md "Not verified"). This stage's verdicts, as they stand on main:
  - **PR 5 (`3cf46fd12`): PASS.** Minors M-3 and S-1 below.
  - **PR 6 (`033669bcf`): PASS.** Minors M-1, M-2 and M-4 below.
  - These are post-merge, so they do not satisfy the brief's "squash-merge once the reviewer passes" rule for those two PRs. That rule was bypassed on those two merges (Matt merged them himself), and this review records that and does not repair it.
- **Diffs read in full** (llms\*.txt regenerations skipped as generated):
  - PR 5: `availability.ts`, `holds.ts`, `events.ts`, `rls-route-sweep.fixtures.ts`, `venue-scope-coverage.test.ts`, `availability.test.ts`, `events-test-route-removed.test.ts`, `tools/route-contract/src/fastify-owners{,.test}.ts`, `CLAUDE.md`.
  - PR 6: `app.ts`, `middleware/venue-context.ts`, `services/venue-context-store.ts`, new `routes/named-venue.ts`, `tables.ts`, `reservations.ts`, `floor-plans.ts`, `events.ts`, `holds.ts`, `deposits.ts`, `venue-scope.ts` (comment), the deleted `routes/venue-access.ts`, the ADR-020 and ADR-026 amendments, `CLAUDE.md`, and the deleted and moved tests.
- **Current surface, consistency level:** all of `services/reservations/src/routes/venue-scope.ts` (300 lines); the coverage test's `UNSCOPED_ROUTES` map; a repo-wide grep for hand-passed membership lookups and for route files outside `venueScoped`/`inNamedVenueContext` that read a request `venueId`; the 25 `venueScoped` route files. Verification C2 and C3 already measured the post-run growth (7 new route files, none `pending-migration`). This review adds the security read below.
- **Checked against:** defect.md, architecture.md (incl. § Security rulings confirmed by Matt, 2026-10-05, and the PR 6 Matt ruling (a) in breakdown.md Notes), verification.md (2026-11-02, 11 PASS, 1 RETIRED).
- **Soft gate:** `verification.md` exists. Review follows Verify in the normal order.

## Findings

No critical and no major finding. **No critical finding is unfixed, because none exists.** Four minors and two suspicions follow.

### Minor: ADR-026 amendment claims "a request that is denied never entered a context at all", which is false for owner-access routes (M-1)

- Scenario: the 2026-10-12 amendment (`docs/adr/ADR-026-postgres-rls-venue-backstop.md:963-969`) says `venueScoped` applies the ADR-020 decision "and only then runs the optional entity `load` and the handler inside `runWithVenueContext`", so "a request that is denied never entered a context at all". For `access: { owner }` that is not so. `venue-scope.ts:286-292` runs `load` inside `runWithVenueContext(resolvedVenueId, …)` and only then calls `requireOwnershipOrAdmin`. That is the 3 `entity:reservation/owner` routes in `reservations.ts`. A non-owner who addresses an existing reservation id enters that reservation's own venue context, `getById` runs, and the guard then answers 403. The deviation was logged at implementation time (breakdown.md Notes, PR 1 deviation 3) and in the `venue-scope.ts:37-40` header comment, but not in architecture.md's order contract or the ADR amendment.
- Impact: no authorization bypass found. The venue comes from the server-side `app_resolve_venue_id` lookup of the entity, never from caller input, and the loaded entity is discarded on deny. The decayed contract is the ADR's own sentence, which a later reader will trust. Interface docs for `load` already say it must be a side-effect-free read (`venue-scope.ts:82-85`).
- Standard: none (the target repo has no `docs/standards.json`; see "Passes with no findings").
- Decision: deferred — doc-only. Proposed handling: a second dated clarification in the ADR-026 amendment section (the protocol's "Never rewrite" rule applies to Decision sections, so an appended dated note, not an edit of the 2026-10-12 text). It would state the owner-route exception next to the existing UNSCOPED exception. Ship carries it as a follow-up; it does not touch code.

### Minor: `GET /api/v1/floor-plans` enters a caller-named RLS context with no membership check, so only `listForMember`'s `WHERE` protects it (M-2)

- Scenario: `floor-plans.ts:84-92`. The route is `requireAuth` only. `inNamedVenueContext(request.query.venueId, …)` sets `app.venue_id` to whatever string the caller sent, then runs `listForMember(user.raw.sub, …)` for a non-admin. A signed-in non-member sending `?venueId=<venue B>` gets venue B's context and an empty page today, because the `where` carries `venue: { memberships: { some: { userSub } } }` (`services/floor-plan.ts:91-94`). If that filter were ever loosened, or the call swapped for a lookup that does not filter on membership, the RLS backstop would be pointing at the attacker's chosen venue instead of denying. The ADR-026 amendment (`:970-973`) states the exception openly, and the old global hook behaved the same way, so this is not a regression of PR 6.
- Standard: none.
- Decision: deferred — no exploitable path exists today, and fixing it adds a 403 for non-members who name a foreign venue (today 200 with an empty page). That changes behaviour, so it needs Matt's ruling (the brief makes behaviour changes product decisions). Proposed handling if he wants it: for a non-admin, enter context only when `hasVenueMembership(sub, venueId)`; otherwise answer the same empty page. Sweep fixture `rls-route-sweep.fixtures.ts:1485-1498` would gain a "non-member names foreign venue → empty page" case.

### Minor: lean `dead` — `access: "authenticated"` has no production caller and is the one access mode that authorizes nothing (M-3)

- Scenario: `venue-scope.ts:107-108,265` defines `"authenticated"` ("RLS context only; relies on `requireAuth`"). A reference search across `services/`, `packages/`, `apps/` and `tools/` finds it only in `venue-scope.test.ts:426,442,694-698`, `services/reservations/CLAUDE.md:185` (documentation) and the definition. The coverage registry's 55 descriptors contain none (verification C2). A route that picked it would let any signed-in identity enter RLS context for any venue it names, which is the unsafe shape this run set out to remove. Since the docs list it as a choice, an author can reach for it.
- Standard: none. Cut-list tag: `dead` (evidence: the search above; published surface = this service's internal module, no external importers).
- Decision: deferred — it was in the approved architecture (Interfaces § `VenueAccess`), so it is not a deviation, and removing it is a code change. Proposed handling: delete the branch, its three tests and the CLAUDE.md bullet when the next route work touches `venue-scope.ts`, or keep it and add a coverage-test rule that fails if any descriptor ends in `/authenticated`. Trigger to keep it: the first real route that needs context without membership.

### Minor: `check-adr` mechanically enforces 1 of 28 active ADRs, and not ADR-020 or ADR-026 (M-4)

- Scenario: verification C10 saw "Checking codebase against 1 active ADRs" and left it open. Cause, from `tools/cli/src/commands/adr.ts:66-80`: it keeps only ADRs whose frontmatter has `prohibited_patterns`. `grep -l '^prohibited_patterns:' docs/adr/*.md` lists only ADR-001, while 28 of the 30 ADR files carry `status: active` (ADR-020 and ADR-026 among them). The check was therefore green on both PRs without testing anything about authorization or RLS context. A later reintroduction of `enterWith` or a hand-passed `requireVenueAccess(fastify.venueMembershipLookup, …)` would not trip it. The coverage test and the FORCE sweep guard the second case, and nothing guards the first (see the `enterWith` grep in verification C10, which was manual).
- Standard: none.
- Decision: deferred — outside this run's scope. Proposed handling: add a `prohibited_patterns` entry for `enterWith` under `services/reservations/src` to ADR-026's frontmatter (frontmatter, not the Decision section), as a small follow-up PR. It needs Matt only because it touches an authorization ADR.

### Suspicion (not graded): admin `POST /api/v1/holds` with `venueId: ""` may have changed from the service's answer to 400 (S-1)

- What I saw: `CreateHoldBodySchema.venueId` is `z.string()` with no minimum (`packages/types/src/schemas/reservation-requests.ts:279`). Before PR 5 an admin skipped the guard and `""` reached `holdService.create`. After it, `readField` treats `""` as missing (`venue-scope.ts:199-204`), so an admin gets 400 "venueId is required" from the wrapper. The PR 5 body and breakdown.md Notes say holds bytes are unchanged. Notes 2026-10-10 recorded this same cell for guests, waitlist and the tables/floor-plan params, but not for holds.
- Settle it by: running an admin `POST /api/v1/holds` with `venueId: ""` against `3cf46fd12^` and against main and comparing. If the old answer was already a 400, there is no change. Non-admins get 403 either way. Not a security issue.

### Suspicion (not graded): PR 5 availability ruling not exercised in production (S-2)

- Carried from verification "Not verified". Behaviour is pinned by `availability.test.ts` (`returns 403 on %s for a signed-in non-member`, :389-395) and by the FORCE sweep. I did check the consumers the ruling could break: `useOpenTimes` → `NewReservationDialog` is the only non-widget caller of `api.availability.getTimeSlots` and is a staff dialog; the booking widget and `ChangeBookingDialog` use the slug-scoped public methods (`api-client/src/availability.ts:554`); the agent forwards the staff token (architecture.md assumption). Settle it by: one non-member staff JWT against prod.

## Security pass: what was checked and came back clean

Each item below was checked on current main and found sound.

- **Reachable without membership.**
  - Every `/api/v1` route is stamped or listed in `UNSCOPED_ROUTES` with a reason (coverage test, 10 tests green per verification C8). The mutation check in C8 shows the test goes red when an entry is dropped.
  - The 15 UNSCOPED entries were read one by one. The four admin fan-out routes (`tables` GET/POST, `reservations` GET/POST) and `events/stream` keep `requireAuth` plus `requireVenueAccess(lookup, queryVenueId | bodyVenueId)` as `preHandler`. The guard and the handler's `inNamedVenueContext` read the same field, so a non-admin cannot be authorized for one venue and run in another. An empty or non-string `venueId` is a 403 for non-admins (`authz.ts:105-112`) and no context for admins (`setVenueContext`'s `!venueId` branch).
  - The venue lists, venue create, venue groups, `/me`, health and the webhook carry reasons that match their code.
  - `access: "authenticated"` is unused (M-3).
- **RLS context before authorization.** Scoped member and manager routes: the venue is resolved, `admitIdentity` runs, then `decide`, then `runWithVenueContext` (`venue-scope.ts:274-295`), so a caller-supplied `venueId` is never in context before a decision. `venue-scope.test.ts` and `app-venue-context.test.ts` pin this ("does not enter a caller-supplied query venueId before the membership decision"). Exceptions: owner routes (M-1, server-resolved venue, no bypass) and `GET /floor-plans` (M-2).
- **Context dropped by the hook deletion.**
  - Routes whose context came only from the hook were enumerated by PR 6 (breakdown Notes 2026-10-12): the four fan-out routes plus `GET /floor-plans`. All five now use `inNamedVenueContext`, and the FORCE sweep's "UNSCOPED fan-out routes return the right rows" block covers them. It passed locally (269/269, verification C9) and in CI on `77f84aca5`.
  - `events/stream`: the handler (`events.ts:101-157`) issues no database query. It only registers an emitter callback filtered on the already-authorized `venueId`, so dropping the context drops nothing. The breakdown's PR 6 note asked for this check and it holds.
  - Public, token, webhook and cron paths use explicit `runWithVenueContext` (verification C3: all 7 remaining sites). No public route is addressed by `:venueId` (grep: none), so the hook never gave them context.
  - Known residuals left as the PR 6 rulings state: `GET /reservations?guestId=` with no `venueId` runs with no context (sweep fixture documents it), and an admin with no `venueId` runs unfiltered. Both are pre-existing, since the old hook never set a context for them either.
- **Owner and admin bypasses.**
  - Admin means the coarse role through `hasPermission(user, "admin")`, the same predicate ADR-020 specifies, evaluated once per request.
  - The wrapper still resolves the venue for admins (needed for context) but skips the membership lookup, as the architecture says.
  - Owner routes delegate to `requireOwnershipOrAdmin` with `resolveCurrentUserEmail`, unchanged from before PR 4.
  - A route that forgot `requireAuth` fails closed: `request.user` undefined reaches `requireVenueAccess`, which answers 401 (`authz.ts:85-91`), so a missing preHandler cannot open a route.
- **403 vs 404 leakage.**
  - Non-admin, unresolvable entity or unknown hold → `decide(…, null)` → `requireVenueAccess` 403 "You do not have access to this venue", identical to a real non-member answer. Admin → 404 `notFound`. For holds this is exactly Matt's ruling ("for non-admins an unknown hold returns 403, not 404").
  - Owner routes with an unknown reservation and a verified email → 403. With an unverified email → 401 (`ownership.ts:107-118`), which depends on the caller's own email state and not on whether the id exists, so it is not an existence oracle.
  - Availability: an unknown venue id and a real foreign venue id both give a non-member 403; only admins see the handler's 404.
- **PR 5 rulings, each re-read:** availability ×2 `venue: "params"` / member; holds POST `venue: "body"`; holds GET/DELETE/confirm `resolve: holdService.getVenueId` (no RLS policy on `reservation_hold`, so a plain read is correct). The session check stays on DELETE and confirm; the per-IP `publicRateLimitHook` still runs before `requireAuth`; confirm now receives `scope.venueId` and runs inside its context, closing the FORCE break the architecture named. `events/test` is deleted with its route-contract entry, sweep entry and UNSCOPED entry, and a test pins the 404. Nothing else in the repo references the route (grep).
- **Secrets, injection, error leakage.** No secrets or env reads were added. The resolve path is the parameterized SECURITY DEFINER function. Problem bodies come from `createProblemDetails` with fixed strings.

## Passes with no findings

- **Correctness:** clean apart from S-1 (a suspicion). In particular: `readField` treats `""` as missing; `load` null after resolve → 404; the wrapper's resolve/lookup errors propagate to the 500 handler and fail closed; `runWithVenueContext` uses `AsyncLocalStorage.run` (no `enterWith` anywhere, verification C10 grep).
- **Design:** matches architecture.md except the owner-route load-before-decide order (declared in breakdown PR 1 deviation 3; M-1 is the doc gap) and the Matt-ruled UNSCOPED fan-out routes (SSE, tables, reservations), which supersede the architecture's `venue: "query"/"body"` for them. Both are recorded in breakdown.md Notes. No new ADR was owed: the amendments leave both decision matrices unchanged, and neither Decision section was edited (both amendments are appended, dated sections). ADR-026's amendment overstates one point (M-1).
- **Complexity:** one cut (M-3). `named-venue.ts` (33 lines) has 5 callers for `inNamedVenueContext` and is the replacement for the hook on UNSCOPED routes, so it earns its place. No `lean:` markers were added by either PR (grep of both diffs). Shape concern handed to `deepen` in one line: `venue-scope.ts` mixes the direct/entity/resolve source union with three access modes in one 300-line function, which is still readable. No action now.
- **ADR compliance:** `adr_status.py` lists the ADRs (28 with raw `status: active`), each reported `standing: unrecognized` (the tool's value for status words outside its own vocabulary), so per the reference I read the status text: `active` means live. Read in full for this diff: ADR-020 (membership per request, matrix, 2026-10-12 amendment), ADR-026 (default-deny, `app.venue_id`, §4, 2026-10-12 amendment), ADR-002 (every new problem body goes through `createProblemDetails`; the wrapper's `sendProblem` does too). No violation. Out of scope, one line: ADRs on design system, edge routing, deployment, auth0 token plumbing, agent worktrees, versioning and the other live ADRs that the diff never reaches.
- **Domain passes:** Payments was selected because PR 6 touches `deposits.ts`, `deposits.test.ts` and `services/deposit-venue.ts` (path word `deposit`). Read the changes: comment-only edits (`deposits.ts:88`, `deposit-venue.ts:12`) and a test import. No payment logic, webhook or amount code changed, so clean. Migrations: none selected (no `migrations/`, `*.sql` or `schema.prisma` in either PR). Dependencies: none selected (no manifest or lockfile in either PR).
- **Standards:** the target repo has no `docs/standards.json`, and the pipeline plugin's own index covers `factory`, `pipeline` and `eval` domains, which this diff does not touch. No finding cites a standard, so no finding is raised to the fix-before-Ship track by an `enforced` statement.

## Open items carried from Verify, graded honestly

- **C1/C9 first-pass load timeouts.** Not a product finding: every failure was a 15 s/30 s timeout, pool exhaustion or 503 `preview-timeout` at host load 25-170, none was a 403/404/scope assertion, and both re-ran green. What is not observed: a single clean full-suite pass of the reservations unit tests on a quiet host. CI's `Test (Node 22, reservations)`, `RLS Integration` (269/269) and `CI Gate` were success on `77f84aca5` (verification C9), which is the stronger evidence. Not graded as a finding.
- **PR 5 rulings not probed in production:** S-2 above.
- **Problem-details drift (130 → 169 `createProblemDetails(` calls).** Not graded. It is outside defect.md's target state and brings no failure scenario. It is the brief's "problem-details cleanup" condition item, unaddressed by this run. Recorded for Ship's release notes as a known non-goal; it needs its own run if wanted.
- **`check-adr` reporting 1 active ADR:** explained and recorded as M-4.

## Verdict

**Ready to ship the artifact pull request; no code change blocks it.** There is no critical and no major finding, so the fix loop has nothing to fix before Ship. The code is already on main through six merged PRs, and Ship is prepare-and-stop: it opens one artifact PR and writes `outcome: prepared`.

PR 5 and PR 6 now have a reviewer verdict (this stage's, post-merge): PASS for both, with minors M-1 to M-4 deferred and S-1, S-2 open as suspicions. Each deferral is logged above with its reason. M-2 (behaviour change) and M-4 (edits an authorization ADR's frontmatter) need Matt before anyone acts on them. The rest are doc or dead-code cleanups with no authorization effect.
