# Sessions Directory

This directory stores archived session summaries. Each file captures what happened during a single Claude Code session: what changed, what was learned, what failed, and what should happen next.

## Naming convention

```
YYYY-MM-DD-<descriptive-slug>.md
```

Examples:

- `2026-05-01-acmm-learning-infra.md`
- `2026-04-28-fix-undici-override.md`
- `2026-04-25-hospitality-sidebar-ship.md`

The slug should be short (3-5 words) and describe the primary task of the session. If a session covers multiple unrelated tasks, use the most significant one.

## How summaries are created

1. During a session, the agent uses `.claude/session-summary.md` as a working scratchpad. It starts as a copy of `.claude/session-summary.template.md`.
2. At session end, the `session-archive.sh` Stop hook compares the scratchpad against that template. Byte-identical means nothing was written this session, and the hook exits silently.
3. Anything else is copied here as `YYYY-MM-DD-HHMMSS.md` (UTC). Renaming it to the date-slug convention above is a manual step — the hook has no way to know the slug.
4. The hook does **not** reset the scratchpad, and nothing else does either. It instead skips any summary whose bytes already sit in this directory, so an unchanged scratchpad is archived once and never again. Resetting it by hand — `cp .claude/session-summary.template.md .claude/session-summary.md` — is what starts a clean next session.

Between #910 and #5598 none of this ran. The hook's guard grepped for the `_YYYY-MM-DD_` placeholder in a file that doubled as the template, so it matched on every run and the skip branch was taken unconditionally. `2026-05-12-acmm-gap-closure.md` is the one summary written in that window; #5598 archived it by hand, with the exact bytes the scratchpad had been holding since May.

## How summaries are used

- **Session continuity:** When a new session starts, the agent reads the most recent 3-5 summaries to restore context about what was done and what is pending.
- **Trend analysis:** The `/progress-tracker` skill aggregates session summaries to compute metrics like tasks completed, correction frequency, and time-per-task.
- **Reflection input:** Writing a `.claude/reflections/` entry means cross-referencing these summaries against the corrections and reinforcements in `.claude/memory/`. This is a manual step — no skill performs it.

## Retention policy

- Summaries from the last 30 days are loaded at session start for continuity.
- Summaries from 30-90 days are kept but only loaded on demand (e.g., when investigating a past decision).
- Summaries older than 90 days are archived to `sessions/archive/` and excluded from routine context loading.
- No summaries are ever deleted; the archive serves as the complete session history.

## Relationship to other systems

| System                     | Relationship                                                            |
| -------------------------- | ----------------------------------------------------------------------- |
| `.claude/memory/`          | Summaries reference corrections and reinforcements by date              |
| `.claude/reflections/`     | Reflections are synthesized from one or more session summaries          |
| `.claude/preferences.json` | Updated when a session summary reveals a new or changed preference      |
| `.claude/task-log.jsonl`   | Each task in the log corresponds to work described in a session summary |
