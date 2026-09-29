---
stage: capture
run: maintenance:agent-eval-claude-cli-caller
date: 2026-09-28
re-entry: architect
re-entry-reason: "Wiring the caller to `--adapter claude-cli` is one line, but under that adapter every suite task fails `withinBudget` from its first turn (budgets are $0.40-0.50; the brief measured a one-turn CLI call on this repo at $1.37 of API-equivalent cost) — the cost basis is a design decision with at least three viable mechanisms, and a naive wiring ships a scored-and-wrong 0% baseline, which is worse than today's non-run."
origin: "docs/backlog.md line 6 (from: #4199), claimed 2026-09-28 as maintenance:agent-eval-claude-cli-caller"
assumptions:
  - "The cost-mismatch figure (one-turn `claude -p` on this repo reporting `total_cost_usd: 1.3723`, driven by 68,479 cache-creation tokens) is the brief's own 2026-09-28 session measurement and was NOT re-run here — a probe is real CLI spend outside the single Verify task the brief authorizes. Architect or Verify may re-measure before relying on the exact number; the mechanism (parser passes `total_cost_usd` straight through to `costUsd`) was measured here."
  - "`docs/routines/mbe-evening.md` step 3 — which fires a bare `mbe agent eval` only on a flagged queue-efficiency regression — is treated as a secondary caller with the same defect and in scope for the same adapter wiring; the brief left it as 'check whether it needs it', and the check (below) says it does."
---

# Condition: the weekly eval checkpoint has no caller that can succeed

<!-- Condition brief (degraded, not broken): the checkpoint exists, runs every
     Friday, and is structurally unable to write a row. Filename stays defect.md
     per the protocol. -->

## Condition

**Observed.** `metrics/eval-reports.jsonl` is 0 bytes and has been since it
was created (#4116; last commit touching it is `c99e6333e`, #3742, which only
moved it). The only scheduled caller — `docs/routines/mbe-weekly-improve.md`
step 4, mirrored in the live `mbe-weekly-improve` RemoteTrigger
(`trig_01G12wULcCweXSb2jmVkChPW`, cron `0 14 * * 5`) — invokes
`node tools/cli/dist/index.js agent eval` with no `--adapter`, which resolves
to the default `"claude"`: the **SDK** adapter, whose `isAvailable()` needs
`ANTHROPIC_API_KEY`. The sandbox has no such key by standing decision (#3571,
#3585), so every Friday the command exits 2 (`suiteDidNotRun`) and the
routine's own prompt tells it to log that as an expected no-op.

The adapter that CAN run in that sandbox exists: PR #5670 (merged
2026-09-22T04:53Z) added `ClaudeCliAdapter` (`name: "claude-cli"`, spawns the
`claude` binary headless with `-p … --output-format json
--permission-mode bypassPermissions`, parses real cost/turns). `agent-eval.ts`
already accepts it (`VALID_ADAPTERS` line 40; `--option` help line 63). It is
explicitly selectable only, deliberately outside the `auto` cascade
(ADR-017). **Nothing passes it.** Issue #3585 (Option A = CLI adapter) and
#4199 both closed 2026-09-23T19:15Z, one adapter-merge later, with the caller
untouched.

**Target state that ends the run.**

1. `mbe-weekly-improve` step 4 (doc + live trigger, byte-for-byte for that
   step) invokes `--adapter claude-cli`, and under that adapter exit 2 is
   surfaced as a failure, never logged as fine. Exit 1 keeps its
   genuine-regression meaning.
2. A claude-cli run of `--task example-bugfix` is scored **honestly** — its
   `withinBudget` / cost fields reflect a cost basis Architect chose, not a
   guaranteed fail from the first turn (see hypothesis 2).
3. A small guard fails when the routine prompt's eval invocation drifts back
   to the SDK default.
4. The committed sink is left as-is unless Architect/Ship decide a local
   macOS row is a valid baseline; default is to let the first Friday run
   (2026-10-02 14:00 UTC) write it.

## Reproduction / Evidence

All commands run 2026-09-28 in this worktree (`fix/agent-eval-claude-cli-caller`
off `origin/main` `35517bbae`).

**Non-run reproduced.** After `pnpm build --filter @mbe/cli...`
(`Tasks: 6 successful, 6 total`, `build_exit=0`):

```
$ env -u ANTHROPIC_API_KEY node tools/cli/dist/index.js agent eval; echo "exit=$?"
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
$ wc -c metrics/eval-reports.jsonl
       0 metrics/eval-reports.jsonl
```

`git status --short metrics/eval-reports.jsonl` printed nothing — unchanged.
(A Langfuse "metadata.task over 200 chars" warning and a Claude SDK
`CLAUDE_SDK_CAN_USE_TOOL_SHADOWED` warning preceded the report; neither
affects the outcome.)

**Caller drift.** Every reference to the command is a prose prompt; none
passes an adapter:

```
$ grep -n 'agent eval' docs/routines/mbe-weekly-improve.md docs/routines/mbe-evening.md docs/scheduled-tasks.md
docs/routines/mbe-evening.md:24:3. … If it flags a regression, file de-duplicated `ready` issues and trigger `mbe agent eval` asynchronously (never block this run on eval). …
docs/routines/mbe-weekly-improve.md:26:4. Weekly eval checkpoint: … Invoke it as `pnpm build --filter @mbe/cli... && node tools/cli/dist/index.js agent eval` … **Exit 2** is `suiteDidNotRun` (0 turns / $0 cost, no `ANTHROPIC_API_KEY`), which is the expected result in this sandbox per the #3571 decision not to provision eval credentials here — treat it as a silent no-op, never file an issue for it, and never report it as a baseline. …
docs/scheduled-tasks.md:308:  3. **Weekly eval checkpoint:** runs `mbe agent eval` once against the agent
docs/scheduled-tasks.md:311:     Files a `ready` issue only when `mbe agent eval` exits **1** (a genuine
docs/scheduled-tasks.md:318:    credentials. In that environment `mbe agent eval` exits **2**
docs/scheduled-tasks.md:449:     learning-loop sensor→issue pipeline, **and** fires an `mbe agent eval` run
docs/scheduled-tasks.md:476:> - [x] The weekly `mbe agent eval` checkpoint is in the `mbe-weekly-improve` prompt
docs/scheduled-tasks.md:507:> `mbe agent eval` checkpoint inside `mbe-weekly-improve` (still one Friday run);
```

`grep -rn 'agent eval' .github/workflows scripts` finds only a
"**Do NOT** run `mbe agent eval` synchronously" comment in
`scripts/optimize-implement-queue.mjs:171` — no workflow and no script
invokes it.

**The adapter exists and is accepted, but is opt-in only:**

```
$ grep -n 'claude-cli' tools/cli/src/commands/agent-eval.ts packages/agent-core/src/adapters/claude-cli-adapter.ts | head
tools/cli/src/commands/agent-eval.ts:40:  "claude-cli",
tools/cli/src/commands/agent-eval.ts:63:  .option("--adapter <type>", "Agent adapter: auto, claude, claude-cli, gemini, opencode", "claude")
packages/agent-core/src/adapters/claude-cli-adapter.ts:8: * explicitly selectable only (`--adapter claude-cli`) — it is NOT part of
packages/agent-core/src/adapters/claude-cli-adapter.ts:19:  readonly name = "claude-cli";
```

**The Friday no-op is on record.** `.claude/improvement-loop/log.md:2280`:
"`agent eval` → **exit 2** (`suiteDidNotRun`, `Excluded (did not run): 1`,
0 turns / $0.00, no `ANTHROPIC_API_KEY`). Expected sandbox no-op per the
standing #3571 decision … **No issue filed, no baseline reported,
`metrics/eval-reports.jsonl` unchanged**". `docs/scheduled-tasks.md:315-323`
codifies the same exit-2-is-fine clause.

**Budget scoring vs. CLI-reported cost (evidence for hypothesis 2).**
`tools/cli/src/commands/agent-eval.ts:300-301`:

```ts
const withinBudget =
  session.costUsd <= task.budget.maxCostUsd && session.numTurns <= task.budget.maxTurns;
```

Every suite task's budget (`jq '{id, budget}'`): `example-bugfix`
`{maxTurns:20, maxCostUsd:0.5}`, `cost-001-bugfix` `{20, 0.5}`,
`cost-002-refactor` `{15, 0.4}`, `cost-003-test-writing` `{15, 0.4}`.
`packages/agent-core/src/adapters/cli-usage-parser.ts:228` maps the CLI's
`total_cost_usd` straight to `costUsd` with no adjustment. The brief's
2026-09-28 probe (not re-run here — see `assumptions`) had a **one-word,
one-turn** `claude -p` on this repo report `total_cost_usd: 1.3723`
(`cache_creation_input_tokens: 68479`), i.e. the repo's CLAUDE.md/rules/skills
context alone is ~3x every task's whole budget. Subscription auth bills no
dollars, but the scorer cannot tell.

**Provenance (gh, 2026-09-28):** PR #5670 `MERGED` 2026-09-22T04:53:21Z
"feat(agent-core): add ClaudeCliAdapter for the claude CLI (#3585 Option A)";
issue #3585 `CLOSED` 2026-09-23T19:15:48Z; issue #4199 `CLOSED`
2026-09-23T19:15:51Z. `gh secret list | grep -i anthropic` → no match
(exit 1): no `ANTHROPIC_API_KEY` repo secret exists. Locally `claude` is
`/Users/mbutler/.local/bin/claude`, `2.1.284 (Claude Code)`.

**Work already in flight — check ran, nothing matched.**
`gh pr list --state open --limit 50` (exit 0) returned five PRs: #5881
(acmm daily audit, bot), #5879 (tier:trivial policy for acmm data), #5848
(chaos synthetic bug), #5846 (dependabot production-deps), #5845 (dependabot
codeql-action). None touches `agent eval`, the routines, or the adapter.

## Root-cause hypothesis

Labelled hypotheses, not findings.

1. **The caller was never updated after the adapter landed.** #4199 was
   closed alongside #3585 when #5670 merged the adapter, but the only
   scheduled caller (the routine prompt, plus its `scheduled-tasks.md`
   mirror) still invokes the SDK default, and its exit-2 clause codifies the
   non-run as expected. Nothing tests that the routine prompt names a
   runnable adapter, so doc and code drifted with every gate green — the
   same "shipped ≠ run" class already recorded in memory and gotchas.
2. **Even with the adapter wired, the first real run scores 0% on
   `withinBudget`.** Mechanism measured (scorer line, budgets, parser
   pass-through); magnitude from the brief's probe. So a one-line wiring
   fix produces a scored-and-wrong baseline — worse than the current loud
   non-run, because it would be committed as the first row. This is why the
   run re-enters at Architect: candidate mechanisms include a per-adapter
   cost basis, treating the CLI's figure as API-equivalent-not-billed, or
   re-baselining budgets for CLI runs; none is picked here.
3. (Minor, observed) the excluded task still prints `score 33%` — plausibly
   `withinBudget` passing vacuously on a $0 / 0-turn non-run while the three
   verify checks fail. Cosmetic today; worth a glance once real rows exist.

## Blast radius

- **Who:** the autonomous improvement loop's only slow-drift quality sensor.
  No end user, no production service, no deploy path is touched.
- **Since:** #4116 (creation of the sink). Every weekly checkpoint since has
  been a no-op; the sink has 0 rows. `.claude/improvement-loop/log.md:2280`
  is the most recent recorded instance.
- **Surfaces the fix touches:** `docs/routines/mbe-weekly-improve.md` step 4
  and the LIVE RemoteTrigger prompt it mirrors (resend full `job_config`);
  `docs/scheduled-tasks.md` § mbe-weekly-improve lines ~308-323 (the #3571
  exit-2 paragraph); `docs/routines/mbe-evening.md` step 3 (secondary,
  conditional caller — same fix shape); possibly
  `tools/cli/src/commands/agent-eval.ts` and/or
  `packages/agent-core/src/adapters/claude-cli-adapter.ts` /
  `cli-usage-parser.ts` for the cost basis; a new guard test.
  `scripts/metrics-store.mjs` unchanged.
- **Scale for Review/Ship:** small. Docs + one prompt update + a bounded
  code change + one test. Release authorization (brief): merge via the
  normal gated path, then update the one trigger — nothing else.

## Ruled out

- **Provisioning `ANTHROPIC_API_KEY`** (repo secret, sandbox, CI
  `workflow_dispatch`): decided against in #3571/#3585; measured absent
  today. Contradicts the keyless-CI decision — do not reopen.
- **Writing a CLI adapter:** exists (#5670). Do not write a second one.
- **Making `claude-cli` the default or adding it to `auto`:** #5670 kept it
  explicit-only so `auto` never changes where it already works; the brief
  rejects this. Out of scope.
- **Retiring the checkpoint and deleting the sink:** throws away the
  capability #5670 just built; brief rejects.
- **`pnpm exec mbe` / `mbe` on PATH:** never linked (gotchas § Build). Always
  `pnpm build --filter @mbe/cli...` then `node tools/cli/dist/index.js`.
- **Nested-session blocking of `claude -p`:** refuted locally by the brief's
  probe (`CLAUDECODE=1`, returned `stop_reason: end_turn`). **Not verified in
  the claude.ai RemoteTrigger sandbox** — cannot be from this machine; the
  first scheduled run after Ship is the proof (Operate captures it).

## Notes

- **Reproduction side effect (2026-09-28):** the non-run still appended one
  row to the tracked spend ledger `.claude/agent-spend/sessions.jsonl`
  (`"timestamp":"2026-09-29T03:27:05.458Z","costUsd":0,"adapter":"claude","status":"failed","inputTokens":0`).
  Verify's one real `claude-cli` run will append there too — stage that file
  deliberately (or `git checkout --` it), never by accident; and note a
  never-ran session is ledgered as `failed`/$0, the same shape a genuine $0
  failure would have.
- **Known unknowns carried forward** (from the brief; none blocks Architect):
  whether the RemoteTrigger sandbox has `claude` on PATH with subscription
  auth; whether a `claude-cli` session produces a branch the eval's
  `verify()` (`git checkout <branch>` + `pnpm --filter ./<fixtureRef>
test|typecheck|lint`) can run against; whether the CLI accepts
  `DEFAULT_SESSION_CONFIG.model` (`resolveModelId("sonnet")`,
  `packages/agent-core/src/types.ts:93`) as forwarded via `--model`.
- **Guard-test candidates** (for Architect): the repo already has
  read-the-real-file drift tests — `apps/rialto-web/e2e/workflow-coverage.test.ts`,
  `scripts/__tests__/pulumi-cli-pin.test.mjs` — and a routine catalog
  reader (`scripts/routine-manifest.mjs`'s `parseRoutineCatalog`, exercised
  by `scripts/__tests__/routine-liveness.test.mjs`) that is the natural home
  for "the weekly-improve eval invocation names a runnable adapter".
- **Verify spend** is fixed by the brief: exactly one real task,
  `--task example-bugfix --adapter claude-cli`, run from this worktree's root
  so `findMonorepoRoot` resolves to this worktree's `metrics/`. `--suite cost`
  is not authorized.
- Tracker: no mirror for this run (brief decision). #3585 / #4199 / #5670 are
  cited as provenance only; nothing is created or reopened.
