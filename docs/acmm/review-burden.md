# Review Burden Tracking

## Purpose

As AI agents produce more PRs, human reviewers become the bottleneck. Without tracking review load, high-volume agent output causes rubber-stamping or review abandonment, undermining the human oversight that L5+ depends on.

Review burden tracking measures human review fatigue and ensures sustainable review load.

## Metrics

| Metric | Description | Source |
|--------|-------------|--------|
| PRs per reviewer per week | Volume of PRs assigned to or reviewed by each person | `gh pr list --search "reviewed-by:USERNAME"` |
| Average review time | Time between PR creation and first review comment/approval | PR timeline events via GitHub API |
| Review-to-merge latency | Time between first review and merge | PR timeline events via GitHub API |
| Auto-merge ratio | Percentage of PRs merged via auto-merge vs human-initiated merge | `gh pr list --search "label:auto-merged"` or merge event metadata |
| Review depth | Number of review comments per PR (proxy for thoroughness) | `gh api repos/{owner}/{repo}/pulls/{number}/comments` |

## Warning Thresholds

| Load | PRs / Reviewer / Week | Action |
|------|-----------------------|--------|
| Healthy | < 5 | No action needed |
| Warning | 5 - 10 | Reduce agent output frequency or distribute reviews |
| Critical | > 10 | Pause autonomous PR creation until backlog clears |

## Measurement

### PRs reviewed by a user in the last 7 days

```bash
gh pr list --search "reviewed-by:USERNAME is:merged" --limit 100 \
  --json number,mergedAt \
  --jq '[.[] | select(.mergedAt > (now - 604800 | todate))] | length'
```

### Time from PR creation to first review

```bash
# For a specific PR
gh api repos/{owner}/{repo}/pulls/{number}/reviews \
  --jq '.[0].submitted_at' | \
  xargs -I{} echo "First review at: {}"
```

### Auto-merge vs human-merge ratio

```bash
# Count auto-merged PRs in last 30 days
auto=$(gh pr list --state merged --search "label:auto-merged" --limit 200 --json number | jq length)
total=$(gh pr list --state merged --limit 200 --json number | jq length)
echo "Auto-merge ratio: $auto / $total"
```

## Impact of Automation

Auto-merge reduces the mechanical burden of clicking "merge" but does not reduce the cognitive burden of reviewing. Key risks:

- **Rubber-stamping**: Reviewers approve without reading when volume is high. Track review time as a proxy — reviews under 60 seconds on non-trivial PRs are a warning sign.
- **Review abandonment**: Reviewers stop reviewing entirely when the queue is overwhelming. Track the ratio of PRs merged without any review comments.
- **False confidence**: High auto-merge rates may look efficient but mask whether humans are actually reviewing. A 95% auto-merge rate with 30-second review times means the human gate is decorative.

### Signals to watch

| Signal | Interpretation |
|--------|---------------|
| Average review time dropping | Reviewers may be rubber-stamping |
| Review comments per PR dropping | Less thorough reviews |
| PRs merged with zero comments increasing | Reviews are being skipped |
| Auto-merge ratio > 90% | Human gate may be decorative |

## Sustainable Review Load

### Recommendations

1. **Cap agent PR volume** per reviewer per day. A reviewer can meaningfully review 1-2 non-trivial PRs per day alongside their own work.
2. **Batch small changes**. If 5 agent PRs each fix a one-line lint issue, batch them into one PR. The review cost of 5 trivial PRs is higher than one small PR.
3. **Tier review depth by risk**. Trivial changes (docs, config) need a glance; auth/database/deploy changes need line-by-line review. Use the existing `tier-classifier` workflow to route.
4. **Rotate reviewers**. No single person should be the default reviewer for all agent PRs. Distribute using GitHub's CODEOWNERS or round-robin assignment.
5. **Scheduled review windows**. Instead of interrupting flow with each agent PR, batch reviews into 1-2 daily windows.

## Integration with /progress-tracker

The `/progress-tracker` skill already reports issue and PR metrics. Review burden extends this with:

- **Review load per contributor**: PRs reviewed this week, average review time
- **Queue depth**: Open PRs awaiting review
- **Auto-merge ratio**: Percentage of PRs auto-merged vs manually merged
- **Rubber-stamp risk**: PRs merged with zero comments or sub-60-second review time

These metrics surface alongside existing progress data so the team sees both output velocity and review sustainability in one view.
