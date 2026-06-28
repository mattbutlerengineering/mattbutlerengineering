# Golden-task eval suite — authoring guide

This directory holds the **golden-task suite**: a versioned set of fixed,
representative tasks the agent is run against so a change to a prompt, model,
budget policy, or gate can be measured as a regression or improvement *before*
it ships. Run it with:

```bash
mbe agent eval                       # run the whole suite
mbe agent eval --task example-bugfix # run one task by id
mbe agent eval --json                # machine-readable EvalReport
mbe agent eval --threshold 80        # exit non-zero if pass rate < 80%
mbe agent eval --calibrate           # also print self-grade vs ground-truth calibration
mbe agent eval --suite <dir>         # point at a different suite directory
```

Reports are appended to `docs/logs/eval-reports.jsonl` (same append-only pattern
as `mbe stats`), so suite quality can be charted over time.

## Adding a golden task

A task is a single JSON file in this directory (or a subdirectory — the loader
recurses). Growing coverage is meant to be cheap: drop a file in, no code change.

Copy [`example-bugfix.json`](./example-bugfix.json) as a starting point. The
schema is defined and validated by `taskSchema` in
[`../src/eval/types.ts`](../src/eval/types.ts) — a malformed file fails the load
with a clear Zod error rather than scoring as a silent zero.

### Fields

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `id` | yes | string (non-empty) | Unique across the suite. Used by `--task <id>` and in the report. Duplicate ids fail the load. |
| `category` | yes | enum | One of `bugfix`, `refactor`, `new-route`, `dep-bump`, `test-writing`. Lets you see which kinds of work the agent is strong/weak at. |
| `prompt` | yes | string (non-empty) | The instruction handed to the agent — write it exactly as a real task ticket would read. |
| `fixtureRef` | yes | string (non-empty) | The fixture the task runs against (a repo subdir such as `services/reservations`, a ref, etc.). The harness runs each task in an isolated worktree so tasks don't contaminate each other. |
| `rubric` | no (defaults) | object | Objective expectations — see below. |
| `budget` | no (defaults) | object | `maxTurns` (default 50) and `maxCostUsd` (default 1). A run exceeding either fails the `withinBudget` check, so a quality gain that doubles cost is visible, not hidden. |

### Rubric

The rubric is how a task is **scored objectively** rather than on vibes. The
final score is the fraction of *applicable* signals satisfied; `passed` requires
all of them.

| Field | Default | Meaning |
|-------|---------|---------|
| `testsMustPass` | `true` | The target test command(s) must pass for the change to count. |
| `typecheckMustPass` | `true` | `pnpm typecheck` must be clean (vitest does NOT typecheck — keep this on). |
| `lintMustPass` | `false` | `pnpm lint` must be clean. Opt in when lint-cleanliness is part of the task. |
| `judgeCriteria` | `[]` | Free-text criteria an **LLM judge** scores for things a deterministic check can't express (e.g. "the fix gates the email on the opt-in flag"). Reuses the production `success-evaluator` judge. Leave empty for a purely deterministic task. |

Prefer **deterministic signals** (`testsMustPass` + a regression test in the
prompt) over `judgeCriteria` wherever you can — they need no LLM call, so they're
free, fast, and reproducible. Reach for `judgeCriteria` only for the part a
passing test can't prove.

### Worked example

```json
{
  "id": "example-bugfix",
  "category": "bugfix",
  "prompt": "A reservation cancellation email is sent even when the guest opted out of notifications. Fix the bug so opted-out guests receive no cancellation email, and add a regression test.",
  "fixtureRef": "services/reservations",
  "rubric": {
    "testsMustPass": true,
    "typecheckMustPass": true,
    "lintMustPass": false,
    "judgeCriteria": [
      "The fix gates the cancellation email on the guest's notification opt-in",
      "A regression test covers the opted-out path"
    ]
  },
  "budget": { "maxTurns": 40, "maxCostUsd": 1.0 }
}
```

## Authoring tips

- **Make the expected outcome checkable.** A good prompt asks for a change *and*
  a regression test, so `testsMustPass` does most of the scoring. The
  [`cost/`](./cost) tasks show this — each names the exact file and the edge case
  a test must cover.
- **Keep budgets realistic but tight.** Set `maxTurns`/`maxCostUsd` near what a
  competent run actually costs, so a regression that balloons cost trips the
  budget check.
- **Pick a stable `fixtureRef`.** Point at a subdir whose surrounding code won't
  churn out from under the task, or the task measures repo drift instead of the
  agent.
- **One behaviour per task.** Narrow tasks give a cleaner signal about *what*
  regressed than a sprawling multi-part prompt.
- **Tag the `category` honestly** so the per-category aggregates stay meaningful.

## What the harness produces

Each run emits an `EvalReport` (`../src/eval/types.ts`): per-task `TaskScore`
(passed, 0–1 score, deterministic checks, optional judge result, cost, turns)
plus a suite `aggregate` (pass rate, mean score, mean cost, mean turns, stuck
count). With `--calibrate`, it also pairs each task's self-reported
`success-evaluator` confidence against the ground-truth pass/fail, so you can
learn how far the agent's self-grade can be trusted.
