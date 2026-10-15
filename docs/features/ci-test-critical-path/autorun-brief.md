---
run: feature:ci-test-critical-path
date: 2026-10-14
stop-after: decompose
---

# Autorun brief: cut Test off the Typecheck critical path

Collected from GitHub issue #6665 (part 3 of 3 of "sdlc-speed-2 — cut the
cold/full-run CI Test critical path", tracking #6666), driven by the
Conductor batch item on branch `conductor/sdlc-ci-6665`. The issue is the
Owner's input; this brief restates it for the stage interviews.

## Feature description (what and why)

`ci.yml`'s `test` job has `needs: [typecheck]` for one stated reason: "the
turbo `^build` cache it reuses comes from Typecheck". So the PR critical
path is prepare → typecheck (160–200 s measured) → test. On run
38650413196 Test started 265 s after the run was created; on 38644177646,
473 s. Build has the same shape. If `^build` outputs can come from the
`prepare` job instead, Test and Typecheck run in parallel and the critical
path shortens by Typecheck's whole duration.

**Measure first, then change only if the measurement supports it:**

1. On one PR run, record from the logs how much of Test's turbo work was
   `cache hit, replaying` for `^build` tasks that Typecheck produced vs.
   built fresh.
2. If `^build` outputs can come from `prepare` (e.g. prepare runs
   `turbo build` for library packages into the shared `.turbo/cache` key),
   move that production to `prepare` and set `test.needs: [prepare]` so
   Test and Typecheck run in parallel. Typecheck still gates CI Gate.
3. If the measurement shows the dependency must stay, close the issue with
   the numbers instead — that is a valid outcome.

## Run scale and slug

Feature run, slug `ci-test-critical-path`, entering at Idea.
`stop-after: decompose` — this run stops at the blueprint gate; Implement
onward belongs to a later Worker.

## Scope boundaries

- **In:** `.github/workflows/ci.yml` jobs `prepare` and `test`;
  `scripts/__tests__/ci-lint-critical-path.test.mjs` (extend: assert Test
  does not need Typecheck AND CI Gate still needs Typecheck).
- **Conditionally in:** `build`/`migrations`/`rls-integration` only if the
  same reasoning applies — the PR must say which.
- **Out:** everything else; no changes to what CI Gate requires
  (Typecheck still gates CI Gate), no weakening of any gate.

## Success criteria (from the issue, verbatim where it speaks)

- PR body (or closing comment) shows the measured cache-hit split from
  step 1.
- If changed: guard test passes and fails when `needs: [typecheck]` is
  reintroduced or typecheck is dropped from `ci-gate`.
- If changed: a real PR run shows Test starting before Typecheck finishes,
  with no extra cache-miss `build` tasks vs. the baseline.
- Tests pass: `pnpm lint && pnpm typecheck && pnpm test` (affected).

## Decisions already made

- Prior identical cuts are the pattern to follow: #6089 (build/test off
  `lint`), #6102 (integrity off `build`), #6114 (off `architecture-audit`)
  — all guarded in `ci-lint-critical-path.test.mjs`.
- Depends on #6664 (same `ci.yml` test job); not parallel-safe with it.
- No user-facing surface — CI workflow and guard-test change only.

## Tracker

The run mirrors issue #6665 (import only — the issue exists; this
environment has no GitHub credential, so no export or tracker writes).

## Release authorization

None — prepare-and-stop is moot here: the run stops at decompose. The
merge belongs to the Conductor's Owner gate.
