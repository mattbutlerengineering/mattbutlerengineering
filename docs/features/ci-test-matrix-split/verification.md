---
stage: verify
run: feature:ci-test-matrix-split
date: 2026-10-18
assumptions:
  - "Window = every ci.yml run created from 2026-10-15T11:15:00Z (the #6684 merge) to 2026-10-18T23:14:09Z (the newest run at measurement), all events. Wall-clock statistics use only runs in which all four legs concluded success or failure (latest attempt, `filter=latest`); skipped and cancelled legs are not outcomes and are excluded."
  - "Leg wall-clock = job `started_at` to `completed_at` from `GET /actions/runs/<id>/jobs` — the same method the 2026-10-14 artifact and the 14m49s baseline use. It excludes runner queueing before a leg starts."
  - "Cold classification is this stage's default, read from each leg log's turbo summary (`Cached: N cached, M total`). Misses = M - N. `cold` = every leg re-ran all of its own test:coverage tasks: reservations, hospitality and rialto each missed 1, and rest missed 29 (rest has 31 test:coverage entries in `turbo --dry=json`, 2 of them `<NONEXISTENT>`). Since #6720, Prepare builds the ^build closure, so a leg's build dependencies are cache hits. `cached` = 0 misses in every leg. `partial` = anything else."
  - "Percentiles use linear interpolation over the per-run slowest-leg wall-clock."
  - "A red leg counts as leg-caused only when the shard topology is the cause: a timeout or resource failure, a failure that does not reproduce on the same code, a missing or empty coverage artifact, or a coverage-join failure. A named assertion failing in a named test file counts as code-caused. Each red leg was classified from the FAIL lines in its own log."
  - "SC-5 is graded from main's CI Gate, which includes the lint, typecheck and test jobs, and not from a local full `pnpm lint && pnpm typecheck && pnpm test`. Locally this stage ran only the workflow guard suites."
  - "Downloading run 39172972797's `coverage-*` artifacts into the scratchpad counts as read-only: nothing was dispatched, re-run, cancelled or pushed."
---

# Verification: Test matrix legs + `test-coverage-gate` (on `main`)

## Summary

This pass grades `main` as of 2026-10-18 (`af0d8d546`), which includes #6684
(`3c0263c6e`, merged 2026-10-15T11:15:13Z) and the later `ci.yml` changes
#6720, #6855 and #6888. The 2026-10-14 artifact graded the PR branch; its
measurements are kept below, labelled as pre-merge.

**Result: 5/5 PRD criteria pass, and the breakdown acceptance criteria not
already covered by a PRD criterion pass too. 0 leg-caused red runs.**

- 658 `ci.yml` runs were created after #6684 merged: 383 `pull_request`,
  211 `push` (all on `main`) and 64 `workflow_dispatch`.
- 477 of those runs had all four legs execute. None had a leg over 7m. The
  slowest leg in any of them took 5m50s.
- The 10 fully cold runs had a slowest-leg p50 of **5m06s** and a p90 of
  **5m24s**. The single-job baseline took 14m49s.

**Correction to earlier artifacts:** the baseline run 38650413196 was a
`pull_request` run on `dependabot/npm_and_yarn/production-deps-67355de4e9`
(`a511fffcc`), not a run on main. Its `Test (Node 22)` job did take 14m49s
(re-measured: `2026-10-14T22:55:36Z` to `2026-10-14T23:10:25Z`, `success`).

## Criteria & evidence

### SC-1: the guard fails if a `test:coverage` package is in zero legs or in two

- **Check:** ran the guard suite on `main`'s tree. As an independent check,
  ran turbo dry-runs of each leg's real filter against the unfiltered set.
- **Evidence:**
  ```
  ✓ scripts/__tests__/ci-test-shards.test.mjs (12 tests) 10ms
    it("selects every test:coverage package in exactly one leg")
    it("every named package exists and defines test:coverage")
    it("declares the named legs plus an exclusion-derived rest leg")
  ```
  ```
  pnpm turbo test:coverage --dry=json [leg filter]  → test:coverage packages
    unfiltered 34 | reservations 1 | hospitality 1 | rialto 1 | rest 31
  dups: (none)
  diff all vs union: IDENTICAL
  ```
  Before the split, the job ran `pnpm turbo test:coverage --concurrency=2` with
  no filter (`3c0263c6e^:.github/workflows/ci.yml:582`). The union of the four
  legs therefore covers exactly the package set the old single job covered.
- **Pre-merge history (2026-10-14):** the guard was RED against the single-job
  `ci.yml` (10 of 12 failing) and GREEN after the split.
- **Result:** PASS

### SC-2: the guard fails if `ci-gate` drops the coverage gate or a threshold changes

- **Check:** the guard suite, plus a read of `ci.yml` on `main`.
- **Evidence:**
  ```
  describe("ci.yml CI Gate wiring") → it("needs both the legs and the coverage gate")
  describe("ci.yml test-coverage-gate") → it("enforces the 60% repo-wide and 80% agent-core thresholds")
  ```
  ```
  ci-gate:  needs: [ … build, test, test-coverage-gate, hadolint, … ]
  test-coverage-gate:  needs: [test]   env: COVERAGE_THRESHOLD: 60
            if [ "$PCT" -lt 80 ]; then   # agent-core step
  ```
- **Result:** PASS

### SC-3: longest leg ≤ ~7m on a cold run, and the gate's repo-wide % equals main's

- **Check:** fetched every post-merge run's Test-leg jobs and each leg's turbo
  cache summary. Read the Test Coverage Gate logs.
- **Evidence: the 10 fully cold runs after the merge** (every leg missed all
  of its test:coverage tasks):

  | Run         | Event / branch                   | Created (UTC)    | Reservations | Hospitality | Rialto | Rest (slowest) | Conclusion |
  | ----------- | -------------------------------- | ---------------- | ------------ | ----------- | ------ | -------------- | ---------- |
  | 38726243930 | push main                        | 2026-10-15 11:17 | 2m18s        | 3m26s       | 3m32s  | **5m00s**      | success    |
  | 38726371628 | dispatch changeset-release/main  | 2026-10-15 11:18 | 2m13s        | 2m52s       | 3m46s  | **4m51s**      | success    |
  | 38749502004 | PR worktree-agent-a4c3fcc415a9…  | 2026-10-15 14:13 | 2m29s        | 3m18s       | 3m28s  | **3m30s**      | success    |
  | 38781040563 | push main                        | 2026-10-15 17:53 | 1m44s        | 2m51s       | 3m40s  | **5m15s**      | success    |
  | 38781481237 | PR worktree-agent-a411de67dadd…  | 2026-10-15 17:56 | 2m36s        | 2m55s       | 2m26s  | **3m33s**      | success    |
  | 38979097958 | push main                        | 2026-10-16 23:01 | 2m36s        | 2m24s       | 3m42s  | **4m07s**      | success    |
  | 38979611785 | PR ci/6887-knip-in-ci            | 2026-10-16 23:06 | 2m27s        | 3m49s       | 2m33s  | **5m11s**      | success    |
  | 38980469943 | push main                        | 2026-10-16 23:15 | 2m27s        | 2m24s       | 2m20s  | **5m24s**      | success    |
  | 39166853350 | PR feat/issue-7072-menu-qr-down… | 2026-10-18 21:13 | 2m51s        | 2m30s       | 3m04s  | **5m22s**      | success    |
  | 39167454086 | push main                        | 2026-10-18 21:21 | 2m40s        | 3m13s       | 2m58s  | **5m25s**      | success    |

  ```
  cold        n=10   slowest-leg p50 5m06s  p90 5m24s  max 5m25s  min 3m30s
  partial     n=376  p50 2m25s  p90 4m02s  max 5m50s
  cached      n=91   p50 0m43s  p90 0m50s  max 1m01s
  all         n=477  p50 2m13s  p90 4m01s  max 5m50s
  runs with any leg > 7m: 0
  baseline single job (38650413196): 14m49s
  ```

  Rest was the slowest leg in all 10 cold runs. Across all 477 runs the
  slowest leg was rest in 298, hospitality in 93, reservations in 62 and
  rialto in 24. The 5m50s maximum is a partial-cache run,
  39048383860 (hospitality, PR `chore/queue-telemetry-backfill-6944`).

  Coverage parity. The `Test Coverage Gate` log of the newest main run
  (39172972797, `af0d8d546`):

  ```
  Total of 4 artifact(s) downloaded
  Repo-wide coverage: 86% (34541/39924 statements, threshold: 60%)
  agent-core statement coverage: 95% (2722/2855)
  ```

  This matches the baseline 86% (31817 / 36725) and 95% that the 2026-10-14 artifact recorded. The
  statement totals grew because of work merged since.

- **Pre-merge history (2026-10-14, PR branch).** A forced full run,
  38688786065 (`d0f7fdda4`, with a cache-bust comment in `eslint.config.js`
  that was later reverted), measured reservations 5m16s, rest 4m50s,
  hospitality 2m54s, rialto 2m14s, and the gate 15s. Its gate log read
  `Repo-wide coverage: 86% (31936/36914 …)` and `agent-core … 95% (2693/2826)`.
  That run was taken before #6720 moved the ^build closure into Prepare. It
  explains why reservations was the slowest leg there, while on `main` the
  cold reservations leg is 1m44s to 2m51s.
- **Result:** PASS. The cold-run p90 of 5m24s is under the ~7m bound, no
  observed run broke 7m, and the repo-wide % equals main's after rounding.

### SC-4: `report-health` and every other `needs: test` consumer still resolve

- **Check:** grepped every workflow for `needs` edges on `test`, and read the
  job conclusions of the 12 newest main push runs.
- **Evidence:**
  ```
  .github/workflows/ci.yml:666:    needs: [test]                       # test-coverage-gate
  .github/workflows/ci.yml:980:    needs: [detect-changes, lint, typecheck, build, test, migrations]   # report-health
  ci-gate needs: [ … test, test-coverage-gate, … ]
  report-health env: TEST_RESULT: ${{ needs.test.result }}
  ```
  ```
  39172972797 Report CI Health success | Test Coverage Gate success | CI Gate success
  39169195845 Report CI Health success | Test Coverage Gate success | CI Gate success
  39167454086 Report CI Health success | Test Coverage Gate success | CI Gate success
  … (all 12 of the newest main push runs: 39154939834 … 39172972797, each one success/success/success)
  ```
  The job id `test` is unchanged. Guard: `it("keeps report-health keyed on
the surviving `test` job id")`.
- **Result:** PASS

### SC-5: affected gates pass (lint, typecheck, test, and the existing workflow guards)

- **Check:** ran the workflow guard suites locally on `main`'s tree after
  `pnpm build --filter '@mbe/scripts^...'` (exit 0). Lint, typecheck and test
  are graded from main's CI Gate.
- **Evidence:**
  ```
  ✓ scripts/__tests__/ci-lint-critical-path.test.mjs (12 tests)
  ✓ scripts/__tests__/ci-node-matrix.test.mjs (2 tests)
  ✓ scripts/__tests__/ci-test-results-glob.test.mjs (10 tests)
  ✓ scripts/__tests__/nightly-compliance-workflow.test.mjs (23 tests)
  ✓ scripts/__tests__/ci-coverage-upload-paths.test.mjs (18 tests)
  ✓ scripts/__tests__/ci-test-shards.test.mjs (12 tests)
  ✓ scripts/__tests__/check-ci-gate-coverage.test.mjs (18 tests)
   Test Files  7 passed (7)
        Tests  95 passed (95)
  ```
  On main, push runs since the merge concluded 191 success, 5 failure and 15
  cancelled. The newest 12 all ended `CI Gate success` (see SC-4). The
  `--concurrency=2` cap is declared on every leg:
  `run: pnpm turbo test:coverage --concurrency=2 ${{ matrix.filter }}`.
- **Result:** PASS

### Breakdown ACs not already covered by a PRD criterion

- **WO-0057, no `**` globs in the legs.** In the `test` job (lines 538-659),
  the only `**` occurrences are the 2 in comments ("Fixed depths, not `**`").
  The upload paths are `*/coverage/coverage-final.json` and
  `*/*/coverage/coverage-final.json`. PASS.
- **WO-0058, gate steps byte-equivalent to the moved originals except the
  dropped conditions.** Diffed `Upload coverage reports` through `agent-core
coverage threshold met` in `3c0263c6e^` against `main`:
  ```
  10d9
  <         if: matrix.node-version == 22
  44d42
  <         if: matrix.node-version == 22
  ```
  The fail-closed `if [ "$TOTAL_LINES" -eq 0 ]` path is intact. PASS.
- **Coverage upload still covers what it covered before.** The codecov
  `files:` list on `main` is identical to the pre-split list (`diff` exit 0,
  17 files). The run 39172972797 artifacts hold 31 `coverage-final.json`
  files: 1 each in `coverage-reservations`, `coverage-hospitality` and
  `coverage-rialto`, and 28 in `coverage-rest`. The repo-wide scan sees all
  of them. The one `test:coverage` package that produces no file is
  `plugins/acmm` (`node --test --experimental-test-coverage`, which prints to
  stdout). That predates the split, since #4000. Its tests still run in the
  rest leg. PASS.
- **WO-0059, actionlint on `ci.yml`.** It reports only two `SC2015:info`
  notes, both at `ci.yml:1056`. That line is in the `migration-dry-run` job,
  outside the Test and coverage jobs. No findings in the jobs this run
  touched. PASS for the scope.

## Red legs in the window: 0 leg-caused

Across 1,939 leg executions, 24 concluded `failure` and no `Test Coverage
Gate` job failed (452 success, 92 skipped, 40 cancelled). Every red leg
failed on a named assertion in a named test file. None hit `Test timed out`,
a resource limit or a missing artifact.

| Failing test                                                                   | Leg         | Runs                                                                                                                                                                | Cause                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LocalePicker.test.tsx` › keeps the trigger enabled… while a switch is pending | hospitality | 38786278037 (PR), 38803016913 (main `7d05cdca5`), 38803278987, 38805311222, 38806223202 (dispatch)                                                                  | A 50 ms in-test switch timeout under coverage load (`expected 'en-US' to be 'es-MX'`). It was added by #6702 after the split and fixed by #6734 ("stop the gated LocalePicker switch timing out on CI"). Not attributed to the split: the hospitality leg runs one turbo task, so its runner is no more loaded than the single job's two-wide fan-out was. This is a judgement, not a measurement. |
| `check-cursorrules-drift.test.mjs` › passes on the real repo                   | rest        | 38925403445, 38926113255, 38927311115, 38928165876, 38928710521, 38929404968 (PR); 38926882789, 38927474153 (main `4b68906af`, `5369559c9`); 38929284490 (dispatch) | Generated-rules drift assertion on #6855-era commits                                                                                                                                                                                                                                                                                                                                               |
| `ui-quality-routes.test.mjs` (route counts), `phantom-tokens.test.mjs`         | rest        | 38997432106, 38999587869, 39003396826, 39164684595, 39164766432, 39168080950 (PR)                                                                                   | Feature PRs that added routes or tokens without updating the pinned fixtures                                                                                                                                                                                                                                                                                                                       |
| `workflow-deps.test.mjs`                                                       | rest        | 38847623392 (PR)                                                                                                                                                    | A workflow edit on that PR                                                                                                                                                                                                                                                                                                                                                                         |
| `no-display-intl.test.ts`                                                      | hospitality | 39011155374 (PR)                                                                                                                                                    | An ad-hoc `Intl` call on that PR                                                                                                                                                                                                                                                                                                                                                                   |
| `client-inventory.test.ts` (route-contract)                                    | rest        | 39159950061, 39160638384 (PR)                                                                                                                                       | An unrostered `*Client` export on that PR                                                                                                                                                                                                                                                                                                                                                          |

## Failures

None. No route back to Implement.

## Not verified

- **Wall-clock is per leg, not end to end.** Time from Prepare to CI Gate
  was not measured, and neither was runner queueing before a leg starts. The
  coverage gate adds p50 14s and p90 17s (n=452). Its one outlier took 194s.
- **Only 10 cold runs.** Every one was natural: no cache bust was pushed or
  dispatched (read-only stage). The p90 rests on n=10.
- **Local lint, typecheck and test were not run in full.** SC-5 relies on
  main's CI Gate for those, and only the workflow guards ran locally.
- **The LocalePicker attribution is a judgement.** No A/B run separated
  sharding from coverage load.
- **Codecov ingestion was not checked.** `fail_ci_if_error: false` means a
  codecov-side failure would not turn a run red. Only the uploaded file list
  was verified.
- **Count for Operate.** 658 post-#6684 `ci.yml` runs (570 concluded
  success/failure, 477 with all four legs executed). That clears the
  ≥ 20-run minimum signal.
