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

1. During a session, the agent uses `.claude/session-summary.md` as a working scratchpad.
2. At session end (via a Stop hook or manual `/reflect` invocation), the scratchpad is finalized.
3. The finalized summary is copied to this directory with the date-slug filename.
4. The scratchpad in `session-summary.md` is reset to its template state for the next session.

## How summaries are used

- **Session continuity:** When a new session starts, the agent reads the most recent 3-5 summaries to restore context about what was done and what is pending.
- **Trend analysis:** The `/progress-tracker` skill aggregates session summaries to compute metrics like tasks completed, correction frequency, and time-per-task.
- **Reflection input:** The `/reflect` skill cross-references summaries with corrections and reinforcements in `.claude/memory/`.

## Retention policy

- Summaries from the last 30 days are loaded at session start for continuity.
- Summaries from 30-90 days are kept but only loaded on demand (e.g., when investigating a past decision).
- Summaries older than 90 days are archived to `sessions/archive/` and excluded from routine context loading.
- No summaries are ever deleted; the archive serves as the complete session history.

## Relationship to other systems

| System | Relationship |
|--------|-------------|
| `.claude/memory/` | Summaries reference corrections and reinforcements by date |
| `.claude/reflections/` | Reflections are synthesized from one or more session summaries |
| `.claude/preferences.json` | Updated when a session summary reveals a new or changed preference |
| `.claude/task-log.jsonl` | Each task in the log corresponds to work described in a session summary |
