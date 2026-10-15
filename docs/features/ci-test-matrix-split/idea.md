---
stage: idea
run: feature:ci-test-matrix-split
date: 2026-10-14
assumptions:
  - "The protocol's work-in-flight check and open-PR pre-flight could not run: this Worker has no GitHub credential and every gh/push path is disabled. Recorded as could-not-run, not clean; the Conductor owns batch-level duplication and PR-queue checks."
  - "Stages run inline in one agent rather than one fresh subagent per stage, to stay inside the item's $6.44 ceiling. The artifacts remain the only inter-stage state, per the autorun skill's inline sanction."
  - "Run 38650413196's durations (14m turbo; reservations 391s, hospitality 277s, rialto 270s) are carried from issue #6664 as filed, not re-measured — no CI access from this Worker."
---

# Idea: Split CI's Test job into duration-balanced matrix legs

> Source: `autorun-brief.md` in this directory (collected 2026-10-14 from
> issue #6664). No live interview. Factual claims about the current workflow
> were checked against this worktree's `.github/workflows/ci.yml` and
> workspace; measured-duration claims are carried from the issue, labelled.

## Problem

`ci.yml`'s `test` job (`Test (Node ${{ matrix.node-version }})`, matrix =
`[22]`) runs **every** package's `test:coverage` in one job:
`pnpm turbo test:coverage --concurrency=2` (ci.yml:582). Verified in this
tree: 32 workspace packages declare a `test:coverage` script. On a full run
that is ~14m of turbo time on the critical path to `CI Gate` — the repo's
only required status check — while three packages alone sum to ~938s
(reservations 391s, hospitality 277s, rialto 270s). Affected-only PR runs
are 1–4m, but any turbo cache bust (lockfile — a `globalDependencies`
entry — or root inputs) pays the full 14m (gotchas § CI).

The same job also hosts, inline (ci.yml:598–666): the codecov upload, the
repo-wide 60% statement-coverage gate (`COVERAGE_THRESHOLD: 60`, summing
every `*/coverage/coverage-final.json`), and the agent-core 80% gate. Any
split must re-join coverage somewhere downstream or these gates lose their
inputs.

## Who suffers, and how they cope

PR authors — overwhelmingly the autonomous merge train, whose cadence is CI
wall-clock-bound. Coping today is waiting, plus institutional knowledge that
lockfile-touching PRs run cold and slow (gotchas § Build and § Dependencies,
the grouped-Dependabot entry).

## Why now

Batch sdlc-speed-2 (#6666) targets exactly this path. #6663 shrinks the
longest suite; this item (#6664) parallelizes the job; #6665 edits the same
job afterwards. Sequenced here so both neighbors land against a known shape.

## Evidence

First-hand from this worktree: the single-job structure, the 32-package
coverage surface, the inline gates, and the `needs:` consumers
(`ci-gate` needs `test` among 18 jobs; `report-health` needs
`[detect-changes, lint, typecheck, build, test, migrations]`). Carried from
the issue (one CI run, labelled above): the duration split.

## Rough solution shape

One matrix job, legs = `reservations` | `hospitality` | `rialto` | `rest`,
each a turbo `--filter` expression; `rest` is **exclusion-derived**
(`!` filters for the three named packages) so a new package falls into
exactly one leg by construction. Each leg uploads its coverage JSONs and
test-results XML (fixed-depth globs). A new `test-coverage-gate` job
(`needs: test`) downloads all coverage artifacts and runs the two existing
gates and the codecov upload with unchanged logic and thresholds. `ci-gate`
adds the gate job to `needs:`. A guard test
(`scripts/__tests__/ci-test-shards.test.mjs`) pins: every `test:coverage`
package in exactly one leg; `ci-gate` depends on the gate job; thresholds
unchanged.

## Success

On a forced full run, the longest test leg ≤ ~7m and the coverage gate
reports the same repo-wide % as main (± rounding), with no package and no
gate silently dropping out.

## Unknowns / ways this dies

- Artifact round-trip: the gate job must see coverage files at their
  repo-relative paths or the existing `find`-based gate script scans nothing
  — and an empty scan is already a hard failure (`TOTAL_LINES -eq 0`), which
  is the right fail-closed default.
- `needs:`/name semantics: `ci-gate` and `report-health` key on the job id
  `test`, which survives; the display name gains a leg suffix. Required
  check is `CI Gate` only (gotchas § CI), so no branch-protection rename.
- The `rest` leg's ~7m bound is inferred from total−(big three), not
  measured per-leg; the forced-full-run criterion is where it gets measured.
