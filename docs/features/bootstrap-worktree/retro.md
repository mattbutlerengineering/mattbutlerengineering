---
stage: operate
run: feature:bootstrap-worktree
date: 2026-11-22
users-observed: 1
signal-source: "issue #9111 (2026-11-18): one named worker worktree, agent-a199ba5254f54bae5, reported running `pnpm bootstrap:worktree`. No usage telemetry for the command exists, so the count is a floor, not a census; the 14-day harvest in #9312 counts failures to run it, not runs of it."
assumptions:
  - "users-observed is 1: the only named, evidenced invocation by a person or agent is the worker in #9111. The command's population is every worktree-spawned agent plus the Owner, but nothing counts them. 124 linked worktrees exist on this host (`git worktree list`, 2026-11-22), 66 with a `node_modules`, 58 without; that shows how many trees exist, not who ran the command."
  - "release.md says `outcome: released` with `released-at: 2026-11-03T03:26:10Z`, which is the merge of the artifact PR #8168. The code itself reached main earlier, as #6676 (merged 2026-10-15T05:37:25Z, `gh pr view 6676`). Both dates are read from the artifacts and gh, not re-derived."
  - "The brief's `operate: skip` is superseded: this retro is written on explicit request, and release.md's Outcome section says the run stays active until feedback is captured."
  - "CI cannot be the signal for the `node_modules missing` class: CI jobs check out fresh and install themselves. `gh run list --limit 200` shows 0 failures (171 success, 26 skipped, 3 cancelled), so a clean run list says nothing about worktree behaviour. The worker/session signal is #9312's harvest."
  - "Issue #8169 (created 2026-11-03T00:24:05Z, before #8168 merged at 03:26:10Z) is about cloud sessions' primary checkout, not worktrees. By the protocol's date rule it is counted toward nothing; it is listed under Open debt only for visibility."
---

# Retro: `pnpm bootstrap:worktree`, one-command worktree bootstrap

## Outcomes vs. intent

Population: one named worker observed, plus the Owner as the person who filed the follow-ups. The success statement ("in a fresh worktree, `pnpm bootstrap:worktree` then `tsc --noEmit` passes with no TS2307, and a second run finishes in under 5 seconds") is a statement about a tool, so some of it can be measured directly. Whether workers use the command is only partly observable: see the first outcome.

### The command exists, is on main, and is what the docs and prompts point at (R1, R3, R4)

- What happened: `scripts/bootstrap-worktree.mjs`, the SessionStart hook `.claude/hooks/worktree-bootstrap-hint.sh` and the `package.json` script `bootstrap:worktree` are all on `origin/main` (`git grep` on origin/main). The command is named in `CLAUDE.md` line 40, `.claude/rules/gotchas.md` lines 27 and 33, `.claude/agents/implement-queue-worker.md` line 47, `.claude/implement-queue.md` line 114, `.claude/skills/ci-monitor/SKILL.md` line 125 and `scripts/cloud-session-bootstrap.mjs`. The script now derives 14 dist-consumed packages, one more than Verify's 13 (`@mbe/site-nav` joined), so the derived list tracked the workspace without a hardcoded edit. I ran `pnpm bootstrap:worktree --check` in this fresh worktree: it reported `pending — install, then build (...14 packages)`.
- Signal strength: measured (file and command output). Says the tool exists and the derivation works. Says nothing about use.

### SC-1, fresh worktree passes `tsc --noEmit` with no TS2307

- What happened: passed in Verify on 2026-11-02 (install plus 13 builds, `tsc` exit 0). Since release, I found no issue or merged PR whose title or body reports a TS2307 in a bootstrapped worktree: `gh issue list --search "TS2307 OR node_modules worktree"` and `gh pr list --state merged --search "TS2307 ..."` since 2026-11-03 returned only #9312, #8169, #8392, #9384 and #9200, none of which reports TS2307 after a completed bootstrap. Absence of a complaint is weak evidence: search lags and workers rarely file issues for a thing they fixed.
- Signal strength: anecdote (one Verify run, plus absence of complaints).

### SC-2, a no-op second run in under 5 seconds

- What happened: still unconfirmed, and the two pre-merge re-measures were waived, not run (release.md, "Ship write-back"; the merge happened at load ~86). Today, at load average 6.77 (`uptime`, not idle), I timed `pnpm bootstrap:worktree --check` at 1.213 s total and `node scripts/bootstrap-worktree.mjs --check` at 0.122 s. That is the `--check` path on a tree that needs bootstrap, not the "nothing to do" path, so it is an indicative upper bound on launcher plus probe cost, not a measurement of SC-2. It does support Verify's reading that the 10.9 to 12.3 s was host load (pnpm launcher 8.7 to 11.3 s at load 22 to 45), not the script.
- Signal strength: anecdote. The literal criterion has still never been measured on an idle host.

### The bet: workers and sessions stop hitting `node_modules missing` / TS2307 (idea.md "why now")

- What happened: not retired. Issue #9312 (filed 2026-11-21, after the merge, a 14-day session harvest) records, finding 5: "Missing `node_modules` in worktrees: 9 occurrences / 3 sessions": `pre-bash-guard.sh` blocked `pnpm exec vitest` with `BLOCK: node_modules missing`. The issue's own reading is that the guard works and "`pnpm bootstrap:worktree` was skipped or had not finished", and that some dispatch prompts still carried the bare install step. PR #9384 (merged 2026-11-22) changed `.claude/implement-queue.md` requirement 2, the `ci-monitor` prompt and `docs/routines/mbe-evening.md` from bare `pnpm install --frozen-lockfile` to `pnpm bootstrap:worktree`, and says the live `mbe-evening` trigger "still has the old text". The 9 failures are real, but the harvest does not say which of the 3 sessions bootstrapped and failed, versus skipped the step. Of the 124 worktrees on this host, 58 have no `node_modules` (some will be reaped or idle, so this is not a failure count).
- Signal strength: pattern for "the failure class recurs after release" (9 occurrences across 3 sessions in one harvest). Anecdote for the cause: the harvest does not attribute it.

### Defects found after release in the feature's own territory

- What happened: two regressions arrived through follow-on work and were fixed the same day. #9106 (2026-11-18) made `bootstrap:worktree` set a per-worktree `core.hooksPath=.husky/_`; #9111 (filed 19:06Z, closed 19:28Z) found that left hooks silently inert in a fresh worktree (`.husky/_` did not exist) and that the first bootstrap failed on `git config extensions.worktreeConfig`, a config-lock race when three bootstraps ran in parallel. #9114 fixed both: it generates `.husky/_`, retries on `could not lock config file` (`withLockRetry`, 5 tries), and prints `hooks active: yes/no`. The tool is therefore now doing more than the PRD's R1 (it owns hooks setup), and that growth was where the post-release defects came from.
- Signal strength: pattern for "parallel and fresh worktrees exercise the tool in ways Verify's single worktree did not" (two distinct defects, one run, same day). Single-incident evidence each.

## Open debt

The run's own findings, never counted as feedback. All six review.md findings (two Majors, four Minors) are deferred in review.md and none was filed as an issue (the brief forbids tracker interaction).

- review.md Major, SC-2: literal no-op under 5 s never measured on an idle host; the pre-merge re-measure was waived at Ship. Still open (above).
- review.md Major, SC-5: `bash scripts/conductor-gate.sh` never shown green; failed on `@mbe/config#test` 5000 ms timeouts at load 45. Waived at Ship. `packages/config` and `packages/types` still carry no `testTimeout` setting on origin/main (`git grep testTimeout` finds only a CLAUDE.md mention), so the cold-load timeout class `gotchas.md` describes is unaddressed there.
- review.md Minor: a partial `dist/` counts as built. Unchanged on origin/main: `missingDistsProbe` still tests only that `<pkg>/dist` exists (`scripts/bootstrap-worktree.mjs` line 136).
- review.md Minor: an unknown flag (a typo such as `--chek`) still runs the mutating path; `runBootstrap` only checks `argv.includes("--check")` (origin/main).
- review.md Minor: `runBootstrap`'s exec layer and the real lock-staleness probe untested. The new `withLockRetry` and hooks code from #9114 sits in the same file; I did not check its tests.
- review.md Minor: `architecture.md` still describes a different workspace reader than the code uses. Not edited.
- #8169, listed for visibility only: cloud sessions starting with no `node_modules` (created before the run's merge, so counted toward nothing; also not about worktrees). Closed 2026-11-06; #8392 ("bootstrap cloud sessions via SessionStart hook", merged 2026-11-06) is the likely fix, the link was not verified.

## Run retrospective

- Keep: building the dist-consumer list from the workspace instead of hardcoding it. It absorbed a new package (`@mbe/site-nav`) with no edit, which was the idea's main unknown.
- Keep: pure core plus thin CLI. It let #9114 add lock-retry and a hooks check without touching `decideBootstrapSteps`.
- Keep: Verify recording the SC-2 attribution (script 1.37 s versus pnpm launcher 8.7 to 11.3 s) instead of rounding a FAIL up to a PASS. It is why today's 1.2 s number can be read at all.
- Change: the run's two stated criteria that need an idle machine (SC-2, SC-5) were written without saying so, and were then waived rather than measured. Either state a measurement condition in the PRD or measure on the cheap path. A 1.2 s launcher cost read at load 6.8 took one command today.
- Change: the "release" was the merge of an artifact-only PR, three weeks after the code shipped. For this run "shipped" and "released" are different dates (code 2026-10-15, release.md 2026-11-03), so any outcome window counted from `released-at` under-counts the exposure.
- Stop: nothing proposed. The tool is small and it is being used and extended.

## Environment

| Mistake                                                                                                                                                                                                                             | Evidence                                                                                                                            | Class      | Proposed carrier                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The `node_modules missing` BLOCK messages still say to run bare `pnpm install --frozen-lockfile`, the half-fix idea.md set out to replace (it omits the dist builds, so TS2307 survives). Agents obey the message in front of them. | `.claude/hooks/pre-bash-guard.sh` lines 94-96 and `.claude/hooks/pre-push-typecheck.sh` lines 79-81 on origin/main; #9312 finding 5 | mechanical | The two hooks themselves: change their message text to `pnpm bootstrap:worktree`. `scripts/__tests__/hook-input.test.mjs` already asserts `node_modules missing` (lines 389, 645, 697) and is the place to pin the new wording.                                                                                 |
| Dispatch prompts and a live routine trigger still carried the bare install step weeks after the command existed                                                                                                                     | PR #9384 body, finding 5 ("live `mbe-evening` trigger still has the old text"); #9312                                               | mechanical | A test over `.claude/**` and `docs/routines/*.md` that fails on `pnpm install --frozen-lockfile` outside an allowlist, run by the existing `docs-format` or `scripts/` vitest lane. The live trigger itself is managed per `CLAUDE.md` (RemoteTriggers section): docs PR first, then apply, then `get_trigger`. |
| SC-2 measured on a host at load 22 to 45, then waived at Ship, so the < 5 s claim has no valid measurement                                                                                                                          | `verification.md` §SC-2 and §Failures; `release.md` "Ship write-back"                                                               | judgement  | A line in the PRD/Verify guidance that a timing criterion names its measurement conditions. No existing mechanical carrier: `scripts/conductor-gate.sh` runs lint/typecheck/test, not timings.                                                                                                                  |
| SC-5 gate red from 5000 ms test timeouts under load in an unrelated package                                                                                                                                                         | `verification.md` §SC-5; `review.md` Major SC-5                                                                                     | mechanical | `packages/config/vitest.config.*` `testTimeout`, the carrier `gotchas.md` "Cold-cache test timeouts" already names (`testTimeout: 15000`). Not present on origin/main for `packages/config` or `packages/types`.                                                                                                |
| Follow-on work (#9106) added hooks setup to the tool and shipped hooks silently inert, found hours later by a worker, not by a test                                                                                                 | #9111 (Problem section); #9114                                                                                                      | mechanical | #9111's own item 3, a regression test that a fresh linked worktree ends bootstrap with an existing hooks dir. #9114 added `hooksActive()` output; whether a test pins it was not checked.                                                                                                                       |
| A partial `dist/` makes the tool say "nothing to do" while TS2307 persists, and the SessionStart hint goes silent too                                                                                                               | `review.md` Minor 1; `scripts/bootstrap-worktree.mjs` line 136                                                                      | mechanical | The probe itself: test for a declared entrypoint file, not the directory; pin in `scripts/__tests__/bootstrap-worktree.test.mjs`.                                                                                                                                                                               |
| `scripts/` hooks under a worktree-isolated worker reject compound commands, and `pnpm bootstrap:worktree >/dev/null ...` is one of the cited examples                                                                               | #9312 §Findings 1 (cites `(pnpm bootstrap:worktree >/dev/null ...`)                                                                 | judgement  | Already carried: `gotchas.md` "Worktree-isolated subagents' Bash is gated by an isolation classifier" and the new `gotchas-worker-shell.md` from #9384. Nothing new.                                                                                                                                            |

## Knowledge-base harvest

Not run. The retro skill's harvest wants `kb.py harvest <main checkout root>`, and a worktree path finds no transcripts (`gotchas.md`); the main checkout is off limits to this worktree-isolated agent. #9312 is the existing 14-day harvest for this period and is used above. Proposed `gotchas.md` entries: none.

## Seeds for next ideas

Not appended to `docs/backlog.md` here, by instruction; the parent run owns the backlog write.

- Point the `node_modules missing` BLOCK messages in `pre-bash-guard.sh` and `pre-push-typecheck.sh` at `pnpm bootstrap:worktree`, and pin the wording in `hook-input.test.mjs` (from: feature:bootstrap-worktree)
- Add a test that fails when any `.claude/**` or `docs/routines/*.md` prompt tells a worktree agent to run bare `pnpm install --frozen-lockfile`, and re-apply the live `mbe-evening` trigger text (from: feature:bootstrap-worktree)
- Measure SC-2 on an idle host or CI runner for the "nothing to do" path, then either record it as met or restate the criterion as the script's own cost (from: feature:bootstrap-worktree)
- Make `pnpm bootstrap:worktree` write a one-line invocation record (worktree, outcome, seconds) so the next retro can count users instead of inferring them from failures (from: feature:bootstrap-worktree)
- Fix the bootstrap probe so a partial `dist/` is not "built", and make unknown flags exit 2 instead of running the mutating path (from: feature:bootstrap-worktree)
- Set `testTimeout` in `packages/config` and `packages/types` so `conductor-gate.sh` stops going red under host load (from: feature:bootstrap-worktree)

## Run complete

2026-11-22. The command, hook and docs are on main and the derivation absorbed a new package with no edit. Population is one named worker, so adoption is unobserved beyond that. The `node_modules missing` class is not retired (9 occurrences in 3 sessions per #9312), and the likeliest cause is stale prompts and hook messages that still name the bare install, now carried as seeds. SC-2 and SC-5 remain unmeasured on an idle host. Seeds above are the input to the next Idea-stage run.
