# Reflections System

This directory stores structured session reflections that capture what the agent learned, what went well, and what should change. Reflections are the analytical layer on top of raw memory -- they synthesize corrections and reinforcements into actionable insights.

## Structure

```
reflections/
  README.md              # This file
  YYYY-MM-DD-<slug>.md   # Individual reflection entries
```

## When reflections are created

Reflections are generated:

1. **End of session** -- via the `/reflect` skill or a Stop hook, the agent reviews the session for corrections made, patterns discovered, and conventions reinforced.
2. **After multi-step failures** -- when a task requires more than two retries, a reflection captures the debugging path and root cause.
3. **After architecture decisions** -- significant design choices are reflected on so future sessions understand the rationale.

## Reflection format

Each reflection file contains:

```markdown
# Reflection: <title>

**Date:** YYYY-MM-DD
**Session:** <session-id>
**Type:** correction-capture | positive-reinforcement | architecture | debugging

## What happened
<Narrative of the event or decision>

## What was learned
<Key takeaway, stated as a reusable principle>

## Action items
- [ ] Update CLAUDE.md if a new convention was discovered
- [ ] Add to preferences.json if a preference was clarified
- [ ] File an issue if a systemic problem was found
```

## How reflections are indexed

The `/reflect` skill scans this directory and cross-references entries with:

- `.claude/preferences.json` -- to update preference weights
- `.claude/memory/` -- to link reflections to their source corrections or reinforcements
- `.claude/session-summary.md` -- to include reflection highlights in the session summary

## Retention policy

- Reflections are never deleted; they form the long-term knowledge base.
- Reflections older than 6 months are considered "historical" and are loaded only when explicitly queried, not at session start.
- Active reflections (< 6 months) are scanned at session start for relevant context.
