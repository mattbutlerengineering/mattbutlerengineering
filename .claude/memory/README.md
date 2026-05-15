# Memory System

This directory stores correction captures and positive reinforcements that accumulate across Claude Code sessions. The goal is to build a feedback loop so the agent avoids repeating mistakes and doubles down on effective patterns.

## What gets recorded

### Corrections (`corrections/`)

A correction is captured whenever the agent:

- Produces output the user explicitly rejects or asks to redo
- Makes an assumption that turns out to be wrong (e.g., wrong file path, stale API)
- Violates a project convention documented in CLAUDE.md or rules/
- Triggers a pre-commit hook failure due to lint, type, or security errors

Each correction file is a Markdown document named `YYYY-MM-DD-<slug>.md` containing:

| Field        | Description                            |
| ------------ | -------------------------------------- |
| `date`       | ISO 8601 date                          |
| `session`    | Session identifier                     |
| `trigger`    | What the agent did wrong               |
| `correction` | What the user (or hook) said to fix it |
| `root_cause` | Why the mistake happened               |
| `prevention` | Rule or check to avoid recurrence      |

### Positive reinforcements (`reinforcements/`)

A reinforcement is captured whenever the agent:

- Receives explicit praise from the user ("that's exactly right", "perfect")
- Completes a task that passes all checks on first attempt
- Applies a pattern the user specifically requested in a prior session

Each reinforcement file uses the same naming convention and contains:

| Field     | Description                |
| --------- | -------------------------- |
| `date`    | ISO 8601 date              |
| `session` | Session identifier         |
| `action`  | What the agent did well    |
| `context` | Why it was effective       |
| `pattern` | Reusable pattern to repeat |

## How memories are used

At session start, the agent (or an OMEGA hook) scans this directory for recent entries and loads them into context. Corrections are weighted higher than reinforcements to prevent regression. The preference index (`.claude/preferences.json`) is updated when a memory reveals a new or changed preference.

## Retention

- Corrections older than 90 days with no recurrence are archived to `memory/archive/`.
- Reinforcements are kept indefinitely as they have negligible size.
- The total memory directory should stay under 200 files to keep context loading fast.
