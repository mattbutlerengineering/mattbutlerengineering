# Golden Task Authoring Guide

This guide explains how to add a new golden task to the agent eval harness.

## What is a golden task?

A golden task is a versioned, reproducible benchmark case the eval harness runs
through the agent to measure capability over time. The harness loads all tasks
from `packages/agent-core/src/eval/suites/`, runs each through the agent, scores
the result against a rubric, and aggregates into a report broken down both
overall and per category.

## Fixture shape

Each task is a single JSON file in `packages/agent-core/src/eval/suites/`.
The filename can be anything — the task is identified by its `id` field.

```json
{
  "id": "bugfix-off-by-one",
  "category": "bugfix",
  "prompt": "The pagination helper returns one extra item when limit equals …",
  "fixtureRef": "fixtures/bugfix-off-by-one",
  "rubric": {
    "testsMustPass": true,
    "typecheckMustPass": true,
    "lintMustPass": false,
    "judgeCriteria": [
      "The fix changes only the pagination logic, not the calling code.",
      "A regression test is added or updated to cover the off-by-one case."
    ]
  },
  "budget": {
    "maxTurns": 20,
    "maxCostUsd": 0.25
  }
}
```

### Required fields

| Field        | Type     | Description                                                                      |
| ------------ | -------- | -------------------------------------------------------------------------------- |
| `id`         | `string` | Unique task identifier. Use `<category>-<slug>` as a convention.                 |
| `category`   | enum     | One of `bugfix`, `refactor`, `new-route`, `dep-bump`, `test-writing`.            |
| `prompt`     | `string` | The instruction handed verbatim to the agent. Be concrete and self-contained.    |
| `fixtureRef` | `string` | Identifier for the code fixture the agent edits (repo subdir, branch ref, etc.). |

### Optional fields (all have defaults)

| Field                      | Default | Description                                                          |
| -------------------------- | ------- | -------------------------------------------------------------------- |
| `rubric.testsMustPass`     | `true`  | Agent must leave the test suite green.                               |
| `rubric.typecheckMustPass` | `true`  | TypeScript must be error-free after the change.                      |
| `rubric.lintMustPass`      | `false` | ESLint must be clean. Enable for lint-focused tasks.                 |
| `rubric.judgeCriteria`     | `[]`    | Free-text acceptance criteria evaluated by an LLM judge (see below). |
| `budget.maxTurns`          | `50`    | Maximum agent turns before the task is aborted.                      |
| `budget.maxCostUsd`        | `1.00`  | Maximum spend in USD before the task is aborted.                     |

## Categories

Each task must be tagged with exactly one category. The eval report groups
results by category so you can see per-category pass rates.

| Category       | Use for                                                         |
| -------------- | --------------------------------------------------------------- |
| `bugfix`       | Fixing a specific defect with a clear expected outcome.         |
| `refactor`     | Restructuring code without changing external behaviour.         |
| `new-route`    | Adding a new API route or endpoint end-to-end.                  |
| `dep-bump`     | Updating a dependency version and verifying compatibility.      |
| `test-writing` | Adding or expanding test coverage for existing production code. |

## Rubric fields

### Deterministic checks

`testsMustPass`, `typecheckMustPass`, and `lintMustPass` are evaluated
mechanically by running the relevant commands after the agent completes. They
are cheap and always accurate.

Use `lintMustPass: true` only when the task goal relates to code style (e.g.
an ESLint rule violation fix) — it adds signal without cost. For most tasks the
default `false` is correct.

### LLM judge criteria (`judgeCriteria`)

When `judgeCriteria` is non-empty and a judge function is injected, an LLM
reviews the diff against each criterion and returns a pass/fail verdict. This
signal is in addition to the deterministic checks.

Write each criterion as a self-contained, falsifiable assertion about the diff:

```json
"judgeCriteria": [
  "A new named function `formatSourceFiles` is exported or used internally.",
  "The body of `buildSystemPrompt` is shorter after the extraction.",
  "No behaviour changes — the output of `buildSystemPrompt` is identical."
]
```

Avoid vague criteria like "the code is clean" — they produce inconsistent judge
results. Prefer observable properties of the diff.

## How scoring works

The scorer applies rubric signals in order:

1. `testsMustPass` (if enabled) — checks `testsPass`
2. `typecheckMustPass` (if enabled) — checks `typecheckPass`
3. `lintMustPass` (if enabled) — checks `lintPass`
4. Budget (always) — checks `withinBudget`
5. LLM judge (if `judgeCriteria` non-empty and judge is provided) — one signal

`score` is the fraction of applicable signals that are satisfied (0..1).
`passed` is `true` only when every applicable signal is satisfied.

The overall `EvalReport` aggregates all task scores into:

- `aggregate` — overall pass rate, mean score, mean cost, mean turns, stuck count
- `byCategory` — the same aggregate broken down by `category` tag

## Step-by-step: adding a task

1. Pick a unique `id` using the `<category>-<slug>` convention.
2. Choose the correct `category` from the table above.
3. Write a `prompt` that is fully self-contained — the agent receives only the
   prompt and the fixture; do not assume any context the agent cannot read.
4. Set `fixtureRef` to identify the code state the agent should work against.
5. Tune the `rubric` — start with defaults, add `judgeCriteria` for non-trivial
   acceptance criteria, and lower `budget.maxTurns` / `budget.maxCostUsd` for
   simple tasks.
6. Create the file at `packages/agent-core/src/eval/suites/<id>.json`.
7. Run `pnpm --dir packages/agent-core test` and confirm the bundled suite tests
   (`bundled golden suite`) still pass.
8. Run `pnpm --dir packages/agent-core typecheck` to confirm no type errors.

## Running the suite locally

```bash
# Run the full eval suite (dry-run: loads tasks, does not invoke the agent)
pnpm --dir packages/agent-core test -- src/eval/golden-task-set.test.ts

# Run a single task through the harness
mbe agent eval --suite golden --only <task-id>
```

## Dos and don'ts

- **Do** write a prompt that is reproducible — it should behave the same way
  every time the agent runs it.
- **Do** set a tight `budget` for simple tasks; leave headroom for complex ones.
- **Do** add `judgeCriteria` when the expected diff has non-obvious correctness
  properties that tests cannot verify mechanically.
- **Don't** make `fixtureRef` point to a moving target (e.g. `HEAD` on main) —
  use a pinned ref or subdir so the task is stable across runs.
- **Don't** duplicate task ids — the loader rejects the suite if two tasks share
  an id.
