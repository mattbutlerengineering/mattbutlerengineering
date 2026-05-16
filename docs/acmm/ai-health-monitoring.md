# AI Agent Health Monitoring

## Overview

Monitor the health of the AI agent system itself — not just the code it produces, but the infrastructure that powers it. A degraded AI service produces bad work before anyone notices.

## Key Metrics

| Metric               | Source                      | Healthy | Warning     | Critical |
| -------------------- | --------------------------- | ------- | ----------- | -------- |
| Session success rate | Langfuse `success` score    | >90%    | 70-90%      | <70%     |
| Avg session duration | Langfuse trace duration     | <5min   | 5-15min     | >15min   |
| Stuck rate           | Langfuse `stuck` score      | <5%     | 5-15%       | >15%     |
| API error rate       | Langfuse generation errors  | <1%     | 1-5%        | >5%      |
| Cost per session     | Langfuse `cost_usd` score   | <$0.50  | $0.50-$2.00 | >$2.00   |
| Turns per session    | Langfuse `num_turns` score  | <20     | 20-40       | >40      |
| CI pass rate         | GitHub Actions              | >80%    | 60-80%      | <60%     |
| Failed agent issues  | GitHub `agent-failed` label | 0-2     | 3-5         | >5       |

## Data Sources

### Langfuse

All agent sessions are traced to [Langfuse Cloud](https://cloud.langfuse.com):

- **Session traces** — one per `runSession()` call
- **Generation spans** — per-turn with token usage
- **Scores** — `success`, `cost_usd`, `num_turns`, `stuck`, `evaluation_confidence`

### GitHub API

- Agent PR merge rate — PRs from `agent-*` and `worktree-agent-*` branches
- CI pass rate on recent workflow runs
- Failed agent issues — count of open `agent-failed` labeled issues
- Agent regressions — count of `agent-regression` labeled PRs

### Health Check Script

```bash
./scripts/acmm/ai-health-check.sh          # Human-readable report
./scripts/acmm/ai-health-check.sh --json   # Machine-readable for automation
```

The script works without Langfuse credentials by computing metrics from GitHub data.

## Alerting

| Condition                       | Duration  | Action                                             |
| ------------------------------- | --------- | -------------------------------------------------- |
| Success rate <70%               | 24h       | Create GitHub issue with `agent-health` label      |
| Stuck rate >15%                 | 24h       | Create GitHub issue with `agent-health` label      |
| 3+ consecutive session failures | Immediate | Create GitHub issue with `agent-health` label      |
| Cost spike (>3x daily average)  | Immediate | Create `cost-alert` issue (see cost-governance.md) |
| CI pass rate <60%               | 24h       | Investigate via `/ci-monitor`                      |

## Investigating Health Issues

### Agent sessions are failing

1. Check Langfuse for the failing sessions — filter by `success=0`
2. Look at the task description — is it too vague or too complex?
3. Check turn count — >40 turns usually means the agent is stuck
4. Check if the model was appropriate — Haiku may fail on complex tasks

### Agent sessions are stuck

1. Filter Langfuse by `stuck=1`
2. Look for patterns — same file, same error, same tool
3. Check if the task needs information the agent can't access (e.g., env vars, external APIs)
4. Consider adding context to the relevant CLAUDE.md

### Cost is spiking

1. Run `./scripts/acmm/ai-health-check.sh` for current PR volume
2. Check Langfuse for sessions with high `cost_usd` scores
3. Verify model tiering — are Opus sessions running where Sonnet would suffice?
4. Check scheduled trigger frequency — `mbe-issue-worker` runs every 2h
5. See [cost-governance.md](cost-governance.md) for budget policy details

### CI pass rate is low

1. Run `/ci-monitor` to check current CI state
2. Check if baseline failures on `main` are dragging down the rate (see gotchas.md)
3. Distinguish agent-caused failures from infrastructure failures

## Architecture

```
Agent Session
     ↓
Langfuse Trace ─── Scores (success, cost, turns, stuck)
     ↓
ai-health-check.sh ─── GitHub API (PRs, issues, CI runs)
     ↓
/progress-tracker ─── Aggregated dashboard
     ↓
GitHub Issue ─── (if threshold breached)
```

## Related Docs

- [Cost governance](cost-governance.md) — budget limits and cost spike investigation
- [AI service fallback](ai-service-fallback.md) — behavior when Claude API is down
- [Auto-rollback](auto-rollback.md) — automatic revert of agent regressions
