---
kind: autorun-brief
run: maintenance:agent-eval-claude-cli-caller
date: 2026-09-28
---

# Autorun brief: the weekly eval checkpoint has no caller that can succeed

Not an artifact — this file never counts toward orientation or active-run
discovery. It is the single source of interview answers for every stage.
Where it is silent, a stage takes its skill's recommended default and logs
it under `assumptions:`; where no default exists, it stops and surfaces.

## Origin

Backlog seed at `docs/backlog.md` line 6 (top of file), from `#4199`. Claim
it in place per the protocol (`(claimed: maintenance:agent-eval-claude-cli-caller)`):

> Give `mbe agent eval` a caller that can actually succeed, or retire the
> weekly eval checkpoint — `metrics/eval-reports.jsonl` has been 0 bytes since
> it was created in #4116 and #4199's adapter fix could not change that,
> because the defect is upstream of adapter selection. Measured 2026-09-21 on
> `origin/main`: the command's only references are two routine _prompts_
> (`docs/routines/mbe-weekly-improve.md` step 4, `mbe-evening.md` step 3), no
> `.github/workflows/` job and no script invokes it; `--adapter` defaults to
> `claude`, and `ClaudeAdapter` is the **SDK** adapter (… `isAvailable()`
> requires `ANTHROPIC_API_KEY`) — so the default path is byte-for-byte the
> pre-#4206 behaviour, and there is no adapter anywhere in `agent-core` that
> shells out to the `claude` CLI binary the cloud sandbox actually has.
> Reproduced end to end: `node tools/cli/dist/index.js agent eval` with the
> key unset printed `Excluded (did not run): 1`, exited **2**, and left the
> file at 0 bytes. … Candidate fixes, all needing a human decision: a
> `workflow_dispatch` CI job with the repo secret, a `claude`-CLI subprocess
> adapter alongside the gemini/opencode ones, or deleting the checkpoint and
> the empty sink.

**The seed is partly stale — measured 2026-09-28 on `origin/main` (`35517bbae`):**

- The "no adapter shells out to the `claude` CLI" clause is **false now**.
  PR **#5670** (merged 2026-09-22T04:53Z, "feat(agent-core): add
  ClaudeCliAdapter for the claude CLI (#3585 Option A)") added
  `packages/agent-core/src/adapters/claude-cli-adapter.ts` — `name:
"claude-cli"`, `cliBinary: "claude"`, headless `-p <task> --output-format
json --permission-mode bypassPermissions`, real cost/turns parsed from the
  JSON result. It is **explicitly selectable only** (`--adapter claude-cli`)
  and deliberately NOT in the `auto` failover cascade (ADR-017).
- `tools/cli/src/commands/agent-eval.ts` already accepts `--adapter
claude-cli` (`VALID_ADAPTERS`), default still `"claude"` (SDK).
- Issue **#3585** ("no ANTHROPIC_API_KEY available — route AI features through
  the Claude CLI, or remove them") CLOSED 2026-09-23T19:15:48Z — Option A
  (CLI adapter) is the recorded human decision. Issue **#4199** closed the
  same minute (19:15:51Z).
- **What is still broken:** no caller passes `--adapter claude-cli`.
  `docs/routines/mbe-weekly-improve.md` step 4 still runs bare
  `node tools/cli/dist/index.js agent eval` (default SDK adapter) and
  instructs the routine to treat exit 2 as "the expected result in this
  sandbox … a silent no-op, never file an issue for it". So the checkpoint
  is structurally guaranteed to write nothing, forever, and its own prompt
  tells it that is fine.

## Human decisions already made (this session, 2026-09-28)

1. **Run target:** this seed (top of backlog = propose first).
2. **Fix direction: wire the caller to the existing `claude-cli` adapter.**
   Rejected alternatives, with reasons — do not re-open them:
   - _Make `claude-cli` the eval default / add to `auto`_ — #5670 kept it
     explicit-only so `auto` never changes in an environment that already
     works; out of scope.
   - _CI job + provision `ANTHROPIC_API_KEY`_ — contradicts the #3585
     keyless-CI decision; `gh secret list` (2026-09-28) shows **no**
     `ANTHROPIC_API_KEY` secret exists.
   - _Retire the checkpoint + delete the sink_ — throws away the capability
     #5670 just built.
3. **Release authorization: GRANTED for both externally visible actions**
   (see § Release authorization).
4. **Verify spend: one real task**, `--task example-bugfix --adapter
claude-cli`, locally, on the Claude subscription (see § Verification).

## Run scale and slug

Maintenance run (condition brief: something is degraded — the checkpoint
exists and can never fire). Slug `agent-eval-claude-cli-caller`; artifacts
under `docs/fixes/agent-eval-claude-cli-caller/`. Entry stage is `capture`
(`defect.md`). Re-entry depth is capture's call; the brief's view is that the
budget-mismatch question (below) is design-touching, which points at
`re-entry: architect`, but capture decides and records it.

## What is degraded — observed vs expected

**Observed.** `metrics/eval-reports.jsonl` is 0 bytes since #4116 created it.
Every Friday 07:00 PT the `mbe-weekly-improve` routine (RemoteTrigger
`trig_01G12wULcCweXSb2jmVkChPW`, cron `0 14 * * 5`, model opus) runs step 4,
gets exit 2 (`suiteDidNotRun`), and — per its own prompt — logs it as an
expected no-op. `.claude/improvement-loop/log.md` line ~2280 records exactly
this: "`agent eval` → **exit 2** (`suiteDidNotRun`, `Excluded (did not run):
1`, 0 turns / $0.00, no `ANTHROPIC_API_KEY`). Expected sandbox no-op".

**Expected.** The weekly checkpoint runs the golden-task suite through an
adapter that can actually execute in that sandbox (the `claude` CLI on the
subscription), appends a real row to `metrics/eval-reports.jsonl`, opens the
`chore(metrics): eval baseline <date>` PR the prompt already describes, and a
non-run under that adapter is **surfaced as a failure** — not logged as fine.

## Reproduction evidence

Capture must re-run the seed's reproduction in this worktree (cheap — the
agent never executes, so no spend): `pnpm build --filter @mbe/cli... && env
-u ANTHROPIC_API_KEY node tools/cli/dist/index.js agent eval`; expect
`Excluded (did not run): 1`, exit **2**, `metrics/eval-reports.jsonl`
unchanged at 0 bytes (`wc -c`). Quote the real output.

Also measured this session and relevant to the design:

- **Nested `claude -p` works from inside a Claude Code session.** With
  `CLAUDECODE=1` set (this session), `claude -p "Reply with exactly: pong"
--output-format json --max-turns 1` returned a JSON result
  (`stop_reason: end_turn`, `duration_api_ms: 2599`). The adapter is not
  blocked by a nested-session guard, at least locally (Claude Code 2.1.284,
  `/Users/mbutler/.local/bin/claude`).
- **Cost mismatch.** That single one-word turn reported
  `total_cost_usd: 1.3723`, driven by `cache_creation_input_tokens: 68479`
  (1h ephemeral) + `cache_read_input_tokens: 10118` — the repo's CLAUDE.md /
  rules / skills context loaded by the CLI. Under a subscription no dollars
  are billed, but `makeAgentTaskRunner` in `agent-eval.ts` scores
  `withinBudget = session.costUsd <= task.budget.maxCostUsd && numTurns <=
maxTurns`, and every task in the suite has `maxCostUsd` 0.4–0.5
  (`eval-suite/example-bugfix.json` 0.5/20 turns; `cost/cost-00{1,2,3}`
  0.5/20, 0.4/15, 0.4/15). **A claude-cli run of this repo will therefore
  fail `withinBudget` on every task from its first turn.** This is a real
  finding the Architect stage must resolve, not a guess — options include a
  per-adapter cost basis, treating the CLI's reported figure as
  API-equivalent-not-billed, or re-baselining budgets for CLI runs; the
  brief does not pick.

## Root-cause hypothesis — labelled a hypothesis

The caller was never updated after the adapter landed. #4199 was closed
alongside #3585 when #5670 merged the adapter, but the routine prompt (the
only scheduled caller) still invokes the SDK default, and its exit-2 clause
codifies the non-run as expected. Nothing tests that the routine prompt
references a runnable adapter, so the doc and the code drifted apart with
every gate green. (Secondary hypothesis: even with the adapter wired, the
budget mismatch above would make the first real run report 0% pass — so a
naïve one-line wiring fix produces a scored-and-wrong baseline, which is
worse than the current non-run.)

## Blast radius

- Who: the autonomous improvement loop's only quality-drift sensor. No
  end-user or production service is touched by this run.
- Since: #4116 (creation of the sink) — every weekly checkpoint since has been
  a no-op; `metrics/eval-reports.jsonl` has 0 rows.
- Surfaces touched by the fix: `docs/routines/mbe-weekly-improve.md` (and the
  LIVE RemoteTrigger prompt it mirrors), possibly
  `tools/cli/src/commands/agent-eval.ts` and/or
  `packages/agent-core/src/adapters/claude-cli-adapter.ts` /
  `eval/` for the cost basis, `docs/scheduled-tasks.md` § mbe-weekly-improve
  (the #3571 exit-2 paragraph), `scripts/metrics-store.mjs` unchanged.
- `mbe-evening.md` step 3 references eval only conditionally (fires on a
  flagged regression via `/optimize-implement-queue`) — check whether it
  needs the same adapter wiring; if it shells out to `agent eval` it does.

## Already ruled out — do not re-walk

- Provisioning `ANTHROPIC_API_KEY` anywhere (repo secret, RemoteTrigger
  sandbox): decided against in #3571 and #3585; no secret exists.
- Building a CLI adapter: exists (#5670). Do not write a second one.
- `pnpm exec mbe` / `mbe` on PATH: never linked (gotchas § Build); invoke
  `node tools/cli/dist/index.js agent eval` after `pnpm build --filter
@mbe/cli...`.
- Nested-session blocking of `claude -p`: refuted locally (probe above).
  **Not yet verified in the claude.ai RemoteTrigger sandbox** — see unknowns.

## Scope

**In:**

- Wire the weekly caller to `--adapter claude-cli` (routine doc + live
  trigger prompt + `docs/scheduled-tasks.md` mirror text).
- Redefine the routine's exit-2 handling: under `claude-cli`, `suiteDidNotRun`
  is a failure to surface (file/label per the routine's existing conventions),
  never a silent no-op. Keep exit 1 (genuine regression) semantics.
- Resolve the cost/budget basis so a claude-cli run is scored honestly
  (Architect decides the mechanism; Verify proves it with the one-task run).
- A guard that fails when the routine prompt's eval invocation drifts from a
  runnable adapter, in the style the repo already uses for prompt/doc drift
  (e.g. `apps/rialto-web/e2e/workflow-coverage.test.ts`,
  `scripts/__tests__/pulumi-cli-pin.test.mjs` — a test that reads the real
  file and asserts the exact invocation). Keep it small.
- Claim the backlog seed; reference #3585 / #4199 / #5670 in `defect.md`.

**Out:**

- Changing the `auto` cascade or the `agent eval` default adapter.
- Removing the SDK `ClaudeAdapter` or `@anthropic-ai/claude-agent-sdk`.
- Any API key provisioning; any CI `workflow_dispatch` job for eval.
- The ACMM eval harness seed (`metrics/acmm-evals.jsonl`) — separate seed.
- Growing the golden-task suite.
- Force-running the whole `mbe-weekly-improve` routine out of schedule (it
  opens PRs and files issues as side effects) — see § Release authorization.

## Success criteria

1. `node tools/cli/dist/index.js agent eval --adapter claude-cli --task
example-bugfix` run locally in this worktree exits 0 or 1 (a **scored**
   result), appends exactly one row to `metrics/eval-reports.jsonl` tagged
   `"adapter":"claude-cli"` with `numTurns > 0`, and its `withinBudget` /
   cost fields are honest under the mechanism Architect chose (quote the row).
2. `docs/routines/mbe-weekly-improve.md` step 4 invokes `--adapter
claude-cli` and no longer describes exit 2 as expected; the LIVE trigger
   prompt matches the doc byte-for-byte for that step.
3. A test fails if (2)'s doc invocation regresses to the SDK default.
4. The eval row from (1) is NOT committed as a baseline by this run unless
   Architect/Ship explicitly decide it is a valid baseline (a local macOS run
   is not the sandbox the routine runs in); default is to leave the
   committed file as-is and let the first Friday run produce the baseline.
5. Existing gates green: `pnpm lint`, `pnpm typecheck`, `pnpm test` in
   touched packages; llms regen as the hooks require.

## Known unknowns (stop-and-surface if a stage needs them answered to proceed)

- **Does the claude.ai RemoteTrigger sandbox have `claude` on PATH with
  subscription auth?** The seed asserts yes; nothing in the repo proves it.
  Cannot be verified from this machine. Ship's post-release step is to watch
  the next scheduled run (Fri 2026-10-02 14:00 UTC) — its log entry / `chore
(metrics): eval baseline` PR is the proof; Operate captures it.
- Whether `runAgentSession` via `claude-cli` produces a branch the eval's
  `verify()` step (`git checkout <branch>` + `pnpm --filter ./<fixtureRef>
test|typecheck|lint`) can run against — the one-task Verify run answers it.
- Model under the CLI: `-m` defaults to `DEFAULT_SESSION_CONFIG.model`;
  confirm the CLI accepts that id (the adapter forwards `--model` as given).

## Tracker

No tracker mirror for this run (protocol default when the brief is silent;
recorded here so it is a decision, not silence). Closed issues #3585, #4199
and PR #5670 are cited as provenance in `defect.md`; nothing is created or
re-opened in the tracker by the run itself. The Ship PR is the release
mechanism, not a tracker mirror.

## Verification

- Verify runs the repo's real commands and quotes output. Authorized spend:
  **one** real eval task (`--task example-bugfix --adapter claude-cli`) in
  this worktree; nothing more. `--suite cost` (3 tasks) is NOT authorized
  this run.
- Unit tests for any code change are written first (repo mandate: TDD, RED
  before GREEN). `pnpm typecheck` before declaring done (vitest does not
  typecheck).
- Run the eval from the worktree root so `findMonorepoRoot` resolves to this
  worktree's `metrics/`, not the stale main checkout.

## Release authorization

**Granted** (Matt, 2026-09-28, this session) for exactly two externally
visible actions, in this order, each gated:

1. **Merge the PR to `main`** via the normal path: PR-level CI green (`CI
Gate` as a real `pull_request` check — see gotchas § CI for the
   `gate-missing` / `gate-unattributed` traps), the `reviewer` subagent
   gate passed, no unfixed critical review finding. `gh pr merge <N> --auto
--squash --delete-branch`. Matt's standing policy: review-gate pass + CI
   green → merge, no further human-in-the-loop; `tier:*` labels do not block.
2. **Update the LIVE `mbe-weekly-improve` RemoteTrigger prompt** on claude.ai
   (`trig_01G12wULcCweXSb2jmVkChPW`) so it matches the merged doc. **Resend
   the FULL job_config** — a partial update wipes omitted fields (memory:
   "must resend full job_config on update (omitting events wipes it)").
   Read the trigger back afterwards and diff it against the doc.

**Not authorized:** force-running the weekly routine out of schedule,
creating new triggers, touching any other routine's prompt, any deploy /
publish / tag. Unfixed critical review findings block (1) and (2)
unconditionally — stop and surface.

## Stack, style, constraints

- Repo mandates apply (CLAUDE.md, AGENTS.md, `.claude/rules/gotchas.md`):
  TDD; surgical diffs; conventional commits; `pnpm` from inside a package or
  `pnpm --dir <abs>`; llms regen needs the CLI built; never `git add -A`
  (prettier hook keeps ~170 files dirty — stage explicit paths); docs need
  prettier before a docs PR (docs-only PRs skip the check and poison later
  Builds).
- Work happens in this worktree only: `/Users/mbutler/github/
mattbutlerengineering/.claude/worktrees/agent-eval-claude-cli-caller`,
  branch `fix/agent-eval-claude-cli-caller` off `origin/main` `35517bbae`,
  `pnpm install --frozen-lockfile` already done. The main checkout is 555
  commits behind and dirty — never read or write it.
- Immutability, small files, explicit error handling per user rules.

## Decisions added after Implement (Matt, 2026-09-28)

5. **Eval-worktree litter cleanup is authorized for this run.** Every
   `agent eval` invocation — including the non-spending exit-2 repros and
   Verify's single authorized claude-cli task — leaves a gitignored
   `.agent-worktrees/agent-*` worktree on a local-only `agent/*` branch inside
   this worktree (`runAgentSession` creates it before the adapter runs;
   `createPr: false` keeps it), which trips
   `scripts/__tests__/dockerfile-pnpm-patches.test.mjs`'s repo-wide Dockerfile
   glob locally (never in CI). Matt authorized `git worktree remove --force
   <dir> && git branch -D <branch>` for the two Implement left behind AND for
   the one Verify will leave — scoped to `.agent-worktrees/agent-*` created
   inside THIS worktree during this run, nothing else. The orchestrator runs
   the removal (the stage subagent was denied it by the harness). The test's
   glob excluding `.agent-worktrees/**` is a logged adjacent smell, out of
   scope.
