---
stage: verify
run: maintenance:agent-eval-claude-cli-caller
date: 2026-09-28
assumptions:
  - "The drift guard was run as `pnpm --dir scripts test -- routine-eval-adapter` (the breakdown's Accept form). The orchestrator's `pnpm --dir scripts exec vitest run __tests__/routine-eval-adapter.test.mjs` reported `No test files found` (exit 1) because `scripts/vitest.config.mjs` roots at `..` and its include glob is `scripts/__tests__/**/*.test.mjs` — a command-form mismatch, not a test outcome; recorded here so the exit 1 is not misread."
  - "Criterion 5 was verified by re-running every gate (lint/typecheck/test in packages/agent-core, tools/cli and scripts; `pnpm regen --check`; prettier on the touched docs), not by citing Implement's report — the orchestrator's non-spending list named only the three targeted test files plus regen."
  - "Criterion 3 was probed with two mutations of `docs/routines/mbe-weekly-improve.md` (whole-line revert to origin/main's text; flag stripped from the invocation only), each restored with `git checkout --` and confirmed clean, because a guard that is green on the current doc does not demonstrate that it fails on regression."
  - "The exit-2 repro's `$0`/`failed` ledger row was reverted BEFORE the authorized spend so the spend's effect on `.claude/agent-spend/sessions.jsonl` could be isolated; the row was quoted first (§ Criterion 1 repro)."
  - "Architecture assumption 10 (`verify()` checkout refusal) was measured by a read-only probe — `git checkout <agent branch>` from this worktree — not by the run itself, because the run failed upstream of `verify()`."
  - "The nested `claude` CLI's own transcript under `~/.claude/projects/` was read (read-only, outside the repo) to establish that the CLI actually ran and how many turns it took, since the eval discarded that signal."
  - "The eval-worktree litter created by this stage (one repro worktree, one spend worktree) was removed by this stage — the harness permitted `git worktree remove --force` + `git branch -D` this time — under brief § Decisions added after Implement item 5, scoped to the two `.agent-worktrees/agent-*` created inside this worktree during Verify."
  - "Criterion 2's live-trigger half is Ship's deliverable and was not attempted; only the doc side is verified here."
  - "Re-verification (2026-09-29 local / 2026-09-30 UTC): the second-spend expectation's `numTurns > 0` is graded against the eval row's `turns` field — `TaskScore` names it `turns`; `numTurns` is the `SessionResult`/spend-ledger name, and the ledger row carries `numTurns: 10` too."
  - "Re-verification: `testsPass`/`typecheckPass` were cross-checked by replaying the verifier's own commands (`CI=1 pnpm install --frozen-lockfile`, `pnpm turbo run test|typecheck --filter=./services/reservations`) in a throwaway detached worktree at the agent's commit `59e82a803` under the scratchpad, removed afterwards, because the eval deletes a succeeded session's worktree and prints nothing on success. Non-spending (no model call)."
  - "Re-verification: the default-adapter repro (`env -u ANTHROPIC_API_KEY node tools/cli/dist/index.js agent eval`) was run on the previous verification's word that it is non-spending. It is not on this machine — see § Re-verification F4. That spend was not authorized by brief decision 6; it is disclosed, not hidden."
  - "Re-verification: the repro's `.agent-worktrees/…-732e84` worktree and its `agent/…-732e84` branch (at `7a3961d0a`, no commits) were removed under brief decision 5 (non-spending exit-2 repros are named in its scope). The authorized spend's `agent/…-4c3714` branch is kept: architecture § Eval fixture verifier keeps the branch ref of a succeeded session on purpose so `git show` still has the diff."
reverified: 2026-09-29
---

# Verification: wire the weekly eval checkpoint to the claude-cli adapter, scored honestly

## Re-verification 2026-09-29 (after amendment)

**All five brief criteria PASS at the code/doc level; criterion 1 now PASSES live.** The second and last authorized run of `--task example-bugfix --adapter claude-cli` exited **0** in 165 s and appended one scored row — `adapter: "claude-cli"`, `costBasis: "api-equivalent"`, 10 turns, $0.63, `withinBudget: true`, `testsPass: true`, `typecheckPass: true`, no `sessionErrors` — plus one `succeeded` spend-ledger row; the eval worktree was removed and nothing was pushed. F1 (commit hook in a build-less worktree, usage discarded, false cause) and F2 (line-level drift guard) are closed. **One new finding needs Matt (F4):** the default-adapter repro that this run has treated as non-spending since Capture actually runs the model on this machine through the local subscription login, hits the SDK's $0.50 budget cap, and is then reported as a 0-turn non-run blaming a missing `ANTHROPIC_API_KEY`. Every one of this run's four default-adapter repros did this (~$0.51–$0.53 API-equivalent each), including one made by this stage.

Environment: worktree `/Users/mbutler/github/mattbutlerengineering/.claude/worktrees/agent-eval-claude-cli-caller`, branch `fix/agent-eval-claude-cli-caller` at `36c738239` (20 commits ahead of `origin/main` `35517bbae`), breakdown 19/19 checked. `claude` = `/Users/mbutler/.local/bin/claude` `2.1.285 (Claude Code)`; Node `v22.22.3`; `ANTHROPIC_API_KEY` unset. Timestamps are UTC (2026-09-30Z = 2026-09-29 evening local).

### Pre-flight

```
$ ls -la .agent-worktrees            -> total 0 (empty)
$ git worktree list | grep 'agent-eval-claude-cli-caller/.agent-worktrees'   -> (no entries)
$ git branch --list 'agent/add-a-regression*'
  agent/add-a-regression-test-to-services-reserv-60e999
  agent/add-a-regression-test-to-services-reserv-6ded90      <- both predate this run
$ wc -c metrics/eval-reports.jsonl; wc -l .claude/agent-spend/sessions.jsonl
       0 metrics/eval-reports.jsonl
       0 .claude/agent-spend/sessions.jsonl
$ pnpm build --filter @mbe/cli...
 Tasks:    6 successful, 6 total   Cached: 6 cached, 6 total   build_exit=0
$ node scripts/agent-core-build-freshness.mjs check
{"trusted":true,"state":"fresh","reason":"dist is newer than or equal to every src file",...}   fresh_exit=0
$ grep -c sessionErrors tools/cli/dist/commands/agent-eval.js -> 5 ; grep -c turbo … -> 4
$ grep -rl -- '--no-verify' packages/agent-core/dist -> worktree-manager.js, worktree-manager.d.ts
```

Result: PASS — the amendment's code is in the dist the spend ran.

### Brief criterion 1 — the authorized spend: scored, one honest `claude-cli` row

- Check: exactly one invocation, not retried, no `--suite cost`: `node tools/cli/dist/index.js agent eval --task example-bugfix --adapter claude-cli` from the worktree root, stdout and stderr to separate scratchpad files.
- Evidence:

  ```
  start=2026-09-30T05:14:37Z   end=2026-09-30T05:17:22Z   elapsed_s=165   exit=0
  --- stdout
  Eval Report
  ───────────
  ✓ example-bugfix [test-writing] — score 100% (10 turns, $0.63)

  Tasks:       1
  Pass rate:   100.0%
  Mean score:  100.0%
  Mean cost:   $0.63
  Mean turns:  10.0
  Failed to complete: 0

  Cost basis: api-equivalent — CLI-reported, not billed; budget cost arm not applied
  --- stderr: 0 bytes
  ```

  `metrics/eval-reports.jsonl` (1 line, the whole file):

  ```json
  {
    "runId": "eval-66202",
    "tasks": [
      {
        "taskId": "example-bugfix",
        "category": "test-writing",
        "passed": true,
        "score": 1,
        "deterministic": {
          "withinBudget": true,
          "testsPass": true,
          "typecheckPass": true,
          "lintPass": true
        },
        "costUsd": 0.6328623999999999,
        "turns": 10
      }
    ],
    "nonRunCount": 0,
    "aggregate": {
      "total": 1,
      "passRate": 1,
      "meanScore": 1,
      "meanCostUsd": 0.6328623999999999,
      "meanTurns": 10,
      "stuckCount": 0
    },
    "byCategory": {
      "test-writing": {
        "total": 1,
        "passRate": 1,
        "meanScore": 1,
        "meanCostUsd": 0.6328623999999999,
        "meanTurns": 10,
        "stuckCount": 0
      }
    },
    "timestamp": "2026-09-30T05:17:22.349Z",
    "adapter": "claude-cli",
    "costBasis": "api-equivalent"
  }
  ```

  `.claude/agent-spend/sessions.jsonl` (1 line):

  ```json
  {
    "date": "2026-09-30",
    "timestamp": "2026-09-30T05:17:04.988Z",
    "costUsd": 0.6328623999999999,
    "model": "claude-sonnet-5",
    "adapter": "claude-cli",
    "status": "succeeded",
    "inputTokens": 18,
    "outputTokens": 2120,
    "numTurns": 10
  }
  ```

  The agent's work, committed on the kept branch ref and never pushed:

  ```
  $ git log -1 --format='%h %ad %s' agent/add-a-regression-test-to-services-reserv-4c3714
  59e82a803 2026-09-29 22:15:55 -0700 feat: Add a regression test to services/reservations/src/services/booking-noti
  $ git merge-base … fix/agent-eval-claude-cli-caller -> 7a3961d0a  (= local main)
  $ git show --stat --format= 59e82a803
   .../src/services/booking-notifications.test.ts | 15 +++++++++++++++
  +  it("cancelBookingNotifications still sends the cancellation when the guest is unsubscribed from marketing (transactional, per contact-policy.ts)", async () => {
  +    const reservation = makeReservation({
  +      guest: { visitCount: 3, communicationPreference: "both", unsubscribed: true },
  +    });
  +    await notifier.cancelBookingNotifications(reservation as never, "tok", "guest");
  +    expect(deps.notificationAdapter.sendBookingCancelled).toHaveBeenCalledWith(
  +      expect.objectContaining({ reservationId: "res-1" }), "both");
  $ git ls-remote --heads origin agent/add-a-regression-test-to-services-reserv-4c3714 | wc -l
         0
  ```

  The nested CLI's own transcript (`~/.claude/projects/…-reserv-4c3714/087c4722-….jsonl`, 745,614 bytes): 16 assistant entries, all `"model":"claude-sonnet-5"`, `05:14:42.875Z` → `05:15:54.408Z`. (16 transcript entries vs the CLI's `num_turns: 10` — the transcript writes one entry per content block, so the counts are not the same unit.)

- Grade against architecture's "Second-spend expectation":

  | Expectation                                                                   | Observed                                                                                                                                                        | Verdict |
  | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
  | exit 0                                                                        | `exit=0`                                                                                                                                                        | PASS    |
  | one row, `adapter: "claude-cli"`, `costBasis: "api-equivalent"`               | 1 line; both fields as expected                                                                                                                                 | PASS    |
  | `numTurns > 0`                                                                | row `turns: 10`; ledger `numTurns: 10`                                                                                                                          | PASS    |
  | `withinBudget` true iff turns ≤ 20                                            | 10 ≤ 20 → `withinBudget: true`, with `costUsd` 0.633 > `maxCostUsd` 0.5 — the cost arm really was skipped live; under `billed` this row would have been `false` | PASS    |
  | `testsPass`/`typecheckPass` real                                              | both `true`; independently replayed (below)                                                                                                                     | PASS    |
  | `sessionErrors` only if the gateway amend-hook path fired                     | absent from the row; stdout has no `session errors:` line; ledger `status: "succeeded"`                                                                         | PASS    |
  | no `.agent-worktrees/` entry left when `succeeded`                            | `ls -la .agent-worktrees` → empty; `git worktree list` → no entries                                                                                             | PASS    |
  | one spend-ledger row                                                          | 1 line, `adapter: "claude-cli"`, `status: "succeeded"`, `$0.633`, 10 turns                                                                                      | PASS    |
  | (architecture: the non-publishing session commits hook-free and never pushes) | commit `59e82a803` exists in a worktree with no `packages/agent-core/dist` (the F1 crash site); `ls-remote` → 0 heads                                           | PASS    |

- `testsPass`/`typecheckPass` cross-check. The eval removes a succeeded worktree and prints nothing on success, so the verifier's own output is gone. Its commands were replayed in a throwaway detached worktree at `59e82a803` (scratchpad, removed afterwards, `replay_remove=0`):

  ```
  CI=1 pnpm install --frozen-lockfile                                  install_exit=0  16 s
  pnpm turbo run test --filter=./services/reservations                 test_exit=0     39 s
    @mbe/reservations-service:test:  ✓ src/services/booking-notifications.test.ts (20 tests)
    @mbe/reservations-service:test:  Test Files  98 passed | 1 skipped (99)
    Tasks:    13 successful, 13 total   Cached:    0 cached, 13 total
  pnpm turbo run typecheck --filter=./services/reservations            typecheck_exit=0  6 s
    Tasks:    13 successful, 13 total   Cached:   12 cached, 13 total
  ```

  `booking-notifications.test.ts` has 20 tests at the agent's commit (G1 measured 19 before it), so the agent's new test is in the run and passes, and the suite-wide pass is real, not a missing-dist artefact.

  **Unexplained timing, recorded not resolved:** the spend-ledger row (written at session end, 05:17:04.988Z) and the report row (05:17:22.349Z) bound the verifier + worktree removal to about **17 s**, while the replay of the same commands took 61 s and G1 measured 68 s cold for the test step alone. No remote turbo cache is reachable (`turbo.json` has `remoteCache.enabled: true` but no `TURBO_*` env and no turborepo login), and neither this worktree's nor the main checkout's `.turbo/` received any file between 22:14:30 and 22:17:30 local, so the verifier did not borrow a sibling cache. A plausible but unmeasured explanation is that `WorktreePhase`'s own lockfile sync had already installed, leaving a near-no-op install. The replay above is the evidence that both `true` values are correct. The 17 s is not.

- Result: **PASS.** Brief criterion 1 is met live: the run exited 0, wrote one scored `claude-cli` row with real turns and cost, and scored the budget honestly under the chosen mechanism.

### Criterion 1 regression repro — default adapter

- Check: `env -u ANTHROPIC_API_KEY node tools/cli/dist/index.js agent eval; echo "exit=$?"`, run **after** the spend's rows were quoted and reverted, on the earlier section's word that it is non-spending.
- Evidence (Langfuse/SDK warnings above the report omitted):

  ```
  example-bugfix: worktree kept for inspection at /Users/mbutler/github/mattbutlerengineering/.claude/worktrees/agent-eval-claude-cli-caller/.agent-worktrees/agent-add-a-regression-test-to-services-reserv-732e84
  Eval Report
  ───────────
  ✓ example-bugfix [test-writing] — score 100% (0 turns, $0.00)
      session errors: Claude Code returned an error result: Reached maximum budget ($0.5); No result message received from agent

  Tasks:       0
  …
  Excluded (did not run): 1 — not counted in the aggregate above

  No task executed: ANTHROPIC_API_KEY is not set, so the agent adapter has no credentials to run. This is not a scored regression — the suite never ran.
  exit=2
         0 metrics/eval-reports.jsonl
         1 .claude/agent-spend/sessions.jsonl
  {"date":"2026-09-30","timestamp":"2026-09-30T05:22:15.830Z","costUsd":0,"model":"claude-sonnet-5","adapter":"claude","status":"failed","inputTokens":0,"outputTokens":0,"numTurns":0}
  ```

  The nested transcript `~/.claude/projects/…-reserv-732e84/ac355520-….jsonl` (771,954 bytes): 7 assistant entries on `claude-sonnet-5`, `05:21:57.468Z` → `05:22:15.672Z`, last `"costUSD":0.5295295999999999`. The model ran.

- Result: **exit code and the no-key sentence are unchanged, as breakdown item 3 requires (PASS as written). But the premise is false: FINDING F4, below.** The run's target, the false non-run under `claude-cli`, no longer reproduces (criterion 1 above). Under the default adapter the false non-run still reproduces. It is now visible for what it is, because the amendment's `session errors:` line prints the SDK's own error.

### Brief criterion 2 — step 4 invokes `--adapter claude-cli`, exit 2 not "expected"

- Check: step-4 line of `docs/routines/mbe-weekly-improve.md` byte-compared with architecture § Routine step-4 contract (amended, `> ` stripped); secondary callers grepped.
- Evidence:
  ```
      2435 v2-step4-doc.txt
      2435 v2-step4-arch.txt
  459464816caa32db  v2-step4-doc.txt
  459464816caa32db  v2-step4-arch.txt
  diff_exit=0
  .claude/skills/optimize-implement-queue/SKILL.md:148:**CRITICAL:** Do NOT run `node tools/cli/dist/index.js agent eval --adapter claude-cli` …
  docs/routines/mbe-evening.md:24:3. … agent eval --adapter claude-cli …
  ```
- Result: PASS for the doc. **Live trigger byte-match: still NOT VERIFIED.** It belongs to Ship.

### Brief criterion 3 — the drift guard fails on regression (F2 re-graded)

- Check: guard green on the tree; M1 (flag stripped from the invocation only, prose mention kept on the same line); M2 (line 26 replaced with `origin/main`'s text). Each restored with `git checkout --` and confirmed clean.
- Evidence:

  ```
  (a) $ pnpm --dir scripts test -- routine-eval-adapter
   ✓ scripts/__tests__/routine-eval-adapter.test.mjs (12 tests)   Tests  12 passed (12)   exit=0

  (b) M1: adapter-mentions-left=1 invocation-has-flag=0   1 file changed, 1 insertion(+), 1 deletion(-)
         × contains the exact invocation `node tools/cli/dist/index.js agent eval --adapter claude-cli` — a zero-match pass would pin nothing
         × follows every `agent eval` with `--adapter claude-cli`
  AssertionError: docs/routines/mbe-weekly-improve.md no longer contains `node tools/cli/dist/index.js agent eval --adapter claude-cli` — restore the invocation, …
        Tests  2 failed | 10 passed (12)
  M1_guard_exit=1
  M1 restored: clean

  (c) M2: 1 file changed, 1 insertion(+), 1 deletion(-)
         × contains the exact invocation …
         × follows every `agent eval` with `--adapter claude-cli`
       × files the deterministic issue title `ci-fix: weekly eval checkpoint did not run under claude-cli`
       × no longer calls exit 2 "treat it as a silent no-op"
       × calls a task that ran and then failed a "scored failure row", not a non-run
        Tests  5 failed | 7 passed (12)
  M2_guard_exit=1
  M2 restored: clean
  ```

- Result: **PASS.** M1, which passed 10/10 before the amendment, now fails 2 tests. F2 is closed.

### Brief criterion 4 — the local row is not committed

- Evidence:
  ```
  $ git checkout -- metrics/eval-reports.jsonl .claude/agent-spend/sessions.jsonl   revert_exit=0   (after the spend, and again after the repro)
         0 metrics/eval-reports.jsonl
         0 .claude/agent-spend/sessions.jsonl
  $ git status --short | grep -v '^?? .claude/sessions/'    -> (empty)
  ```
- Result: PASS. The row is quoted above and exists nowhere in git. This stage commits only `verification.md`.

### Brief criterion 5 — gates green; llms regen clean

- Evidence:
  ```
  packages/agent-core  lint=0  typecheck=0  test=0   Test Files  97 passed (97)   Tests  1768 passed (1768)
  tools/cli            lint=0  typecheck=0  test=0   Test Files  44 passed (44)   Tests  389 passed (389)
  scripts              test=0                        Test Files  217 passed (217) Tests  4109 passed (4109)   (after litter removal)
  $ pnpm regen --check
  All generated artifacts are up to date.   regen=0
  ```
  Amendment contracts, verbose (selection):
  ```
  ✓ worktree-manager.test.ts > commitChanges > adds --no-verify to the commit when asked
  ✓ worktree-manager.test.ts > commitAndPush > commits with the hooked form (no --no-verify)
  ✓ run-cli-adapter-session.test.ts > neither pushes nor creates a PR when createPr is false
  ✓ run-cli-adapter-session.test.ts > reports worktreePath on a successful session only when createPr is false
  ✓ run-cli-adapter-session.test.ts > outer catch > a post-dispatch commit rejection resolves as failed with the adapter's usage (createPr: false)
  ✓ agent-eval.test.ts > eval fixture verifier … > (a) never checks out the agent branch in the caller's repo
  ✓ agent-eval.test.ts > eval fixture verifier … > (b) installs once per task in the worktree (300 s), then runs each script through turbo there (600 s)
  ✓ agent-eval.test.ts > eval fixture verifier … > (e) removes the worktree of a succeeded session, swallowing a removal failure
  ✓ agent-eval.test.ts > eval fixture verifier … > (e) keeps the worktree of a failed session and prints its path
  ```
- Result: PASS.

### Earlier failures, re-graded

- **F1 (commit in a build-less worktree; usage discarded; false cause): CLOSED for `claude-cli`.** The session committed (`59e82a803`) in a worktree with no dist, did not push, and its usage reached both sinks. The live run did not exercise the throw-with-usage path (nothing threw). That path is unit-verified only (`outer catch` tests above).
- **F2 (line-level guard): CLOSED** — M1 is red.
- **F3 (`Cost basis:` line on the exit-2 path):** not re-observed. No claude-cli exit 2 occurred. Unchanged, cosmetic.
- **Assumption 10 (refused checkout):** superseded. The verifier no longer checks out, pinned by unit test (a). Live: this worktree stayed on `fix/agent-eval-claude-cli-caller` throughout (`git rev-parse --abbrev-ref HEAD` after the run).

### New finding F4 — the default adapter is not key-gated here: it spends, then reports a non-run with a false cause (needs Matt)

On this machine, with `ANTHROPIC_API_KEY` unset, `node tools/cli/dist/index.js agent eval` (default `--adapter claude`) **runs the model** through the Agent SDK. It evidently uses the local Claude Code subscription login. It hits the session's `maxBudgetUsd` ($0.50), the SDK returns `Reached maximum budget ($0.5)`, the SDK path's catch zeroes usage (architecture's Operate seed: `session-runner.ts`'s outer catch), and the eval reports `0 turns, $0.00`, exit 2, and "ANTHROPIC_API_KEY is not set, so the agent adapter has no credentials to run". That sentence is false. It also prints `✓ … score 100%` for the excluded task: the verifier ran the fixture on an unchanged worktree, so the tests passed trivially. Every default-adapter "non-spending" repro in this run did the same:

```
nested transcript (~/.claude/projects/…-reserv-<hash>)   assistant  first timestamp              last costUSD
a6511a  (Capture repro)                                   8          2026-09-29T03:26:46.675Z      0.5250756
c061fa  (Implement item 3 repro)                          14         2026-09-29T04:16:51.755Z      0.5267792
f6f0cc  (Verify #1 repro)                                 9          2026-09-29T05:01:10.147Z      0.5090246
732e84  (this re-verification's repro)                    7          2026-09-30T05:21:57.468Z      0.5295296
60e999, 6ded90 (pre-run, 2026-09-21)                       13 / 6     2026-09-21T23:59 / 23:58      0.5212 / 0.5148
```

Consequences:

1. **Unplanned spend.** Brief decision 6 authorized one run. This stage's repro was a second model call, ~$0.53 API-equivalent on the subscription and not billed to a key, made on the previous verification's statement that the command is non-spending. Capture's and Implement's repros spent the same way.
2. **The defect's stated mechanism needs re-checking before Operate reads Friday's result.** `defect.md` and the earlier section attribute the default path's exit 2 to "no credentials". Locally the cause is budget cap plus usage loss. Whether the RemoteTrigger sandbox's SDK path is key-gated (no subscription login) or behaves like this machine is unmeasured. The fix direction (`--adapter claude-cli`) is unaffected: it scored correctly here.
3. **Not fixed here.** It is out of this run's scope: architecture leaves the SDK catch as an Operate seed, and the default-adapter message is required to stay byte-unchanged. Candidate seed: the SDK path should carry usage through its catch, the way the amendment did for the CLI path, and `noRunMessage` should not assert "no credentials" when a session reported errors.

### Worktree state, before → after

```
before: .agent-worktrees/ empty; no registered eval worktrees; agent/…-{60e999,6ded90} (pre-run)
spend:  created …-4c3714 → removed by the eval itself (status succeeded); branch agent/…-4c3714 kept by design
repro:  created …-732e84 (kept, status failed) → removed by this stage:
          git worktree remove --force .agent-worktrees/…-732e84   wt_remove=0
          git worktree prune                                       prune=0
          Deleted branch agent/add-a-regression-test-to-services-reserv-732e84 (was 7a3961d0a).
replay: scratchpad/v2-replay-4c3714 (detached 59e82a803) → git worktree remove --force   replay_remove=0
after:  .agent-worktrees/ empty; no registered eval worktrees; agent/…-{4c3714,60e999,6ded90}
```

### Still not verified

- **Live RemoteTrigger prompt byte-match** (criterion 2). Ship owns it.
- **Whether the claude.ai sandbox has `claude` on PATH with a subscription login.** The first Friday run (2026-10-02 14:00 UTC) is the proof.
- **The throw-with-usage path live** (`status: failed` row carrying `sessionErrors`). Unit-verified only, because nothing threw in the spend.
- **The verifier's ~17 s wall time** (see criterion 1). Its `true` values were independently reproduced; its speed was not explained.
- **The eval worktree base.** It was still cut from local `main` `7a3961d0a` (2026-09-20), not `origin/main`. This is the earlier Observation, unchanged. The agent was evaluated against 9-day-old code.

---

The sections below are the original verification (2026-09-28/29, before the amendment), kept as written.

## Summary

**4 criteria PASS, 1 FAIL, 1 gap; the regression (default-adapter exit 2) is reproduced and byte-unchanged; the single authorized spend did NOT produce a scored row.** The `claude` CLI ran for real (15 assistant turns on `claude-sonnet-5`, $0.60 API-equivalent, a plausible 15-line test staged in 66 s), but the eval harness's own commit step in the fresh `.agent-worktrees/` checkout tripped husky's `check-adr` on a missing `packages/agent-core/dist`, the adapter threw, and the eval scored the task as a 0-turn non-run — exit 2, nothing persisted, and the new `noRunMessage` asserted a cause ("the `claude` CLI is missing from PATH, has no subscription login, or refused to start") that is false for this failure. Criterion 1 fails on a pre-existing, adapter-independent harness defect one step earlier than the one architecture assumption 10 predicted. Every code-level and doc-level criterion passes; all gates are green. **Shipping as-is would convert Friday's silent no-op into a loud, misdiagnosed failure every week** (see § Failures F1).

All commands ran 2026-09-28/29 (local, UTC timestamps in logs) in `/Users/mbutler/github/mattbutlerengineering/.claude/worktrees/agent-eval-claude-cli-caller`, branch `fix/agent-eval-claude-cli-caller` at `91c68d8ca` (7 commits ahead of `origin/main` `35517bbae`). `claude` = `/Users/mbutler/.local/bin/claude`, `2.1.284 (Claude Code)`; Node `v22.22.3`; `ANTHROPIC_API_KEY` unset; `CLAUDECODE=1`.

## Criteria & evidence

### Pre-flight: fresh dist

- Check: `pnpm build --filter @mbe/cli...` then `node scripts/agent-core-build-freshness.mjs check`.
- Evidence:
  ```
   Tasks:    6 successful, 6 total
  Cached:    6 cached, 6 total
  build_exit=0
  {"trusted":true,"state":"fresh","reason":"dist is newer than or equal to every src file",...}
  -rw-r--r--  1 mbutler  staff    919 Sep 28 21:16 packages/agent-core/dist/eval/cost-basis.js
  -rw-r--r--  1 mbutler  staff  16178 Sep 28 21:16 tools/cli/dist/commands/agent-eval.js
  16   <- grep -c 'costBasis' tools/cli/dist/commands/agent-eval.js
  ```
- Result: PASS (cache hit is fresh against source; the new code is in the dist the spend ran).

### Brief criterion 1 — `--adapter claude-cli --task example-bugfix` exits 0/1, appends one row with `"adapter":"claude-cli"`, `numTurns > 0`, honest `withinBudget`/cost

- Check: the ONE authorized spend, from the worktree root, in the background:
  `node tools/cli/dist/index.js agent eval --adapter claude-cli --task example-bugfix` with stdout+stderr to `scratchpad/verify-eval-claude-cli.log`. Not retried. `--suite cost` not run.
- Evidence — the log (stack trace elided with `…`):

  ```
  start=2026-09-29T05:05:44Z
  cwd=/Users/mbutler/github/mattbutlerengineering/.claude/worktrees/agent-eval-claude-cli-caller
  branch=fix/agent-eval-claude-cli-caller
  Eval Report
  ───────────
  ✗ example-bugfix [test-writing] — error: git commit -m feat: Add a regression test to services/reservations/src/services/booking-noti failed: Command failed: git commit -m feat: Add a regression test to services/reservations/src/services/booking-noti
  ⋯ Backing up original state…
  ✔ Done backing up original state (71eebb901)!
  ⋯ Running tasks for staged files…
      **/*.{ts,tsx} — 1 file
        ⋯ eslint --fix --config ".../.agent-worktrees/agent-add-a-regression-test-to-services-reserv-de7a93/services/reservations/eslint.config.js" ".../services/reservations/src/services/booking-notifications.test.ts"
        ⋯ prettier --config .prettierrc.js --write ".../services/reservations/src/services/booking-notifications.test.ts"
  ✔ eslint --fix …
  ✔ prettier …
  ✔ Done running tasks for staged files!
  …
  > @mbe/cli@0.0.0 start /Users/mbutler/github/mattbutlerengineering/.claude/worktrees/agent-eval-claude-cli-caller/.agent-worktrees/agent-add-a-regression-test-to-services-reserv-de7a93/tools/cli
  > tsx src/index.ts "check-adr" "--staged"

  Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/Users/mbutler/github/mattbutlerengineering/.claude/worktrees/agent-eval-claude-cli-caller/.agent-worktrees/agent-add-a-regression-test-to-services-reserv-de7a93/tools/cli/node_modules/@mbe/agent-core/dist/index.js' imported from .../tools/cli/src/commands/loop.ts
  …
   ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @mbe/cli@0.0.0 start: `tsx src/index.ts "check-adr" "--staged"`
  Exit status 1
  husky - pre-commit script failed (code 1)
   (0 turns, $0.00)

  Tasks:       0
  Pass rate:   0.0%
  Mean score:  0.0%
  Mean cost:   $0.00
  Mean turns:  0.0
  Failed to complete: 1
  Excluded (did not run): 1 — not counted in the aggregate above

  Cost basis: api-equivalent — CLI-reported, not billed; budget cost arm not applied

  No task executed via the claude-cli adapter: the "claude" CLI is missing from PATH, has no subscription login, or refused to start (0 turns / $0.00). This is not a scored regression — the suite never ran.
  exit=2
  elapsed_s=66
  end=2026-09-29T05:06:51Z
  ```

  Sinks after the run (nothing appended — there is no row to quote):

  ```
  $ wc -c metrics/eval-reports.jsonl; wc -l .claude/agent-spend/sessions.jsonl
         0 metrics/eval-reports.jsonl
         0 .claude/agent-spend/sessions.jsonl
  $ git status --short metrics/eval-reports.jsonl .claude/agent-spend/sessions.jsonl
  (empty — both clean)
  $ git rev-parse --abbrev-ref HEAD
  fix/agent-eval-claude-cli-caller
  ```

  **The CLI did run.** Its own transcript, `~/.claude/projects/-Users-mbutler-github-mattbutlerengineering--claude-worktrees-agent-eval-claude-cli-caller--agent-worktrees-agent-add-a-regression-test-to-services-reserv-de7a93/0853e5a0-d5a6-4d7a-9b6d-b01cea2ace3d.jsonl` (734,570 bytes):

  ```
  assistant_msgs=15
  user_msgs=9
  first_ts="timestamp":"2026-09-29T05:05:50.130Z"
  last_ts="timestamp":"2026-09-29T05:06:43.849Z"
  models=  15 "model":"claude-sonnet-5"
  cost_fields="costUSD":0.6021568
  ```

  And it produced the change the task asked for, left **staged** in the eval worktree (`git -C .agent-worktrees/…-de7a93 diff --cached`):

  ```
   .../src/services/booking-notifications.test.ts            | 15 +++++++++++++++
  +  it("cancelBookingNotifications still sends the cancellation email when the guest has unsubscribed from marketing (transactional, per contact-policy.ts)", async () => {
  +    const deps = makeDeps();
  +    const notifier = createBookingNotifier(deps);
  +    const reservation = makeReservation({
  +      guest: { visitCount: 3, communicationPreference: "both", unsubscribed: true },
  +    });
  +
  +    await notifier.cancelBookingNotifications(reservation as never, "tok", "guest");
  +
  +    expect(deps.notificationAdapter.sendBookingCancelled).toHaveBeenCalledWith(
  +      expect.objectContaining({ reservationId: "res-1" }),
  +      "both"
  +    );
  +  });
  ```

  Why the commit failed — the eval worktree has `node_modules` (workspace symlinks) but no build output:

  ```
  $ ls .agent-worktrees/…-de7a93/packages/agent-core/dist
  ls: …/packages/agent-core/dist: No such file or directory
  $ ls -la .agent-worktrees/…-de7a93/tools/cli/node_modules/@mbe/
  agent-core -> ../../../../packages/agent-core
  ```

  Why the real usage was lost — the throw path, from source:
  - `packages/agent-core/src/adapters/cli-adapter-base.ts:241-248` `commitChanges()`: `git -C <worktree> add -A` then `git -C <worktree> commit -m …` via `execFileAsync` — the husky pre-commit (`lint-staged` + `pnpm --filter @mbe/cli start check-adr --staged`, i.e. `tsx src/index.ts`, which imports `@mbe/agent-core` → `dist/index.js`) fails, `execFileAsync` rejects, `dispatch()` throws.
  - `packages/agent-core/src/adapters/run-cli-adapter-session.ts:93` `adapterResult = await cliAdapter.dispatch(…)` never assigns; the module "has no outer try/catch to unwind through" (line 258 comment), so `recordSpend` at line 223 is never reached — hence no spend-ledger row either.
  - `packages/agent-core/src/eval/eval-harness.ts:38-40` catches and calls `failedScore()`, which hard-codes `costUsd: 0, turns: 0, withinBudget: false, error: <message>` (lines 55-71) → `taskDidNotRun` → `nonRunCount: 1` → `suiteDidNotRun` → exit 2, `persistReport` skipped.

- Result: **FAIL.** Exit 2, no row, `numTurns` reported 0 (real: 15). The adapter, the subscription login, and the model id all worked; the failure is the harness's commit step in a build-less worktree plus the throw discarding usage. `withinBudget`/`costBasis` honesty on a live row is therefore **unverified live** (unit-verified only — see item 2 below).

### Criterion 1 regression repro — default adapter still exits 2, message byte-unchanged, sink still 0 bytes

- Check: `env -u ANTHROPIC_API_KEY node tools/cli/dist/index.js agent eval; echo "exit=$?"` (non-spending: the SDK adapter fails `isAvailable()` before any model call).
- Evidence (Langfuse/SDK warnings preceding the report omitted — same two as defect.md):
  ```
  Eval Report
  ───────────
  ✗ example-bugfix [test-writing] — score 33% (0 turns, $0.00)

  Tasks:       0
  Pass rate:   0.0%
  Mean score:  0.0%
  Mean cost:   $0.00
  Mean turns:  0.0
  Failed to complete: 0
  Excluded (did not run): 1 — not counted in the aggregate above

  No task executed: ANTHROPIC_API_KEY is not set, so the agent adapter has no credentials to run. This is not a scored regression — the suite never ran.
  exit=2
         0 metrics/eval-reports.jsonl
         1 .claude/agent-spend/sessions.jsonl
   M .claude/agent-spend/sessions.jsonl
  {"date":"2026-09-29","timestamp":"2026-09-29T05:01:53.797Z","costUsd":0,"model":"claude-sonnet-5","adapter":"claude","status":"failed","inputTokens":0,"outputTokens":0,"numTurns":0}
  ```
  The report and diagnostic line are identical to defect.md § Reproduction (only the ledger timestamp differs). Ledger row reverted with `git checkout -- .claude/agent-spend/sessions.jsonl` → `0 .claude/agent-spend/sessions.jsonl`, status clean.
- Result: PASS (the SDK/default path is byte-unchanged by this run's code, as breakdown item 3's Accept requires).

### Brief criterion 2 — step 4 invokes `--adapter claude-cli`, no longer describes exit 2 as expected; live prompt matches byte-for-byte

- Check: `grep -n 'adapter claude-cli'` on the three callers; programmatic byte-diff of `docs/routines/mbe-weekly-improve.md` line 26 against `architecture.md` § Routine step-4 contract (line 109, `> ` prefix stripped); `git diff --stat origin/main -- <file>` per caller.
- Evidence:
  ```
  docs/routines/mbe-weekly-improve.md:26:4. Weekly eval checkpoint: … Invoke it as `pnpm build --filter @mbe/cli... && node tools/cli/dist/index.js agent eval --adapter claude-cli` — … **Exit 2** is `suiteDidNotRun` (0 turns / $0 cost) and under `--adapter claude-cli` it is a FAILURE, never an expected no-op: … `ci-fix: weekly eval checkpoint did not run under claude-cli` … `ci-fix` and `ready-for-human` … Record the exit-2 outcome as a failure in step 5's log entry. …
  docs/routines/mbe-evening.md:24:3. … trigger `node tools/cli/dist/index.js agent eval --adapter claude-cli` asynchronously …
  .claude/skills/optimize-implement-queue/SKILL.md:148:**CRITICAL:** Do NOT run `node tools/cli/dist/index.js agent eval --adapter claude-cli` synchronously. …

      1969 step4-doc.txt
      1969 step4-arch.txt
  5a6894440cb3ea2c33b8b571923dbe8eb635d878275fb5c3b1d1a170ae0b046e  step4-doc.txt
  5a6894440cb3ea2c33b8b571923dbe8eb635d878275fb5c3b1d1a170ae0b046e  step4-arch.txt
  diff_exit=0

   1 file changed, 1 insertion(+), 1 deletion(-)   <- mbe-weekly-improve.md vs origin/main
   1 file changed, 1 insertion(+), 1 deletion(-)   <- mbe-evening.md
   1 file changed, 1 insertion(+), 1 deletion(-)   <- optimize-implement-queue/SKILL.md
  ```
- Result: PASS for the doc (identical to the contract; exactly one line changed per caller, so the `weekly improve <date>` liveness signature is untouched). **Live trigger byte-match: NOT VERIFIED** — owned by Ship (architecture § Live trigger update); nothing here touched `trig_01G12wULcCweXSb2jmVkChPW`.

### Brief criterion 3 — a test fails if the doc invocation regresses to the SDK default

- Check: (a) the guard green on the current tree; (b) mutation M2 — line 26 replaced with `origin/main`'s pre-fix text (the literal "regresses to the SDK default"); (c) mutation M1 — only the flag stripped from the invocation (`agent eval --adapter claude-cli\`` → `agent eval\``), leaving the prose mention of `--adapter claude-cli`later on the same line. Each mutation restored with`git checkout -- docs/routines/mbe-weekly-improve.md`and confirmed`git diff --quiet`.
- Evidence:

  ```
  (a) $ pnpm --dir scripts test -- routine-eval-adapter
   ✓ scripts/__tests__/routine-eval-adapter.test.mjs (10 tests) 4ms
   Test Files  1 passed (1)   Tests  10 passed (10)   exit=0

  (b) M2: silent-no-op-mentions=1 adapter-mentions=0   1 file changed, 1 insertion(+), 1 deletion(-)
       ❯ docs/routines/mbe-weekly-improve.md (2)
         × passes `--adapter claude-cli` on every `agent eval` line 4ms
     ❯ the weekly-improve prompt treats a claude-cli non-run as a failure (2)
       × files the deterministic issue title `ci-fix: weekly eval checkpoint did not run under claude-cli` 6ms
       × no longer calls exit 2 "treat it as a silent no-op" 2ms
  ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
  AssertionError: `agent eval` invoked without `--adapter claude-cli` in:
    docs/routines/mbe-weekly-improve.md:26: 4. Weekly eval checkpoint: … node tools/cli/dist/index.js agent eval` — …
  M2_guard_exit=1
  M2 restored: clean

  (c) M1: adapter-mentions-left=1 invocation-has-flag=0
   ✓ scripts/__tests__/routine-eval-adapter.test.mjs (10 tests) 5ms
   Tests  10 passed (10)
  M1_guard_exit=0
  M1 restored: clean
  ```

- Result: **PASS with a gap.** A whole-line regression (the realistic one — reverting or pasting the old prompt) turns the guard red with a message naming the file, line and fix. But the guard's assertion is line-level `line.includes("--adapter claude-cli")`, so a partial regression that drops the flag from the command while keeping the explanatory prose on the same line passes — see § Failures F2.

### Brief criterion 4 — the eval row from (1) is NOT committed as a baseline

- Check: sinks reverted after quoting; staged diff on both paths; last commit's file list.
- Evidence:
  ```
  $ git checkout -- metrics/eval-reports.jsonl .claude/agent-spend/sessions.jsonl; echo "revert_exit=$?"
  revert_exit=0
         0 metrics/eval-reports.jsonl
         0 .claude/agent-spend/sessions.jsonl
  $ git diff --cached --stat -- metrics/eval-reports.jsonl .claude/agent-spend/sessions.jsonl
  (empty)
  $ git status --short | grep -v '^?? .claude/sessions/'
  (empty)
  ```
- Result: PASS — vacuously: the spend produced no row in either sink, so there was nothing to withhold; the committed `metrics/eval-reports.jsonl` remains 0 bytes and this stage's only commit is `verification.md`.

### Brief criterion 5 — existing gates green in touched packages; llms regen clean

- Check: full lint/typecheck/test per touched package, the scripts project, `pnpm regen --check`, prettier on the touched docs.
- Evidence:
  ```
  packages/agent-core:  eslint src/ → exit 0 | tsc --noEmit → exit 0 | Test Files  97 passed (97)  Tests  1747 passed (1747)
  tools/cli:            eslint src/ → exit 0 | tsc --noEmit → exit 0 | Test Files  44 passed (44)  Tests  378 passed (378)
  scripts:              Test Files  217 passed (217)  Tests  4107 passed (4107)   (after litter removal — see § Litter)
  $ pnpm regen --check
  All generated artifacts are up to date.   exit=0
  $ pnpm exec prettier --check docs/routines docs/scheduled-tasks.md docs/fixes/agent-eval-claude-cli-caller packages/agent-core/eval-suite/README.md .claude/skills/optimize-implement-queue/SKILL.md
  All matched files use Prettier code style!   exit=0
  $ git log --format='%h %s' origin/main..HEAD
  91c68d8ca docs(eval): close item 8 — gates green after eval-worktree cleanup
  0a2bcc689 chore(eval): regenerate llms context for the cost-basis and caller wiring
  2cff3cbc3 docs: mirror the claude-cli eval checkpoint in scheduled-tasks and the eval-suite README
  2f23cb55d fix(routines): wire every eval caller to --adapter claude-cli and guard the invocation
  6dea94874 fix(cli): name the claude-cli prerequisite on a non-run and print the cost basis
  84d14ac1f feat(cli): score eval budgets through the adapter's cost basis
  4cf72a5ba feat(agent-core): add per-adapter cost basis for eval scoring
  ```
- Result: PASS.

### Breakdown item 1 Accept — cost-basis module contract

- Check: `pnpm --dir packages/agent-core exec vitest run src/eval/__tests__/cost-basis.test.ts --reporter=verbose`.
- Evidence:
  ```
   ✓ costBasisForAdapter > treats the SDK adapter, opencode, and the auto cascade as billed money
   ✓ costBasisForAdapter > treats claude-cli as API-equivalent — a real figure the CLI reports, not billed under a subscription
   ✓ costBasisForAdapter > treats gemini as having no cost figure at all (its JSON never carries USD)
   ✓ isWithinBudget > fails a billed run that is over the cost arm (bit-identical to the pre-existing inline check)
   ✓ isWithinBudget > passes a billed run that is within both arms
   ✓ isWithinBudget > fails a billed run that is over the turns arm even at $0
   ✓ isWithinBudget > passes an api-equivalent run that is over cost but within turns — the cost arm does not apply
   ✓ isWithinBudget > still fails an api-equivalent run that is over the turns arm
   ✓ isWithinBudget > treats `none` like api-equivalent — turns arm only
   ✓ isWithinBudget > accepts the boundary values on both arms
   Test Files  1 passed (1)   Tests  10 passed (10)   exit=0
  ```
- Result: PASS (every row of architecture § Interfaces' contract table is pinned).

### Breakdown items 2–3 Accept — eval command scoring, row label, diagnostics (unit level)

- Check: `pnpm --dir tools/cli exec vitest run src/__tests__/agent-eval.test.ts --reporter=verbose`.
- Evidence (the claude-cli / cost-basis / non-run cases; 31/31 overall):
  ```
   ✓ claude-cli cost basis (api-equivalent — the budget's cost arm does not apply) > scores an over-cost, within-turns claude-cli run as within budget, keeps the figure, and labels the row
   ✓ claude-cli cost basis (…) > still fails the turns arm under claude-cli
   ✓ claude-cli cost basis (…) > labels a default-adapter (SDK) row as billed
   ✓ claude-cli diagnostics > names the CLI prerequisite (not ANTHROPIC_API_KEY) and does not persist when every task reports 0 turns / $0 under claude-cli
   ✓ claude-cli diagnostics > prints the cost-basis line for a scored claude-cli run so a $1.37 task beside a $0.50 budget is not read as a bug
   ✓ claude-cli diagnostics > prints no cost-basis line for a scored default-adapter (billed) run
   ✓ exits 1 when pass rate is below --threshold
   ✓ no-credentials / non-run detection > exits non-zero (distinct from --threshold's exit 1), names the missing prerequisite, and does not persist when every task reports 0 turns / $0 cost
   ✓ gemini CLI-adapter path (#4208 …) > scores a successful gemini run instead of treating it as a non-run, even though costUsd stays 0
   ✓ --max-cost-regression > exits 0 when cost is within threshold versus baseline
   ✓ --max-cost-regression > exits 1 when cost exceeds the regression threshold
   Test Files  1 passed (1)   Tests  31 passed (31)   exit=0
  ```
  Live: both item-3 diagnostics were observed in the spend log (`Cost basis: api-equivalent — …` and the claude-cli `No task executed via the claude-cli adapter: …` line) — but see F3: the message's stated cause was wrong for what actually happened.
- Result: PASS at unit level; the scoring path (`isWithinBudget`, row `costBasis`) is **not exercised live** because no row was written.

### Breakdown item 7 Accept — intent mirror and eval-suite README

- Check: the Accept's greps.
- Evidence:
  ```
  expected-silent-no-op count: 0
  ci-fix title count: 1
  adapter claude-cli count: 4
  README:46: | `budget` | … Under a non-`billed` cost basis (e.g. `--adapter claude-cli`, whose CLI-reported figure is not billed on a subscription login) only `maxTurns` is enforced; `costUsd` is still recorded on the task score. |
  docs/scheduled-tasks.md:489:> - [x] The weekly `mbe agent eval` checkpoint is in the `mbe-weekly-improve` prompt      <- historical, untouched
  docs/scheduled-tasks.md:520:> `mbe agent eval` checkpoint inside `mbe-weekly-improve` (still one Friday run);       <- historical, untouched
  ```
- Result: PASS.

### Architecture assumption 10 — `verify()`'s `git -C <repoPath> checkout <branch>` is refused while the eval worktree holds the branch

- Check: the run never reached `verify()` (it threw at commit), so this was probed read-only from this worktree against the branch the spend left behind, then the branch was confirmed unchanged.
- Evidence:
  ```
  branch_before=fix/agent-eval-claude-cli-caller
  fatal: 'agent/add-a-regression-test-to-services-reserv-de7a93' is already used by worktree at '/Users/mbutler/github/mattbutlerengineering/.claude/worktrees/agent-eval-claude-cli-caller/.agent-worktrees/agent-add-a-regression-test-to-services-reserv-de7a93'
  checkout_exit=128
  branch_after=fix/agent-eval-claude-cli-caller
  ```
  Retention confirmed in source: `run-cli-adapter-session.ts:193` removes the worktree only `if (worktree && config.createPr)`, and `agent-eval.ts:330` passes `createPr: false`.
- Result: **CONFIRMED (by probe).** Had the run got past the commit, `testsPass`/`typecheckPass` would have been `false` for harness reasons exactly as predicted. Not fixed here (brief scope); it now sits behind the earlier defect in F1.

### Brief known unknowns answered by this run

- **Does the CLI accept `DEFAULT_SESSION_CONFIG.model` via `--model`?** Yes — the transcript shows all 15 assistant messages on `"model":"claude-sonnet-5"` (`resolveModelId("sonnet")`).
- **Does a claude-cli session produce a branch `verify()` can run against?** No, for two independent reasons: the commit fails in a build-less worktree (F1), and even with a commit the checkout is refused (assumption 10).
- **Is `claude -p` blocked from inside a Claude Code session (`CLAUDECODE=1`)?** No — the nested run completed 15 turns.

## Failures

**F1 — Criterion 1 FAIL: the eval cannot commit the agent's work in its own fresh worktree, and the failure is reported as a non-run with a false cause.** Routes back to **Implement** (or to Architect if the fix is judged design-touching), and to **Review/Ship as a shipping risk**: the same mechanism will fire in the Friday sandbox — the routine's `pnpm build --filter @mbe/cli...` builds the sandbox checkout, but the eval creates a fresh `.agent-worktrees/` worktree with no `packages/agent-core/dist`, husky's `check-adr` dies identically, and step 4 (as now written) files `ci-fix: weekly eval checkpoint did not run under claude-cli` with `ready-for-human`, quoting a diagnostic that blames a missing binary/login. That is a loud, misdiagnosed failure every week in place of today's silent no-op. Three defects, all pre-existing and adapter-independent (the SDK path runs the same husky hook; it was never reached because no eval has ever got past `isAvailable()`):

1. `cli-adapter-base.ts:commitChanges()` runs the parent repo's pre-commit hooks inside a worktree that has never been built. Options for the fix owner (not decided here): build agent-core in the worktree before committing; commit with `--no-verify` in the throwaway eval worktree (the parent repo's hooks re-run on any real PR); or have `WorktreePhase` prepare the worktree the way `implement-queue-worker` does.
2. A `dispatch()` throw discards real usage: `run-cli-adapter-session.ts` has no outer catch, so `adapterResult` (15 turns, $0.60) and the `recordSpend` row are both lost, and `eval-harness.ts:failedScore()` scores the task `costUsd: 0, turns: 0` — the exact `taskDidNotRun` signature. A run that _ran and failed at commit_ is indistinguishable from one that never started. The existing comment at `agent-eval.ts:293-296` documents this class for the earlier gemini case (#4208); this is the same shape one layer up.
3. The new claude-cli `noRunMessage` (item 3) asserts three possible causes, none of which was true. It should hedge (e.g. "…or the session failed before any usage was captured — check the task's `error:` line") or the harness should stop classifying an errored-with-usage task as a non-run.

**F2 — Criterion 3 gap: the drift guard is line-level, not invocation-level.** Mutation M1 (flag removed from the command, prose mention of `--adapter claude-cli` left on the same line) passes 10/10. Small fix, routes to **Implement** unless Review accepts it as a known limitation: assert the exact invocation `node tools/cli/dist/index.js agent eval --adapter claude-cli` (or that the flag immediately follows `agent eval`) rather than `line.includes(ADAPTER_FLAG)`. The whole-line regression IS caught (M2, 3 tests red).

**F3 — finding, not a criterion:** the `Cost basis:` line prints on the exit-2 path (Implement noted this as harmless; observed live). Harmless in isolation, but beside F1's message it reads as if a claude-cli run was evaluated. Cosmetic; Operate seed.

**Observation (out of scope, seed for Operate):** the eval worktree was cut from local `main` = `7a3961d0a` (2026-09-20), which in this worktree is 187 commits behind `origin/main` (`git rev-list --count main..origin/main` → 187). `DEFAULT_SESSION_CONFIG.baseBranch` is a local ref, so a stale checkout evaluates the agent against stale code. Harmless in the routine's fresh sandbox, misleading locally.

## Litter (brief § Decisions added after Implement, item 5)

Two `.agent-worktrees/agent-*` worktrees were created inside this worktree during Verify — `…-f6f0cc` (the exit-2 repro, 22:01) and `…-de7a93` (the spend, 22:05), both on local-only `agent/…` branches at `7a3961d0a`. Before removal, `pnpm --dir scripts test` would have failed `scripts/__tests__/dockerfile-pnpm-patches.test.mjs` on the Dockerfile copies inside them (the class breakdown item 8 recorded). Removed by this stage — the harness permitted it:

```
--- de7a93 ---  worktree_remove_exit=0  Deleted branch agent/add-a-regression-test-to-services-reserv-de7a93 (was 7a3961d0a).  branch_delete_exit=0
--- f6f0cc ---  worktree_remove_exit=0  Deleted branch agent/add-a-regression-test-to-services-reserv-f6f0cc (was 7a3961d0a).  branch_delete_exit=0
$ ls -la .agent-worktrees      -> empty
$ git worktree list | grep 'agent-eval-claude-cli-caller/.agent-worktrees'   -> (no entries)
```

The two remaining `agent/add-a-regression-test-to-services-reserv-{60e999,6ded90}` branches predate this run (present in the pre-spend baseline) and were not touched. The nested CLI transcript under `~/.claude/projects/…-de7a93/` was left in place (outside the repo).

## Not verified

- **Live RemoteTrigger prompt byte-match (criterion 2, second half)** — Ship's deliverable; not attempted.
- **Whether the claude.ai RemoteTrigger sandbox has `claude` on PATH with a subscription login** — cannot be tested from this machine; the first Friday run (2026-10-02 14:00 UTC) is the proof (Operate). Note F1 predicts that run exits 2 for a different reason even if the binary is present.
- **`withinBudget` / `costBasis` honesty on a live row** — no row was written; verified at unit level only (items 1–2). The brief's $1.37 one-turn figure was not re-measured (this run's CLI tally was $0.60 for 15 turns, from the CLI's own transcript, not from the adapter's parser — the parsed `total_cost_usd` never surfaced).
- **`verify()`'s `pnpm --filter ./services/reservations test|typecheck` on a real agent branch** — unreachable; the checkout it depends on is refused (assumption 10, confirmed by probe).
- **Whether the SDK (`claude`) adapter path hits the same commit-hook failure** — cannot run without `ANTHROPIC_API_KEY`; the same `WorktreePhase`/husky mechanics apply, so it is expected to, but this is inference, not measurement.
- **`--suite cost`** — not authorized this run, not run.
- **The agent's staged test itself** (does the new `it()` pass?) — not a criterion, and its worktree was removed; the diff is quoted above for Review.
