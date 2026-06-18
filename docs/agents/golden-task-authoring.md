# Authoring Golden Tasks

Golden tasks are fixed, versioned benchmark cases used by `mbe agent eval` to measure agent capability across task categories. This document explains the fixture shape, rubric fields, how scoring works, and the workflow for adding a new task.

## Suite location

All golden tasks live in:

```
packages/agent-core/eval-suite/
```

Each file is a single JSON object. The filename should match the task `id` (e.g. `fix-login-redirect.json` for id `fix-login-redirect`).

## Task fixture shape

```json
{
  "id": "unique-kebab-case-id",
  "category": "bugfix",
  "prompt": "The instruction handed verbatim to the agent.",
  "fixtureRef": "services/reservations",
  "rubric": {
    "testsMustPass": true,
    "typecheckMustPass": true,
    "lintMustPass": false,
    "judgeCriteria": ["Criterion 1 phrased as an observable outcome", "Criterion 2"]
  },
  "budget": {
    "maxTurns": 40,
    "maxCostUsd": 1.0
  }
}
```

### Fields

| Field               | Type           | Required | Description                                                                                                                                            |
| ------------------- | -------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                | `string`       | yes      | Unique identifier across the suite. Used with `--task <id>` to run one task.                                                                           |
| `category`          | `TaskCategory` | yes      | See [categories](#categories) below.                                                                                                                   |
| `prompt`            | `string`       | yes      | The task description given to the agent. Write it as you would a real GitHub issue body: precise, self-contained, and free of ambiguity.               |
| `fixtureRef`        | `string`       | yes      | The workspace-relative path of the package the agent works in (e.g. `services/reservations`). Verification scripts run with `--filter ./<fixtureRef>`. |
| `rubric`            | `Rubric`       | no       | Defaults: `testsMustPass: true`, `typecheckMustPass: true`, `lintMustPass: false`, `judgeCriteria: []`.                                                |
| `budget.maxTurns`   | `number`       | no       | Default 50. How many agent turns the task may consume.                                                                                                 |
| `budget.maxCostUsd` | `number`       | no       | Default 1.00. Maximum spend allowed for this task.                                                                                                     |

## Categories

| Category       | When to use                                                                 |
| -------------- | --------------------------------------------------------------------------- |
| `bugfix`       | Fix an existing defect; typically includes a regression test.               |
| `refactor`     | Restructure code without changing observable behaviour.                     |
| `new-route`    | Add a new HTTP endpoint (or equivalent API surface) with tests.             |
| `dep-bump`     | Update one or more dependency versions across the monorepo.                 |
| `test-writing` | Add or expand tests for an under-tested module; no production code changes. |

## Rubric fields

### Deterministic checks

These run automatically by the harness after the agent finishes:

| Field               | Default | Meaning                                                                                                    |
| ------------------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| `testsMustPass`     | `true`  | `pnpm --filter ./<fixtureRef> test` must exit 0.                                                           |
| `typecheckMustPass` | `true`  | `pnpm --filter ./<fixtureRef> typecheck` must exit 0.                                                      |
| `lintMustPass`      | `false` | `pnpm --filter ./<fixtureRef> lint` must exit 0. Set `true` for tasks where lint correctness is the point. |

All deterministic checks that are `true` must pass, plus the agent must stay within `budget`, for `passed: true`.

### `judgeCriteria`

Free-text strings consumed by the LLM judge (added in a later slice). Each criterion should describe a single observable outcome:

- Good: `"The fix gates the cancellation email on the guest notification opt-in"`
- Bad: `"The code is clean"` (too vague for a judge to evaluate)

Keep criteria to 3–6 items. More than 6 dilutes the signal.

## How scoring works

```
score = satisfied_signals / applicable_signals   (0..1)
passed = every applicable signal is satisfied
```

**Applicable signals:**

- `withinBudget` — always applicable
- `testsPass` — when `rubric.testsMustPass` is `true`
- `typecheckPass` — when `rubric.typecheckMustPass` is `true`
- `lintPass` — when `rubric.lintMustPass` is `true`
- LLM judge signals — when `judgeCriteria` is non-empty (future slice)

The `EvalReport` aggregates scores across all tasks and breaks them down by category:

```json
{
  "aggregate": {
    "total": 5,
    "passRate": 0.8,
    "byCategory": {
      "bugfix": { "total": 1, "passRate": 1.0 },
      "refactor": { "total": 1, "passRate": 1.0 },
      "new-route": { "total": 1, "passRate": 1.0 },
      "dep-bump": { "total": 1, "passRate": 0.0 },
      "test-writing": { "total": 1, "passRate": 1.0 }
    }
  }
}
```

Use per-category pass rates to identify where the agent is weakest. A category with consistent 0% pass rate signals a prompt-engineering or model-routing gap, not a code defect.

## Writing a good prompt

1. **Be self-contained.** The agent receives only the prompt and the repo. Do not rely on implied context.
2. **Name specific files.** `"the buildPrBody function in services/agent/src/routes/sessions.ts"` is better than `"the PR body builder"`.
3. **Include acceptance conditions.** List what the correct solution looks like in plain language. These become your `judgeCriteria`.
4. **Scope to one concern.** A task that mixes a bugfix and a refactor is harder to score and harder to attribute failure.
5. **Set a realistic budget.** A dep-bump that touches one file needs 20 turns; a new route with tests may need 40. Over-budgeting inflates cost metrics without improving results.

## Adding a task — checklist

1. Create `packages/agent-core/eval-suite/<id>.json` with the fixture above.
2. Run `pnpm --dir packages/agent-core test` — the `loadSuite` test will reject malformed JSON or an invalid category immediately.
3. Run `pnpm --dir packages/agent-core typecheck` to confirm the suite still builds.
4. Run `mbe agent eval --task <id> --json` on a real agent session to baseline the expected score before merging.
5. Open a PR. The CI `pnpm test` gate covers the harness tests; no extra CI job is required.

## Running the suite

```bash
# Full suite
mbe agent eval --suite packages/agent-core/eval-suite

# One task
mbe agent eval --task fix-login-redirect

# Assert a minimum pass rate (exits 1 if below)
mbe agent eval --threshold 70

# JSON output (for dashboards)
mbe agent eval --json | jq '.aggregate.byCategory'
```
