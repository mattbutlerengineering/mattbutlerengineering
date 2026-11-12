# RCA: PR #8701 — fold-budget clock pin, reverted for red checks it did not touch

**Date:** 2026-11-12
**Type:** debugging
**Status:** Probable false-positive revert. Issue #8683 (the date-dependent fold-budget ratchet) is unfixed again after #8713.

## Summary

PR #8701 (merged `6ae9e180b`, 2026-11-11T19:51Z) changed one file, `apps/hospitality/e2e/fold-budget.spec.ts`, to pin the browser clock so the Timeline header's date label stops wrapping on long dates (root cause analysed in the PR body). Reviewer PASS 9/10, `reviewed-merge` merged it on a green `CI Gate`.

The push-to-main run then failed `CI Gate`. #8712 was filed, the revert watchdog proposed #8713, and it merged as `16e3bef17`.

## Evidence

Failing checks on the merge commit `6ae9e180b`: `CI Gate`, `Dependency Sync`, `Regenerate (hospitality)`, `Visual Regression (hospitality)`, `Capture E2E Screenshots`.

- **`Dependency Sync`** (job `130768938164`) log: `npm error notarget No matching version found for @babel/types@^7.29.14` plus `Audit failed for apps/gen`. A registry/lockfile problem; a spec-only diff cannot cause it.
- **`Visual Regression (hospitality)`**: `briefing-375x812` was already 1028 px over its 202 px budget in the PR-level visual comment on #8701 _before_ merge (run `43077544912`). The snapshot is produced by `apps/hospitality/e2e/visual.spec.ts`, which runs under its own fixed clock and does not import `fold-budget.spec.ts`. No link from the diff to that snapshot was found.
- `Regenerate (hospitality)` and `Capture E2E Screenshots`: the logs read were build output only; no failure line tied to the spec change was found. Not conclusively diagnosed.
- #8701's own diff left the budget and the ratchet constant unchanged.

## Root cause

Not proven. The best-supported reading: main went red from checks independent of the one-file spec change (a registry failure and an advisory visual drift), and the watchdog reverts the newest merge on any red main run without testing whether that merge could cause the failing jobs. The cost: a correct fix for #8683 was removed and the fold-budget ratchet will fail again on long date labels.

What I could not verify: whether pinning the clock changes any screenshot shared with other specs. Check this before re-landing.

## Prevention

- One gotcha added (`.claude/rules/gotchas.md` § CI): before reverting for a red main, compare the failing jobs with the diff's files.
- Re-land the #8701 change (reopen #8683) once the `Dependency Sync` ETARGET and the `briefing-375x812` baseline are handled separately; confirm `visual.spec.ts` snapshots do not move with it.
