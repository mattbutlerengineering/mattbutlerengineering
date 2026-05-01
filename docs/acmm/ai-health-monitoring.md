# AI Agent Health Monitoring

## Overview

Monitor the health of the AI agent system itself — not just the code it produces, but the infrastructure that powers it.

## Key Metrics

| Metric | Source | Healthy | Warning | Critical |
|--------|--------|---------|---------|----------|
| Session success rate | Langfuse `success` score | >90% | 70-90% | <70% |
| Avg session duration | Langfuse trace duration | <5min | 5-15min | >15min |
| Stuck rate | Langfuse `stuck` score | <5% | 5-15% | >15% |
| API error rate | Langfuse generation errors | <1% | 1-5% | >5% |
| Cost per session | Langfuse `cost_usd` score | <$0.50 | $0.50-$2.00 | >$2.00 |
| Turns per session | Langfuse `num_turns` score | <20 | 20-40 | >40 |

## Data Sources

### Langfuse

All agent sessions are traced to [Langfuse Cloud](https://cloud.langfuse.com):
- **Session traces** — one per `runSession()` call
- **Generation spans** — per-turn with token usage
- **Scores** — `success`, `cost_usd`, `num_turns`, `stuck`, `evaluation_confidence`

### GitHub API

- Agent PR merge rate — PRs from `agent-*` branches
- CI pass rate on agent PRs
- Time from PR creation to merge

## Alerting

| Condition | Action |
|-----------|--------|
| Success rate <70% for 24h | Create GitHub issue with `agent-health` label |
| Stuck rate >15% for 24h | Create GitHub issue with `agent-health` label |
| 3+ consecutive session failures | Create GitHub issue with `agent-health` label |

## Accessing Health Data

```bash
# Via progress-tracker skill
/progress-tracker

# Via Langfuse dashboard
# Navigate to: https://cloud.langfuse.com → Sessions → Filter by project
```

## Architecture

```
Agent Session → Langfuse Trace → Scores/Metrics
                                      ↓
                              /progress-tracker aggregates
                                      ↓
                              GitHub Issue (if threshold breached)
```
