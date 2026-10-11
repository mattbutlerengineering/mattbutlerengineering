---
stage: ship
run: maintenance:test-typecheck-coverage
date: 2026-10-08
released-at: origin/main 88581c586 (all six implementation PRs merged)
assumptions:
  - "Release mechanism: the brief authorizes squash-merging each PR once the `reviewer` subagent passes it and `CI Gate` is green on the final head, and lets CI deploy workflows run on merge. The six implementation PRs were released that way by earlier stages. Ship records them and opens the closeout PR. The orchestrator runs the reviewer on the closeout PR and merges it; Ship does not."
  - "No runtime artifact changes. The run touched test files, tsconfig/typecheck scripts, turbo inputs, a scripts/ guard test, docs, and the unpublished rialto showcase demo app. Deploy workflows that fired on the merges are reported with their job-level conclusions. They redeployed unchanged runtime code, so their success is evidence that nothing broke, not evidence that this run changed production."
  - "Intake: defect.md has no `intake:` field (no tracker issue), so there is no issue to close."
  - "The closeout PR's own outcome (merge SHA, main push CI) is PENDING in this committed copy. It cannot be known when this file is committed. See § Outcome."
---

# Release: test files escape `pnpm typecheck` (6 PRs + closeout)

## Pre-flight

- [x] Verification green: `verification.md` reports 11 PASS, 0 FAIL at `88581c586`. Its
      Not-verified gaps are outside the target state.
- [x] Review: `review.md` has no critical or major finding. One minor finding (turbo
      `typecheck.inputs` overrides replacing the root list) is fixed on this branch
      (`66fbcbb75`). The other minor (tools/cli `issue.test.ts` probe flake) and two nits
      are deferred, with reasons in `review.md`.
- [x] No secrets in the diff. The changes are tsconfig, package scripts, turbo.json, tests
      and docs. No target-environment config is needed.
- [x] Migrations/data changes: none.
- [x] Rollback plan concrete (below).
- [x] Branch rebase: `docs/test-typecheck-coverage-closeout` was 3 ahead / 0 behind
      `origin/main` after `git fetch origin main`, so no rebase was needed.
      `scripts/__tests__/typecheck-covers-tests.test.mjs` and
      `scripts/__tests__/turbo-task-inputs.test.mjs` re-ran green: 2 files, 20 tests.

## Rollback plan

Every PR was a squash merge, so each one reverts as a single commit. Revert through a PR,
never a direct push, so `CI Gate` runs on the revert:

```
git fetch origin main
git switch -c revert/test-typecheck-coverage-<N> origin/main
git revert --no-edit <squash-sha>        # newest first if reverting several
pnpm --dir scripts test                  # the guard must still pass, see below
gh pr create --base main --title "revert: #<N> ..." --body "..."
```

Order matters because of the guard. PR1 (#6158, `d68f8ec1e`) added
`scripts/__tests__/typecheck-covers-tests.test.mjs`, which fails whenever a tracked test
file sits outside every tsc project a package's `typecheck` runs. Reverting a later PR's
config change alone (for example #6167's `apps/hospitality/tsconfig.test.json`) turns the
guard red. So either:

- revert the whole run newest-first (`88581c586`, `1cd09d0e6`, `bdfcad156`, `a2d05bdd4`,
  `bb85b3071`, `d68f8ec1e`), and the guard leaves with the last revert; or
- revert one package's config and remove the guard (or revert `d68f8ec1e`) in the same
  PR. The guard needs its own revert.

The closeout PR reverts the same way. Reverting it restores the copied root lists in the
three package `turbo.json` files and drops the `$TURBO_EXTENDS$` describe, both in one
commit.

Nothing needs rolling back in production. No runtime code changed, so redeploying the
previous build is not needed.

## Release log

1. **#6158**: `test: typecheck test files — guard plus small packages (1/5)`. Squash
   `d68f8ec1e`, merged 2026-10-08T18:17:55Z. PR `CI Gate` check run success, run
   `37811538557`. Main push `CI` `37823192861` success.
2. **#6162**: `test: typecheck test files in gh-client, agent-test-utils, notifications
(2/6)`. Squash `bb85b3071`, merged 18:38:38Z. PR `CI Gate` success, run `37824663615`.
   **Main push `CI` `37825873644` FAILED**: job `Test (Node 22)` failed, so `CI Gate`
   failed. Cause: `tools/cli` `issue.test.ts` hit the 5 s `gh --version` probe timeout
   under a cold cache. The run triggered it but did not cause it; see `review.md` § Minor
   (deferred). The next main push (`a2d05bdd4`) was green with the same tools/cli and
   gh-client source.
3. **#6165**: `test: typecheck agent-core test files (3/6)`. Squash `a2d05bdd4`, merged
   19:00:01Z. PR `CI Gate` success, run `37827144934`. Main push `CI` `37828611255`
   success.
4. **#6167**: `test: typecheck hospitality unit test files (4/6)`. Squash `bdfcad156`,
   merged 19:43:11Z. PR `CI Gate` success, run `37831619788`. Main push `CI`
   `37834046930` success.
5. **#6168**: `test: typecheck e2e and root-level test files (5/6)`. Squash `1cd09d0e6`,
   merged 20:25:22Z. PR `CI Gate` success, run `37836874222`. Main push `CI`
   `37839329601` success.
6. **#6169**: `test: typecheck rialto showcase and retire the pending list (6/6)`. Squash
   `88581c586`, merged 20:50:59Z. PR `CI Gate` success, run `37840900337`. Main push `CI`
   `37842507864` success.
7. **Closeout PR** (this branch, `docs/test-typecheck-coverage-closeout`): verification.md,
   review.md, this release.md, and Review's turbo fix (`$TURBO_EXTENDS$` in
   `apps/hospitality`, `apps/rialto-web` and `packages/rialto-catalog` `turbo.json`, plus a
   guard describe in `scripts/__tests__/turbo-task-inputs.test.mjs` and the gotchas
   wording). Opened by Ship; merge is the orchestrator's after `reviewer` passes and
   `CI Gate` is green. Outcome PENDING, see § Outcome.

### Deploy workflows that fired on the merges

All conclusions below are job-level. A workflow-level `success` can hide a skipped deploy
job (gotchas § CI), so each job was read.

| Merge       | Workflow (run id)                            | Jobs                                                                                                         |
| ----------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `d68f8ec1e` | Deploy Services (`37823192848`)              | Deploy API Services success; Post-Deploy Verification success; Deploy Blocked skipped                        |
| `d68f8ec1e` | Deploy Static Sites (`37823192846`)          | Hospitality, Marketing, Rialto Web success; Post-Deploy Verification success; Rollback skipped               |
| `d68f8ec1e` | Deploy Storybook (`37823193077`)             | build, deploy success                                                                                        |
| `d68f8ec1e` | Pulumi Deploy (`37823193083`, `37823541780`) | Deploy Infrastructure success (both)                                                                         |
| `bb85b3071` | none                                         | No deploy workflow fired. The main push CI was red, and no deploy workflow ran on this SHA.                  |
| `a2d05bdd4` | Deploy Services (`37828611302`)              | Deploy API Services success; Post-Deploy Verification success                                                |
| `bdfcad156` | Deploy Static Sites (`37834046886`)          | Hospitality success; Rialto Web and Marketing skipped (no change detected); Post-Deploy Verification success |
| `bdfcad156` | Pulumi Deploy (`37834262899`, workflow_run)  | Deploy Infrastructure success                                                                                |
| `1cd09d0e6` | Deploy Static Sites (`37839329611`)          | Marketing, Hospitality, Rialto Web success; Post-Deploy Verification success                                 |
| `1cd09d0e6` | Pulumi Deploy (`37839329649`, `37839637700`) | Deploy Infrastructure success (both)                                                                         |
| `88581c586` | Deploy Static Sites (`37842508079`)          | Rialto Web, Hospitality, Marketing success; Post-Deploy Verification success                                 |
| `88581c586` | Deploy Storybook (`37842507750`)             | build, deploy success                                                                                        |
| `88581c586` | Pulumi Deploy (`37842508189`, `37842812497`) | Deploy Infrastructure success (both)                                                                         |

On `d68f8ec1e`, `bdfcad156`, `1cd09d0e6` and `88581c586`, `Post-Deploy Check` had one
`cancelled` workflow_run, superseded by a later `success` run on the same SHA (`a2d05bdd4`
had only a `success`) (for example `37842797578` cancelled, then
`37842812882` and `37843057926` success on `88581c586`). Auto-Rollback on Agent
Regression was `skipped` on every SHA, so no rollback fired.

## Post-release checks

- Main CI green after the run → main push `CI` on `88581c586` (`37842507864`) success.
  The only red main push in the run was `bb85b3071`, which the next push cleared. It is
  explained in step 2 above.
- Deploys after merges → every deploy job that ran concluded success, with Post-Deploy
  Verification success (table above). No rollback job ran.
- Gate actually guards → `verification.md` T1–T3: 972 of 972 tracked TS/TSX test files
  are in a tsc project their package's `typecheck` runs. A forced `turbo typecheck` was
  green (52 tasks). A wrong-shaped mock in `packages/notifications` fails the new
  `typecheck` and passes the pre-run config and vitest. Three guard mutations each turn
  the guard red.
- Main CI green at the closeout merge → PENDING (see § Outcome).
- Next unrelated PR still passes typecheck → PENDING. It needs a PR that does not exist
  yet. Operate should check the first non-run PR merged after the closeout: its `Typecheck`
  job is green, and no new typecheck failure in a test file is blamed on these configs.

## Outcome

**The six implementation PRs shipped with one hiccup.** Each passed reviewer at 9/10 with
`CI Gate` green on its final head. The `bb85b3071` main push went red on a pre-existing
`tools/cli` probe flake, which the run triggered through a cache miss but did not cause.
It cleared on the next push, and its fix is a deferred one-liner in `review.md`. Every
deploy that fired concluded success at job level and changed no runtime behaviour.

**The closeout PR is PENDING in this committed copy.** Its merge SHA, its main push CI run,
and the "next unrelated PR passes typecheck" check cannot be recorded before the file is
committed. They are not done. Operate (or the orchestrator after merging) must record them
in `retro.md` instead of treating this file as complete. The floor-plan run needed a
follow-up PR because a pending `release.md` was taken as final.
