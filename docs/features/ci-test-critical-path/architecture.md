---
stage: architect
run: feature:ci-test-critical-path
date: 2026-10-14
ux: skipped — no user-facing surface (prd.md ux-reason)
assumptions:
  - "No ADR: the change is a two-line needs edit plus a cache/build step,
    fully undone by revert — fails the hard-to-reverse leg. Reserved adr
    ids 107–109 go unused; this section is the one-line record."
---

# Architecture: measurement-gated parallelization of Test and Typecheck

## Mechanism today (measured from ci.yml)

- `typecheck` (needs `prepare`) runs `pnpm typecheck`; turbo's `typecheck`
  task pulls `^build`, so Typecheck builds library deps and seeds two
  caches shared with Test: the remote-cache proxy
  (`rharkor/caching-for-turbo`, GH-Actions-cache-backed, per-task keys)
  and local `.turbo/cache` (actions/cache, key
  `${os}-turbo-${hash(pnpm-lock)}-${sha}`, prefix fallback).
- `test` (needs `typecheck`, ci.yml:500–508) restores both caches, then
  `turbo test:coverage` replays the `^build` tasks as cache hits.
- On warm runs the prefix fallback can serve `^build` from a _previous_
  run — the hand-off is only unambiguously load-bearing on cold runs
  (lockfile-touching PRs, new cache era), which is why measurement must
  target a cold/full run.

## Step 1 — the measurement (decides everything)

On one cold PR run: from Test's "Run tests with coverage" log, count
`cache hit, replaying` vs `cache miss, executing` lines for `#build`
tasks; cross-reference Typecheck's log for which of those hits it
produced in the same run (same task hashes). Record: total `^build`
tasks, hits-from-Typecheck, hits-from-prior-cache, built-fresh.
`gh run view <id> --json jobs` gives start/finish stamps for the
serialization cost. Decision rule: if Test's `^build` needs can be met
without Typecheck (few tasks, cheap to produce in prepare), proceed;
if Typecheck's hand-off is irreplaceable or prepare-side production
would cost ≈ Typecheck's duration, stop and close #6665 with the numbers.

## Step 2 — the change (only if supported)

In `.github/workflows/ci.yml`:

1. `prepare` gains the two cache steps Test already uses (Cache for
   Turbo + Restore turbo local cache) and a `pnpm turbo build
--filter='./packages/*'` (exact filter set by the measurement: the
   library packages Test's `^build` actually needs). actions/cache saves
   on job completion, so prepare's save under the `${sha}` key lands
   before any dependent job starts; the remote proxy is readable
   cross-job immediately.
2. `test.needs: [typecheck]` → `test.needs: [prepare]`, replacing the
   ci.yml:503–508 comment with one naming prepare as the `^build`
   producer and citing the measurement.
3. `build`/`migrations`/`rls-integration` keep `needs: [typecheck]` in
   this run — same mechanism but un-measured here; the PR says so
   (surgical-change mandate). A follow-up may cut them with their own
   numbers.

Risk accepted: prepare lengthens for every job. Containment: the
measurement must show prepare's added build time ≪ Typecheck's 160–200 s,
else close-with-numbers.

## Step 3 — the guard (written first, RED → GREEN)

Extend `scripts/__tests__/ci-lint-critical-path.test.mjs` with a fourth
describe mirroring the three existing ones: `test` does not contain
`typecheck` and contains `prepare`; `ci-gate` still contains `typecheck`.
The existing `it.each(["build", "test", ...])` asserts every job
_contains_ `typecheck`, so `test` moves out of that list into the new
block — the edit is part of the guard work, not a drive-by.

## Decisions (one-line records; none meet the ADR bar)

- Scope the cut to `test` only; sibling jobs wait for their own numbers.
- Measurement is a work order with a recorded verdict, not a side note —
  the proceed/close decision is written into the breakdown before any
  ci.yml edit.
