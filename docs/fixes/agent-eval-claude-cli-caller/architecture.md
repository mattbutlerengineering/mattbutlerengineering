---
stage: architect
run: maintenance:agent-eval-claude-cli-caller
date: 2026-09-28
ux: not-applicable — maintenance run, no UI surface
assumptions:
  - "Cost basis: a per-adapter `CostBasis` (`billed` | `api-equivalent` | `none`) decided by a pure `costBasisForAdapter(adapterType)` in `packages/agent-core/src/eval/`; the budget's cost arm (`costUsd <= maxCostUsd`) applies only when the basis is `billed`, the turns arm always applies, and the reported `costUsd` is kept untouched in the row plus a row-level `costBasis` field. Picked over re-baselining budgets, dropping the CLI cost, per-adapter budgets in task JSON, forwarding `--max-budget-usd`, and an adapter-declared property — see Decisions. Autorun default; the brief listed the options without picking."
  - "`auto` maps to `billed`: its cascade's first member is the billed SDK adapter, and a gemini fallback already reports $0 so the cost arm passes vacuously — behaviour under `auto`, `claude`, and `opencode` is byte-for-byte unchanged by this design."
  - "Exit 2 under `--adapter claude-cli` is surfaced by the routine as one deduplicated issue titled exactly `ci-fix: weekly eval checkpoint did not run under claude-cli`, labelled `ci-fix` + `ready-for-human` (never `ready` — the fix is environmental, no agent PR can make it, and a `ready` label would burn an implement-queue worker), with a dated comment on recurrence instead of a second issue; plus the routine's step-5 log entry records it as a FAILURE. Mirrors `scripts/scheduled-workflow-health.mjs`'s deterministic-title `ci-fix:` convention. Exit 1 keeps its meaning and its `ready` issue."
  - "No `--threshold` (or `--max-cost-regression`) is added to the routine's invocation this run. Exit 1 is therefore unreachable from the routine as written (only a load error or invalid adapter produces it) — a pre-existing gap, not introduced here. A threshold is a policy number for a 1-task suite with zero rows; Operate should seed it once Friday rows exist. The prompt's exit-1 clause stays verbatim."
  - "The local Verify row is NOT committed as a baseline (brief default). Verify quotes the appended `metrics/eval-reports.jsonl` row and the `.claude/agent-spend/sessions.jsonl` row into verification.md, then `git checkout --` both files. A macOS run under Matt's user-level `~/.claude` context is a different population from the sandbox; the first Friday run (2026-10-02 14:00 UTC) writes the baseline."
  - "Live trigger update contract (Ship): only `trig_01G12wULcCweXSb2jmVkChPW` (mbe-weekly-improve). Read the trigger, send the ENTIRE prompt (all five steps plus trailer, exactly the doc's fenced block) as the `prompt` field of `update_trigger` — never a fragment or a diff; if only the raw job_config API is available, resend the FULL job_config (every field just read back) per the memory rule the brief cites. Read back and byte-diff against the doc; zero diff or stop. `docs/scheduled-tasks.md` § Prompt files says `update_trigger` is field-scoped, which is why 'full' here means the whole prompt, not the whole job_config."
  - "`docs/routines/mbe-evening.md` step 3 and `.claude/skills/optimize-implement-queue/SKILL.md` line 148 are edited in the repo (they can cause an agent to invoke eval) but the LIVE mbe-evening trigger is NOT updated this run — the brief's release authorization excludes every other routine's prompt. Ship records the resulting doc/live drift for mbe-evening explicitly, the way `scripts/routine-manifest.mjs` records it for mbe-night/mbe-midday."
  - "Drift guard scope: `docs/routines/mbe-weekly-improve.md`, `docs/routines/mbe-evening.md`, `.claude/skills/optimize-implement-queue/SKILL.md` — every file whose text can make an agent run eval. `docs/scheduled-tasks.md` is intent prose with historical `mbe agent eval` mentions (checklist line 476, budget note line 507) that must not be forced to carry a flag, so it is updated by hand and excluded from the guard."
  - "The $1.37 one-turn figure is the brief's 2026-09-28 measurement, inherited from defect.md and not re-run here (a probe is real CLI spend outside the single authorized Verify task). The design depends only on the mechanism — `parseClaudeCliUsage` passes `total_cost_usd` straight to `costUsd`, and every suite budget is $0.40–0.50 — not on the magnitude."
  - "Known pre-existing harness defect, predicted by reading and NOT fixed here (brief scope): `verify()` in `agent-eval.ts` runs `git -C <repoPath> checkout <branch>` while the eval's `createPr: false` leaves that branch checked out in the agent's `.agent-worktrees/` worktree (default `full` mode = `git worktree add -b`), which git refuses. Adapter-independent; never observed because no row has ever been scored. Verify measures it on the one authorized run; if confirmed, `testsPass`/`typecheckPass` will be `false` for harness reasons and Operate seeds a follow-up run. Success criterion 1 is scoped to `withinBudget`/cost honesty and is unaffected."
---

# Architecture: wire the weekly eval checkpoint to the claude-cli adapter, scored honestly

## Approach

The adapter that can run in the Friday sandbox exists (#5670); the fix is to make the only scheduled caller use it and to stop the scorer from failing every claude-cli task on a cost figure that is not money. Two shapes were compared. **Shape A — change the numbers:** raise every task's `maxCostUsd` until a claude-cli run fits. It loses because the budgets are shared with the billed SDK adapter (which would lose its $0.50 guard), and because the ~$1.37 floor is the repo's `CLAUDE.md`/rules/skills context being cached on turn 1, a property of the repo that grows with every rules edit, so any number chosen today is wrong by the next one. **Shape B — change what the number means (chosen):** the eval already knows cost is adapter-specific (`loadCostBaseline` is scoped per adapter since #4218; gemini's cost is structurally absent and passes the cost arm vacuously). Make that knowledge explicit as a `CostBasis` per adapter, apply the budget's cost arm only when the basis is `billed`, keep the reported figure in the row, and label the row so a reader knows $1.37 is API-equivalent. Around that core: the routine prompt names the adapter and treats exit 2 as a failure with a deduplicated issue; a small read-the-real-file test pins the invocation; the live trigger is updated last, by full-prompt replace and byte-diff. Nothing in the `auto` cascade, the default adapter, the SDK adapter, or key provisioning moves.

## Components

### Cost basis (`packages/agent-core/src/eval/cost-basis.ts`, new)

- Responsibility: owns the one rule "which adapters' reported `costUsd` is billed money, and therefore which runs the budget's cost arm applies to". Pure, no I/O, unit-tested next to `run-detection.ts` / `cost-regression.ts`.
- Collaborators: `adapter-resolution.ts` (imports the `AdapterType` union), `types.ts` (`TaskBudget`). Exported from `packages/agent-core/src/index.ts` beside `checkCostRegression`/`suiteDidNotRun`.
- Deletion test: without it the adapter→basis map and the predicate reappear inline in `agent-eval.ts` (today's shape) with no unit test and no name — complexity returns to the caller, so it is a module, not a forwarder.

### Eval command wiring (`tools/cli/src/commands/agent-eval.ts`, edited)

- Responsibility: thin consumer. `makeAgentTaskRunner` computes `costBasisForAdapter(adapterType)` once and replaces the inline `withinBudget` expression with `isWithinBudget(...)`; `persistReport` adds `costBasis` to the row next to `adapter`; `noRunMessage` gains a `claude-cli` branch naming the real prerequisite (binary on PATH + subscription login) instead of the generic "0 turns via claude-cli"; `printReport` prints one `Cost basis:` line when the basis is not `billed`, so a $1.37 task beside a $0.50 budget does not read as a bug in the routine's log.
- Collaborators: Cost basis; `runAgentSession` / `resolveSessionAdapter` (unchanged seam); `metrics/eval-reports.jsonl` (append). `loadCostBaseline`, exit codes, `--json` shape, and every non-claude-cli path are unchanged.

### Routine prompt — weekly-improve step 4 (`docs/routines/mbe-weekly-improve.md`, edited)

- Responsibility: the authoritative caller. Step 4 invokes `--adapter claude-cli`, states why the default cannot score here, and defines the three exit-code actions (see the step-4 contract below). Steps 1–3 and 5 and the trailer are untouched so the `weekly improve <date>` liveness signature in `scripts/routine-manifest.mjs` keeps matching.
- Collaborators: the live RemoteTrigger (mirror, updated at Ship); Drift guard (reads this file); `docs/scheduled-tasks.md` (intent prose, updated by hand).

### Secondary callers (`docs/routines/mbe-evening.md` step 3; `.claude/skills/optimize-implement-queue/SKILL.md` line 148, edited)

- Responsibility: the conditional path — on a flagged queue-efficiency regression the evening routine "triggers `mbe agent eval` asynchronously". Both texts gain `--adapter claude-cli` (`node tools/cli/dist/index.js agent eval --adapter claude-cli`) so the async fire cannot regress to the SDK default either. Nothing else in either file changes; the SKILL's `ready,eval` label (no `eval` label exists) is pre-existing drift, flagged not fixed.
- Collaborators: Drift guard. The live mbe-evening trigger is deliberately not touched this run (assumptions).

### Intent mirror and authoring docs (`docs/scheduled-tasks.md` § mbe-weekly-improve + line ~449; `packages/agent-core/eval-suite/README.md` budget row, edited)

- Responsibility: keep prose true. `scheduled-tasks.md`: the #3571 keyless decision stands (no `ANTHROPIC_API_KEY`, still), the checkpoint now runs on the `claude` CLI's subscription login via `--adapter claude-cli` (#5670), and exit 2 is a surfaced failure with the deterministic `ci-fix:` title — replacing the "expected, silent no-op" paragraph; the optimize-implement-queue bullet names the flag. The eval-suite README's `budget` row gains one sentence: under a non-billed basis only `maxTurns` is enforced; `costUsd` is still recorded.
- Collaborators: none at runtime; read by humans and the monthly `/claude-md-improver`.

### Drift guard (`scripts/__tests__/routine-eval-adapter.test.mjs`, new)

- Responsibility: fail `pnpm test` (scripts project, `scripts/vitest.config.mjs` include glob) when any eval invocation in the guarded files drops `--adapter claude-cli`, when the invocation vanishes entirely (a guard that passes on zero matches is the class gotchas.md forbids), when the adapter name no longer exists in the code, or when step 4 reverts to calling exit 2 a silent no-op. Text reads only, no YAML/TS imports — the precedent set by `scripts/__tests__/pulumi-cli-pin.test.mjs` and `apps/rialto-web/e2e/workflow-coverage.test.ts`.
- Collaborators: the three guarded files; `packages/agent-core/src/adapters/claude-cli-adapter.ts` (`readonly name = "claude-cli"`); `tools/cli/src/commands/agent-eval.ts` (`"claude-cli"` inside `VALID_ADAPTERS`).

### Live trigger update (Ship procedure, not code)

- Responsibility: make `trig_01G12wULcCweXSb2jmVkChPW`'s prompt byte-identical to the merged doc, after the PR merges, then prove it by read-back diff. Contract below.
- Collaborators: claude.ai RemoteTrigger MCP tools (`list_triggers`/`get_trigger`, `update_trigger`); `docs/routines/mbe-weekly-improve.md` as the source of bytes.

## Data model

One append-only JSONL sink, one writer per run, no cross-row consistency needed beyond "the row a run appends is the row it printed".

**`metrics/eval-reports.jsonl` row** (schema owned by `persistReport`; metrics-store lists it under `EXTERNAL`, unchanged):

```jsonc
{
  ...EvalReport,                 // runId, tasks[], aggregate, byCategory, nonRunCount — unchanged
  "timestamp": "2026-10-02T14:31:07.000Z",
  "adapter": "claude-cli",       // since #4218
  "costBasis": "api-equivalent"  // NEW — "billed" | "api-equivalent" | "none"
}
```

Per-task `TaskScore.costUsd` stays the adapter's reported figure (under claude-cli the CLI's `total_cost_usd`); `deterministic.withinBudget` reflects the applicable arms only. `EvalReport`/`TaskScore` types are unchanged — the label lives at the row level with `adapter`, because basis is a function of adapter, not of task.

Access patterns served: (1) `loadCostBaseline(adapter)` — last same-adapter row's `aggregate.meanCostUsd` (unchanged; same adapter ⇒ same basis, so cost trend within claude-cli remains meaningful even though it is not billed); (2) Operate/humans reading a row and needing to know whether `$1.37` is money — answered by `costBasis` without consulting code; (3) the routine's `chore(metrics): eval baseline <date>` PR carrying exactly one new line (unchanged).

**Issue as dedupe record** (GitHub, written by the routine prompt, no script): title is the key — `ci-fix: weekly eval checkpoint did not run under claude-cli`, no date embedded so re-runs match by exact title; labels `ci-fix`, `ready-for-human`; body: run date, the `noRunMessage` line, the `Excluded (did not run): N` line, pointer to `docs/scheduled-tasks.md` § mbe-weekly-improve. Recurrence = one comment with the date and the same two lines.

## Interfaces & contracts

### `costBasisForAdapter(adapterType: AdapterType): CostBasis`

- Input: one of `"auto" | "claude" | "claude-cli" | "gemini" | "opencode"` (the existing union — an unknown value is a TypeScript error, never a runtime branch).
- Output: `"billed"` for `claude`, `opencode`, `auto`; `"api-equivalent"` for `claude-cli` (subscription login, CLI still reports the API-price figure, inflated on turn 1 by cached repo context); `"none"` for `gemini` (its JSON never carries USD — see `parseGeminiUsage`).
- Failure modes: none — total function over the union. Exhaustive `switch` so adding an `AdapterType` fails typecheck here until a basis is chosen.

### `isWithinBudget(usage: { costUsd: number; numTurns: number }, budget: TaskBudget, costBasis: CostBasis): boolean`

- Input: the session's reported cost and turns; the task's `budget`; the basis from above.
- Output: `numTurns <= budget.maxTurns && (costBasis !== "billed" || costUsd <= budget.maxCostUsd)`.
- Failure modes: none (pure). The `billed` branch is bit-identical to today's inline expression, so `claude`/`opencode`/`auto` scoring cannot change. Tests pin: billed over-cost → false; api-equivalent over-cost, within turns → true; api-equivalent over turns → false; none behaves as api-equivalent.

### `mbe agent eval --adapter claude-cli [--task <id>]` (process contract, unchanged codes, sharper diagnostics)

- Input: cwd = repo root (`findMonorepoRoot` resolves `metrics/`); `claude` on PATH with a subscription login; `--model` defaults to `DEFAULT_SESSION_CONFIG.model` (`resolveModelId("sonnet")`) and is forwarded verbatim as `--model` — the CLI accepting that id is a brief unknown Verify answers.
- Output: human table (plus `Cost basis: api-equivalent — CLI-reported, not billed; budget cost arm not applied`) or `--json`; on a scored run, exactly one row appended to `metrics/eval-reports.jsonl`, plus one row in `.claude/agent-spend/sessions.jsonl` (via `recordSpend`, unchanged).
- Exit codes: **0** scored, no gate tripped; **1** scored and a `--threshold`/`--max-cost-regression` gate tripped, or the suite could not load / adapter invalid (pre-existing overload, unchanged); **2** `suiteDidNotRun` — every task 0 turns and $0, nothing persisted. Under `claude-cli`, stderr names the prerequisite: `No task executed via the claude-cli adapter: the "claude" CLI is missing from PATH, has no subscription login, or refused to start (0 turns / $0.00). This is not a scored regression — the suite never ran.`
- Failure modes and timeouts: the `claude` subprocess is bounded by `maxTurns × 120 s` (20 turns → 40 min) and 10 MB stdout (`CliAdapterBase`); `verify()` bounds `git checkout` at 30 s and each `pnpm --filter ./<fixtureRef> <script>` at 300 s and scores any failure `false`. Retrying a scored run is real spend (plan quota) and appends a second row — not safe to retry blindly; retrying an exit-2 run is free (nothing ran) and safe. A run that dies after the agent but before `persistReport` leaves the spend-ledger row and no report row.

### Routine step-4 contract (`docs/routines/mbe-weekly-improve.md`, the bytes the live trigger must match)

Replacement text for step 4 only (steps 1–3, 5, trailer unchanged):

> 4. Weekly eval checkpoint: run the agent evaluation suite once to catch slow-drift quality regressions. Invoke it as `pnpm build --filter @mbe/cli... && node tools/cli/dist/index.js agent eval --adapter claude-cli` — `--adapter claude-cli` runs the suite through the `claude` CLI on this sandbox's subscription login (#5670); the default adapter is the Claude SDK and needs `ANTHROPIC_API_KEY`, which this sandbox does not have by decision (#3571/#3585), so a bare `agent eval` can never score. There is no `mbe` binary on PATH and `pnpm exec mbe` fails with `Command "mbe" not found`, because nothing in the workspace depends on `@mbe/cli`, so no `node_modules/.bin/mbe` symlink is ever created. Act on the exit code, never on the printed score. **Exit 0**: `metrics/eval-reports.jsonl` gained a row — commit only that path on a branch and open a PR titled `chore(metrics): eval baseline <date>` labeled `has-pr`, or the row dies with this ephemeral checkout; the row's `costUsd` is the CLI's API-equivalent figure, not billed spend, and its `costBasis` field says so. **Exit 1** is a genuine run whose pass rate regressed — file a `ready` issue. **Exit 2** is `suiteDidNotRun` (0 turns / $0 cost) and under `--adapter claude-cli` it is a FAILURE, never an expected no-op: the `claude` binary is missing from PATH, has no login, or refused to start in this sandbox. Search open issues for the exact title `ci-fix: weekly eval checkpoint did not run under claude-cli`; if none is open, file it with labels `ci-fix` and `ready-for-human` (not `ready` — the fix is environmental and no agent PR can make it), quoting the command's stderr diagnostic line and the `Excluded (did not run)` line; if one is open, add a comment with today's date and the same two lines. Record the exit-2 outcome as a failure in step 5's log entry. Never report an exit-2 run as a baseline. This is the only scheduled eval; on the subscription it consumes plan quota, not API dollars.

- Failure modes: the routine runs in Claude Code Remote — no `gh`; it files/searches via `mcp__github__*` as it already does for its `ready` issues (gotchas § Claude Code Remote). If issue search itself fails, the step-5 log entry is the fallback record and must still say FAILURE.

### Drift guard (`scripts/__tests__/routine-eval-adapter.test.mjs`)

- Input: the three guarded files and the two code files, read from disk relative to `scripts/__tests__` (`resolve(__dirname, "../..")`, the precedent's root convention).
- Output: for each guarded file, every line containing `agent eval` also contains `--adapter claude-cli`, and at least one such line exists (never a vacuous pass); `claude-cli-adapter.ts` contains `readonly name = "claude-cli"`; `agent-eval.ts` contains `"claude-cli"` inside the `VALID_ADAPTERS` array; `mbe-weekly-improve.md` contains the exact issue title above and does not contain `treat it as a silent no-op`.
- Failure modes: the assertion message names the file and the offending line, and says to add the flag or delete the stale mention — the `workflow-coverage.test.ts` style. Runs under the `scripts` vitest project (already in CI's `test` job), so no workflow wiring and no `check-orphaned-tests` allowlist entry.

### Live trigger update (Ship; remote, one-shot)

- Input: merged `docs/routines/mbe-weekly-improve.md`; trigger id `trig_01G12wULcCweXSb2jmVkChPW`.
- Procedure: (1) read the trigger and save the current prompt; (2) `update_trigger` with the ENTIRE fenced prompt as `prompt` — all five steps and the trailer, never a fragment (if the environment offers only the raw job_config API, resend every field just read back, per the memory rule); (3) read back; (4) byte-diff the returned prompt against the doc's fenced block — zero diff or stop; (5) confirm cron `0 14 * * 5`, model `claude-opus-5`, and environment id are unchanged in the read-back.
- Failure modes: HTTP 200 with a divergent read-back (the 2026-07-31 incident class) → re-apply once, then stop and surface with both texts; length/quoting rejection → stop and surface (the doc is not shortened to fit). Not retried in a loop.

## Stack & dependencies

- TypeScript in `@mbe/agent-core` + `@mbe/cli`, vitest — the existing eval stack; no new dependency.
- One new `.mjs` test under `scripts/__tests__` — house style for repo-file drift guards; no YAML parser (plain text scalars, as `pulumi-cli-pin.test.mjs` notes).
- Zod not needed — `CostBasis` is a closed TS union over an existing union; no external input crosses this seam.
- Gates the change touches: `pnpm --dir packages/agent-core test|typecheck|lint`, `pnpm --dir tools/cli test|typecheck|lint`, `pnpm --dir scripts test` (or root `vitest --project` for the scripts project). `packages/agent-core` and `tools/cli` both carry tracked `llms.txt`/`llms-full.txt`, so `pnpm build --filter @mbe/cli... && pnpm regen` after the code edits, staged by explicit path (gotchas § Build). Docs edits need `pnpm exec prettier --check docs/routines docs/scheduled-tasks.md docs/fixes/agent-eval-claude-cli-caller packages/agent-core/eval-suite/README.md .claude/skills/optimize-implement-queue/SKILL.md` before the PR (gotchas § CI, docs-only poisoning).

## Decisions & alternatives

- **Per-adapter `CostBasis` with the cost arm applied only when `billed`** over _re-baselining `maxCostUsd`_ — budgets are shared with the billed SDK adapter, and the turn-1 context floor grows with every rules edit, so any number is re-broken later.
- Over _dropping `costUsd` for claude-cli in the parser_ (make it cost-blind like gemini) — throws away a real figure #5670 deliberately parsed and pinned in `claude-cli-adapter.test.ts`; loses the per-adapter cost trend `--max-cost-regression` already supports; `recordSpend` and `taskDidNotRun` would then lean on turns alone.
- Over _per-adapter budgets in task JSON_ (`maxCostUsdByAdapter`) — task definitions (policy) would import adapter names (detail), every new task needs N numbers, and the claude-cli number would still be a fiction.
- Over _forwarding `--max-budget-usd` to the CLI_ (the flag exists) — it would stop the agent at $0.50 of API-equivalent spend, i.e. right after loading context, guaranteeing task failure.
- Over _subtracting a measured context-overhead constant_ — a magic number that drifts with repo size and hides real cost movement.
- Over _an adapter-declared `costBasis` property on `AgentAdapter`_ — purer dependency direction, but `FailoverSessionAdapter` (`auto`) has no single answer, and it touches five adapter classes plus test doubles for a fact with exactly one consumer; the eval already keys adapter-specific knowledge by `AdapterType` (`noRunMessage`, `loadCostBaseline`). Revisit if a second consumer (e.g. `mbe agent run`'s budget gate) needs it.
- **Three basis values, not two** — `none` (gemini, no figure) and `api-equivalent` (claude-cli, real figure, not billed) collapse to the same budget behaviour but mean different things to a row's reader; the distinction costs one enum member and makes gemini's existing vacuous pass a named fact instead of an accident.
- **Exit-2 issue labelled `ci-fix` + `ready-for-human`** over _`ready`_ (would dispatch an implement-queue worker at an unfixable sandbox problem) and over _log-only_ (today's shape; the log is read weekly at best). Deterministic title without a date, comment on recurrence — `scheduled-workflow-health.mjs`'s convention, hand-executed by the prompt.
- **No `--threshold` this run** over _adding one_ — zero rows exist and the default suite has one task, so any value is a coin-flip policy; kept as an Operate seed.
- **Guard reads text, no imports** over _importing `VALID_ADAPTERS`_ — it is not exported and `tools/cli/dist` is not guaranteed in the scripts project; precedent says text.
- **Verify row not committed** over _committing it as the first baseline_ — different machine, different `~/.claude` context, and (see assumptions) possibly a harness-broken `testsPass`; the first Friday row is the honest baseline.
- **Live update = whole prompt, read back, byte-diff** — reconciles the brief's "resend full job_config" with `scheduled-tasks.md`'s field-scoped `update_trigger`; the invariant both protect is "never send a partial prompt, never trust a 200".
- **Adjacent surfaces deliberately left as-is** (each a seed candidate, none in scope): `run-cli-adapter-session.ts` still emits `session:budget_breach` on every claude-cli run (observe-only, `enforceBudget` defaults false); `recordSpend` ledgers the API-equivalent figure as spend under claude-cli, so `.claude/agent-spend/sessions.jsonl` over-counts; the excluded task still prints `score 33%`; `tools/cli/CLAUDE.md`'s `--adapter` list omits `claude-cli`; the `verify()` checkout-in-repoPath defect (assumptions).

## Traceability

| Requirement (defect.md target / brief criterion)                                                                                                 | Component(s)                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| 1 — `--task example-bugfix --adapter claude-cli` scores (exit 0/1), one row, `adapter: "claude-cli"`, `numTurns > 0`, honest `withinBudget`/cost | Cost basis; Eval command wiring (row `costBasis`)                         |
| 2 — step 4 invokes `--adapter claude-cli`, exit 2 no longer "expected"; live matches byte-for-byte                                               | Routine prompt step 4; Live trigger update                                |
| Target 1 — exit 2 under claude-cli surfaced as a failure, exit 1 unchanged                                                                       | Routine prompt step 4 (issue + log); Eval command wiring (`noRunMessage`) |
| 3 — a test fails if the doc regresses to the SDK default                                                                                         | Drift guard                                                               |
| 4 — local row not committed unless decided otherwise                                                                                             | Decision recorded (assumptions); Verify procedure                         |
| 5 — gates green, llms regen                                                                                                                      | Stack & dependencies                                                      |
| Brief § Blast radius — evening step 3 same defect; scheduled-tasks mirror text                                                                   | Secondary callers; Intent mirror                                          |

## ADRs

None — no decision met the bar. The cost-basis rule is one pure function and a map (cheap to reverse), it follows the already-recorded per-adapter precedent (#4218), and the trade-off is real but small; the one-line records above are enough.
