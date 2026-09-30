---
stage: review
run: maintenance:agent-eval-claude-cli-caller
date: 2026-09-29
assumptions:
  - "Scope is `git diff origin/main...HEAD` at `adee40c50` (base `35517bbae`). Only the source and test diff was reviewed line by line. Generated `llms*.txt` were excluded because Verify re-ran `pnpm regen --check`. The run docs were read only as the contracts under review."
  - "Verify re-ran every gate (lint, typecheck, test, regen, prettier) after the amendment, so Review did not re-run them (the maintenance-run rule: don't re-verify what Verify already covered). Each finding below was checked by re-reading the code at the cited line, not by execution."
  - "M1's pre-change behaviour was established from `git show origin/main:packages/agent-core/src/adapters/run-cli-adapter-session.ts`. That version has no try/catch around dispatch, verification, publish or feedback, so a throw left before the `createPr` removal at its line 194."
  - "Who reaches the `createPr: true` CLI path was established by grep. `mbe agent run` defaults `--pr` on, and `/issue-worker` drives `mbe agent run`. The agent service's orchestrator calls `runSession` (the SDK path), so it does not reach `runCliAdapterSession`."
  - "`docs/standards.json` is absent in this repo, so no finding cites a standards slug."
  - "Severity is Review's own call under autorun. The brief puts no user in the loop, so M1's fix-or-defer decision goes to the orchestrator."
---

# Review: wire the weekly eval checkpoint to the claude-cli adapter, scored honestly

## Scope

The diff is `origin/main...HEAD` (`35517bbae..adee40c50`). It was reviewed against `architecture.md`, including its 2026-09-29 amendment, and against `verification.md`, which passed on re-verification. The review covered:

- `packages/agent-core/src/adapters/run-cli-adapter-session.ts`: the new outer catch and `worktreePath`
- `phases/verification-phase.ts`, `worktree-manager.ts`, `phases/pipeline-types.ts`: the non-publishing rule
- `result-builder.ts`, `session-runner.ts`, `types.ts`: `SessionResult.worktreePath`
- `eval/cost-basis.ts`, `eval/task-scorer.ts`, `eval/types.ts`, `eval/run-detection.ts`, `index.ts`
- `tools/cli/src/commands/agent-eval.ts`: cost basis, the fixture verifier, `releaseWorktree`, `noRunMessage` v2
- `scripts/__tests__/routine-eval-adapter.test.mjs`: the v2 drift guard
- the three guarded prompts and `docs/scheduled-tasks.md`
- every touched test file

Every `createPr: false` caller was traced:

- `tools/cli/src/commands/agent-eval.ts:340`
- `mbe agent run --no-pr` at `tools/cli/src/commands/agent/run.ts:120`
- `wave.ts`, which shells out to `mbe agent run --no-pr`
- the agent service, via `session-lifecycle/orchestrator.ts:75` → `runSession`
- `ClaudeAdapter.run()` at `claude-adapter.ts:62`

## Findings

### Major M1: a throw on the `createPr: true` CLI path now force-deletes the agent's uncommitted work

This is a regression the diff introduced. The architecture document does not record it.

- Where:
  - `packages/agent-core/src/adapters/run-cli-adapter-session.ts:198-205`: the new outer catch, then the unchanged `if (worktree && config.createPr) removeWorktree(...)`
  - `worktree-manager.ts:160`: `git worktree remove --force`
- Scenario: `mbe agent run "<task>" --adapter claude-cli` runs with the default `--pr`, so `createPr` is `true`. `/issue-worker` takes the same path with any CLI adapter.
  1. The agent edits files.
  2. `VerificationPhase` runs `commitChanges` with hooks. In a fresh `.agent-worktrees/` checkout the pre-commit hook fails: `check-adr` hits `ERR_MODULE_NOT_FOUND`, which is Verify's F1 mechanism and still live for publishing sessions.
  3. Before this diff, that `GitCommandError` propagated out of `runCliAdapterSession` before the removal line. The worktree and its uncommitted edits stayed on disk and could be recovered.
  4. Now the throw is caught, control falls through to the removal, and `git worktree remove --force` deletes the edits. No commit exists, so no branch ref preserves them.
- The session fails either way. The difference is that the agent's output is now unrecoverable.
- The SDK sibling (`session-runner.ts`) also removes the worktree after a throw, but it first tries `pushPartialWork`. The CLI path has no such salvage step, so the new code "mirrors" the SDK catch only half-way.
- The architecture document says every `createPr: true` path is byte-unchanged. That holds for `VerificationPhase` but not for this runner's failure tail.
- The new test `run-cli-adapter-session.test.ts:397-438` (`createPr: true, keepsWorktree: false`) pins the deleting behaviour. It passes a commit error whose text is literally "hook exited 1".
- Recommended fix, one line plus a test:
  - Skip removal when `threw`, i.e. `if (worktree && config.createPr && !threw)`.
  - Report `worktreePath` whenever the worktree is kept, so the "present iff kept" contract still holds.
  - Flip the test's `createPr: true` row to expect the worktree to be kept and `removeWorktree` not to be called.
- The eval never takes this path (it always passes `createPr: false`), so the authorized release is unaffected either way.
- Standard: none.
- Decision: **fix recommended before Ship (route to Implement; about 10 lines).** The orchestrator may defer instead. A deferral must be logged with a reason and carried as a `docs/backlog.md` seed.
- Resolution (2026-09-29, Implement re-entry, breakdown item 20): fixed in `bd4164668`. The runner removes the worktree only when `createPr` is true and nothing threw, and reports `worktreePath` whenever the worktree is kept. The `createPr: true` row now expects the worktree kept, and a new case pins removal after a successful `createPr: true` session.

### Minor m1: for a non-run, the fixture verifier still installs and tests, and prints a passing line

- Where: `tools/cli/src/commands/agent-eval.ts:348` (always calls `verifyInWorktree`) and `:132` (`emitReport` before `noRunMessage`).
- Scenario: under `--adapter claude-cli` in a sandbox with no `claude` binary, every session is a non-run with 0 turns and $0.
  - The verifier still runs `pnpm install --frozen-lockfile` (up to 300 s) plus one turbo run per required script (up to 600 s each) on an unchanged worktree.
  - The table then prints `✓ <task> … score 100%` above the exit-2 diagnostic. Verify observed exactly this under the default adapter (F4).
  - The exit code and the `Excluded (did not run)` line stay correct, so scoring is unaffected. The cost is wasted minutes on the Friday failure path and a misleading tick in the log the routine quotes.
- Fix: skip `verifyInWorktree` when `taskDidNotRun({ turns: session.numTurns, costUsd: session.costUsd })`.
- Standard: none.
- Decision: deferred. The exit code and the persisted row are correct. Seed it together with F4 (below).

### Minor m2: `releaseWorktree` swallows removal failures without a word

- Where: `tools/cli/src/commands/agent-eval.ts:476-479`.
- Scenario: removing a worktree with a full pnpm `node_modules` hits the 60 s git timeout, or git refuses. The removal fails, the catch is empty, and `.agent-worktrees/` keeps growing with no stderr line.
- Every other failure in the verifier "says why on stderr". The repo's coding-style rule is "never silently swallow errors".
- Fix: add one `console.error` line with the path, the way the kept-for-inspection branch does.
- Standard: none.
- Decision: deferred (cosmetic; the worktree is litter, not a scoring error).

### Minor m3: a removal throw on the CLI path still skips `recordSpend`

This predates the diff; the new contract only narrows around it.

- Where: `run-cli-adapter-session.ts:203-205`. The removal sits outside the new try, unguarded.
- The amended contract says no throw escapes dispatch, verification, publish or feedback. Removal is not in that list, so this is not a contract breach.
- Still, a failing `git worktree remove` on the `createPr: true` path throws past `recordSpend`, and the usage is lost. The SDK path wraps the same call in try/catch and schedules a reap.
- Standard: none.
- Decision: deferred. The same seed as M1 can carry it if M1 is deferred.

### Minor m4: `createPr: false` API sessions return a `branchName` that no longer exists on origin

This is an accepted consequence, confirmed rather than new.

- Where: `verification-phase.ts:48` (push skipped); `services/agent/src/services/session.ts:13,144` (`branchName` persisted and returned); `packages/api-client/src/agent-sessions.ts:8`.
- Scenario: an agent-service session created with `createPr: false` now commits only inside the service container. The API still returns `branchName`, but nothing can fetch it from origin, and the work disappears with the container.
- Grep finds no consumer: no `apps/*` reference to `branchName`, and the service only uses it in `countCiRetries`.
- Architecture assumption "Non-publishing session" records exactly this trade-off.
- Local callers lose nothing:
  - `--no-pr` and the eval keep the local ref and the worktree.
  - `wave` merges its own branch, not the agent's, so it never relied on the push. That is a separate pre-existing wave defect and not this run's concern.
- Standard: none.
- Decision: deferred as documented design.

### Minor m5: guarded-prompt coverage stops at the three files

This predates the diff and is out of scope.

- `scripts/optimize-implement-queue.mjs:171` emits prompt text naming `mbe agent eval` without the flag. It is a "do NOT run" instruction and is unguarded.
- `.claude/skills/optimize-implement-queue/SKILL.md:145`'s async trigger is `nohup mbe agent run …`. It cannot resolve `mbe` (gotchas § Build).
- `docs/agents/golden-task-authoring.md:144` uses the stale flags `--suite golden --only`.
- None of these makes an agent invoke eval without the flag today.
- Standard: none.
- Decision: deferred. This is a `docs/backlog.md` seed candidate for whoever next touches the eval callers.

### Out of scope: Verify's F4, the default SDK adapter spending while reporting a false no-credentials non-run

- On a machine with a Claude Code subscription login, `env -u ANTHROPIC_API_KEY node tools/cli/dist/index.js agent eval` (the default `--adapter claude`) is not gated on the key:
  1. It runs the model and hits the $0.50 `maxBudgetUsd`, about $0.51–0.53 API-equivalent per run. Four of this run's repros spent this way.
  2. `session-runner.ts`'s outer catch then zeroes the usage (`costUsd: 0, numTurns: 0` at lines 118-126).
  3. The eval classifies the run as a non-run and exits 2.
  4. `noRunMessage` then says "ANTHROPIC_API_KEY is not set, so the agent adapter has no credentials to run", which is false.
- This diff does not cause any of it. The brief required the default-adapter sentence to stay byte-unchanged, and the architecture document left the SDK catch as an Operate seed.
- It does mean:
  - The "non-spending repro" in `defect.md`/`breakdown.md` is not non-spending on a logged-in machine.
  - Friday's exit-2 interpretation must not assume key-gating.
- **Recommended carrier:** one `docs/backlog.md` seed, `(from: maintenance:agent-eval-claude-cli-caller)`, covering:
  - (a) `session-runner.ts`'s catch carries the SDK's parsed usage the way this run's CLI catch does;
  - (b) `noRunMessage`'s `claude`/`auto` branch asserts "no credentials" only when no session reported an error, and otherwise quotes `sessionErrors`, as the `claude-cli` branch now does;
  - (c) m1's skip-verify-on-non-run.
- Operate files the seed; Review does not write it.
- Decision: deferred (out of scope). Not a blocker.

## Passes with no findings

- **`--no-verify` reachability (security):** clean. `noVerify` is `!config.createPr` (`verification-phase.ts:44`), and no publishing path can reach a `createPr: false` commit:
  - `PublishPhase` returns at `!config.createPr` (`publish-phase.ts:24`).
  - `pushPartialWork` and `abortOnFailure` gate on `createPr` (`session-runner.ts:472,518`).
  - `FeedbackPhase` needs a `prNumber`.
  - `commitAndPush` (the feedback loop) and `session-runner`'s partial commit pass no options, so they keep the hooked form, which `worktree-manager.test.ts` pins.
  - The `createPr: true` arm now passes `{ noVerify: false }`, and the git args stay exactly `["commit", "-m", msg]`.
  - Residual: hook-free commits exist only as local `agent/*` refs. Pushing one by hand still meets CI's Gitleaks.
- **CLI outer catch:** exactly one `recordSpend`, after the catch, not inside it; the test asserts `toHaveBeenCalledTimes(1)`.
  - `checkAborted` stays a predicate, so abort semantics are unchanged. The orchestrator reads `signal.aborted` itself for cancellation.
  - Caught errors reach `errors[]` and `categorizeFailure`, so nothing is swallowed.
  - Side effect worth knowing: a thrown rate-limit message now categorises as `rate_limited` and cascades in `auto`, where before it escaped the cascade. That is an improvement, not a finding.
- **Fixture verifier injection and bounds:**
  - Every command is `execFile("pnpm", [...args])`, an argument array with no shell.
  - `fixtureRef` (zod `min(1)`) is only ever interpolated into the single argv element `--filter=./<ref>`. The `./` prefix blocks flag injection.
  - Timeouts: 300 s for install, 600 s per script, 60 s for git removal.
  - `cwd` is always `session.worktreePath` and never `repoPath`, so the caller's checkout can no longer be switched.
  - Removal runs only on `status === "succeeded"` and keeps the branch ref. Worktree mode is always `full`, so `git worktree remove` is correct.
- **Drift guard and the step-4 contract:**
  - The `mbe-weekly-improve.md` step-4 line is byte-identical to the block quoted in the architecture document (compared with a shell string test).
  - `/\bagent eval\b(?! --adapter claude-cli)/` is word-bounded, and it finds an unflagged occurrence anywhere on the line even when a flagged one sits beside it.
  - The exact-invocation assertion prevents a vacuous pass.
  - A repo-wide grep finds no unflagged invocation in any guarded file.
- **Cost basis:** the switch is exhaustive over `AdapterType`. The `billed` branch is bit-identical to the old inline expression, so `claude`, `opencode` and `auto` scoring is unchanged. `costBasis` sits at row level.
- **Test quality:**
  - `tools/cli`'s tests are typechecked because its tsconfig includes `src`, and the `fakeSession` shape carries the new `worktreePath`.
  - `agent-core`'s tests are excluded from typecheck. The new mocks there were read against the real signatures (`commitChanges(path, msg, options?)`, `SessionResult.worktreePath`) and match.
  - The one test that encodes a wrong behaviour is M1's `createPr: true` row.

## Verdict

**No critical findings, so the authorized release is not blocked.**

**Fix-first is recommended for M1.** It is a one-line data-loss regression on the `createPr: true` CLI failure path, which the eval never takes, so it can alternatively be deferred with a logged reason and a backlog seed. m1–m5 are deferred with reasons above. F4 is out of scope and goes to a `docs/backlog.md` seed at Operate.

Next stage: Implement for M1, or Ship if M1 is deferred.
