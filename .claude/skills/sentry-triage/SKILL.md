---
name: sentry-triage
description: Query Sentry for production errors, filter by severity/frequency, deduplicate against existing GitHub issues, and create actionable issues for the ship-loop. Invoke with /sentry-triage.
user-invocable: true
---

# Sentry Triage

Automated production error to GitHub issue pipeline. Queries Sentry MCP for actionable errors and creates deduplicated issues for the ship-loop.

## Prerequisites

1. **Sentry MCP configured** in `.mcp.json`
2. **Token with event:read scope** — create at sentry.io/settings/account/api/auth-tokens/
3. **Set SENTRY_ACCESS_TOKEN env var** before running

## Running Triage

```bash
SENTRY_ACCESS_TOKEN=<token> node .claude/skills/sentry-triage/scripts/triage.mjs
```

## Workflow

### Step 1: Query Sentry
Run `fetch-issues.mjs` or `triage.mjs` to get production errors.

### Step 2: Filter Issues
- Only `error` or `fatal` level
- >5 occurrences in 14 days
- Max 3 issues per run

### Step 3: Deduplicate
Check existing GitHub issues by Sentry ID and title.

### Step 4: Create Issues
Create `ready,sentry,bug` issues for ship-loop pickup.

## Current Status
Pipeline active — 0 production errors across 2 projects.
