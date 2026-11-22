---
stage: operate
run: maintenance:venue-scoped-routes
date: 2026-11-22
users-observed: 0
signal-source: "none: the shipped change is an internal authorization refactor of services/reservations with no user-facing surface and no usage counter; no analytics or Sentry query was run for it"
assumptions:
  - "users-observed is 0. The only observers of this change are the Owner and automated checks (CI, the RLS sweep, Verify). No outcome below reads as adopted or used; every signal is `unobserved`, `anecdote` or `measured` by a test, never `pattern` of use."
  - "release.md records `outcome: released` (released-at 2026-11-03T03:26:14Z, artifact PR #8173). The code itself reached main earlier through six squash PRs (#6132, #6193, #6224, #6323, #6363, #6365), so 'released' for this run means the artifact PR merged; the code has been in prod since 2026-10-09 to 2026-10-13 per the merge dates in breakdown.md Notes."
  - "autorun-brief.md says `operate: skip`, and release.md says Operate is skipped. This retro is written on the Owner's later request, so the brief's skip is read as superseded for this stage. The brief never supplies the count, and none was taken from it."
  - "Sentry was NOT queried: the sentry MCP tools are deferred in this session and were not loaded. Recurrence below is from `gh` queries, a grep of the fresh origin/main checkout (2513b39a9) and the text of issues and PRs, not from event counts."
  - "No Knowledge-base harvest was run (not requested for this retro); stated as skipped, not as zero findings."
---

# Retro: declare a route's venue scope once, authorize and set RLS context together

## Outcomes vs. intent

Population: 0 people observed. The target state in `defect.md` is a statement about code shape and test coverage, so it can be measured by checks. Whether the change made the service safer or easier to extend for anyone is `unobserved`.

### Target 1 and 2: a route declares its venue scope once; one module does membership, RLS context, entity load and the 403/404 envelope

- What happened: `verification.md` (2026-11-02) graded C2 and C4 PASS. Counts in non-test route files went from 43 hand-passed `fastify.venueMembershipLookup` to 5, from 29 `loadInVenueContext(` to 0, and the app-wide RLS hook and `venue-access.ts` are gone (C3, C10). I re-checked on origin/main `2513b39a9` on 2026-11-22: `venue-access.ts` does not exist, and `fastify.venueMembershipLookup` appears in `tables.ts` (2), `reservations.ts` (2) and `events.ts` (1), the same five fan-out sites Verify listed, and 0 in `guests.ts` and `holds.ts`. I grepped those five files only, not every route file.
- Signal strength: measured (by CI-pinned tests and greps), no use signal. The 7 route files added after 2026-10-17 all declare scope through `venueScoped` (verification C2), which is the only evidence the pattern is being followed by later work; it is one data point over one stretch of time, so anecdote as to habit.

### Target 5: every unchecked-venueId route has a recorded decision

- What happened: C7 PASS. Availability, holds and `events/test` were decided and implemented; the four admin fan-out routes and the SSE stream were ruled UNSCOPED by Matt (breakdown.md Notes 2026-10-10, 2026-10-11). Production behaviour of the availability and holds rulings was never probed (verification "Not verified", review S-2).
- Signal strength: unobserved in prod; measured in tests.

### Target 6: the sweep completeness check runs locally without a DB

- What happened: C8 PASS, including a mutation check that goes red when an UNSCOPED entry is dropped.
- Signal strength: measured. Limit found afterwards: the check enforces `/api/v1` routes only (see the miss analysis below).

### Target 7: the scaffold skill teaches the real shape

- What happened: RETIRED by Matt on 2026-10-10 (skill deleted by #6219); the rescoped item (`services/reservations/CLAUDE.md` § Venue scope) passed C12.
- Signal strength: measured (doc present); whether any author reads it is unobserved.

### Did the defect recur after release?

Not the structural one, as far as I measured. Two adjacent things surfaced; neither is the same defect and neither is proven to be caused by this run.

- **Guest-card 403 (Sentry HOSPITALITY-E, issue #8256, filed 2026-11-04, fixed in #8275).** Per the issue, 96 events and 5 users between 2026-10-11 and 2026-11-04. #8275's root cause: `resolveReservationsListVenueId` read the FORCE-RLS `guests` table with no venue context, returned null, and `requireVenueAccess` 403'd every non-admin; "the RLS route sweep already recorded the admin half of this bug as `expectBroken(... item-2: unscoped guestService.getById)`". This is the exact lookup breakdown.md Notes 2026-10-11 said PR 6 "must give a SECURITY DEFINER resolution or explicit context before the global hook is deleted". PR 6 instead kept `GET /reservations?guestId=` context-free under Matt's ruling (a) of 2026-10-12, and Verify and Review recorded it as a "known residual, not a regression" (verification "Not verified"; review Security pass). The 403 itself predates this run's release (it started 2026-10-11 per the issue), so the run did not cause it; the run saw the cause, deferred it, and graded it clean. Signal: anecdote (one issue, one Sentry group, counts read from the issue text, not queried).
- **Public hold DELETE outside the coverage test (issue #8039, filed 2026-11-01, fixed in #8073).** A scheduled audit found `DELETE /public/v1/venues/:slug/holds/:holdId` skipped `publicVenueScoped` and was absent from `venue-scope-coverage.test.ts`. The issue calls it low severity (no cross-venue release possible: `sessionId` is the capability and `reservation_holds` has no RLS policy). It was created before this run's merge, so it is the run's neighbour, counted toward nothing below.
- **Staff hold confirm accepted a foreign-venue `guestId` (#9277, merged 2026-11-20).** Closes part of a `docs/backlog.md` seed that `defect.md` Notes had seen and deliberately not claimed. Not a recurrence of this defect; recorded because it shows the unclaimed seed took about six weeks to be worked.

## Pipeline miss check (maintenance run)

- **Regression test missed.** Yes, for #8256. #8275 says the #4865 unit tests "mocked `getById` to return a guest, so they never saw the RLS behaviour"; the only thing that did see it was a sweep fixture marked `expectBroken`. A broken-marker with no owner or expiry passed Verify. The completeness test already has a rule "a declared route's sweep fixture is not still marked broken" (verification C8), but it applies to declared routes, not to the UNSCOPED ones that carried this one.
- **Design constraint missed.** Yes, for #8039. The coverage test measures `/api/v1` routes (verification C2: 55 descriptors, 1 `slug/public`), so a `/public/v1` route that is not wrapped is invisible to it. Review's security pass checked "no public route is addressed by `:venueId`" by grep, which is a one-off, not a guard.
- **Review finding missed.** No new one. The four minors (M-1 to M-4) and two suspicions (S-1, S-2) are deferred and none was filed as an issue that I found. I ran a keyword search (`venueScoped`, `venue-scope`, `venue-scoped-routes`) and found no issue for M-2, M-3 or M-4; this is not an exhaustive search.

## Open debt

The run's own deferrals and neighbours; never counted as feedback. The protocol rule: an issue created before the run's merge (2026-11-03T03:26:14Z) or citing the run's review or verification is the run's own.

- Review M-1: the ADR-026 amendment says a denied request "never entered a context at all", false for the 3 owner routes (review.md, deferred, doc-only).
- Review M-2: `GET /api/v1/floor-plans` enters a caller-named RLS context with no membership check; today only `listForMember`'s `WHERE` protects it. A fix changes behaviour (200 empty page to 403), so it needs Matt.
- Review M-3: `access: "authenticated"` has no production caller and authorizes nothing.
- Review M-4: `check-adr` enforces 1 of 28 active ADRs, not ADR-020 or ADR-026; no check blocks reintroducing `enterWith`.
- Review S-1: admin `POST /api/v1/holds` with `venueId: ""` may have changed from the service's answer to 400. Unsettled.
- Review S-2 and verification "Not verified": no production probe of the PR 5 rulings (needs a non-member staff JWT).
- Verification "Not verified": no quiet-host single-pass run of the full reservations suite; `check-adr` scope; 169 vs 130 `createProblemDetails(` calls (problem-details cleanup, not in target state).
- Residuals Matt ruled to keep: `GET /reservations?guestId=` with no `venueId` ran context-free (now changed by #8275, which this run did not do); admins can create venue-less tables and reservations (seeded at `docs/backlog.md:261`); deposit 400/404 bodies reach the wire as `{}`.
- Neighbour issues created before the merge, closed: #6276 (deepen `venueScoped` with public-slug and manage-token sources, cites this run), #6282, #8039 (fixed by #8073).
- `TestEventBodySchema` / `testEventBodyJsonSchema` in `packages/types` have no consumer since `events/test` was deleted (breakdown.md Notes 2026-10-12). Not re-checked on current main.

## Run retrospective

- Keep: the architecture's stop-and-ask on behaviour-changing migrations. Three blockers (SSE stream, tables, reservations; then the hook deletion) each stopped the run, listed options (a)/(b)/(c), and waited for Matt's ruling instead of silently changing admin behaviour (breakdown.md Notes 2026-10-10, 2026-10-11, 2026-10-12).
- Keep: RED-first pins on unmigrated routes, and the mutation check in C8. Both made the claim "the guard still works" testable rather than read.
- Keep: Verify's honesty about load-induced failures; it recorded five failed RLS attempts and the final 269/269, and said no quiet-host single pass was seen (verification C1, C9).
- Change: do not grade a known broken path "not a regression" when the run itself listed it as owed. breakdown.md 2026-10-11 said PR 6 must fix the guest lookup; Verify and Review then passed it as a Matt-ruled residual. Either file it as an issue at the moment it is deferred, or do not carry it as accepted.
- Change: PR 5 and PR 6 merged with no `reviewer` verdict, and their gate boxes stayed unchecked until 2026-10-17 (breakdown.md Notes). The review that closed the gap came three weeks later and post-merge, so it could not stop anything.
- Change: Ship did not explain why `Deploy Services` succeeded on #6365's merge commit while the `CI` push run failed (`AI Antipattern Ratchet`, `CI Gate`; release.md "Did the code reach production?"). It recorded the fact and moved on.
- Stop: nothing proposed. Review and Ship ran as direct passes with no subagents (review.md assumptions); for a docs-only artifact PR that was proportionate.

## Environment

One row per mistake the run recorded. Classes follow the rule: a mechanical mistake gets a check, never a prose rule.

| Mistake                                                                                                                                    | Evidence                                                               | Class      | Proposed carrier                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Main went red on the AI Antipattern Ratchet after PR 2 (`hardcodedRoutes` 854 vs baseline 852)                                             | breakdown.md Notes 2026-10-10                                          | mechanical | The existing ratchet in pre-push and CI already measured it; the gap was the merge result, not the check. Existing note: "Ratchet slack is shared, re-run on merge result" (auto-memory). No new carrier; recorded as a repeat.                                                                  |
| `Deploy Services` reported success on #6365's merge commit while `CI Gate` was red                                                         | release.md §Did the code reach production?                             | mechanical | The `Wait for CI` job in `deploy-services.yml` (named in release.md); why it passed was not investigated. Seed below.                                                                                                                                                                            |
| Two merges (#6363, #6365) had no `reviewer` verdict; gate boxes unchecked                                                                  | breakdown.md Notes 2026-10-17; review.md §Scope                        | judgement  | The brief's own rule ("squash-merge once the reviewer passes") was bypassed by the Owner's own merge. The existing `reviewer-verdict:` comment convention (auto-memory, #9308) and `reviewed-merge.yml` (gotchas.md) are the carriers for agent merges; neither stops a hand merge. Not changed. |
| A known-broken sweep fixture (`expectBroken`, unscoped `guestService.getById`) passed Verify and Review and surfaced as a prod 403 (#8256) | #8275 body; verification "Not verified"; breakdown.md Notes 2026-10-11 | mechanical | `venue-scope-coverage.test.ts`, which already has "a declared route's sweep fixture is not still marked broken": extend it to the UNSCOPED entries, or require each `expectBroken` to cite an open issue.                                                                                        |
| The completeness test covers `/api/v1` only; a public route outside `publicVenueScoped` was invisible (#8039)                              | #8039 body; verification C2                                            | mechanical | `venue-scope-coverage.test.ts`: add the `/public/v1` routes to the registry-equality check.                                                                                                                                                                                                      |
| `check-adr` was green on both authorization PRs while checking 1 of 28 ADRs                                                                | review.md M-4; verification C10                                        | mechanical | `prohibited_patterns` frontmatter on ADR-026 for `enterWith` under `services/reservations/src`, read by the existing `check-adr` command.                                                                                                                                                        |
| Reservations unit and RLS suites failed under host load 25-170 and needed isolated reruns                                                  | verification C1, C9                                                    | mechanical | The per-package `testTimeout` and `hookTimeout` in `vitest.config.ts` (gotchas.md "Cold-cache test timeouts"). Whether a verify-time concurrency cap exists was not checked.                                                                                                                     |
| ADR-026 amendment overstated one property ("denied request never entered a context")                                                       | review.md M-1                                                          | judgement  | A second dated clarification appended to the ADR-026 amendment section (the protocol's never-rewrite rule). Prose only; no deterministic check could catch it.                                                                                                                                   |

## Idea seeds

Appended to `docs/backlog.md` by the orchestrator, one line each (this run does not edit that file).

- Make a known-broken RLS sweep fixture carry an owner: fail `venue-scope-coverage.test.ts` when an `expectBroken` or UNSCOPED entry has no open issue reference, since the `guestId`-only reservations list sat marked broken from 2026-10-11 until it 403'd in prod (HOSPITALITY-E, #8256, fixed #8275) (from: maintenance:venue-scoped-routes)
- Extend the venue-scope completeness check from `/api/v1` to `/public/v1` routes, so a public route outside `publicVenueScoped` fails a test rather than waiting for a scheduled audit (#8039, fixed #8073) (from: maintenance:venue-scoped-routes)
- Add a `prohibited_patterns` entry for `enterWith` under `services/reservations/src` to ADR-026's frontmatter so `check-adr` enforces an authorization ADR; it checks 1 of 28 active ADRs today (review.md M-4) (from: maintenance:venue-scoped-routes)
- Find out why `Deploy Services` concluded success on #6365's merge commit (`033669bcf`) while `CI` and `CI Gate` failed on the same commit, and make the `Wait for CI` job fail closed (release.md, run 38459405158 vs 38459405120) (from: maintenance:venue-scoped-routes)
- Decide whether a non-admin naming a foreign venue on `GET /api/v1/floor-plans` should get 403 instead of an empty 200 page; it enters the caller's named RLS context with only `listForMember`'s `WHERE` protecting it (review.md M-2, needs Matt) (from: maintenance:venue-scoped-routes)
- Delete the unused `access: "authenticated"` mode in `venue-scope.ts` (no production caller, authorizes nothing) or add a coverage rule that fails if any descriptor uses it (review.md M-3) (from: maintenance:venue-scoped-routes)
- Probe production once with a non-member staff JWT for `GET /api/v1/availability/:venueId` and `/api/v1/holds/:id` (expect 403), and compare admin `POST /api/v1/holds` with `venueId: ""` before and after #6363 (review.md S-1, S-2) (from: maintenance:venue-scoped-routes)
- Append a dated clarification to ADR-026's 2026-10-12 amendment that owner-access routes load inside the entity's own venue context before the ownership decision (review.md M-1) (from: maintenance:venue-scoped-routes)

## Run complete

2026-11-22. The run met its target state as measured by Verify (11 PASS, 1 RETIRED) and the structural counts still hold on origin/main for the five fan-out files re-grepped. No one has used it: population 0, so adoption and user effect are unobserved. Two gaps the pipeline should have caught, a known-broken sweep fixture and a coverage test blind to public routes, are the first two seeds above. Sentry was not queried. Seeds above are the input to the next Idea-stage run.
