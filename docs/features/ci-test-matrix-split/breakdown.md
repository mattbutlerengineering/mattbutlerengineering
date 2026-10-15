---
stage: decompose
run: feature:ci-test-matrix-split
date: 2026-10-14
assumptions:
  - "Work-order ids come from this item's reserved block (wo 56–65); WO-0056–WO-0060 used, WO-0061–WO-0065 unused."
  - "No item carries a (tracker: #N) reference — the conductor owns issue #6664's lifecycle, so nothing in this breakdown may auto-close it."
  - "Item sizing and cut lines chosen by this stage without the skill's review-the-cut step (unattended run; brief pre-decided scope and patterns, not the cut)."
  - "WO-0060's forced full run is produced by a temporary cache-busting commit on the implementation PR itself (touch a root turbo input, capture timings, revert in the same PR) — chosen over waiting for a natural lockfile bump, which leaves SC-3 unverifiable on demand."
---

# Breakdown: Test matrix legs + `test-coverage-gate`

Progress lives in the checkboxes — Implement checks items off as acceptance
criteria are met. Source: `architecture.md` in this directory; every
mechanism below is Architect's.

## Standing rules for every item

- TDD: the guard test precedes the workflow edit it pins. Gates before
  check-off: `pnpm lint`, `pnpm typecheck`, `pnpm test` (affected).
- Stage by explicit path, never `git add -A`.
- New/moved `run:` blocks whose exit code is the point open with
  `set -o pipefail`; third-party actions keep their existing full-SHA pins.
- Nothing here merges, tags, publishes, or deploys.

## Milestone 1: the topology is pinned by a red guard

- [x] **WO-0056 — Write `scripts/__tests__/ci-test-shards.test.mjs`, prove
      it RED** — textual parse of the real `ci.yml` (pattern:
      `ci-lint-critical-path.test.mjs` `needsOf`). Asserts: (a) the `test`
      job declares `matrix.leg` with named legs
      `reservations|hospitality|rialto` mapping to filters
      `@mbe/reservations-service`, `@mbe/hospitality`,
      `@mattbutlerengineering/rialto`, plus `rest` whose filters are
      exclusions of exactly the named set — so every workspace
      `package.json` with `test:coverage` (enumerated from disk) is selected
      by exactly one leg: SC-1 red on zero-or-two-leg coverage; (b)
      `ci-gate`'s `needs:` includes `test-coverage-gate` and still `test`;
      (c) `COVERAGE_THRESHOLD: 60` lives on `test-coverage-gate` and the
      agent-core step keeps the literal 80 (SC-2). AC: suite fails against
      current single-job `ci.yml` (RED run quoted in the commit/PR), and
      each assertion fails independently when its target is perturbed.

## Milestone 2: ci.yml satisfies the guard

- [x] **WO-0057 — Split `test` into the leg matrix** — add `leg` axis
      (`node-version: [22]` stays), per-leg turbo command keeping
      `--concurrency=2`; per-leg uploads: `coverage-${{ matrix.leg }}`
      (fixed-depth `*/coverage/coverage-final.json`,
      `*/*/coverage/coverage-final.json`) and
      `test-results-node${{ matrix.node-version }}-${{ matrix.leg }}`
      (existing fixed-depth XML globs). Remove the three inline
      coverage/codecov steps and job-level `COVERAGE_THRESHOLD`. AC:
      `ci-test-results-glob.test.mjs` and
      `nightly-compliance-workflow.test.mjs` still green; no `**` globs.
- [x] **WO-0058 — Add `test-coverage-gate`** — `needs: [test]` (no
      `if: always()`), env `COVERAGE_THRESHOLD: 60`; checkout, download
      `pattern: coverage-*` with `merge-multiple: true` into the workspace
      root, then the three moved steps verbatim (repo-wide gate, agent-core
      gate, codecov upload with the existing `files:` list), dropping the
      now-meaningless `matrix.node-version == 22` conditions. AC: gate steps
      byte-equivalent to the moved originals aside from those drops;
      fail-closed `TOTAL_LINES -eq 0` path intact.
- [x] **WO-0059 — Wire `ci-gate` and sweep consumers** — add
      `test-coverage-gate` to `ci-gate`'s inline `needs:` (keeping `test`);
      confirm `report-health`'s `needs` untouched and resolving; run
      WO-0056's guard (now GREEN) plus `ci-lint-critical-path.test.mjs`,
      `ci-turbo-cache.test.mjs` if it reads the test job, actionlint on
      `ci.yml`, and the affected lint/typecheck/test gates (SC-4, SC-5).

## Milestone 3: the split is measured, not assumed

- [ ] **WO-0060 — Forced full-run measurement (SC-3)** — on the
      implementation PR, push a temporary commit touching a root turbo
      input to bust every cache, record each leg's wall-clock and the
      gate's repo-wide % against main's current %, then revert the bust in
      the same PR. AC: longest leg ≤ ~7m and % equal ± rounding, numbers
      recorded in the PR body and the run's `verification.md`; if the
      bound misses, record the actual number and route re-balancing back to
      Architect rather than silently widening a leg.

## Notes

- ADR 104–106 reserved, none consumed (two-way door; recorded in
  `architecture.md` frontmatter).
- Blocked by nothing in this batch; #6665 edits the same job and must land
  after (issue: parallel-safe with #6663 only).
