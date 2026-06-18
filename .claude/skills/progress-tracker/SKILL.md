---
name: progress-tracker
description: Track loop metrics, trends, improvements. Invoke: /progress-tracker.
user-invocable: true
---

# Progress Tracker

Queries: metrics, patterns, actions. Daily.

## Queries (7d)

```bash
gh issue list --label "audit" --state all --json number,title,state,createdAt,closedAt,labels --limit 100
gh issue list --label "ci-fix" --state all --json number,title,state,createdAt,closedAt,labels --limit 50
gh issue list --label "ready" --state open --json number,title
gh issue list --label "in-progress" --state open --json number,title
gh issue list --label "has-pr" --state open --json number,title
gh issue list --label "agent-failed" --state open --json number,title
gh issue list --label "agent-skip" --state open --json number,title,createdAt
gh pr list --state merged --json number,title,mergedAt,headRefName --limit 50
gh run list --branch main --limit 20 --json conclusion,createdAt
gh issue list --label "meta-improvement" --state all --json number,title,state
cat .claude/agent-spend.jsonl 2>/dev/null | tail -100
```

Cost: `.claude/agent-spend.jsonl` = `{date,timestamp,costUsd,issueNumber,model}`

## Metrics

| Metric        | Formula                  | Target |
| ------------- | ------------------------ | ------ |
| Created (7d)  | audit+ci-fix             | -      |
| Closed (7d)   | audit+ci-fix             | -      |
| Closure Rate  | Closed/Created           | >80%   |
| Time-to-Close | mean(closedAt-createdAt) | <24h   |
| Agent Success | has-pr/(has-pr+failed)   | >70%   |
| CI Pass       | success/total main       | >95%   |
| Queue         | count ready              | <5     |
| Stale         | ready>7d                 | 0      |
| Blocked       | agent-failed             | 0      |
| Skipped       | agent-skip               | 0      |
| Daily Spend   | Σ costUsd                | <$10   |
| 7d Spend      | Σ costUsd                | <$50   |
| Cost/Issue    | 7d/closed                | <$2    |

## Analysis

1. Recurring types → systemic?
2. Agent failures → pattern?
3. CI unstable → same job?
4. Queue bottleneck?
5. Cost efficiency?

## Log

Append `.claude/improvement-loop/log.md`:

```markdown
## YYYY-MM-DD

### Metrics

[Table with Closed/Created/Rate/Time/Success/Pass/Queue/Stale/Skip/Spend/Cost]

### Patterns

- [Findings]

### Recommendations

- [Actions]

### Skipped Issues

[Manual review]
```

Query skipped: `gh issue list --label "agent-skip" --state open --json number,title,createdAt --jq '.[] | "  #\(.number) \(.title)"'`

Summary: "N skipped after max retries"

**Append only.**

## Improvement Issues

Pattern 3+ days consistent?

```bash
gh issue create --title "[Meta] <improvement>" --label "meta-improvement" \
  --body "## Observation
<Data>

## Recommendation
<Change>

## Impact
<Outcome>

---
*Identified: $(date +%Y-%m-%d)*"
```

## Thresholds

| Metric  | Green | Yellow   | Red   |
| ------- | ----- | -------- | ----- |
| Closure | >80%  | 50-80%   | <50%  |
| Success | >70%  | 40-70%   | <40%  |
| CI      | >95%  | 85-95%   | <85%  |
| Queue   | <5    | 5-10     | >10   |
| Time    | <24h  | 24-72h   | >72h  |
| Daily   | <$10  | $10-$20  | >$20  |
| 7d      | <$50  | $50-$100 | >$100 |
| Cost    | <$2   | $2-$5    | >$5   |

## Actions

### Pause on Failure >50% (3d)

```bash
gh issue create --title "[Alert] Queue paused — failure >50%" \
  --label "meta-improvement" \
  --body "Success <50%. Pause loop.

$(gh issue list --label agent-failed --state open --json number,title -q '.[] | "- #\(.number): \(.title)"')

Fix, improve descriptions, re-enable."
```

### Auto-retry Stale (3+ days)

Exclude `agent-skip`:

```bash
STALE=$(gh issue list --label "agent-failed" --state open --json number,createdAt,labels -q '[.[] | select(.createdAt < (now - 259200 | todate)) | select(.labels | map(.name) | index("agent-skip") | not)] | .[].number')

for NUM in $STALE; do
  gh issue edit $NUM --add-label "ready" --remove-label "agent-failed"
  gh issue comment $NUM --body "Auto-retry — failed 3+ days."
done
```

Max 2/run.

### Queue Adjust

Queue >10 + success >70% → `/loop 15m /implement-queue`

Queue 0 for 3d → reduce audit or expand

### Features

```bash
gh issue list --label "feature" --state all --json number,title,state,labels --limit 100
gh issue list --label "tracking" --state open --json number,title,body
```

% = closed/total in body.

### Reverts

```bash
git log --oneline --grep="Revert" --since="7 days ago" | wc -l
```

> 3/week → broken code?

## Rules

- Read-only code
- Max 2 meta/run
- Max 2 retry/run
- Append-only log
- Cost: `.claude/agent-spend.jsonl`
- Circuit: 50% over 3+ days
