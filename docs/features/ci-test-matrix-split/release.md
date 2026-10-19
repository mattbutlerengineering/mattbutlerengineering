---
stage: ship
run: feature:ci-test-matrix-split
date: 2026-10-18
outcome: released
released-at: 2026-10-15
released-commit: 3c0263c6eb68a7b3be4034968895246aa229ca07 (squash of PR #6684, head d70b17757, merged 2026-10-15T11:15:13Z by mattbutlerengineering)
preflight-head: 130577822 (branch docs/ci-test-matrix-close, cut from origin/main; carries #6684 plus later main commits)
assumptions:
  - "This Ship stage records a release that already happened (brief § Resume 2026-10-18). The Conductor merged #6684 on 2026-10-15. No new release action was taken here: no merge, deploy, tag, push, PR, issue, label or dispatch."
  - "'Production' for this run is `.github/workflows/ci.yml` on `main`: the change reaches its users (every PR author and the merge train) the moment it merges, with no separate deploy. The 'deploy evidence' is therefore the first `ci.yml` push runs on `main` at or after `3c0263c6e`, read at job level."
  - "The repo's Ship pre-flight hook (`local-ci-precheck`) ran against this branch's head, 130577822, not against `3c0263c6e`. The worktree is cut from origin/main and the hook is defined against the final branch head. The merge's own gate is recorded from CI (Release log 1-2)."
  - "Versioning and tagging: a CI workflow change carries no version or tag, and the diff touches no published package, so no changeset, version bump or tag applies. This is the repo's own convention; no default was needed."
  - "Rollback default: a whole-commit `git revert 3c0263c6e`, with this run's docs restored from HEAD. It is this stage's choice, made without live Owner input, and was measured below (only a docs modify/delete conflict; the reverted ci.yml passes the six surviving workflow guards)."
  - "Follow-ups are listed, not filed (brief: the run mirrors no work items to the tracker). Proposed `docs/backlog.md` seeds are given as text for Operate to append at run close. This stage writes no backlog line."
  - "The review major's fix PR number is not known to this stage; the orchestrator links it. This artifact records the fix as pending outside the run and does not invent a number."
---

# Release: Test job sharded into matrix legs + `test-coverage-gate` (#6664 → PR #6684)

The release already happened. The Conductor squash-merged #6684 to `main` on
2026-10-15T11:15:13Z as `3c0263c6e`. It splits `ci.yml`'s single `test` job
into four matrix legs (`reservations`, `hospitality`, `rialto`, and an
exclusion-derived `rest`), moves the repo-wide 60% and agent-core 80% coverage
gates and the codecov upload into a new `test-coverage-gate` job, adds that job
to `CI Gate`'s `needs`, and pins the shape with
`scripts/__tests__/ci-test-shards.test.mjs`. It took effect on the very next
`ci.yml` run. This artifact records the pre-flight, the evidence that `main`
runs the new shape, the rollback plan and the open review major. This stage
released nothing.

## Pre-flight

- [x] **Verification green.** `verification.md` (2026-10-18, `75fb859d4`)
      re-graded the run against `main`: 5/5 PRD criteria pass, no failures, 0
      leg-caused red runs. `review.md` (2026-10-18, `5b6bd1b3d`) returns
      `ship-record-ok` with **no critical** finding, one major and three
      minors. The Owner decided the major live on 2026-10-18 ("Fix now"; brief
      § Review decision). It is latent, not live (see Open known defect).
      Nothing routes back to Implement.
- [x] **No secrets in the diff; target config present.** `Secret Scan` run
      38726016518 on `3c0263c6e`: `success`. The PR head's
      `Gitleaks Secret Scan` check (run 38690555577): `success`. The diff adds
      no secret; the moved codecov step reuses the existing `CODECOV_TOKEN`,
      now in a job that executes no test code (review § Security).
- [x] **Migrations/data changes have a tested forward path.** None exist. The
      diff touches `.github/workflows/ci.yml`, two `scripts/__tests__/*.mjs`
      guards and this run's docs.
- [x] **ADRs.** The run added none. The reserved ADR 104–106 are unused
      (`architecture.md`: two-way door). Review's deferred minor proposes an
      amending note to ADR-016 (see Follow-ups).
- [x] **Rollback plan concrete.** See below, including the measured revert.
- [x] **Launch brief hook.**
      `python3 <ship skill>/../../launch_demo.py config` printed `NONE` and
      `launch-demo: 0 problem(s)`, exit 0. The repo has no launch-demo config,
      so nothing was run and nothing was written.
- [x] **Repo Ship pre-flight hook (`local-ci-precheck`) against the final
      head (130577822).** The steps in `.claude/skills/local-ci-precheck/SKILL.md`
      were run directly on Node v22.22.3 (`.nvmrc`: 22). Every lane exited 0;
      no missing-build retry was needed. See Release log 5. The hook ran after
      the release, so it confirms today's `main` (plus this run's docs) is
      clean. It is not a gate the merge passed through.

## Rollback plan

Door: two-way — the release is CI workflow topology plus a guard test. It
touches no schema, data, published package or public interface. One revert of
`3c0263c6e` restores the single `test` job; the revert's `ci.yml` hunk applies
cleanly on today's `main` (measured below).

Blast radius: the CI pipeline only. If the call is wrong, every `ci.yml` run
goes back to one serial `Test (Node 22)` job (cold runs ~14m49s on the
critical path instead of ~5m), and the coverage gates run inside `test` again.
No deployed app, service or data is touched. `CI Gate` stays the only required
check, so branch protection needs no change either way.

**Measured 2026-10-18 on 130577822** (`git revert --no-commit 3c0263c6e` in
this worktree, then `git revert --abort` and `git reset --hard HEAD`;
`git status --porcelain` printed nothing afterwards):

| Step                                                        | Result                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git revert --no-commit 3c0263c6e`                          | exit 1, but only on docs: `UD docs/features/ci-test-matrix-split/verification.md` (modify/delete, the file was rewritten since). `.github/workflows/ci.yml` **auto-merged** past #6720 `650f19217`, #6855 `4b68906af` and #6888 `f1f6f7ecf`; `ci-coverage-upload-paths.test.mjs` and `breakdown.md` staged as `M`; `ci-test-shards.test.mjs` staged as `D`. |
| reverted `ci.yml`                                           | no `matrix.leg` or `test-coverage-gate` left; `test` keeps #6720's `needs: [prepare]`.                                                                                                                                                                                                                                                                      |
| the six surviving workflow guards against the reverted tree | `vitest run --config scripts/vitest.config.mjs` over `ci-lint-critical-path`, `ci-node-matrix`, `ci-test-results-glob`, `nightly-compliance-workflow`, `ci-coverage-upload-paths`, `check-ci-gate-coverage`: **6 files, 83 tests passed**.                                                                                                                  |

CI runs only through GitHub Actions; nothing here is deployed by hand.

```
# Realistic rollback: revert the merge, keep this run's docs
git fetch origin main
git switch -c revert/ci-test-matrix-split origin/main
git revert --no-commit 3c0263c6e
git checkout HEAD -- docs/features/ci-test-matrix-split/   # keep the run's record
git status --porcelain                                     # expect: M ci.yml, M ci-coverage-upload-paths.test.mjs, D ci-test-shards.test.mjs
pnpm --dir scripts test                                    # workflow guards green on the single-job shape
git commit -m "revert: ci: shard Test job into balanced matrix legs (#6684)"
# push, open a PR, merge on a green CI Gate. The PR's own CI run is already
# the single-job shape; confirm a `Test (Node 22)` job (no leg suffix) and no
# `Test Coverage Gate` job, at JOB level, on the first main push run after.
#
# If the review-major fix PR has merged first, its report-health edge and
# guard assertion on test-coverage-gate must be reverted with it (the job
# they reference no longer exists): revert that PR first, then this one.
```

## Release log

1. **Merge.** PR #6684 (`worktree-agent-aac15da08cfe6b3ee`, head
   `d70b17757`) was squash-merged by `mattbutlerengineering` (the Conductor's
   merge turn) at 2026-10-15T11:15:13Z as `3c0263c6e`. PR-head checks, read
   from `gh api repos/…/commits/d70b17757…/check-runs`, all from
   `pull_request` run 38690554593:

   | Check                          | Conclusion | Wall-clock |
   | ------------------------------ | ---------- | ---------- |
   | `Test (Node 22, reservations)` | success    | 2m36s      |
   | `Test (Node 22, hospitality)`  | success    | 3m07s      |
   | `Test (Node 22, rialto)`       | success    | 3m40s      |
   | `Test (Node 22, rest)`         | success    | 4m57s      |
   | `Test Coverage Gate`           | success    | 13s        |
   | `CI Gate`                      | success    | 6s         |

   Commit status on the PR head: `combined=success` (`CI Gate: success`).

2. **CI on the merge SHA — the change taking effect.** `3c0263c6e` got its
   own `push` run, **38726016607** (11:15:16Z → 11:19:13Z, `success`,
   attempt 1), found with `gh api …/actions/workflows/ci.yml/runs?branch=main&event=push`
   filtered by `head_sha`. Job level: `Prepare` success · `Test (Node 22,
reservations)` success (28s) · `Test (Node 22, hospitality)` success
   (35s) · `Test (Node 22, rialto)` success (28s) · `Test (Node 22, rest)`
   success (2m07s) · **`Test Coverage Gate` success** · `Report CI Health`
   success · **`CI Gate` success**. Its gate log: `Total of 4 artifact(s)
downloaded`, `Repo-wide coverage: 86% (32180/37187 statements, threshold:
60%)`, `agent-core statement coverage: 95% (2693/2826)` — the same 86% / 95%
   the pre-split baseline recorded. Commit status: `combined=success`
   (`CI Gate`, `codecov/patch`). This run was mostly cache hits, so it proves
   the shape works, not the wall-clock.

3. **First cold run on the new shape.** The next main push, **38726243930**
   on `ae18133c7` (#6685, a dependency bump — a lockfile cache bust; a
   descendant of `3c0263c6e`), 11:17:12Z → 11:29:08Z, `success`. Job level:
   `Prepare` success · `reservations` success (2m18s) · `hospitality`
   success (3m26s) · `rialto` success (3m32s) · **`rest` success (5m00s,
   slowest)** · `Test Coverage Gate` success · `Report CI Health` success ·
   `CI Gate` success. Verification classifies it as fully cold (every leg
   missed all its own `test:coverage` tasks).

4. **Wall-clock result** (from `verification.md`, not re-measured here):
   across 477 post-merge runs in which all four legs executed, no leg ran
   over 7m (max 5m50s). The 10 fully cold runs had a slowest-leg p50 of
   **5m06s** and p90 of **5m24s**, against the single-job baseline of
   **14m49s** (run 38650413196). The newest main push run read here,
   **39178008470** on `949d8ecd7` (2026-10-18T23:47:59Z, `success`), still
   shows the shape: four `Test (Node 22, <leg>)` jobs success,
   `Test Coverage Gate` success, `Report CI Health` success, `CI Gate`
   success.

5. **Ship pre-flight hook** (`local-ci-precheck`), run 2026-10-18 against
   `1305778225eab3a83475966e17347b2b1df9e3f2` on node v22.22.3. Every lane
   passed:

   ```
   install exit=0                                  (pnpm install --frozen-lockfile)
   [lint]       Tasks: 52 successful, 52 total     lint exit=0
   [typecheck]  Tasks: 52 successful, 52 total     typecheck exit=0
   [arch-audit] ✅ No architectural violations detected.
                ✅ All external dependencies are consistent across the monorepo.
                                                   arch exit=0
   [drift]      dep-graph regen: git diff --exit-code clean;
                27 × "llms.txt is in sync", 0 stale  drift exit=0
   ```

   `git status --porcelain` printed nothing afterwards, so the tree was
   unchanged.

## Post-release checks

- **The new shape runs on `main`, at job level.** Release log 2–4: the
  merge SHA's own run and every main push run read since carry four leg jobs,
  `Test Coverage Gate` and `CI Gate`, all `success`. None is a skipped-job
  "success": each leg and the gate ran (start/complete timestamps recorded).
- **The gate fails closed in practice.** Review observed run 38786278037
  (hospitality leg `failure` → gate `skipped` → `CI Gate` `failure`) and run
  39091316665 attempt 2 (cancelled before the matrix expanded → `CI Gate`
  `failure`). A red leg cannot pass `CI Gate`.
- **Coverage parity holds.** 86% repo-wide and 95% agent-core on the merge
  SHA (Release log 2) and on run 39172972797 (verification), equal to the
  pre-split numbers.
- **0 leg-caused red runs** across 1,939 leg executions (verification § Red
  legs). Every red leg failed on a named assertion in a named test file.
- **Intake issue to close:** none. This is a feature run. #6664 is owned by
  the Conductor batch (sdlc-speed-2, tracking #6666); nothing here closes it.

## Open known defect: `report-health` is blind to coverage-gate failures (review major)

- **What:** `report-health` (`ci.yml:980`,
  `needs: [detect-changes, lint, typecheck, build, test, migrations]`) does
  not need `test-coverage-gate`. Before #6684 the coverage thresholds ran
  inside `test`, so a threshold failure set `TEST_RESULT=failure`. Now a
  `main` push whose legs pass but whose coverage gate fails turns `CI Gate`
  red while `report-health` PUTs `conclusion: "success"` to KV `ci/latest`,
  and the public `GET /health/system` reports CI healthy for a red `main`.
- **Live:** no — **latent**. The coverage gate failed in 0 of the 70 failed
  `ci.yml` runs since the merge (review), and current margins are 86% vs 60%
  and 95% vs 80%. Still present on `origin/main` today (`ci.yml:980`
  unchanged, read 2026-10-18).
- **Status:** the **Owner chose "Fix now"** (2026-10-18, live). A separate fix
  PR, **outside this run**, adds `test-coverage-gate` to `report-health`'s
  `needs` and result loop and pins the edge in `ci-test-shards.test.mjs`, RED
  first; the Owner merges it. **Fix PR: pending — number linked by the
  orchestrator.** Ship records the defect and does not block on it.

## Follow-ups

None were filed. Proposed seeds, in the `docs/backlog.md` line format, for
Operate to append at run close (review's three deferred minors):

1. **Coverage collection depth and the guard's package roots are not tied to
   the workspace.**
   `- Derive ci-test-shards.test.mjs coveragePackages() from pnpm-workspace.yaml and assert every workspace glob's depth is matched by a Test-leg coverage upload pattern (*/ and */*/ today), so a deeper glob such as packages/integrations/* cannot silently drop out of repo-wide coverage (from: feature:ci-test-matrix-split)`
2. **ADR-016's Decision text names the wrong job.**
   `- Add an amending note (or ADR from the unused 104-106 block) to ADR-016: the repo-wide COVERAGE_THRESHOLD and agent-core 80% gate now live in ci.yml's test-coverage-gate job, not test, and the runner-concurrency premise is unmeasured under four Test legs (from: feature:ci-test-matrix-split)`
3. **#6720's hand-written Prepare `^build` filter can drift from the real
   closure.**
   `- Make ci-lint-critical-path.test.mjs assert, against turbo run test:coverage --dry=json, that every build task in the Test legs' graph is selected by Prepare's --filter set, instead of pinning the filter string (from: feature:ci-test-matrix-split)`
4. **Baseline correction (not a seed).** The 14m49s baseline run
   38650413196 is a `pull_request` run on
   `dependabot/npm_and_yarn/production-deps-67355de4e9` (`a511fffcc`), not a
   run on `main`, as the brief and earlier artifacts said (verification
   re-measured it: `2026-10-14T22:55:36Z` → `23:10:25Z`, `success`). The
   number stands; its label was wrong. Operate should cite it as a PR run.

## For human review

- **Review major fix PR** (`report-health` needs `test-coverage-gate`) is the
  one open item. It is latent, not live; until it merges, a coverage-only
  failure on `main` would show green on `/health/system`.
- **Rollback is a one-command revert of `ci.yml`** today; the only conflict is
  this run's own docs. Once the major's fix PR merges, revert it first.
- **Wall-clock rests on n=10 cold runs**, all natural (none forced). Operate's
  minimum signal (≥ 20 runs, p50/p90 slowest leg, leg-caused red count) is
  already cleared by verification's 658-run window; Operate should re-read it
  rather than trust this snapshot.
- **Cost trade-off** (review): billable Test minutes per successful run rose
  ~21% (7.0 → 8.5, per-job setup and minute rounding). The repo is public, so
  these are runner minutes, not a bill.

## Outcome

Shipped cleanly on 2026-10-15. #6684 passed `CI Gate` on its PR head, and its
merge SHA `3c0263c6e` got its own main push run (38726016607) with all four
legs, `Test Coverage Gate` and `CI Gate` succeeding at job level. The first
cold main run (38726243930) put the slowest leg at 5m00s against the 14m49s
single-job baseline. No hiccups in the release itself. One latent defect,
review's major, ships with an Owner-chosen fix pending outside this run.
Next stage: Operate.
