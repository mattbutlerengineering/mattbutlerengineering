# RCA: PR #3588 — "Reverted" claim was itself a false positive

**Date:** 2026-08-03
**Type:** debugging / meta-automation
**Status:** No revert ever merged. #3588's changes are live on `main` today.

## Summary

Issue #3615 asked for an RCA on the premise that PR #3588 ("fix(ci): wire
`@mbe/scripts` into test:coverage, fix phantom rialto tokens") was reverted in
commit `ec35b2cf`. That premise is **false**. `ec35b2cf` is `#3588`'s own
squash-merge commit, not a revert. A revert PR (**#3614**, `revert: #3588
(fixes broken main)`) was auto-proposed by `revert-watchdog.yml`, but a human
closed it **without merging** once `main` was fixed forward. `#3588`'s diff —
`scripts/package.json`'s `test:coverage` script, the `ci.yml` codecov file
entry, `scripts/vitest.config.mjs`'s coverage block, and the regression test —
is still on `main` unchanged (verified: `git show HEAD:scripts/package.json`
still has `test:coverage`, `ci.yml`'s codecov `files:` list still has
`scripts/coverage/coverage-final.json`).

Two independent root causes are behind this:

## Root cause 1 — the RCA-triggering automation itself was buggy (pre-existing, already fixed)

`scripts/revert-rca.mjs`, at the time issue #3615 was filed, conflated "a
revert PR was _proposed_" with "a revert was _merged_". `revert-watchdog.yml`
calls the script immediately after opening a revert PR — before it's possible
for that PR to be merged — passing the culprit's own merge commit as
`--revert-sha`. The old code trusted that argument unconditionally and filed
an RCA issue claiming "was reverted in commit `<culprit's own sha>`" the
instant the revert PR was opened, regardless of whether anyone ever merged it.

This exact bug class was already caught once before, on `#3545`/`#3559`
(tracked as **#3583**, false RCA **#3560**), and fixed in **PR #3590**
("verify a revert actually merged before filing RCA"), which rewrote the
script to classify revert state as `none` / `proposed` / `merged` and only
file an RCA issue in the `merged` state.

**The timing is the tell:** issue #3615 was created at `2026-08-01T20:15:22Z`
— nine minutes _before_ #3590 merged at `2026-08-01T20:24:07Z`. #3615 is a
straggler instance of the already-diagnosed #3583 bug class, filed by the
pre-fix version of the script in the narrow window before the fix landed. It
is not a new occurrence and does not indicate #3590's fix is incomplete — no
recurrence has been observed since.

## Root cause 2 — the actual CI break that triggered the (mislabeled) revert proposal

`#3588` did genuinely break `main`'s push-triggered CI run at `ec35b2cf`
(run `30716101816`, Node 20 leg only). Two compounding, pre-existing repo
conditions — neither of which #3588 introduced — turned an unrelated
dependency bump into a red build:

1. **`pnpm-lock.yaml` is a turbo `globalDependencies` entry** (`turbo.json`).
   #3588 added `@vitest/coverage-v8` as a `scripts/package.json`
   `devDependency`, touching the lockfile. Any lockfile change invalidates
   turbo's cache for **every** task in the graph, forcing a cold, fully
   parallel re-run of the whole ~40-task CI matrix instead of the usual
   mostly-cached run.
2. **`tools/cli`'s `check-model subcommand` tests had no timeout headroom**
   for that cold/parallel load. `agent.test.ts`'s directive-mode test
   exceeded vitest's 5s default at least once under the cache-cold run; a
   second test in the same block then read stale output from the first
   test's still-resolving action handler and failed its assertion.

A third, structural factor is why this wasn't caught **before** merge rather
than after: at the time, `ci.yml`'s `test` job resolved its Node matrix via
`fromJSON(github.event_name == 'pull_request' && '[22]' || '[20,22]')` — the
Node 20 leg that actually failed ran _only_ on push-to-main, never on the PR
itself (tracked separately as **#3570**). So `#3588`'s own PR checks were
green (Node 22 only), and the failure surfaced for the first time on the
merge commit, already on `main`.

### Fix (already merged, same day, no revert needed)

- **#3616** (`a45b118a`, merged 20:33:34Z) — raised `tools/cli`'s vitest
  `testTimeout` to 15000ms, mirroring the identical fix already applied to
  `services/reservations` for its `buildApp()` cold-start timeout.
- **#3618** (`8e110ced`, merged 20:47:51Z) — dropped the per-event Node
  matrix split entirely (Node 20 retired, flat `node-version: [22]`), closing
  #3570 and making PR-time and push-time CI structurally identical so this
  class of "invisible until post-merge" failure can't recur.

`main` has been green on every run since `a45b118a`. Both fixes are still in
place (`tools/cli/vitest.config.ts` still carries `testTimeout: 15000` with a
comment citing this exact incident; `ci.yml`'s `test` job matrix is still
flat `[22]`).

## Why it wasn't caught pre-merge

- The timeout only manifests under a cold, cache-invalidated, fully parallel
  CI run — not reproducible by running `tools/cli`'s suite in isolation
  (confirmed reliable in #3616's own investigation: 352/352 passing locally
  with workspace deps built).
- The specific CI leg that failed (Node 20) did not run on the PR that
  introduced the lockfile change, only on the resulting push to `main`
  (#3570) — since fixed by #3618.

## Prevention

Two `gotchas.md` entries added (see below): one on the turbo-cache /
default-timeout interaction generalized beyond the `buildApp()`-only framing,
and one on `revert-rca.mjs`'s now-fixed "proposed ≠ merged" distinction so a
future contributor extending the revert/RCA automation doesn't reintroduce
the same conflation in a new code path.

## Re-attempting the original fix?

**No — nothing to re-attempt.** Both goals named in #3588's title are already
live on `main`:

- `@mbe/scripts` → `test:coverage` wiring: still present (`scripts/package.json`,
  `scripts/vitest.config.mjs`, `ci.yml`'s codecov file list, the regression
  test) — never reverted.
- "phantom rialto tokens": that was a _different_ issue (#3567) that had
  already been fixed and merged as **#3586** before #3588 even merged; #3588's
  worker found the overlap mid-run and dropped the redundant CSS delta from
  its own diff before opening the PR. There is no phantom-token regression on
  `main` to fix.

This PR is scoped to the RCA doc and the two gotcha entries only.
