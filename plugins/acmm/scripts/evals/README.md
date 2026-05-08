# ACMM agent evals

Frozen task fixtures + rubric scorer for measuring agent quality across model and prompt changes.

> Why this exists: production metrics (PR acceptance, revert rate, CI flake) tell us how the agent is performing on a moving target. Evals run a **fixed task suite** so we can answer "did this prompt change / model upgrade actually help?"

## Usage

```bash
# Exercise the full pipeline without spending API $ (synthetic outcomes).
node scripts/acmm/evals/index.js --dry-run

# Run all tasks against the real agent. Each task spawns `mbe agent run --no-pr -v`.
node scripts/acmm/evals/index.js

# Run only one task.
node scripts/acmm/evals/index.js --task fix-typo-in-readme

# Print summary from existing JSONL (no run).
node scripts/acmm/evals/index.js --report
```

Results are appended to `metrics/acmm-evals.jsonl` (committed; same convention as `metrics/acmm-pr-history.jsonl`).

## Task fixture shape

```jsonc
{
  "id": "fix-typo-in-readme", // stable identifier (filename should match)
  "prompt": "There is a typo …", // verbatim agent input
  "model": "claude-sonnet-4-6",
  "maxBudgetUsd": 0.1,
  "maxTurns": 8,
  "rubric": {
    "mustPass": ["lint"], // gates: "build" | "tests" | "lint"
    "diffSizeMax": 4, // additions + deletions
    "mustTouch": ["README.md"], // substring match against changed file paths
    "mustNotTouch": ["package.json"],
  },
}
```

Add a fixture by dropping a JSON file into `tasks/`. The runner picks them up automatically.

## Scoring

Each run produces a 0..1 weighted score:

| Criterion      | Weight | Pass condition                                     |
| -------------- | ------ | -------------------------------------------------- |
| `completed`    | 1.0    | Session reached terminal state without error       |
| `verification` | 1.0    | All `mustPass` gates passed                        |
| `diffSize`     | 0.5    | `diffSize <= rubric.diffSizeMax`                   |
| `filePaths`    | 0.5    | All `mustTouch` matched, no `mustNotTouch` matched |

A run is `success: true` if score ≥ 0.75 (configurable in `schema.js`).

Override weights per-task by adding `rubric.weights: { completed, verification, diffSize, filePaths }`.

## Reader

`scripts/acmm/evals.js` exports `measureEvals(cwd, opts)` returning an aggregated summary:

```js
{
  n: 12,
  passRate: 0.83,
  medianScore: 0.88,
  medianCostUsd: 0.07,
  medianTurns: 6,
  perModel: { 'claude-sonnet-4-6': { n: 10, passRate: 0.85, medianScore: 0.9 } },
  status: 'green',  // ≥80% pass = green, ≥50% = yellow, else red; "unknown" if n<3
  lastRun: '2026-04-26T...'
}
```

Status bands assume each task is small enough that 100% pass rate is realistic — if you start tracking harder tasks, lower the green threshold in `evals.js`.

## What's intentionally minimal

- **No LLM-as-judge** (yet). Only mechanical checks — gates, diff size, touched files. Add `evaluateSuccess: true` task field + a judge weight when ready.
- **No concurrency**. Tasks run serially. Each spawns its own worktree via the agent CLI; parallel runs would compete for `git worktree add` locks. Add `--concurrency N` if needed once tasks are stable.
- **No CI workflow** in this PR. Real-eval runs cost API $; gate that behind a deliberate trigger (e.g., weekly + on `model:` config change).

## Curating the task suite

Frozen fixtures rot — the codebase moves under them. Quarterly: re-run with the latest model and review which tasks have become trivial (always pass) or impossible (always fail), and replace them. A healthy suite has ~30–70% spread.
