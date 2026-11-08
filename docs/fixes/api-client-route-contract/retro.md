---
stage: operate
run: maintenance:api-client-route-contract
date: 2026-11-07
users-observed: 0
signal-source: "gh pr view 5877 (mergedAt 2026-09-28T20:50:00Z, squash 4fc15a65d, CI Gate SUCCESS); git -C $W log origin/main -- tools/route-contract packages/api-client/src/health.ts packages/api-client/src/venue-groups.ts; gh issue list --state all --search 'route-contract in:title,body'; gh issue view 8262; gh api repos/.../actions/workflows/ci.yml/runs?created=2026-09-28..2026-11-07 (2,500 runs, 654 failed; per-job logs NOT read); production probes 2026-11-07 via dig @1.1.1.1 + curl --resolve (/health/system, /api/health/system, /hospitality/ and a crawl of its 13 JS chunks); Sentry MCP search_errors over 90d for health/system (0 events, 0 users). No Cloudflare analytics token, no page-view event for SystemHealthBadge, no issue or comment from a user of the badge."
assumptions:
  - "users-observed is 0: the only user-facing change is the system-health badge in the hospitality admin dashboard. No record shows anyone opening it since 2026-09-28. The Owner is not counted, because nothing records his use."
  - "The guard has no end users. Its population is CI runs and PR authors. They are the sample, not the people, so they are not counted. 'Did it fire' is answered from code and issue history, not from per-job CI logs."
  - "The Sentry 0 for health/system is weak evidence. SystemHealthBadge swallowed the 404 before the fix, so Sentry would not have held an event then either. The 0 does not show the badge works."
  - "No brief `operate:` section exists. autorun-brief.md has no Operate heading; its Target state and Success criteria are used as the intended outcomes."
  - "release.md on main still ends 'Not yet shipped at the moment this file was committed' and carries no `outcome:` field. The merge is taken from gh, not from release.md."
---

# Retro: pin `@mbe/api-client` URL literals to a route that answers them

## Ship state

`release.md` on `main` still reads "Not yet shipped" (committed pre-push). It promised a post-merge follow-up PR with the merge SHA, CI run IDs, deploy run and smoke output. `gh pr list --search` and `git log origin/main -- docs/fixes/api-client-route-contract` find no such follow-up. The only commit touching the directory is the squash itself.

gh shows the change merged:

- PR #5877, merged 2026-09-28T20:50:00Z, squash `4fc15a65d`, `CI Gate` conclusion SUCCESS.
- The run is 40 days past merge.

Soft gate passed. What is not recorded is the hospitality redeploy. `packages/api-client/**` is outside `deploy-static.yml`'s `push.paths`, so the merge alone did not ship Finding A. The deployed bundle (below) shows it did ship.

## Outcomes vs. intent

Population is 0. The two outcomes about the badge are `unobserved` and record state only. Intended outcomes come from the brief's Target state and Success criteria, restated in `verification.md` criteria 1-4.

### A check runs in CI on every PR and fails when a client URL has no registered route

- What happened: `tools/route-contract` is on `main` and still wired into CI. `ci.yml:709` lists `./tools/route-contract/coverage/coverage-final.json`, and the guard runs through `turbo test:coverage` under the `Test` job in `CI Gate`. The last three `ci.yml` runs on `main` (2026-11-07) concluded success.
- Eight commits touched it after release, including three feature PRs: #7079 (menus), #7281 (floor-plan sections) and #7585 (venue team). Each added one line to the client roster in `client-inventory.ts` (`menus`, `floorPlanSections`, `venueTeam`). So the guard's exhaustiveness check was in the path of three later features and was satisfied by a one-line edit. I did not read the failing CI logs, so I cannot say whether it ever went red on a PR first.
- Maintenance run `failing-fetches` (tracking issue #8262, 2026-11-04) ran its own client-vs-route sweep and found no client call whose path, method or prefix misses its route. It states that "`tools/route-contract` already guards that in CI". That is the guard's claim held by an independent sweep, and is the nearest thing to a measured outcome here.
- Signal strength: pattern

### A real mismatch does not reach production unnoticed (the 2026-08-30 floor-plan pair, and what the guard itself found)

- What happened: the guard's two in-flight findings are fixed on `main`. A deliberate red-on-known-bad run (`proof/guard-red-on-main.md`) is on record from Verify. Since release, no issue or Sentry search I found reports a client URL answered 404 by the router. The one 404-shaped issue after release is #5711 (`/api/gen/ui`, 2026-09-23), filed before the merge. It predates the guard and is not its catch.
- That nothing has surfaced fits "the guard works" and also fits "nothing drifted". Forty days cannot tell them apart.
- Signal strength: unobserved

### Finding A, user-facing: the hospitality system-health badge calls `/health/system`, not `/api/health/system`

- What happened, as state (2026-11-07):
  - `dig @1.1.1.1 +short mattbutlerengineering.com` → `104.21.25.32`, `172.67.222.73`.
  - `GET /health/system` → HTTP 200 with the coarse healthy body.
  - `GET /api/health/system` → HTTP 404, unchanged from the pre-release probe in `release.md` step 8.
  - I crawled the deployed hospitality bundle: `/hospitality/` plus every chunk it references, 13 JS files. `` yn=`/health/system` `` is in `dist-BP-5oqy-.js`, and `/api/health/system` is in none. In `release.md` step 8 the same literal was `/api/health/system` in `dist-CoXGu3I2.js`.
  - So the fix is deployed. This shows the code that ships. It does not show that anyone saw the badge render.
- Signal strength: unobserved

### Finding A's accepted cost: the 10 req/60 s `/health/system` rate-limit bucket is not hit by admins

- What happened: `infrastructure/worker/rate-limiter.js` on `main` still carries `{ pattern: "/health/system", maxRequests: 10, windowSeconds: 60 }`. The badge polls once per 60 s per tab, so about ten tabs behind one IP saturate it. No data on admin tab counts or 429s from `/health/system` exists. Sentry 90 d shows 0 events mentioning it, but a swallowed error never reached Sentry. #8271 (merged) changed the origin services' health-route limits, not this edge bucket.
- Signal strength: unobserved

### Finding B, latent: `VenueGroupsClient.getBySlug` is gone

- What happened: `git grep getBySlug origin/main -- packages/api-client/src/venue-groups.ts` finds nothing. The method is deleted. Zero callers existed at release, so nothing could have used it.
- Signal strength: unobserved

### Coverage is stated, and the guard cannot be made vacuously green

- What happened: the floor `MINIMUM_CLIENT_PAIRS` is still 86 on `main` (`vacuity.ts:43`), pinned absolutely as well as relatively. Three feature PRs have added client methods since, so the real pair count has likely grown past 86. I did not re-measure it. If so, the 80-86 window Review accepted (N4) widened rather than narrowed.
- `ENV_CONDITIONAL_ROUTES` is now empty (`fastify-owners.ts:107`), because `POST /api/v1/events/test` was deleted by #6363. That shows the R1 mechanism's only known entry has been retired.
- Signal strength: pattern

## Defect recurrence

The defect class is a client URL literal with no router answering it. Since release the guard's own tests have caught none that I can find, and the `failing-fetches` sweep found none. Nothing recurred in the way the 2026-08-30 floor-plan pair or Finding A did. One adjacent class did recur: #8262's eight production failures were all runtime failures, not path mismatches, which the guard does not claim to cover (`verification.md` criterion 3 excludes payload shape and handler behaviour by design).

No recurrence, so no preventive seed on that ground.

## Open debt

The run's own issues are #5684-#5695, the twelve mirrored work items, created 2026-09-22 before the merge. All twelve are CLOSED (`gh issue list --search 'route-contract'`).

Review deferrals were recorded only as prose in `release.md` § Deferred to Operate. No issue was filed for any of them. Current state on `origin/main`, read 2026-11-07:

- R2, edge classifier default branch is fail-open: unchanged (`edge-owner.ts` still lists four terminal paths and classifies by response).
- R3, `edge` anti-vacuity signal is the literal `EDGE_TERMINAL_PATHS.length`: unchanged (`route-contract.ts:83`).
- R4, anti-narrowing check depends on the `*Client` name: unchanged (`client-inventory.ts:152`, `/^[A-Z]\w*Client$/`).
- R7, `packages/api-client/src/contract.test.ts` over-claims its name: unchanged. It still imports `@mbe/types` Zod schemas and no service.
- N1, `packages/rialto-catalog` has no `testTimeout`: `vitest.config.ts` has no match. Not re-measured, and no issue exists.
- N3, the production-only direction of the env diff is not pinned by a committed test: not re-checked.
- R8, a new production-required env var reds the guard with the service's own error: `PRODUCTION_BOOT_ENV` is still a bare record (`fastify-owners.ts:192`). No wrapper found.
- R9, stale line citations in comments: still present (`fastify-owners.ts:178`, `:254` and `:261` cite `app.ts:231`, `app.ts:266`, `create-service-app.ts:247`; `fastify-owners.test.ts:182` cites `app.ts:231`).

All eight are open in fact and none has an owner. They count toward nothing.

## Run retrospective

- Keep: the guard drives the real client rather than regexing source. It joins against booted routers and an edge worker, so it found Finding A (a route no owner has, in production) and Finding B without being told about either. Capture's "measure, don't trust" instruction produced real findings.
- Keep: Review's one major (R1, a route registered only outside production) was fixed in-run, and the fix fails closed. The measured difference between test and production boot must equal a named list, so a new env-gated route goes red. The fix has since been exercised: #6363 deleted the one entry and the list now stands empty.
- Keep: recording a verified production baseline before the release (`release.md` step 8: 404 on the old path, 200 on the new, literal in the live chunk). That let me repeat the same three probes today and compare like for like.
- Change: the post-merge record never landed. `release.md` was committed pre-push as "Not yet shipped" and its follow-up was left to a PR that was not opened or did not merge. A reader of `main` cannot tell from the artifact that this shipped, when the hospitality redeploy ran, or whether the smoke checks passed.
- Change: eight Review deferrals went into prose with no issue. Forty days later all eight are still in place, and unmeasured whether any matters. Same lesson as the seed already in `docs/backlog.md` on trackable Review deferrals; this run is another sample.
- Change: a user-facing fix whose failure mode is "the badge renders nothing" has no observer. The retro cannot tell whether the badge shows, and neither could the pre-fix code (the badge swallowed the 404). The run fixed the symptom's cause and left the invisibility of the symptom.
- Stop: nothing. Review's R5 correction (do not apply `testTimeout`, it is already applied and cannot reach an in-test `waitFor`) was worth having, and not carrying it into the release was the right call.

## Environment

Sources: `verification.md` § Failures (F1, F2) and § Not verified, `review.md` findings R1-R9 and N1-N6, `breakdown.md` § Notes.

| Mistake                                                                                                                                                                                                                                                    | Evidence                                                                              | Class      | Proposed carrier                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A guard invariant ("no route registration reads `NODE_ENV`") was false; one route registered only outside production. Fixed in-run.                                                                                                                        | `review.md` § R1; `release.md` § Review findings                                      | mechanical | Already carried: the env-diff assertion against `ENV_CONDITIONAL_ROUTES` in `tools/route-contract/src/fastify-owners.test.ts`, run by the `Test` job in `ci.yml`. Gap N3 (the production-only direction is not pinned) is seeded.                    |
| `MINIMUM_CLIENT_PAIRS` was pinned only relatively; lowering it to 20 left every test green. Fixed in-run.                                                                                                                                                  | `verification.md` F2; `review.md` § F2                                                | mechanical | Carried: the absolute-floor case in `tools/route-contract/src/vacuity.test.ts`, run by the same `Test` job. The 80-86 window is accepted, and the floor has not been ratcheted since.                                                                |
| Root `pnpm test` (uncapped `turbo run test`) is red on packages this branch does not touch, with a different victim each time: `rialto` `Toast`, `rialto-web` `page-registry`, `rialto-catalog` `registry`, `users` `ready.test.ts`, `reservations` hooks. | `verification.md` F1, § 6 of the re-verification addendum; `release.md` assumptions   | mechanical | Finding: `.husky/pre-push` runs the antipattern ratchet, not tests. `ci.yml:616` runs `turbo test:coverage --concurrency=2`, so the uncapped `pnpm test` the brief's criterion names runs under no hook and no CI job. Nothing re-checks it. Seeded. |
| Verify's F1 recommended a remedy (`testTimeout: 15000`) that was already applied in both victims and cannot reach an in-test `waitFor`.                                                                                                                    | `review.md` § R5; `release.md` § Explicitly NOT done                                  | judgement  | None deterministic. A Verify recommendation needs a check that the recommended config is not already present; no existing checker does that.                                                                                                         |
| The ratchet baseline had zero slack: the guard added 24 `hardcodedRoutes` and 1 `emptyCatch`, so the baseline was raised (825 → 847, 77 → 78).                                                                                                             | `release.md` § The ratchet-baseline raise; Review addendum                            | mechanical | Carried and working: `scripts/check-ai-antipatterns.mjs` in `.husky/pre-push:32` and `ci.yml:999`. It forced a recorded, attributable `--update`.                                                                                                    |
| `architecture.md` claimed workspace deps resolve to source under vitest. They resolve to `dist` for `@mbe/api-client` and some services have no `exports`. Decompose caught it.                                                                            | `breakdown.md` § Notes (2026-09-22)                                                   | judgement  | None. Item 1's smoke test (`tools/route-contract/src/workspace-resolution.test.ts`) pins resolution going forward, so this exact claim cannot decay quietly.                                                                                         |
| The planned `ioredis` mock was unavailable (unresolvable from the package). Closed by `NODE_ENV=test` instead, and the note that justified it was itself wrong and later corrected.                                                                        | `breakdown.md` § Notes (item 3 and its R1 correction)                                 | judgement  | The same env-diff test as row 1 now measures the premise.                                                                                                                                                                                            |
| Five line citations in guard comments point at the wrong lines after a merge, and are still wrong today.                                                                                                                                                   | `release.md` R9; `fastify-owners.ts:178,254,261`; `fastify-owners.test.ts:182`        | mechanical | No existing checker covers file:line citations in comments. Seeded as a candidate for `scripts/` rather than another prose rule.                                                                                                                     |
| `packages/api-client/src/contract.test.ts` reads as the whole contract and covers the payload half only. Flagged at Capture and again at Architect and Verify; unfixed.                                                                                    | `verification.md` § Failures; `release.md` R7                                         | judgement  | None existing. A rename is the fix and no gate asks for it. Seeded.                                                                                                                                                                                  |
| `release.md` was committed as "Not yet shipped" and the post-merge record never reached `main`.                                                                                                                                                            | `release.md` § Outcome; `git log origin/main -- docs/fixes/api-client-route-contract` | judgement  | None verified. This predates the `outcome:` field; no workflow checks that a `release.md` on `main` is non-pending. Seeded.                                                                                                                          |

## Idea seeds

- Make `tools/route-contract` classify an edge response as an owner only when it is positively tagged by the edge router, and make the `edge` anti-vacuity signal a measurement of the live router rather than the literal `EDGE_TERMINAL_PATHS.length`; measure by adding a throwaway client literal under `/dashboard` and a bare `.map` path and checking whether the guard goes red (from: maintenance:api-client-route-contract)
- Give the hospitality `SystemHealthBadge` an observer (a render or poll-outcome event, or a counted 429), and measure how many admin tabs poll `/health/system` per source IP per minute against the edge's 10 req/60 s bucket in `infrastructure/worker/rate-limiter.js`, so Finding A's accepted cost becomes a number (from: maintenance:api-client-route-contract)
- Re-measure the guard's real client-pair count on `main` and decide whether `MINIMUM_CLIENT_PAIRS` (86) and the 80 absolute floor should ratchet up, since menus, floor-plan sections and venue-team clients were added after the floor was set (from: maintenance:api-client-route-contract)
- Count, from `gh run` logs for `ci.yml` since 2026-09-28, how many failed `Test` jobs named a `tools/route-contract` test, and which PRs, so the guard's catch rate is a measured number rather than an inference from roster edits (from: maintenance:api-client-route-contract)
- Run the uncapped root `pnpm test` somewhere that records it: either a scheduled CI job that reports the failing package per run, or a decision that the brief's "`pnpm test` green" means the `--concurrency=2` form; measure the red rate on `main` over 14 days. Include `packages/rialto-catalog` (no `testTimeout`) and `services/users` `ready.test.ts` (hook timeout on both trees) (from: maintenance:api-client-route-contract)
- Rename or narrow `packages/api-client/src/contract.test.ts` so it no longer reads as covering the path half of the contract, and point its header at `tools/route-contract` (from: maintenance:api-client-route-contract)
- Pin the two untested directions of the guard's reference boot: extract the test-versus-production env diff as a pure function and test both `registeredUnder` directions (N3), and wrap each reference boot so a new production-required env var is reported naming `PRODUCTION_BOOT_ENV` (R8) (from: maintenance:api-client-route-contract)
- Derive the guard's client roster from `Object.keys(createApiClient(...))` instead of the `*Client` class-name pattern (R4), and replace the stale `file:line` citations in `fastify-owners.ts` and its test with symbol names (R9) (from: maintenance:api-client-route-contract)
- Make Ship's post-merge record land: have the ship step open or push the follow-up that rewrites `release.md` with `outcome:` and the merge SHA, and have a repo check flag any `release.md` on `main` whose body still says "Not yet shipped"; measure how many `docs/**/release.md` on `main` carry that text today (from: maintenance:api-client-route-contract)

## Run complete

Closed 2026-11-07. Seeds above are the input to the next Idea-stage run. The existing `docs/backlog.md` seed on making Review deferrals trackable covers that theme and is not duplicated here.
