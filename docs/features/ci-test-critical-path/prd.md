---
stage: prd
run: feature:ci-test-critical-path
date: 2026-10-14
ux: not-applicable
ux-reason: CI workflow and guard-test change only; no user-facing surface
assumptions:
  - "Brief answered all interview questions; no live user input. Scope,
    actors and criteria taken from issue #6665 verbatim where it speaks."
  - "Reserved prd id 7 from the Conductor item's block names this PRD;
    the run directory remains the artifact's home per protocol."
---

# PRD 7: Test runs parallel to Typecheck when measurement supports it

## Problem

`test.needs: [typecheck]` serializes the two slowest-to-finish PR jobs for
one stated reason — the turbo `^build` cache hand-off. Typecheck's whole
160–200 s sits on every PR's critical path (Test started +265 s and +473 s
after run creation on the two cited runs).

## Users

PR authors (human and agent) and the implement-queue loop, whose iteration
time is bounded by CI wall-clock.

## Requirements

1. **Measure before changing.** On one real PR run, record from Test's
   logs the split of turbo `^build` tasks between `cache hit, replaying`
   and built fresh, and whether the hits were produced by that run's
   Typecheck or restored from a prior run's cache. A cold/full run (e.g.
   lockfile-touching) is the case that decides.
2. **Change only if supported.** If `prepare` can produce the `^build`
   outputs into the caches Test already restores, move that production to
   `prepare` and set `test.needs: [prepare]`. Typecheck still gates
   CI Gate. `build`/`migrations`/`rls-integration` change only if the same
   reasoning applies — the PR must say which.
3. **Guard the cut.** Extend
   `scripts/__tests__/ci-lint-critical-path.test.mjs`: Test does not need
   Typecheck AND `ci-gate` still needs Typecheck; it must fail if either
   regresses.
4. **Closing with numbers is success.** If the measurement shows the
   dependency must stay, close #6665 with the measured split.

## Out of scope

Any weakening of CI Gate's `needs` list; any other ci.yml job; turbo task
graph changes (`turbo.json`).

## Success criteria (acceptance, from #6665)

- [ ] PR body (or closing comment) shows the measured cache-hit split.
- [ ] If changed: guard test passes, and fails when `needs: [typecheck]`
      is reintroduced or typecheck is dropped from `ci-gate`.
- [ ] If changed: a real PR run shows Test starting before Typecheck
      finishes, with no extra cache-miss `build` tasks vs. baseline.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` (affected) pass.

## Constraints

- Depends on #6664 (same `test` job); not parallel-safe — land after it.
- Pattern to follow: #6089, #6102, #6114 (prior cuts, same guard file).
