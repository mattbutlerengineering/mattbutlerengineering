# AI Cost Governance

## Budget Policy

The budget policy is defined in `.claude/budget-policy.json` and sets limits at three levels:

| Level    | Limit   | Description                                |
| -------- | ------- | ------------------------------------------ |
| Per-task | $1.00   | Default `--max-budget` for `mbe agent run` |
| Per-day  | $25.00  | Aggregate daily spend across all sessions  |
| Per-week | $100.00 | Weekly aggregate spend                     |

## Token Tracking

Token usage is tracked via [Langfuse](https://cloud.langfuse.com):

- Each `runSession()` call creates a trace with cost metadata
- Generation spans record per-turn token usage
- Session metrics include `cost_usd` for aggregate tracking

## Model Tiering

| Model      | Use Case                             | Relative Cost |
| ---------- | ------------------------------------ | ------------- |
| Haiku 4.5  | Lightweight agents, worker agents    | 1x            |
| Sonnet 4.6 | Main development, orchestration      | 5x            |
| Opus 4.6   | Complex architecture, deep reasoning | 25x           |

## Alerting

When aggregate spend reaches 80% of daily/weekly limits, a GitHub issue is created with the `cost-alert` label.

## Monitoring

View cost trends via:

- Langfuse dashboard: session cost aggregations
- `/progress-tracker`: includes cost section when data available
