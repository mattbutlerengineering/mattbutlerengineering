---
stage: decompose
run: feature:ci-test-critical-path
date: 2026-10-15
assumptions:
  - "Autorun-driven: the cut lines were not reviewed live; milestone
    boundaries follow architecture.md's three steps as recommended."
  - "Work-order ids come from the Conductor item's reserved block
    (wo 66–75); WO-0072–WO-0075 unused."
  - "The run mirrors issue #6665 import-only (per autorun-brief.md); no
    tracker writes from this environment, so items carry the reference
    but no export happened."
---

# Breakdown: measurement-gated parallelization of Test and Typecheck

Progress lives in the checkboxes below — Implement checks items off as their
acceptance criteria are met.

**Branch rule (from architecture.md):** WO-0066's recorded verdict picks
exactly one of Milestone 2 (`proceed`) or Milestone 3 (`close`). The branch
not taken is checked off as not-applicable with a dated Note citing the
verdict — never silently skipped.

## Milestone 1: The measurement — a recorded verdict exists (tracker: #6665)

- [ ] **WO-0066 — Measure the cold-run `^build` split in Test** — on one
      cold/full PR run (lockfile-touching or fresh cache era), count from
      Test's "Run tests with coverage" log the `cache hit, replaying` vs
      `cache miss, executing` lines for `#build` tasks, and cross-reference
      Typecheck's log in the same run (same task hashes) for which hits
      Typecheck produced; `gh run view <id> --json jobs` for the
      serialization cost.
  - Accept: a dated Note below (and later the PR body) records the run
    id plus four numbers — total `^build` tasks, hits-from-Typecheck,
    hits-from-prior-cache, built-fresh — and one line
    `verdict: proceed` or `verdict: close`, applying architecture.md's
    decision rule (proceed only if Test's `^build` needs can be met
    without Typecheck and prepare-side production would cost ≪
    Typecheck's 160–200 s).
  - Blocked by: — (needs GitHub Actions log access; this blueprint
    environment has none, so the item belongs to the implement Worker)

## Milestone 2: The cut, guard-first — Test runs parallel to Typecheck (only on `verdict: proceed`)

- [ ] **WO-0067 — Guard RED: extend `ci-lint-critical-path.test.mjs`** —
      remove `"test"` from the line-40 `it.each` (lint block); in the
      line-77 architecture-audit block, change `test`'s second assertion
      from `toContain("typecheck")` to `toContain("prepare")`; add a fourth
      describe mirroring the existing three: `test` does not need
      `typecheck` and does need `prepare`, and `ci-gate` still needs
      `typecheck`.
  - Accept: the new describe fails against unchanged `ci.yml` (RED
    output quoted), and after WO-0068 passes — and fails again if
    `test.needs: [typecheck]` is reintroduced or `typecheck` is dropped
    from `ci-gate`'s needs.
  - Blocked by: WO-0066
- [ ] **WO-0068 — `ci.yml`: prepare produces `^build`, Test needs prepare** —
      `prepare` gains the two cache steps Test already uses (Cache for
      Turbo + Restore turbo local cache) and a `pnpm turbo build` filtered
      to the library packages WO-0066 showed Test's `^build` needs;
      `test.needs: [typecheck]` → `[prepare]`, replacing the ci.yml:503–508
      comment with one naming prepare as the `^build` producer and citing
      the measurement. `build`/`migrations`/`rls-integration` keep
      `needs: [typecheck]` — un-measured here; the PR says so.
  - Accept: WO-0067's guard goes GREEN; `git diff` touches only the
    `prepare` and `test` jobs plus the comment; sibling jobs' `needs`
    byte-identical.
  - Blocked by: WO-0067
- [ ] **WO-0069 — Run the affected repo gates** — `pnpm lint`,
      `pnpm typecheck`, and `pnpm exec vitest run --config
scripts/vitest.config.mjs scripts/__tests__/ci-lint-critical-path.test.mjs`
      (plus the scripts suite it lives in).
  - Accept: all three pass with output quoted in the PR body /
    verification evidence.
  - Blocked by: WO-0068
- [ ] **WO-0070 — Prove it on a real PR run** — after the change is
      pushed, read one real PR run's job timings and Test's turbo summary.
  - Accept: the PR body records a run id where Test's `startedAt`
    precedes Typecheck's `completedAt`, and Test's cache-miss `build`
    task count is not above WO-0066's baseline.
  - Blocked by: WO-0069

## Milestone 3: Close with the numbers (only on `verdict: close`)

- [ ] **WO-0071 — Close #6665 with the measured split** — the dependency
      stays; no `ci.yml` or guard-test change lands.
  - Accept: the closing comment on #6665 carries WO-0066's four numbers
    and the verdict line; the working tree carries no `ci.yml` /
    `ci-lint-critical-path.test.mjs` diff from this run.
  - Blocked by: WO-0066

## Design gaps found

None — architecture.md already fixes the mechanism, the decision rule, and
the guard shape; no component was unclear at cut time.

## Notes

- 2026-10-15 — Blueprint stops here per `stop-after: decompose` in
  autorun-brief.md; Implement onward belongs to a later Worker with
  GitHub access (WO-0066 needs Actions logs; WO-0070 needs a pushed PR).
- 2026-10-15 — WO-0066 attempted by the implement Worker on
  `conductor/sdlc-ci-6665` and still blocked: this worktree's tool
  grant is `Read, Edit, Glob, Grep, Bash(python3 *), Bash(bash
scripts/conductor-gate.sh), git add/commit/status/diff/log` — no
  `gh`, no `WebFetch`, no push, and the Conductor item's own boundary
  text confirms "this environment carries no GitHub credential." The
  measurement's acceptance criterion needs `gh run view <id> --json
jobs` and a real Test-job "Run tests with coverage" log to count
  `cache hit, replaying` vs `cache miss, executing` `#build` lines —
  none of that is reachable from here. `docs/audits/ci-conditional-steps-2026-10-10.md`
  was checked as a possible substitute (it already reads 25 real
  `ci.yml` PR runs via `gh run view`) but only times Test as a whole
  job (median 6.1 min / 7 billed) — it does not break out `^build`
  cache hits by producer, so it cannot stand in for this measurement.
  Per the protocol ("the check could not run — no review surface, no
  credentials, no network ... name why it is blocked, never silence
  it"), the item stays unchecked rather than recording an invented
  run id or verdict. Remains: "Blocked by: — (needs GitHub Actions log
  access; this blueprint environment has none)" — true again for this
  Worker, not just the Blueprint one. Re-dispatch WO-0066 to a session
  with `gh` + a real GitHub credential.
- Ordering constraint from #6665: depends on #6664 (same `test` job);
  not parallel-safe — the implement Worker lands after it.
- The protocol's open-PRs pre-flight could not run in this environment
  (no GitHub credential); reported, not silently skipped.
