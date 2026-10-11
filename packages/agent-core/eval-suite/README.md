# Golden-task eval suite — authoring guide

This directory holds the **golden-task suite**: a versioned set of fixed,
representative tasks the agent is run against so a change to a prompt, model,
budget policy, or gate can be measured as a regression or improvement _before_
it ships. Run it with:

```bash
mbe agent eval                       # run the whole suite
mbe agent eval --task example-test-writing # run one task by id
mbe agent eval --json                # machine-readable EvalReport
mbe agent eval --threshold 80        # exit non-zero if pass rate < 80%
mbe agent eval --calibrate           # also print self-grade vs ground-truth calibration
mbe agent eval --suite <dir>         # point at a different suite directory
```

Reports are appended to `metrics/eval-reports.jsonl` (same append-only pattern
as `mbe stats`), so suite quality can be charted over time.

## Adding a golden task

A task is a single JSON file at the **top level** of this directory — the
loader does not recurse into subdirectories. Growing coverage is meant to be
cheap: drop a file in, no code change.

Subdirectories here are separate, explicitly-registered named suites, not
extra coverage for the default suite — [`cost/`](./cost) is the example,
wired up in [`../src/eval/cost-suite.ts`](../src/eval/cost-suite.ts) and run
via `mbe agent eval --suite cost`. A `*.json` file dropped into an
unregistered subdirectory is checked in, valid, and never runs.

Copy [`example-test-writing.json`](./example-test-writing.json) as a starting point. The
schema is defined and validated by `taskSchema` in
[`../src/eval/types.ts`](../src/eval/types.ts) — a malformed file fails the load
with a clear Zod error rather than scoring as a silent zero.

### Fields

| Field        | Required      | Type               | Notes                                                                                                                                                                                                                                                                                                                                                                               |
| ------------ | ------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`         | yes           | string (non-empty) | Unique across the suite. Used by `--task <id>` and in the report. Duplicate ids fail the load.                                                                                                                                                                                                                                                                                      |
| `category`   | yes           | enum               | One of `bugfix`, `refactor`, `new-route`, `dep-bump`, `test-writing`. Lets you see which kinds of work the agent is strong/weak at.                                                                                                                                                                                                                                                 |
| `prompt`     | yes           | string (non-empty) | The instruction handed to the agent — write it exactly as a real task ticket would read.                                                                                                                                                                                                                                                                                            |
| `fixtureRef` | yes           | string (non-empty) | The fixture the task runs against (a repo subdir such as `services/reservations`, a ref, etc.). The harness runs each task in an isolated worktree so tasks don't contaminate each other.                                                                                                                                                                                           |
| `rubric`     | no (defaults) | object             | Objective expectations — see below.                                                                                                                                                                                                                                                                                                                                                 |
| `budget`     | no (defaults) | object             | `maxTurns` (default 50) and `maxCostUsd` (default 1). A run exceeding either fails the `withinBudget` check, so a quality gain that doubles cost is visible, not hidden. Under a non-`billed` cost basis (e.g. `--adapter claude-cli`, whose CLI-reported figure is not billed on a subscription login) only `maxTurns` is enforced; `costUsd` is still recorded on the task score. |

### Rubric

The rubric is how a task is **scored objectively** rather than on vibes. The
final score is the fraction of _applicable_ signals satisfied; `passed` requires
all of them.

| Field               | Default | Meaning                                                                                                                                                                                                                                      |
| ------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `testsMustPass`     | `true`  | The target test command(s) must pass for the change to count.                                                                                                                                                                                |
| `typecheckMustPass` | `true`  | `pnpm typecheck` must be clean (vitest does NOT typecheck — keep this on).                                                                                                                                                                   |
| `lintMustPass`      | `false` | `pnpm lint` must be clean. Opt in when lint-cleanliness is part of the task.                                                                                                                                                                 |
| `judgeCriteria`     | `[]`    | Free-text criteria an **LLM judge** scores for things a deterministic check can't express (e.g. "the fix gates the email on the opt-in flag"). Reuses the production `success-evaluator` judge. Leave empty for a purely deterministic task. |

Prefer **deterministic signals** (`testsMustPass` + a regression test in the
prompt) over `judgeCriteria` wherever you can — they need no LLM call, so they're
free, fast, and reproducible. Reach for `judgeCriteria` only for the part a
passing test can't prove.

### Worked example

```json
{
  "id": "example-test-writing",
  "category": "test-writing",
  "prompt": "Add a regression test to services/reservations/src/transitions/adapters/dispatcher-messaging.test.ts, alongside the existing 'booking-cancelled' test cases, that locks in an existing (correct) behavior: a reservation-cancelled email is transactional, per services/reservations/src/services/contact-policy.ts, so it must still be sent even when the guest has unsubscribed from marketing. Using the existing res() helper and overrides pattern in that file, build a reservation whose guest carries unsubscribed: true — spread the file's existing default guest object and override only the unsubscribed field (Reservation['guest'] from @mbe/types requires a full shape including visitCount, so replacing it outright with a partial literal will fail typecheck) — send a 'booking-cancelled' message through the messaging adapter returned by createDispatcherMessaging, and assert dispatcher.sendBookingCancelled was still invoked. Do not change any production code — the behavior is already correct; only the test coverage is missing.",
  "fixtureRef": "services/reservations",
  "rubric": {
    "testsMustPass": true,
    "typecheckMustPass": true,
    "lintMustPass": false,
    "judgeCriteria": [
      "The new test builds a reservation whose guest has unsubscribed: true and asserts dispatcher.sendBookingCancelled is still called",
      "No production code is changed — only test coverage is added"
    ]
  },
  "budget": { "maxTurns": 28, "maxCostUsd": 1.2 }
}
```

> **Why this task reads as "add a test" rather than "fix a bug":** the original version of
> this example asked the agent to _gate_ the cancellation email on guest opt-in — but
> `contact-policy.ts` already, deliberately, treats cancellation as a transactional
> message that bypasses the marketing consent gate (`unsubscribed`), and a passing test
> (`contact-policy.test.ts`) already locks that policy in. The prompt's premise was
> false relative to the fixture (see #4630), which is exactly the "surrounding code
> churned out from under the task" failure mode called out below — a live worked
> example of the "pick a stable `fixtureRef`" tip, not just a hypothetical. The file
> and `id` were renamed from `example-bugfix` to `example-test-writing` (#5981) so
> the `id`/`category` finally agree with what the task actually exercises.
>
> **The fixture moved again before the rename even finished landing.** #6055 (merged
> days after #5981 opened) deleted `services/reservations/src/services/booking-notifications.ts`
> and its test file wholesale — `cancelBookingNotifications` doesn't exist anymore.
> The cancellation-email send now lives in
> `src/transitions/adapters/dispatcher-messaging.ts`'s `sendBookingCancelled`, which
> still has no `unsubscribed` check (same transactional-bypass behavior, different
> module), so the task was repointed there rather than retired. This is the "pick a
> stable `fixtureRef`" tip failing a second time on the same task, inside the same
> review round — a reminder that "stable" is relative to how actively a subsystem is
> being refactored, not a one-time judgment.
>
> **A first attempt at the repointed prompt scored 67% on a real typecheck failure,
> not a judge miss.** `res()`'s `overrides` parameter is typed `Partial<Reservation>`,
> but `Reservation['guest']` (`@mbe/types`) is not itself partial — it requires
> `visitCount`. An agent that replaced the whole `guest` object with
> `{ communicationPreference, unsubscribed }` (a reasonable, idiomatic-looking test)
> failed `tsc` on a missing `visitCount`, because the file's own default guest
> literal only dodges that check by being embedded inside the full return object's
> `as unknown as Reservation` cast — the override argument gets no such cover. The
> prompt now explicitly says to spread the default guest object and override only
> `unsubscribed`, which avoids the trap without touching production code. Re-run
> with the revised prompt: `passed: true`, score 100%, 17 turns, $0.86
> (`--adapter claude-cli`) — `budget.maxCostUsd` is set to 1.2, headroom above
> that observed cost rather than below it.

## Authoring tips

- **Make the expected outcome checkable.** A good prompt asks for a change _and_
  a regression test, so `testsMustPass` does most of the scoring. The
  [`cost/`](./cost) tasks show this — each names the exact file and the edge case
  a test must cover.
- **Keep budgets realistic but tight.** Set `maxTurns`/`maxCostUsd` near what a
  competent run actually costs, so a regression that balloons cost trips the
  budget check.
- **Pick a stable `fixtureRef`.** Point at a subdir whose surrounding code won't
  churn out from under the task, or the task measures repo drift instead of the
  agent.
- **One behaviour per task.** Narrow tasks give a cleaner signal about _what_
  regressed than a sprawling multi-part prompt.
- **Tag the `category` honestly** so the per-category aggregates stay meaningful.

## What the harness produces

Each run emits an `EvalReport` (`../src/eval/types.ts`): per-task `TaskScore`
(passed, 0–1 score, deterministic checks, optional judge result, cost, turns)
plus a suite `aggregate` (pass rate, mean score, mean cost, mean turns, stuck
count). With `--calibrate`, it also pairs each task's self-reported
`success-evaluator` confidence against the ground-truth pass/fail, so you can
learn how far the agent's self-grade can be trusted.
