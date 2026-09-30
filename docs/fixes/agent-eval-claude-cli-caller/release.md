---
stage: ship
run: maintenance:agent-eval-claude-cli-caller
date: 2026-09-30
assumptions:
  - "Every release action below (merge, the #5915 unblock, the RemoteTrigger update) was performed and verified by the autorun orchestrator on 2026-09-30. This file records those facts; the Ship subagent that wrote it re-read the merged tree at `81b7cbb74` but did not re-run CI or re-fetch the trigger."
  - "Review M1 counts as fixed, not deferred: breakdown item 20 (`bd4164668`, regen `868179f91`) landed before merge, so the soft gate had no unfixed critical or major finding. m1–m5 were deferred by Review with reasons and are carried forward below."
  - "The ratchet bump in `a5696d04d` (consoleLogs 715→717, emptyCatch 78→79) is treated as legitimate on the `reviewer` subagent's judgment. The new `console.error` lines are the stderr diagnostics the architecture requires, and the empty catch is `releaseWorktree`'s (Review m2)."
  - "`docs/routines/mbe-evening.md` step 3 was also changed by #5914, because the capture scoped the secondary caller in. The brief authorized updating only the `mbe-weekly-improve` trigger. Whether the live `mbe-evening` trigger prompt matches its doc was NOT checked or changed here, and is listed as an open item."
  - "The Friday fire is the first real test of the sandbox. Nobody has measured whether `claude` is on PATH there, or whether it has a subscription login. Both outcomes are named in post-release checks as expected branches, not as failures of this release."
---

# Release: run the weekly eval checkpoint through the claude-cli adapter (`maintenance:agent-eval-claude-cli-caller`)

"Production" for this run has two parts:

- **the merged code on `main`**: the cost basis, eval scoring and diagnostics, the drift guard, and the routine docs;
- **the live `mbe-weekly-improve` RemoteTrigger** (`trig_01G12wULcCweXSb2jmVkChPW`), whose prompt is the only scheduled eval caller.

Both are now live. The first time either is exercised for real is the trigger's next fire, Friday 2026-10-02.

## Pre-flight

- [x] **Verification green.** `verification.md` passed on re-verification (2026-09-29, after the amendment). The authorized `claude-cli` spend produced one honest scored row, and that row was not committed (brief criterion 4). F4 is recorded there as out of scope. It is a pre-existing defect on the default adapter, not a failure of this change.
- [x] **Review soft gate.** `review.md` had no critical findings. It raised one major, M1: a throw on the `createPr: true` CLI path force-deleted the agent's worktree. M1 went back to Implement and was fixed as breakdown item 20 (`bd4164668`: RED 1 failed / GREEN 40 passed, gates exit 0). m1–m5 were deferred with reasons.
- [x] **No secrets in diff; target config present.** The diff is TypeScript, tests and markdown. The sandbox's lack of `ANTHROPIC_API_KEY` is the premise, not a gap (#3571/#3585). The `claude-cli` adapter needs the `claude` binary plus a subscription login in the sandbox. That is unmeasured, and post-release check 1 covers it.
- [x] **Migrations/data.** None. `metrics/eval-reports.jsonl` stays 0 bytes on `main`. The first row is the Friday routine's to write.
- [x] **Rollback plan concrete.** See below.

## Rollback plan

Code (reverts #5914's squash commit on a branch, never directly on main):

```bash
git fetch origin
git switch -c revert/eval-claude-cli-caller origin/main
git revert --no-edit 81b7cbb74b90bf68f6cb87531c307b89da160b34
pnpm build --filter @mbe/cli... && pnpm regen   # the squash touched llms*.txt; re-settle them
git add <regenerated llms paths, by explicit path>
git commit -m "chore(llms): regen after reverting #5914"
git push -u origin revert/eval-claude-cli-caller
gh pr create --base main --title "revert: #5914 claude-cli eval caller" --body "..."
gh pr merge <N> --auto --squash --delete-branch
```

The ratchet baseline raise in `a5696d04d` goes out with the squash, so the reverted tree matches the reverted baseline. `#5915` (the brace-expansion override) is independent and stays.

Trigger prompt (restores the pre-update step 4):

1. `git show 35517bbae:docs/routines/mbe-weekly-improve.md`, then take the fenced `text` block and strip the trailing newline. That text is identical to the live prompt before 2026-09-30. A scratch copy exists at `scratchpad/weekly-prompt-old.txt` in the 2026-09-30 orchestrator session.
2. `RemoteTrigger get trig_01G12wULcCweXSb2jmVkChPW` to read the current full `job_config`.
3. `RemoteTrigger update` with the **full** `job_config` resent, replacing only the prompt in `job_config.ccr.events[0]`. Omitting `events` wipes it (memory: scheduled-trigger gotcha).
4. Confirm the response echoes the old prompt in `derived_state.prompt`, and that the cron (`0 14 * * 5`), model, `enabled`, env, allowed_tools and sources are unchanged.

Roll back the trigger and the code together. A reverted doc with a still-updated trigger would fail the drift guard's premise in the other direction, and vice versa.

## Release log

1. PR **#5914** `fix(eval): run the weekly eval checkpoint through the claude-cli adapter and score what it ran` was prepared for merge:
   - `origin/main` (`9a97e4d89`) was merged into the branch.
   - The pre-push AI-antipattern ratchet tripped: consoleLogs 715→717, emptyCatch 78→79. It was raised through the documented `--update` in `a5696d04d`.
2. Review gates on the PR:
   - `reviewer`: **PASS 9/10**. It judged the ratchet raise legitimate.
   - `generated-artifact-determinism-reviewer`: **PASS** (the squash carries regenerated `llms*.txt`).
3. First CI run **36675826414** was **red on Build's `pnpm audit` only**. Two brace-expansion advisories, GHSA-qhr7-859c-m2p7 and GHSA-6j4f-fj2g-mc7p, were published live and are unrelated to this PR (gotchas § Dependencies).
   - A direct push of the override to `main` was denied by the permission classifier.
   - The fix therefore went as PR **#5915**: override → `^5.0.11`, merged as `953280994`.
4. `gh pr update-branch 5914` produced head `fd648096e`. `CI Gate` went green and auto-merge completed.
   - **Merge SHA: `81b7cbb74b90bf68f6cb87531c307b89da160b34`.**
5. Follow-up PR **#5916** was opened: `fix(deps): scope brace-expansion overrides per major so minimatch 3/5 keep a callable export`.
   - #5915's single override force-upgrades minimatch 3/5's brace-expansion across majors. That is a cross-major break that already existed.
   - Auto-merge is armed. It was still OPEN when this file was written.
6. RemoteTrigger **`trig_01G12wULcCweXSb2jmVkChPW`** (`mbe-weekly-improve`) was updated at **2026-09-30T06:48:12Z**:
   - The full `job_config` was resent, with the prompt replaced by the fenced block of `docs/routines/mbe-weekly-improve.md` extracted from `81b7cbb74`, trailing newline stripped.
   - The old→new doc diff is exactly the step-4 line.
   - The update response echoes the new prompt in `derived_state.prompt`, `job_config.ccr.events[0]` and `session_request.events[0]`.
   - Unchanged: cron `0 14 * * 5`, model `claude-opus-5`, `enabled: true`, env `env_012GDG167Tpz55u8MEpDkL2y`, allowed_tools and sources.
   - `next_run_at` is **2026-10-02T14:06:30Z**.
7. **Not done, by design:** the routine was not force-run, and no other trigger was touched. Neither was authorized.

## Post-release checks

Done at release time:

- The merged tree at `81b7cbb74` carries the step-4 text: `node tools/cli/dist/index.js agent eval --adapter claude-cli`, exit 2 as a FAILURE, and the exact issue title `ci-fix: weekly eval checkpoint did not run under claude-cli`.
- The live trigger prompt equals that doc block byte for byte (item 6 above).

Pending: the Friday fire, **2026-10-02T14:06:30Z**, which Operate owns.

1. Find the run with `RemoteTrigger list_runs trig_01G12wULcCweXSb2jmVkChPW`, then read it with `get_run_log`.
2. **Expected pass:** step 4 exits **0** (or **1** on a genuine regression) and a PR `chore(metrics): eval baseline 2026-10-02` appears carrying one `metrics/eval-reports.jsonl` row. The row should show `"adapter":"claude-cli"`, a `costBasis` of `api-equivalent`, `numTurns > 0`, and a `withinBudget` judged on turns only. Once that PR merges, the sink is non-empty for the first time since #4116.
3. **Expected alternate:** step 4 exits **2** because `claude` is not on PATH in the sandbox, or has no login. The outcome is still correct if:
   - one issue titled exactly `ci-fix: weekly eval checkpoint did not run under claude-cli` exists, labelled `ci-fix` + `ready-for-human`;
   - it quotes the stderr diagnostic and the `Excluded (did not run)` line, and asserts no cause the diagnostic did not name;
   - step 5's log entry records a failure.

   This proves the caller is honest, not that the eval runs. The sandbox fix becomes a human item.

4. **Actual failure of this release:** exit 2 logged as fine, or a baseline PR carrying an exit-2 row, or step 4 skipped. Any of these triggers the rollback, or a re-entry at Implement if the prompt is at fault.

## Open items (carried to Operate)

- **One `docs/backlog.md` seed** `(from: maintenance:agent-eval-claude-cli-caller)`. Operate files it.
  - **F4:** the default SDK adapter is not key-gated on a logged-in machine. It spends about $0.51–0.53 API-equivalent, `session-runner.ts`'s catch zeroes the usage, and `noRunMessage` falsely blames a missing `ANTHROPIC_API_KEY`.
  - **Review m1:** skip `verifyInWorktree` on a non-run, so it stops printing `✓ … 100%`.
  - **Review m2:** `releaseWorktree` swallows removal failures silently.
  - **Review m3:** a removal throw skips `recordSpend`.
  - **Review m4:** a `createPr: false` API session returns a `branchName` that is absent on origin. This is documented design and is recorded only.
  - **Review m5:** unguarded eval mentions in `scripts/optimize-implement-queue.mjs:171`, `.claude/skills/optimize-implement-queue/SKILL.md:145` and `docs/agents/golden-task-authoring.md:144`.
- **#5916**: per-major brace-expansion overrides. Auto-merge is armed. Confirm it merged and that `main`'s Build `pnpm audit` stays green.
- **`mbe-evening` live trigger**: #5914 changed `docs/routines/mbe-evening.md` step 3 (its regression-gated `agent eval` now passes `--adapter claude-cli`). Its live prompt was not compared or updated. The brief authorized only the weekly trigger. The routine is also paused (memory, 2026-09-25). Reconcile the prompt before re-enabling it.
- **Defect mechanism re-check (Verify F4 consequence 2):** before reading Friday's result, remember that the sandbox's default-path exit 2 may never have been key-gating at all. This does not change the fix direction.

## Outcome

Shipped with hiccups, all listed above:

- a live-published transitive CVE blocked Build. It was unblocked through #5915 after a direct-to-main push was denied, and the #5916 follow-up is still open;
- a ratchet raise was reviewed as legitimate.

Code is on `main` at `81b7cbb74`, and the live trigger carries the matching prompt. There was no rollback. Whether the eval actually scores in production is unknown until the 2026-10-02 fire. Next stage: Operate.
