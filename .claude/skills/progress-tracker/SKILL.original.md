---
name: progress-tracker
description: Track continuous improvement loop performance. Queries GitHub for metrics (issues created/closed, PRs merged, CI health), logs trends, and suggests process improvements. Invoke with /progress-tracker.
user-invocable: true
---

# Progress Tracker

Daily analysis of the continuous improvement loop's effectiveness. Queries GitHub for metrics, identifies patterns, logs trends, and suggests process improvements.

## Workflow

### Step 1: Gather Metrics

Run these queries to collect data from the last 7 days:

```bash
# Issues created by audit (last 7 days)
gh issue list --label "audit" --state all --json number,title,state,createdAt,closedAt,labels --limit 100

# Issues created by CI monitor
gh issue list --label "ci-fix" --state all --json number,title,state,createdAt,closedAt,labels --limit 50

# Issues currently in each state
gh issue list --label "ready" --state open --json number,title
gh issue list --label "in-progress" --state open --json number,title
gh issue list --label "has-pr" --state open --json number,title
gh issue list --label "agent-failed" --state open --json number,title
gh issue list --label "agent-skip" --state open --json number,title,createdAt

# PRs merged recently
gh pr list --state merged --json number,title,mergedAt,headRefName --limit 50

# CI health (last 20 runs on main)
gh run list --branch main --limit 20 --json conclusion,createdAt

# Meta-improvement suggestions created
gh issue list --label "meta-improvement" --state all --json number,title,state

# Agent spend (from local cost log)
# Read .claude/agent-spend.jsonl and aggregate by date
cat .claude/agent-spend.jsonl 2>/dev/null | tail -100
```

#### Cost Log Format

The file `.claude/agent-spend.jsonl` contains one JSON object per line:

```json
{
  "date": "2026-04-06",
  "timestamp": "2026-04-06T12:00:00Z",
  "costUsd": 0.45,
  "issueNumber": 199,
  "model": "claude-sonnet-4-6"
}
```

Log entries are written by `pnpm log:cost -- --cost <usd> --issue <num>` after each agent session.

### Step 2: Compute Metrics

Calculate these key indicators:

| Metric                  | Formula                                                                    |
| ----------------------- | -------------------------------------------------------------------------- |
| **Issues Created (7d)** | Count of audit + ci-fix issues created in last 7 days                      |
| **Issues Closed (7d)**  | Count of audit + ci-fix issues closed in last 7 days                       |
| **Closure Rate**        | Closed / Created (target: > 0.8)                                           |
| **Avg Time-to-Close**   | Mean of (closedAt - createdAt) for closed issues                           |
| **Agent Success Rate**  | Issues with `has-pr` / (Issues with `has-pr` + Issues with `agent-failed`) |
| **CI Pass Rate**        | Successful runs / Total runs on main (target: > 0.95)                      |
| **Queue Depth**         | Count of issues with `ready` label (target: < 5)                           |
| **Stale Issues**        | Issues with `ready` label open > 7 days                                    |
| **Blocked Issues**      | Issues with `agent-failed` label not re-queued                             |
| **Skipped Issues**      | Issues with `agent-skip` label (exceeded max retries, need manual review)  |
| **Daily Agent Spend**   | Sum of costUsd from .claude/agent-spend.jsonl for today (target: < $10)    |
| **7d Agent Spend**      | Sum of costUsd from last 7 days of entries                                 |
| **Avg Cost/Issue**      | 7d spend / issues closed in 7d                                             |

### Step 3: Analyze Patterns

Look for:

1. **Recurring issue types** — Are the same categories appearing repeatedly? This suggests a systemic problem rather than individual bugs.
   - Example: Multiple `[Audit] A11y:` issues → may need an accessibility review of shared components

2. **Agent failure patterns** — What types of issues does the agent fail on? Are there common characteristics?
   - Example: Agent fails on issues requiring database changes → may need better skill instructions

3. **CI instability** — Is the same job failing repeatedly? Is it a flaky test or a real regression?
   - Example: `migrations` job fails 3x/week → database schema process needs improvement

4. **Queue bottlenecks** — Is the queue growing faster than the worker can process?
   - If queue depth > 10: suggest increasing worker cadence
   - If agent failure rate > 30%: suggest improving issue descriptions

5. **Cost efficiency** — Are we spending budget on low-value issues?

### Step 4: Log Entry

Append a dated entry to `.claude/improvement-loop/log.md`:

```markdown
## YYYY-MM-DD

### Metrics

| Metric              | Value | Target | Status   |
| ------------------- | ----- | ------ | -------- |
| Issues Created (7d) | N     | -      | -        |
| Issues Closed (7d)  | N     | -      | -        |
| Closure Rate        | N%    | >80%   | ✅/⚠️/❌ |
| Avg Time-to-Close   | Nh    | <24h   | ✅/⚠️/❌ |
| Agent Success Rate  | N%    | >70%   | ✅/⚠️/❌ |
| CI Pass Rate        | N%    | >95%   | ✅/⚠️/❌ |
| Queue Depth         | N     | <5     | ✅/⚠️/❌ |
| Stale Issues        | N     | 0      | ✅/⚠️/❌ |
| Skipped Issues      | N     | 0      | ✅/⚠️/❌ |
| Daily Agent Spend   | $N.NN | <$10   | ✅/⚠️/❌ |
| 7d Agent Spend      | $N.NN | <$50   | ✅/⚠️/❌ |
| Avg Cost/Issue      | $N.NN | <$2    | ✅/⚠️/❌ |

### Patterns

- [Notable patterns observed]

### Recommendations

- [Actionable suggestions]

### Skipped Issues (agent-skip)

[List any issues with the `agent-skip` label that need manual attention]
```

Query skipped issues for the report:

```bash
gh issue list --label "agent-skip" --state open --json number,title,createdAt --jq '.[] | "  #\(.number) \(.title) (created: \(.createdAt | split("T")[0]))"'
```

If any `agent-skip` issues exist, include a summary line in the report: "N issues skipped after max retries -- need manual review"

Create the file if it does not exist. Always **append** — never overwrite previous entries.

### Step 5: Create Improvement Issues

If patterns suggest actionable process improvements, create a GitHub issue:

```bash
gh issue create \
  --title "[Meta] <improvement description>" \
  --label "meta-improvement" \
  --body "## Observation

<What the data shows>

## Recommendation

<Specific change to make>

## Expected Impact

<What should improve>

---
*Identified by progress-tracker on $(date +%Y-%m-%d)*"
```

Only create improvement issues for patterns seen **consistently over 3+ days**. Do not create issues for one-off anomalies.

## Targets & Thresholds

| Metric             | Green | Yellow   | Red    |
| ------------------ | ----- | -------- | ------ |
| Closure Rate       | > 80% | 50-80%   | < 50%  |
| Agent Success Rate | > 70% | 40-70%   | < 40%  |
| CI Pass Rate       | > 95% | 85-95%   | < 85%  |
| Queue Depth        | < 5   | 5-10     | > 10   |
| Avg Time-to-Close  | < 24h | 24-72h   | > 72h  |
| Daily Agent Spend  | < $10 | $10-$20  | > $20  |
| 7d Agent Spend     | < $50 | $50-$100 | > $100 |
| Avg Cost/Issue     | < $2  | $2-$5    | > $5   |

## Self-Tuning Actions

The progress tracker doesn't just observe — it **acts** on what it finds.

### Circuit Breaker: Pause on High Failure Rate

If agent failure rate exceeds 50% over the last 3 days:

```bash
# Disable the implement-queue CronCreate job if running locally
# For RemoteTriggers, disable the issue-worker:
# (Manual step — create an issue alerting the user)
gh issue create \
  --title "[Alert] Implement queue paused — agent failure rate > 50%" \
  --label "meta-improvement" \
  --body "Agent success rate has dropped below 50% over the last 3 days. The loop should be paused until the failure patterns are addressed.

Current failures:
$(gh issue list --label agent-failed --state open --json number,title -q '.[] | "- #\(.number): \(.title)"')

**Action needed**: Review failed issues, improve issue descriptions or skill instructions, then re-enable."
```

### Auto-Retry Stale Failures

If an issue has been `agent-failed` for 3+ days with no activity, re-queue it (the agent or skills may have improved). Issues with the `agent-skip` label are excluded -- they have already exhausted their retry budget and need manual intervention:

```bash
# Find stale agent-failed issues (created > 3 days ago), excluding agent-skip
STALE=$(gh issue list --label "agent-failed" --state open --json number,createdAt,labels -q '[.[] | select(.createdAt < (now - 259200 | todate)) | select(.labels | map(.name) | index("agent-skip") | not)] | .[].number')

for NUM in $STALE; do
  gh issue edit $NUM --add-label "ready" --remove-label "agent-failed"
  gh issue comment $NUM --body "Auto-retrying — this issue has been in agent-failed state for 3+ days."
done
```

**Max 2 retries per run.**

### Queue Depth Adjustment

If queue depth > 10 and agent success rate > 70%:

- Suggest running `/loop 15m /implement-queue` instead of 30m (faster cadence)

If queue depth is 0 for 3 consecutive days:

- Suggest reducing audit frequency or expanding audit scope

### Feature Tracking

Also track feature progress:

```bash
# Feature issues in progress
gh issue list --label "feature" --state all --json number,title,state,labels --limit 100

# Tracking issues (parent features)
gh issue list --label "tracking" --state open --json number,title,body
```

For each tracking issue, calculate feature completion percentage by counting closed vs total sub-issues referenced in the body.

### Revert Monitoring

Track how many reverts happened this week:

```bash
git log --oneline --grep="Revert" --since="7 days ago" | wc -l
```

If reverts > 3 in a week, flag it — the loop may be pushing broken code.

## Safety Rules

- **Read-only on code** — this skill never modifies source code
- **Max 2 meta-improvement issues per run** — avoid flooding the queue
- **Max 2 auto-retries per run** — don't flood the ready queue
- **Append-only log** — never delete or modify previous log entries
- **Cost data** — read from `.claude/agent-spend.jsonl` (logged by `pnpm log:cost` after each agent session)
- **Circuit breaker threshold** — only pause at 50% failure rate over 3+ days, not single bad days
