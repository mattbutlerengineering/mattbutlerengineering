---
name: token-report
description: "Pull a real-time token spend summary using ccusage. Shows daily totals, session breakdown, and block usage with cost, cache-read vs output vs cache-creation tokens, and per-model breakdown. Invoke: /token-report [daily|session|blocks]."
user-invocable: true
---

# Token Report

Read-only spend summary powered by `ccusage`. No new persistence — reads the same Claude Code usage logs that ccusage already tracks.

## Usage

```
/token-report           # runs all three views: daily, session, blocks
/token-report daily     # today's totals by model
/token-report session   # per-session breakdown
/token-report blocks    # 5-hour billing-block view
```

## Preflight Check

Before running any view, verify ccusage is available and logs exist:

```bash
npx -y ccusage@latest --version 2>/dev/null && echo "OK" || echo "MISSING"
```

If the check fails or output contains "No data", stop and report:

> "ccusage is not installed or no Claude Code usage logs were found. Logs are written by the Claude Code desktop app to `~/.claude/logs/`. If you have run Claude Code sessions, ensure you are on the same machine and try again."

## Views

Run the requested view(s). With no argument, run all three in order.

### Daily

```bash
npx -y ccusage@latest daily --json 2>/dev/null
```

Report:

- Date range covered
- Total cost (USD)
- Token breakdown: input / output / cache-read / cache-creation
- Per-model cost and token row (sorted by cost desc)

### Session

```bash
npx -y ccusage@latest session --json 2>/dev/null
```

Report:

- Session count
- Most expensive session (cost, model, task snippet if available)
- Cumulative cost and tokens
- Per-model breakdown across sessions

### Blocks

```bash
npx -y ccusage@latest blocks --json 2>/dev/null
```

Report:

- Active billing block window (start time, end time)
- Tokens and cost consumed in the current block
- Projected cost for the full block at current burn rate
- Per-model breakdown within the block

## Output Format

Render each view as a compact markdown table. Example:

```
### Daily — 2026-06-26

| Model                  | Input    | Output  | Cache-Read | Cache-Create | Cost    |
|------------------------|----------|---------|------------|--------------|---------|
| claude-sonnet-4-6      | 1,234    | 5,678   | 45,000     | 890          | $0.42   |
| claude-haiku-4-5       | 500      | 200     | 12,000     | 0            | $0.03   |
| **Total**              | 1,734    | 5,878   | 57,000     | 890          | **$0.45** |
```

## Graceful Degradation

| Condition                    | Behavior                                                     |
| ---------------------------- | ------------------------------------------------------------ |
| ccusage not found            | Print install hint; do not error                             |
| No logs / empty output       | Print "No usage data found for this period"                  |
| JSON parse error             | Print raw output, note it may be a version incompatibility   |
| Network error (npx download) | Print "Could not fetch ccusage — check network connectivity" |

## Rules

- Read-only: never write files, never modify logs
- Do not print raw API keys, session tokens, or any secret embedded in log paths
- Max one `npx -y ccusage@latest` invocation per view — do not retry in a loop
