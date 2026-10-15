---
stage: idea
run: feature:ci-test-critical-path
date: 2026-10-14
assumptions:
  - "In-flight duplicate check could not run: this environment carries no
    GitHub credential (no gh, no PR list). Proceeding on the Conductor's
    claim of issue #6665; the issue was created by /decompose for the
    sdlc-speed-2 feature and is tracked by #6666."
  - "Open-PR pre-flight could not run for the same reason; reported, not
    silently skipped."
  - "Stages run inline in the orchestrator rather than as fresh subagents:
    the artifacts remain the only state, and the run's hard dollar ceiling
    makes per-stage context reloads a completion risk."
---

# Idea: Test should not wait out Typecheck's whole duration

## Problem

"Every PR pays prepare → typecheck → test in series. Typecheck takes
160–200 s, and Test — the longest job in the run — cannot start until it
finishes. On run 38650413196 Test started 265 s after the run was created;
on 38644177646, 473 s. The only stated reason is a cache hand-off."

## Who has it

- **Every PR author (human or agent)** — waits the serial chain out on
  every push; the merge train multiplies the wait across queued PRs.
- **The implement-queue loop** — its iteration time is bounded below by
  CI wall-clock, so the chain taxes every autonomous cycle.

Today they cope by waiting; nothing routes around the required `CI Gate`.

## Why now

Part 3 of 3 of sdlc-speed-2 (tracking #6666), after #6663/#6664 worked the
same job from other angles. Three prior cuts of this exact shape already
landed and held: #6089 (build/test off `lint`), #6102 (integrity off
`build`), #6114 (off `architecture-audit`) — each guarded in
`scripts/__tests__/ci-lint-critical-path.test.mjs`.

## Evidence

- `ci.yml` `test.needs: [typecheck]`, with the in-file comment naming the
  turbo `^build` cache as the only consumed artifact (ci.yml:503–508).
- Measured starts: Test at +265 s (run 38650413196) and +473 s (run 38644177646) after run creation; Typecheck alone measured 160–200 s.
- Both jobs already share two cache paths: the remote-cache proxy
  (`rharkor/caching-for-turbo`) and the local `.turbo/cache` restore keyed
  `${os}-turbo-${lockfile-hash}-${sha}` with a lockfile-hash prefix
  fallback — so warm runs may not even be consuming Typecheck's outputs.

## Solution hunch

Measure what Test's turbo `cache hit, replaying` lines actually replay on
a real PR run. If the `^build` outputs can be produced by `prepare` (which
every job already needs) into the same shared cache, set
`test.needs: [prepare]` and let Test and Typecheck run in parallel —
Typecheck still gates CI Gate. If the measurement says the hand-off is
load-bearing and irreplaceable, close #6665 with the numbers.

## Success in one sentence

A real PR run shows Test starting before Typecheck finishes, with no extra
cache-miss `build` tasks and CI Gate still requiring Typecheck — or the
issue closes with measurements proving the dependency must stay.

## Unknowns & risks

- The cache-hit split is unmeasured — the whole change is conditional on
  it (the issue makes "close with numbers" a sanctioned outcome).
- Moving `^build` production into `prepare` lengthens `prepare`, which
  gates _every_ downstream job; if building library packages costs what
  Typecheck costs, the critical path just moves.
- Cold runs (lockfile-touching PRs) are the case that matters: warm runs
  already ride the lockfile-prefix cache fallback. The measurement must
  look at a cold or full run, not a warm one (the feature's own name says
  so).
- #6664 touches the same `test` job — not parallel-safe; this run's
  Implement must land after it or rebase over it.
