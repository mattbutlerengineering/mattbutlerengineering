---
stage: ship
run: maintenance:api-client-route-contract
date: 2026-09-28
assumptions:
  - "`origin/main` was NOT merged into the branch before pushing. `git fetch origin main` left it at `7ac892126`, the same tip Review measured on 2026-09-28. The two commits it is ahead of the branch's merge-base (`49c7d773d`) are metrics-only (#5849, #5850). The Ship instruction was to merge only if `origin/main` had moved, and it had not. The ratchet was re-run on the would-be merge tree (`git merge-tree --write-tree HEAD origin/main` → `fcc973e5b`) instead, and CI's `pull_request` run tests the PR's merge ref regardless. Decided without live user input."
  - "`deploy-static.yml`'s `workflow_dispatch` takes no inputs, and its `detect-changes` job sets `marketing`, `hospitality` and `rialto-web` all to `true` on a dispatch. The one dispatch this release needs (hospitality, because `packages/api-client/**` is not in the workflow's `push.paths`) therefore also redeploys marketing and rialto-web from `main`'s current state. That is accepted as the cost of the only CI-mediated way to redeploy hospitality. Decided without live user input."
  - "The post-merge record (merge SHA, CI run IDs, deploy run, smoke output) is written in a separate docs-only follow-up PR, not into this file before merging. This file is committed before the push, so it can only truthfully describe the merge and deploy as next steps. Decided without live user input."
  - "If `CI Gate` fails on a wall-clock timeout in a package this branch does not touch, and that timeout already reproduces on `origin/main` (Verify N1: `packages/rialto-catalog`, `services/users` `ready.test.ts`), ONE `gh run rerun <run-id> --failed` is permitted and will be recorded. Any other failure, or a second red run, stops the release unmerged. This does not contradict R5: R5 forbids applying `testTimeout` in this run, not a single recorded rerun of an environmental failure. Decided without live user input."
---

# Release: pin `@mbe/api-client` URL literals to a route that answers them (`maintenance:api-client-route-contract`)

This release ships three things in one squash merge:

1. **The guard.** `tools/route-contract` (`@mbe/route-contract`) is a new leaf
   workspace package. It runs the real client, joins every request it makes
   against four route owners (reservations, users, agent, edge worker), and
   fails on any request no owner answers. It runs in CI on every PR through
   `pnpm turbo test:coverage --concurrency=2` under the `Test` job, which is in
   `CI Gate`'s `needs`.
2. **Finding A, fixed and user-facing.** `packages/api-client/src/health.ts`
   now sends `/health/system` instead of `/api/health/system` (`dd3c49fb6`).
3. **Finding B, fixed and latent.** `VenueGroupsClient.getBySlug` is deleted
   (`fffc736d8`).

No version bump, tag, or changeset. `@mbe/api-client` and `@mbe/route-contract`
are private workspace packages, and nothing here is published to npm.

## Pre-flight

- [x] **Verification green.** `verification.md` has no unresolved failure that
      blocks. Criteria 1–4 PASS on the merged head `1ff0b79dd`. Criterion 5 is
      PARTIAL on two counts:
  - Root `pnpm test` is red on packages this branch does not touch, and it is
    red on `origin/main` alone too (Verify § 6, N1).
  - `CI Gate` on the PR cannot be observed before push. That half is this
    stage's to close (see § Post-release checks).
- [x] **Review gate.** `review.md` frontmatter says `unfixed-critical: 0` and
      `unfixed-major: 0`, re-reviewed on head `85c0884e8`. The only commit
      after it is `29def7baf`, which touches `review.md` alone.
- [x] **No secrets in the diff.** See the release log, steps 5 and 6.
- [x] **Target config present.** No new environment variable, secret or
      binding is required in any deployed environment:
  - The guard is test-only.
  - Finding A is a client path change to a route the edge already answers.
  - Finding B is a deletion.
  - The five placeholder values in `PRODUCTION_BOOT_ENV` exist only inside
    the guard's in-process reference boot.
- [x] **Migrations / data.** None.
      `git diff --name-only origin/main...HEAD | grep -iE 'migrat|prisma|schema\.prisma'`
      → no match (exit 1).
- [x] **Rollback plan concrete.** See below.

## Rollback plan

The release is a single squash commit on `main`. Roll it back by reverting
that commit **through a PR**, because `main` must stay green and nothing is
admin-merged. Then redeploy hospitality through CI, because a revert of
`packages/api-client/**` does not trigger `deploy-static.yml` on its own
either.

```bash
# 0. <SQUASH_SHA> = mergeCommit.oid from: gh pr view <N> --json mergeCommit
git fetch origin main
git worktree add -b revert/api-client-route-contract <scratch-dir> origin/main
cd <scratch-dir>
git revert --no-edit <SQUASH_SHA>
#    If metrics/ai-antipattern-baselines.json or any generated file conflicts,
#    do not pick a side: finish the revert, then regenerate on the result:
pnpm install --frozen-lockfile              # drops the tools/route-contract importer
pnpm build --filter @mbe/cli... && pnpm regen
node scripts/check-ai-antipatterns.mjs      # --update only if a counted delta is attributable
pnpm graph && pnpm generate:dep-graph       # dep-graph.json / dependency-graph.md
git push -u origin revert/api-client-route-contract
gh pr create --base main --title "revert: pin api-client URL literals to a registered route (#<N>)" --body-file <file>

# 1. Merge only when CI Gate concluded SUCCESS on the revert PR's head
gh pr merge <R> --squash --delete-branch

# 2. Redeploy hospitality from main (packages/api-client/** is not in push.paths)
gh workflow run deploy-static.yml --ref main
gh run watch <run-id> --exit-status

# 3. The revert push also touches infrastructure/worker/dep-graph.json, so
#    pulumi-up.yml redeploys the edge router on its own. Confirm its job
#    conclusions, not just the workflow's (Pulumi "success" can be a skip).
```

What a rollback undoes, so nobody runs it by reflex:

- It reintroduces Finding A's production 404. The badge absence comes back.
- It removes the guard.

A rollback is only warranted if `/health/system` breaks something worse than
an absent badge, or if the guard itself wedges CI. For the second case, a
narrower revert of `tools/route-contract` alone, through the same PR path,
keeps Finding A fixed.

Automatic safety net, for reference: `deploy-static.yml`'s own `rollback` job
runs `wrangler rollback` for each deployed app when its `verify` job fails.
That is CI's rollback, not a manual step.

## Release log

Every command below was run in the worktree
`.claude/worktrees/api-client-route-contract` on 2026-09-28, at branch head
`29def7baf`.

1. `git fetch origin main` → `origin/main` = `7ac892126`. `git ls-remote origin refs/heads/main`
   → `7ac892126c3de6d1adc0431a9352d28bd2d19742`.
   `git log --oneline HEAD..origin/main` → `7ac892126 chore: record review-burden metrics (#5850)`,
   `6a2886253 chore(metrics): learning-loop 2026-09-28 (#5849)`. These are the
   same two metrics-only commits Review measured. **No merge performed** (see
   `assumptions:`).
2. `git merge-tree --write-tree HEAD origin/main` → `fcc973e5bd312b5e63261bbaa363bc89f9c595c0`,
   `MT_EXIT=0`, a clean merge. The tree was exported with `git archive` into a
   scratch directory, and `node scripts/check-ai-antipatterns.mjs` was run
   there:

   ```
     OK       emptyCatch: 78 (baseline: 78)
     OK       hardcodedRoutes: 847 (baseline: 847)
   All patterns within baseline. No regressions detected.
   MERGED_RATCHET_EXIT=0
   ```

   All eight patterns are `OK`. Zero slack remains on both counters (N5), so
   the ratchet must be re-read on the PR's merge ref if `main` moves before
   the merge.

3. `node scripts/check-ai-antipatterns.mjs` at HEAD → `emptyCatch: 78 (baseline: 78)`,
   `hardcodedRoutes: 847 (baseline: 847)`, `All patterns within baseline.`,
   `HEAD_RATCHET_EXIT=0`.
4. `pnpm regen --check` → `All generated artifacts are up to date.`, `REGEN_CHECK_EXIT=0`.
   `pnpm --dir tools/route-contract test` → `Test Files 7 passed (7)` /
   `Tests 68 passed (68)`, `GUARD_EXIT=0`. First, the client `dist` the guard
   resolves was confirmed fresh:
   - `dist/health.js:17` is `const SYSTEM_HEALTH_PATH = "/health/system";`;
   - `dist/deposits.js` contains `getByReservation`;
   - no `packages/api-client/src/*.ts` is newer than `dist/index.js`.
5. **Secret scan, pattern pass.** `git diff origin/main...HEAD` added lines
   were grepped for the following:
   - Stripe live keys and long `sk_test_` keys;
   - AWS `AKIA`/`ASIA` key ids;
   - PEM private-key headers and JWTs;
   - `ghp_` / `github_pat_` tokens, Slack `xox*-`, Google `AIza`, and `npm_`
     tokens.

   Result: no match, `SECRET_HITS_EXIT=1`. The broader assigned-literal pass
   returned only the guard's two placeholder values, `MANAGE_TOKEN_SECRET: "route-contract-reference-boot"`
   and `UNSUBSCRIBE_TOKEN_SECRET: "route-contract-reference-boot"`. These are
   non-secret strings by design (Review § Security).

6. **Secret scan, the repo's own scanner.** `scripts/secret-scan.mjs`'s
   `scanForSecrets()` was run over the full content of every added or
   modified file in the branch diff. The allowlist was bypassed, so that tests
   and `.md` were scanned too. Result: `SCANNED=46 HITS=0`.
7. **Auto-close trailers.** `git log --format=%B origin/main..HEAD` (27
   commits) was grepped for `close[sd]|fix(e[sd])|resolve[sd] #N`. No match,
   `AUTOCLOSE_GREP_EXIT=1`. The squash commit message will be written without
   one too. The twelve mirrored issues #5684–#5695 are already closed, and this
   run has no tracker intake.
8. **Production baseline before the release**, read-only, with DNS
   cross-checked first:
   - `dig @1.1.1.1 +short mattbutlerengineering.com` → `104.21.25.32`,
     `172.67.222.73`. The LAN resolver returned the same two, so there is no
     sinkhole.
   - `curl --resolve …:443:104.21.25.32 https://mattbutlerengineering.com/api/health/system`
     → `HTTP_CODE=404`,
     `{"message":"Route GET:/api/health/system not found","error":"Not Found","statusCode":404}`.
   - `…/health/system` → `HTTP_CODE=200`,
     `{"status":"healthy","timestamp":"2026-09-28T20:19:22.965Z",…,"subsystems":{"services":{"status":"healthy"},"static_sites":{"status":"healthy"},"ci":{"status":"healthy"},"deploys":{"status":"healthy"}}}`.
   - The deployed hospitality bundle was crawled from `/hospitality/` (67 JS
     chunks). `/api/health/system` is present in `dist-CoXGu3I2.js` as
     ``kr=`/api/health/system` ``. No chunk carries a quoted `/health/system`
     without the `/api` prefix. This is Finding A, live in production at the
     moment of release.
9. **Deploy preconditions.**
   - The deploy circuit breaker (`circuit-breaker-state` branch) reads
     `{"state":"closed","updatedAt":"2026-09-28T15:27:10Z"}`.
   - The last four `deploy-static.yml` runs and the last four `pulumi-up.yml`
     runs all concluded `success`. The latest are `36096388047` and
     `36179777386`.

**Next steps, not yet executed when this file was committed.** Their results
are recorded in the post-merge follow-up, not here.

10. Push `fix/api-client-route-contract` and verify the pushed SHA with
    `git ls-remote`.
11. Open the PR against `main`.
12. Wait for a check named `CI Gate` to conclude `SUCCESS` on the PR head.
    The first run is cold across every task, because the new lockfile
    importer busts turbo's `globalDependencies` cache.
13. Squash-merge with `gh pr merge <N> --squash --delete-branch`.
14. Dispatch `deploy-static.yml` once on `main`. Watch it to its conclusion,
    job by job.
15. Record which workflows the merge push triggered. Expected, from their
    `push.paths`:
    - `ci.yml`, `post-merge.yml`, `adr-check.yml`, `secret-scan.yml` and
      `release.yml`;
    - `pulumi-up.yml`, because `infrastructure/worker/dep-graph.json` changed
      and `infrastructure/worker/health/deps.js` bundles it into the edge
      router, so the edge worker redeploys with one new graph node, as it did
      for #5643.

    `pulumi-up.yml` also runs again through `workflow_run` after the Deploy
    Static Sites dispatch. `deploy-services.yml` is **not** expected: no
    `services/**` path and none of its package paths changed.

## Post-release checks

To run after the merge and the hospitality deploy. Results go in the
follow-up.

- `dig @1.1.1.1` cross-check first, then `curl --resolve` for each probe.
- `GET https://mattbutlerengineering.com/health/system` → expect `200` with the
  coarse `systemHealthSchema` shape.
- Re-crawl the deployed hospitality bundle and check both directions:
  - a quoted `/health/system` literal is **present**;
  - `/api/health/system` is **absent** from every chunk.
- `GET https://mattbutlerengineering.com/hospitality/` → `200`. The deploy's
  own `verify` job asserts this too.

## Decisions and findings carried into this release

### Findings the guard found in flight, both fixed here

- **Finding A — `GET /api/health/system` had no route anywhere (user-facing,
  live).** `apps/hospitality`'s `SystemHealthBadge` called it through
  `HealthClient.system()`. The request went to the apex, the edge forwarded
  `/api` to DigitalOcean, and no Fastify service registers it. So it returned
  404 in production. The badge swallowed the error and rendered nothing:
  absence rendering identically to fine.
  - **Fix:** the client now sends `/health/system`, which the edge answers
    itself (`edge-router.js`, exact match) and which returns 200 today.
    Architect chose this over teaching the edge a synonym.
  - **Why the fix reaches users:** the shipped bundle's base URL is the apex
    (`deploy-static.yml`: `VITE_API_URL: https://mattbutlerengineering.com`).
  - **Why the response parses:** the coarse unauthenticated body matches
    `systemHealthSchema`, so the fix swaps a 404 for data.
  - **Accepted consequence: the rate-limit bucket moves.** `/health/system` is
    limited at **10 req / 60 s** per source IP
    (`infrastructure/worker/rate-limiter.js:16`). `/api/` is 100 req / 60 s
    (`:17`). `SystemHealthBadge` polls once per 60 s per tab
    (`POLL_INTERVAL_MS = 60_000`), so about ten admin tabs behind one IP
    saturate the bucket before shedding. Accepted at Architect and re-affirmed
    at Review, for today's admin population. The live 200 carries no
    `x-ratelimit-*` headers, so the bucket is not observable from the
    response.
  - **This release needs a manual dispatch.** `deploy-static.yml`'s
    `push.paths` does not include `packages/api-client/**`, so the merge alone
    does not redeploy hospitality.
- **Finding B — `GET /api/v1/venues/groups/by-slug/:slug` was not registered
  (latent).** `VenueGroupsClient.getBySlug` targeted a route reservations never
  registered. There were zero callers repo-wide, so the method was deleted
  rather than a route registered for no consumer. This lowered the anti-vacuity
  floor 87 → 86 with the reason attached, which is the floor working. After
  merging `origin/main`, the surface is 87 pairs again, from main's new
  `deposits.getByReservation`, against a floor of 86.

### Review findings fixed in this run (live-user direction, brief Round 3)

- **R1 — FIXED (`6fbdbc281`).** The guard's owner table could hold a route
  production does not register: `POST /api/v1/events/test` is registered only
  when `NODE_ENV !== "production"`.
  - **Fix:** each service now boots twice, once under `NODE_ENV="test"` and
    once as a never-`ready()`-ed `production` reference. `answers()` requires
    both routers to match.
  - **Fail-closed:** the measured difference is asserted equal to
    `ENV_CONDITIONAL_ROUTES` (today exactly `POST /api/v1/events/test`), so a
    new env-gated route goes red with no client pair targeting it.
    `vi.resetModules()` per boot extends that to gates decided at module scope.
  - **Stated limit:** the diff cannot see a gate on a third `NODE_ENV` value, a
    gate on a different variable, or a gate inside a package under
    `node_modules`. Nothing sits in that gap today (Review addendum, § R1).
- **F2 — FIXED (`ea17000db`).** `MINIMUM_CLIENT_PAIRS` is now pinned
  absolutely (`>= 80`) as well as relatively. Lowering it to 20 goes red. The
  remaining window is 80–86, accepted by design (N4).

### Explicitly NOT done: R5's `testTimeout` instruction

**Do not apply `testTimeout: 15000`** in this run to `packages/rialto` or
`apps/rialto-web`, as `verification.md`'s F1 suggested. Both already set it
(`packages/rialto/vitest.config.ts:53`, `apps/rialto-web/vitest.config.ts:69`).
The rialto failure is an in-test `waitFor(..., { timeout: 3000 })`, which
`testTimeout` cannot reach. Applying it would be a no-op on two packages this
run does not touch.

This release does not touch `vitest.config.*` anywhere. The `rialto-catalog`
case, which has no `testTimeout` (N1), is a backlog seed, not a change here.

### The ratchet-baseline raise (`1ff0b79dd`), accepted

`metrics/ai-antipattern-baselines.json`: `hardcodedRoutes` 825 → 847 and
`emptyCatch` 77 → 78. Both deltas are attributable to this branch, measured
per directory:

- **`hardcodedRoutes` +22:** `tools/route-contract` contributes 24, and
  `packages/api-client` drops 84 → 82 from the Finding A/B edits. The 24 are
  the literal paths the guard compares against the routers. Routing them
  through either side's constants would make the guard compare a thing to
  itself.
- **`emptyCatch` +1:** the commented catch at
  `tools/route-contract/src/client-inventory.ts:246`. Its one dangerous case,
  a method that throws before issuing a request, is already red through the
  zero-requests anti-vacuity clause.

`.husky/pre-push:35` names `--update` as the sanctioned way to accept a counted
increase. Review accepted the raise and did not recommend Implement's proposed
narrowing of the catch.

### Accepted without change

- **R6** (nit): the global `NODE_ENV` mutation is no longer load-bearing.
- **N2**: the branch adds tasks to the uncapped root `pnpm test`.
- **N4**: the 80–86 floor window.
- **N5**: zero ratchet slack, re-checked on the merge tree above.
- **N6**: `origin/main` moved to `7ac892126` (metrics-only).

### Deferred to Operate as `docs/backlog.md` seeds (not appended here)

| ID  | Severity | One line                                                                                                                                                                                        |
| --- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R2  | minor    | The edge classifier's default branch is fail-open: any untagged edge response (a `/dashboard` 301, a bare `.map` 404) classifies `edge-terminal`, which counts as an owner                      |
| R3  | minor    | The `edge` anti-vacuity signal is the literal `EDGE_TERMINAL_PATHS.length`, not a measurement, so its empty-table clause can never fire on a real report                                        |
| R4  | minor    | The roster-vs-exports anti-narrowing check depends on the `*Client` naming convention. Assert against `Object.keys(createApiClient(...))` instead                                               |
| R7  | nit      | `packages/api-client/src/contract.test.ts` over-claims its name. It compares `@mbe/types` to itself and imports no service (pre-existing)                                                       |
| N1  | minor    | `packages/rialto-catalog` has no `testTimeout` and times out under uncapped root `pnpm test` on `main` alone. Separately, `services/users` `ready.test.ts` hook-times-out on both trees         |
| N3  | minor    | The production-only direction of the env diff (`registeredUnder: "production"`) is never exercised by a committed test. Extract the diff as a pure function and pin both directions             |
| R8  | minor    | A new production-required env var reds the guard with the service's own error, naming nothing in `tools/route-contract`. Wrap each reference boot and rethrow naming `PRODUCTION_BOOT_ENV`      |
| R9  | nit      | The merge left five line citations in the guard's comments pointing at the wrong lines (`app.ts:231`→`:246`, `:266`→`:281`, `create-service-app.ts:247`→`:270`). Cite symbols, not line numbers |

## Outcome

**Not yet shipped at the moment this file was committed.** Pre-flight is
complete and clean (log steps 1–9). The push, PR, `CI Gate` observation,
merge, hospitality deploy and smoke checks are the next steps (10–15). Their
results, including any retry or hiccup, are recorded in the post-merge
follow-up to this file.
