---
name: sentry-triage
description: Query Sentry for production errors, filter by severity/frequency, deduplicate against existing GitHub issues, and create actionable issues for the ship-loop. Invoke with /sentry-triage.
user-invocable: true
---

# Sentry Triage

Automated production error to GitHub issue pipeline. Queries Sentry MCP for actionable errors and creates deduplicated issues for the ship-loop.

## Prerequisites

The Sentry plugin must be authenticated. If you get auth errors, run the Sentry authenticate flow first.

## Workflow

### Step 1: Query Sentry for Recent Issues

Use the Sentry MCP tools to fetch recent issues. The tools are available as skills:

```
Use sentry:getIssues to fetch the most recent issues from Sentry.
```

If the Sentry MCP requires authentication, use the `sentry:seer` skill or the `mcp__plugin_sentry_sentry__authenticate` tool to authenticate first.

Parse the response to extract:
- Issue ID and URL
- Title / error message
- Level (error, fatal, warning)
- Event count (frequency)
- First seen / last seen dates
- Affected user count
- Stack trace (if available)
- Tags (service, browser, OS, release)

### Step 2: Filter Issues

Apply these filters:
1. **Recency**: Only issues with events in the last 7 days
2. **Severity**: Only `error` or `fatal` level (skip `warning`, `info`)
3. **Frequency**: Only issues with >5 occurrences in the window
4. **Status**: Prioritize `new` and `regressed` over `ongoing`

Sort by: frequency x severity (fatal = 2x weight) descending.

### Step 3: Deduplicate Against GitHub Issues

For each Sentry issue that passes filters:

```bash
# Search for existing GitHub issues mentioning this Sentry issue URL or ID
gh issue list --state open --search "sentry <SENTRY_ISSUE_ID>" --json number,title,body --limit 5
```

Also search by error message title:
```bash
gh issue list --state open --search "<error_message_snippet>" --json number,title --limit 5
```

Skip any Sentry issue that already has a matching GitHub issue.

### Step 4: Map to Service/Package

Analyze the stack trace to determine which service/package is affected:

- `services/users/` -> label `service:users`
- `services/reservations/` -> label `service:reservations`
- `services/agent/` -> label `service:agent`
- `packages/` -> label with package name
- `apps/` -> label with app name

If the stack trace is unclear, use the Sentry tags (if they include a service name).

### Step 5: Create GitHub Issues

For the top 3 issues (max per run), create GitHub issues:

```bash
gh issue create \
  --title "fix(<service>): <error_message_summary>" \
  --label "ready,sentry,bug" \
  --body "$(cat <<'EOF'
## Sentry Production Error

**Sentry Issue:** <SENTRY_URL>
**Level:** <error|fatal>
**Events:** <count> in last 7 days
**Affected Users:** <count>
**First Seen:** <date>
**Status:** <new|regressed|ongoing>

## Stack Trace Summary

```
<relevant stack trace lines, max 20 lines>
```

## Affected Area

- **Service/Package:** <name>
- **File:** <primary file from stack trace>
- **Function:** <function name if available>

## Suggested Fix Area

<Brief analysis of what might be causing this based on the error message and stack trace>

## Acceptance Criteria

- [ ] Error rate for this issue drops by >50% after fix
- [ ] Verified by learning-loop post-fix verification (48h after merge)

_Detected by [sentry-triage](../.claude/skills/sentry-triage/SKILL.md)_
EOF
)"
```

### Step 6: Summary

Print a summary:
```
Sentry Triage Complete
  Queried: <N> issues from Sentry
  Filtered: <N> passed severity/frequency filters
  Deduplicated: <N> already have GitHub issues
  Created: <N> new GitHub issues
  Skipped: <N> (max 3 per run)
```

## Integration with Learning Loop

The learning loop's Step 2 (Verify Past Fixes) handles post-fix verification for `sentry`-labeled issues. After a PR with `fixes #<issue>` merges, the verify-fixes script queries the originating sensor 48h later to check if the error rate dropped.

To support this, the Sentry issue body includes the Sentry issue URL. The verification script can use `sentry:seer` to check if the error count has decreased since the fix was deployed.

## Safety Rules

- **Max 3 issues per run** -- prevents issue spam during incident cascades
- **Never create duplicate issues** -- always deduplicate first
- **Skip warning/info level** -- only actionable errors
- **Frequency floor of 5** -- avoids one-off transient errors
