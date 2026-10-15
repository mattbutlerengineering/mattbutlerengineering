---
stage: prd
run: feature:ci-test-matrix-split
date: 2026-10-14
prd: PRD-6
ux: not-applicable
ux-reason: No user-facing surface — the change is CI workflow topology; its only presentation is GitHub's own checks UI.
assumptions:
  - "ux: not-applicable was determined by this PRD against the stated criterion (user-facing surface?), not supplied by the user — the brief leaves the call to this stage."
  - "The ~7m bound is read as a target with explicit tolerance ('≤ ~7m', issue text), not a hard gate: no automated check can assert a wall-clock duration without flaking; SC-3 is verified by observation on the forced full run, not by a CI assertion."
---

# PRD-6: Split CI's Test job into duration-balanced matrix legs

> Source: `autorun-brief.md` and `idea.md`. No live interview. Duration
> evidence remains one CI run (38650413196), carried as filed.

## Problem statement

On any turbo-cache-busting change, `ci.yml`'s single `test` job puts ~14m of
`test:coverage` work on the critical path to `CI Gate`, dominated by three
packages (~938s combined). The job also hosts the repo-wide 60% and
agent-core 80% coverage gates and the codecov upload inline, so it cannot be
naively parallelized without re-joining coverage downstream.

## Solution

Split `test` into duration-balanced matrix legs selected by turbo
`--filter`, with the "everything else" leg derived **by exclusion** so every
workspace package with `test:coverage` lands in exactly one leg by
construction. Each leg uploads coverage JSON and test-results XML as
artifacts (fixed-depth globs). A new `test-coverage-gate` job
(`needs: test`) downloads all coverage artifacts and runs the existing
repo-wide gate, agent-core gate, and codecov upload with unchanged logic and
thresholds. `ci-gate` adds the gate job to its `needs:`. A guard test pins
the topology.

## Success criteria

- **SC-1** `scripts/__tests__/ci-test-shards.test.mjs` fails if any
  workspace package with a `test:coverage` script is covered by zero legs or
  by two or more legs.
- **SC-2** The same guard fails if `ci-gate`'s `needs:` stops including the
  coverage-gate job, and if either threshold changes (repo-wide
  `COVERAGE_THRESHOLD: 60`; agent-core 80).
- **SC-3** On a forced full run (PR touching a root turbo input): longest
  test leg ≤ ~7m, and the coverage gate reports the same repo-wide % as main
  (± integer rounding). Verified by observation of that run (see
  assumptions), with the numbers recorded in the run's verification artifact.
- **SC-4** `report-health` and every other `needs: test` consumer still
  resolves; the job id `test` survives so nothing silently stops gating.
- **SC-5** Affected gates pass: `pnpm lint && pnpm typecheck && pnpm test`,
  including the existing workflow guards
  (`ci-lint-critical-path.test.mjs`, `ci-test-results-glob.test.mjs`,
  `nightly-compliance-workflow.test.mjs` — the `--concurrency=2` cap stays
  declared on every leg).

## Scope

**In:** `.github/workflows/ci.yml` (test matrix, `test-coverage-gate`,
`ci-gate` needs); new guard `scripts/__tests__/ci-test-shards.test.mjs`.

**Out / non-goals:** shrinking any suite (#6663); further test-job changes
(#6665); changing threshold values, codecov semantics, or the nightly suite;
re-balancing legs as durations drift (a later concern — the guard pins
coverage, not balance).

## Risks

- Artifact round-trip must reconstruct repo-relative paths or the gate scans
  nothing — mitigated by the gate's existing fail-closed `TOTAL_LINES -eq 0`
  check, which turns a path mistake into a red job, never a silent pass.
- Fork PRs: artifacts and codecov behave as today (same actions, same
  token handling); no new degradation path is introduced.
