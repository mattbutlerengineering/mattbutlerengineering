---
stage: operate
run: maintenance:agent-eval-claude-cli-caller
date: 2026-11-07
users-observed: 0
signal-source: "no people use this surface (internal automation; the weekly routine is the only caller). Sample read 2026-11-07 from the worktree at origin/main c4320513d: `metrics/eval-reports.jsonl` (23 rows, parsed with node); `gh pr view 5914 5916 5984 6847 7350 8402`; `gh issue view 6842 6846 7351`; `gh issue list --search 'ci-fix: weekly eval checkpoint did not run'` and `--label ci-fix --search 'eval checkpoint'` (both empty); `git -C $W log origin/main -- docs/routines/mbe-weekly-improve.md tools/cli/src/commands/agent-eval.ts packages/agent-core/src/adapters/*.ts scripts/__tests__/routine-eval-adapter.test.mjs`; `.claude/improvement-loop/log.md` weekly sections for 2026-10-02/16/23 and 11-06. Not read: the live RemoteTrigger (`list_runs` unavailable to this agent), so the trigger's current prompt, `enabled` state and any run on 2026-10-09 or 2026-10-30 are unobserved. No Sentry queries (the eval runs in no Sentry-instrumented service)."
assumptions:
  - "Population is 0. The caller is an autonomous routine and the rows are the sample, not people. The Owner is not counted: 19 of the 23 rows are timestamped 2026-10-08 00:37-04:51Z, outside any Friday fire, and no record attributes them to him (the 2026-10-08 log sections show agent sessions, e.g. #6146's eval-task authoring)."
  - "A row dated on a Friday at ~14:00-15:00Z is treated as the scheduled fire. The log sections for 2026-10-16, 10-23 and 11-06 and the baseline PRs (#6847, #7350, #8402) say so explicitly; for 2026-10-02 the log and #5985 do."
  - "The brief carries no `operate:` section. The minimum signal is taken from `release.md` § Post-release checks (the Friday 2026-10-02 fire), which Operate was assigned."
  - "Whether `scripts/__tests__/routine-eval-adapter.test.mjs` runs in CI is inferred: `scripts/package.json` has a `test` script and the `Test (Node, rest)` leg is derived by exclusion from the named legs (`ci.yml:557-562`). Not confirmed against a CI log."
---

# Retro: weekly eval checkpoint runs through claude-cli

Merged. `release.md` has no `outcome:` field; `gh pr view 5914` reports MERGED at 2026-09-30T06:47:29Z (squash `81b7cbb74`). #5915 and #5916 also merged (06:57:19Z for #5916). There is no pending release step. The run is 38 days past release.

## Minimum signal (`release.md` § Post-release checks): the first Friday fire

**Met, on the "expected pass" branch.** Fire of 2026-10-02 (`next_run_at` 14:06:30Z):

- `node tools/cli/dist/index.js agent eval --adapter claude-cli` exited 0. The log (#5985, merged 2026-10-09) records `claude` at `/opt/node22/bin/claude` with a working subscription login. These were the two questions `release.md` listed as unmeasured.
- PR #5984 `chore(metrics): eval baseline 2026-10-02` merged. It carried the first row the sink ever held (`wc -c metrics/eval-reports.jsonl` was 0 until then).
- That row, parsed today: `adapter: "claude-cli"`, `costBasis: "api-equivalent"`, 1 task (`example-bugfix`), 8 mean turns, $0.6488 reported, `passRate: 1`, `nonRunCount: 0`. The $0.65 is over the task's $0.50 budget and the task still passed: the cost-basis design (turns arm only under `api-equivalent`) did what it was built for.
- Brief criterion 1's failure mode, a 0% `withinBudget` baseline, never appeared.

Strength is `measured` for the 2026-10-02 fire (row, PR, log). It is an n=1 sandbox run for that date.

## Outcomes vs. intent

Population is 0, so every user-facing signal is `unobserved`. These are the run's targets from `defect.md` § Condition (target state 1-4); each records state, not use.

### 1. `mbe-weekly-improve` step 4 (doc and live trigger) invokes `--adapter claude-cli`; exit 2 is a failure, not "expected"

- What happened: the doc on `origin/main` still carries the flag (`docs/routines/mbe-weekly-improve.md:26`). Rows exist from the scheduled fires of 2026-10-16 (#6847), 10-23 (#7350) and 11-06 (#8402), so the live trigger demonstrably still runs the flag. Of the 5 Fridays 2026-10-09..11-06, three left a row; **2026-10-09 and 2026-10-30 left no row and no weekly-improve log section** (`log.md` has `## 2026-10-16`, `10-23`, `11-06`; none for 10-09 or 10-30). Cause unobserved. The failure path was not exercised either: `gh issue list` finds no issue titled `ci-fix: weekly eval checkpoint did not run under claude-cli` (state `all`), so either those two fires never reached step 4's exit-2 branch or never ran. The retro cannot tell which.
- Signal strength: unobserved for the two silent Fridays; measured for the three that wrote rows.

### 2. A claude-cli run is scored honestly (cost basis, `withinBudget`)

- What happened: 23 rows, all `adapter: "claude-cli"`, `costBasis: "api-equivalent"`, `nonRunCount: 0`. Mean per-task cost reads $0.43-$0.79 on the five-task suite against $0.40-$0.50 budgets, and no row carries a budget-driven failure. The honest-scoring claim is `measured` for the budget arm. It is **not** evidence that the baseline measures agent quality: the 2026-10-16 log section records that the harness never passed an LLM judge, so all 21 rows then in the sink were build-health baselines (#6846, closed 2026-10-16; judge wired in #6858). On 2026-10-23 the judge then failed on every task and the row read passRate 0, meanScore 0.75 with exit 0 (#7351, closed; #7364). The 2026-11-06 row (passRate 0.8, meanScore 0.95) is the first that follows both fixes. That is two findings about the signal's validity, not about this run's cost basis, and neither is this run's defect.
- Signal strength: measured (rows). The pass-rate trend across 10-16 / 10-23 / 11-06 is not a trend: each of the three rows runs under a different judge state.

### 3. A guard fails when the routine prompt's eval invocation drifts back to the SDK default

- What happened: `scripts/__tests__/routine-eval-adapter.test.mjs` is on `main` and no commit has touched it since 2026-09-30 (`git log origin/main --since=2026-10-02 -- <path>` empty). The routine doc, the mbe-evening doc and `.claude/skills/optimize-implement-queue/SKILL.md:150` all name `--adapter claude-cli` today. No drift happened, so the guard has never fired in anger. Mutation M1 turned it red at Verify.
- Signal strength: unobserved (a guard that never fires says nothing about whether it would).

### 4. The committed sink is left alone by this run; the first Friday run writes the baseline

- What happened: met. #5984 is the first row. Verify's local row was not committed (`verification.md` § Criterion 4).
- Signal strength: measured.

## Maintenance: did the defect recur?

The defect was "the weekly caller can never write a row". Since release it has **not recurred** for the three Fridays with rows. Two Fridays (2026-10-09, 2026-10-30) have no row, and the data cannot say whether that is a recurrence (exit 2, no issue filed, which the new prompt forbids) or no fire at all. Following the contract's question for a recurrence, in the event a later read finds it was an exit 2: the artifact that would have caught it is a review finding, since the prompt's fail-on-exit-2 clause exists but nothing checks that it fired. Not treated as a recurrence today, so no preventive seed on that basis; the seed below asks for the measurement instead.

## Open debt

The run filed no issues (no issue cites `agent-eval-claude-cli-caller`; `gh issue list --search` finds only #6278 and #6842, neither the run's). The debt is Review's prose deferrals and `release.md`'s open items. Current state, checked against `origin/main` on 2026-11-07:

- **#5916** (`release.md` open item): merged 2026-09-30T06:57:19Z. Closed.
- **Review m1** (skip `verifyInWorktree` on a non-run): still open. `agent-eval.ts:351` calls `verifyInWorktree` unconditionally.
- **Review m2** (`releaseWorktree` swallows removal failures): not re-read end to end; `agent-eval.ts:473-483` still has a kept-for-inspection `console.error` branch and a `try {` after it. Treat as open.
- **Review m3** (removal throw skips `recordSpend`): not re-checked. The file it cites, `run-cli-adapter-session.ts`, was restructured by #6337 and #6278 (the merge of `runPipeline` and `runCliAdapterSession`) after release.
- **Review m4** (`createPr: false` `branchName` absent on origin): recorded-only by Review; nothing to chase.
- **Review m5** (unguarded eval mentions): the `scripts/optimize-implement-queue.mjs` and `SKILL.md` lines now name `--adapter claude-cli` (`SKILL.md:150`); `docs/agents/golden-task-authoring.md:144` still says `mbe agent eval --suite golden --only <task-id>` with no adapter flag.
- **Verify F4** (default SDK adapter spends, zeroes usage, blames a missing key): `packages/agent-core/src/session-runner.ts:123` still sets `costUsd: 0` in the catch, and `noRunMessage` for `claude`/`auto` still asserts the missing key whenever `ANTHROPIC_API_KEY` is unset (`agent-eval.ts:212-214`). Review said "Operate files the seed"; `docs/backlog.md` line 8 covers only the "fail loudly without `--adapter claude-cli`" half, and was corrected by #6843 after #6842. The cost and false-message half is not in the backlog. Seeded below.
- **`mbe-evening` live trigger prompt** (`release.md` open item): not compared. #6836 (2026-10-16) is titled "re-sync six routine prompts with their live triggers", so the reconciliation may have happened there; not read.

None of this counts toward users.

## Run retrospective

- Keep: the re-entry at Architect. Capture measured that a one-line wiring would put a 0% `withinBudget` row in the sink and routed to design before writing the line. The first real row (turns arm only, $0.65 reported) passed, the opposite of the prediction without the cost basis.
- Keep: naming the first Friday as the proof and listing both branches (pass / honest exit 2) in `release.md`. The pass branch landed and the log entry cites that exact section.
- Keep: limiting Verify to one named task. Re-verification after the amendment still cost only one more run ($0.63).
- Change: the brief and Capture treated the default-adapter repro as non-spending. It was not (`verification.md` F4: $0.51-0.53 per run on a logged-in machine, four runs). A repro that needs a credential check should be named as spending in the brief, or run with the credential path forced off.
- Change: Review's deferrals (m1-m5, F4) were prose in `review.md`/`release.md` with a promise that Operate would file them. Five weeks later three are still open with no issue. Deferrals that Operate is meant to file should be filed when deferred.
- Change: the rows this run made possible were read as quality baselines for two weeks before #6846 showed they could not fail on behaviour. The brief's success criteria asked only whether a row appeared; a criterion naming what the row measures would have surfaced it at Verify.
- Stop: nothing. Re-verifying after M1's fix was proportional.

## Environment

One row per mistake recorded in `verification.md` § Failures (F1, F2, F4), `review.md` § Findings (M1, m1-m5), `breakdown.md` § Notes and `release.md` § Release log.

| Mistake                                                                                                                                                                                                                                    | Evidence                                                                | Class      | Proposed carrier                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The eval's commit step ran husky `check-adr` in a build-less `.agent-worktrees/` checkout, the adapter threw, usage was discarded and the run was classified a non-run with a false cause. Found only because Verify spent real CLI money. | `verification.md` § Failures F1                                         | mechanical | The Friday routine is the only place this path runs; no hook and no CI job runs `agent eval`. The step-4 `ci-fix` issue clause in `docs/routines/mbe-weekly-improve.md:26` is the carrier, and it has not fired since. Finding: no pre-merge check exercises the eval end to end. |
| The drift guard asserted only that a prose mention of the flag was on the same line as `agent eval`. Mutation removing the flag passed 10/10.                                                                                              | `verification.md` § Failures F2                                         | mechanical | `scripts/__tests__/routine-eval-adapter.test.mjs` (now invocation-level, red under M1). Runs under `pnpm --dir scripts test`; CI inclusion is [INFERENCE] from the `rest` leg (assumptions).                                                                                      |
| A throw on the `createPr: true` CLI path force-deleted the agent's uncommitted worktree.                                                                                                                                                   | `review.md` § Major M1; `breakdown.md` item 20                          | judgement  | A unit test in `run-cli-adapter-session`'s test file (added at `bd4164668`: RED 1 failed / GREEN 40 passed). Only a reviewer reading the new catch would have caught it first.                                                                                                    |
| Default SDK adapter spends, zeroes the usage in `session-runner.ts`'s catch, and `noRunMessage` blames a missing key.                                                                                                                      | `verification.md` F4; `review.md` § Out of scope                        | mechanical | None exists. `session-runner.ts:123` is unchanged; no test asserts the catch carries usage. Seeded.                                                                                                                                                                               |
| The "non-spending repro" in the brief/defect was not non-spending.                                                                                                                                                                         | `defect.md` § Reproduction; `verification.md` F4                        | judgement  | `AGENTS.md` / the autorun brief template. No deterministic carrier; recorded here as a lesson.                                                                                                                                                                                    |
| m1: the non-run path still installs and tests an unchanged worktree and prints `✓ … 100%`.                                                                                                                                                 | `review.md` m1                                                          | mechanical | A case in `tools/cli` agent-eval tests asserting `verifyInWorktree` is not called when `taskDidNotRun`. Not present.                                                                                                                                                              |
| m2: `releaseWorktree` swallows removal failures. Review's own cited standard is "never silently swallow errors".                                                                                                                           | `review.md` m2; release.md ratchet `emptyCatch 78→79`                   | mechanical | `scripts/check-ai-antipatterns.mjs` (run from `.husky/pre-push:32`). It caught the new empty catch and the ratchet was raised by hand in `a5696d04d`; the carrier worked but the raise accepted a known empty catch.                                                              |
| Eval repro worktrees inside the repo made `dockerfile-pnpm-patches.test.mjs` fail on their Dockerfile copies until removed by hand.                                                                                                        | `breakdown.md` § Notes (items 8, close-out); `verification.md` § Litter | mechanical | `scripts/__tests__/dockerfile-pnpm-patches.test.mjs`. It found the litter. No hook or script prevents `.agent-worktrees/` from being created in the repo during local evals.                                                                                                      |
| A live-published advisory failed Build's `pnpm audit` on an unrelated PR, and the fix (#5915) created a cross-major break (#5916).                                                                                                         | `release.md` § Release log items 3, 5                                   | mechanical | The `Build` job's `pnpm audit` step in `.github/workflows/ci.yml` caught it. No further carrier needed.                                                                                                                                                                           |
| The brief authorised only the weekly trigger; the secondary caller's live prompt was left unreconciled.                                                                                                                                    | `release.md` § Open items                                               | judgement  | `docs/routines/*.md` drift check via `scripts/routine-manifest.mjs` / #6836's re-sync. Not read; unconfirmed.                                                                                                                                                                     |

## Idea seeds

- Count scheduled eval fires against rows: for each Friday since 2026-10-02, list the RemoteTrigger `list_runs` outcome beside the baseline PR, and explain 2026-10-09 and 2026-10-30, which wrote no row and no log section; measure share of Fridays with a row (3 of 5 since 2026-10-09) (from: maintenance:agent-eval-claude-cli-caller)
- Carry the SDK adapter's parsed usage through `session-runner.ts`'s catch (`:123` zeroes it) and make `noRunMessage`'s `claude`/`auto` branch quote `sessionErrors` instead of asserting a missing `ANTHROPIC_API_KEY`; measure with a test that a throwing session reports its real turns and cost (from: maintenance:agent-eval-claude-cli-caller)
- Skip `verifyInWorktree` when a task did not run (`agent-eval.ts:351`) so a Friday failure stops printing `✓ … 100%` and stops spending up to 15 minutes on install and turbo; measure with a call-count assertion in the agent-eval tests (from: maintenance:agent-eval-claude-cli-caller)
- Give `releaseWorktree` (`agent-eval.ts:473`) one stderr line on removal failure and count leftover `.agent-worktrees/agent-*` dirs after a full run (from: maintenance:agent-eval-claude-cli-caller)
- Add `--adapter claude-cli` to `docs/agents/golden-task-authoring.md:144` and extend `routine-eval-adapter.test.mjs` to cover it, the last unguarded eval mention from Review m5 (from: maintenance:agent-eval-claude-cli-caller)

## Run complete

Closed 2026-11-07. Seeds above are the input to the next Idea-stage run. The `--threshold` / exit-1-unreachable seed that Architect deferred was promoted as #5981 and is not re-seeded here.
