# RCA: PR #5949 — mutation-testing vitest catalog pin, reverted for an unrelated timeout

**Date:** 2026-10-10
**Session:** https://claude.ai/code/session_01KMhhjK1PyCc6pgF4ffA9wE
**Type:** debugging
**Status:** False-positive revert. The reverted change was not the cause of the red main run. Issue #5826 is still unfixed and has been reopened (label `ready`).

## Summary

PR #5949 (merged `962ba3a1a`, 2026-10-01T15:20:52Z) switched `tools/mutation-testing/package.json` from
`"vitest": "4.1.11"` to `"catalog:"`. It also removed the now-dead `INTENTIONAL_MISMATCHES` entries in
`tools/cli/src/commands/check-deps.ts` and `scripts/check-dep-versions.js`, updated their tests and the README,
and regenerated `pnpm-lock.yaml` (+8/-129). Its PR-level CI was green: run `36882024887`, CI Gate success,
`Test (Node 22)` pass in 8m37s.

The push-to-main CI run `36883537666` (job `110442977400`, `Test (Node 22)`) failed. That failure raised the
broken-main issue #5959, and Revert Watchdog run `36885975516` then proposed revert PR #5960
("Automatically proposed revert of #5949 due to CI failure on main"). #5960 merged as `2ff41db96`. #5949 had
carried `Closes #5826`, and #5826 was closed COMPLETED at the #5949 merge. It was never reopened.

## Evidence: what actually failed

The single failing test in run `36883537666`, taken from the job log:

```
FAIL scripts/__tests__/visual-defect-reproduction.test.mjs > marketing — the declared visual
     sensitivity can see defect.md § A's reproduction > metrics-1280x720.png
Error: Test timed out in 60000ms.
Test Files 1 failed | 245 passed (246)
Tests      1 failed | 4747 passed (4748)    Duration 577.01s
```

- The `check-deps`, `check-dep-versions` and mutation-testing tests, which are the only code #5949 touched,
  all passed (4747/4748).
- The same file, `visual-defect-reproduction.test.mjs`, passed on #5949's own PR run `36882024887` in 340s.
  It failed on the post-merge push run, where the whole file took 531s (the whole suite took 577s).
- The `RolldownError ... 'import ... =' can only be used in TypeScript files` blocks in the log come from
  generated Prisma clients and are noise. They appear without failing anything.
- The test file came from #5931 (`fda7ff10c`, 2026-09-30, one day before #5949). It decodes, shifts and
  compares about 99 whole PNG baselines per run.

## Root cause

A CPU-bound test with a hard 60s per-test timeout (`scripts/vitest.config.mjs` `testTimeout: 60000`) was run
under v8 coverage on a loaded CI runner. It was marginal, and #5949 was the PR that happened to be merged when
it tipped. #5949 had no causal link to the failure.

The fix commit message for #6091 (`b865ca665`, 2026-10-06) confirms the mechanism independently. Main went red
again at `b0765f285` (run `37416547647`) with the same test timing out at 60s on the same kind of baseline
(`metrics-1280x720.png`). That commit has no relation to vitest or mutation testing. #6091 measured that v8
block coverage slows the pngjs/Playwright pixel loops about 8x (17.6s plain vs 145s under `--coverage`) and
fixed it by moving the file to an uninstrumented second vitest pass, plus cheaper PNG encoding in
`shiftPngChannels`.

An aggravating factor is that #5949 touched `pnpm-lock.yaml`. `pnpm-lock.yaml` is a turbo `globalDependencies`
entry, so the lock change forces a cold, fully parallel CI run. That is the failure class already recorded in
`.claude/rules/gotchas.md` § CI ("Any `pnpm-lock.yaml` change forces a cold, fully parallel CI run — that's
what tips marginal-timeout test suites over"). The lock change probably made the post-merge run more likely to
trip, but it is a trigger and not the cause. The log does not prove how much it contributed: the main-branch
run was cold, and the PR run, which also touched the lockfile, was not.

### Why it became a revert instead of a re-run

1. **The automation treats any red push CI as caused by the merge commit.** `revert-watchdog.yml` walked the
   baseline (the log shows `baseline walk: 81cc23b6... was no CI run found — checking its parent`). It proposed
   a revert even though the failing test was in files #5949 never touched. Whether the failing job's test paths
   overlap the culprit PR's changed files is a cheap signal that was available.
2. **The revert reopened nothing.** #5826 stayed closed COMPLETED, so the original dependency-drift finding
   silently dropped out of the queue. As of this RCA `tools/mutation-testing/package.json` still has
   `"vitest": "4.1.11"`.

## Prevention

- The timeout-and-coverage mechanism is already fixed by #6091. Do not add anything for it.
- The lockfile cold-cache trap is already documented (gotchas.md § CI), so no new gotchas.md entry is added.
  This RCA only adds that the mechanism can also be CPU-heavy tests under v8 coverage, not only slow app
  startup.
- Proposed, not implemented because this is workflow-level and outside "small and safe":
  - `revert-watchdog` should skip or downgrade the revert when the failing test file(s) do not intersect the
    culprit PR's changed files and the same test fails on an unrelated later commit, or it should try
    `gh run rerun --failed` once before proposing a revert.
  - A revert PR should reopen any issue its culprit PR closed (`Closes #N`), so the work is not lost. **Now live** (#7397, #7399): when a revert-watchdog revert PR merges, `reopen-culprit-issues` in `revert-watchdog.yml` reopens, labels `ready` and comments on each issue the culprit PR closed.

## Action items

- [x] Reopen #5826 (done by the orchestrator, labelled `ready`). The re-land should re-verify the vitest-runner patch (`patches/@stryker-mutator__vitest-runner@10.0.0.patch`) per the README note in the original PR.
- [x] Seed the revert-watchdog test-path-overlap/rerun check and the revert-reopens-issues behavior: two seeds appended to `docs/backlog.md` (from: RCA-PR-5949).
- [x] Revert PRs reopen the issues their culprit PR closed: `extractClosedIssueNumbers` (#7397) and the merged-revert `reopen-culprit-issues` job (#7399), tracked in #7396.
