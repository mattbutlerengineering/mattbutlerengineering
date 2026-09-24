# Review Burden Tracking

## Purpose

As AI agents produce more PRs, human reviewers become the bottleneck. Without tracking review load, high-volume agent output causes rubber-stamping or review abandonment, undermining the human oversight that L5+ depends on.

Review burden tracking measures human review fatigue and ensures sustainable review load.

## Metrics

| Metric                    | Description                                                      | Source                                                            |
| ------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| PRs per reviewer per week | Volume of PRs assigned to or reviewed by each person             | `gh pr list --search "reviewed-by:USERNAME"`                      |
| Average review time       | Time between PR creation and first review comment/approval       | PR timeline events via GitHub API                                 |
| Review-to-merge latency   | Time between first review and merge                              | PR timeline events via GitHub API                                 |
| Auto-merge ratio          | Percentage of PRs merged via auto-merge vs human-initiated merge | `gh pr list --search "label:auto-merged"` or merge event metadata |
| Review depth              | Number of review comments per PR (proxy for thoroughness)        | `gh api repos/{owner}/{repo}/pulls/{number}/comments`             |

## Warning Thresholds

| Load     | PRs / Reviewer / Week | Action                                              |
| -------- | --------------------- | --------------------------------------------------- |
| Healthy  | < 5                   | No action needed                                    |
| Warning  | 5 - 10                | Reduce agent output frequency or distribute reviews |
| Critical | > 10                  | Pause autonomous PR creation until backlog clears   |

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

| Signal                                   | Interpretation                   |
| ---------------------------------------- | -------------------------------- |
| Average review time dropping             | Reviewers may be rubber-stamping |
| Review comments per PR dropping          | Less thorough reviews            |
| PRs merged with zero comments increasing | Reviews are being skipped        |
| Auto-merge ratio > 90%                   | Human gate may be decorative     |

## Sustainable Review Load

### Recommendations

1. **Cap agent PR volume** per reviewer per day. A reviewer can meaningfully review 1-2 non-trivial PRs per day alongside their own work.
2. **Batch small changes**. If 5 agent PRs each fix a one-line lint issue, batch them into one PR. The review cost of 5 trivial PRs is higher than one small PR.
3. **Tier review depth by risk**. Trivial changes (docs, config) need a glance; auth/database/deploy changes need line-by-line review. Use the existing `tier-classifier` workflow to route.
4. **Rotate reviewers**. No single person should be the default reviewer for all agent PRs. Distribute using GitHub's CODEOWNERS or round-robin assignment.
5. **Scheduled review windows**. Instead of interrupting flow with each agent PR, batch reviews into 1-2 daily windows.

## Automated collector

The ad-hoc `gh` snippets above are for spot checks. The repeatable collector is
[`scripts/acmm/review-burden-metrics.js`](../../scripts/acmm/review-burden-metrics.js).
It fetches closed PRs from the GitHub API (via `gh pr list`, so it reuses your
`gh auth` / `GITHUB_TOKEN` — no token is ever read or logged by the script) and
computes, per reviewer:

- **PRs reviewed** in the window (self-reviews excluded)
- **Mean review turnaround** — minutes from PR open to that reviewer's first review
- **Rubber-stamp ratio** — share of approvals submitted within the threshold (default < 5 min)

### Running it

```bash
node scripts/acmm/review-burden-metrics.js               # 7-day window, appends to JSON
node scripts/acmm/review-burden-metrics.js --days 30      # custom window
node scripts/acmm/review-burden-metrics.js --threshold 10 # custom rubber-stamp minutes
node scripts/acmm/review-burden-metrics.js --dry-run      # print only, no file write
```

### Schedule

`.github/workflows/metrics-collectors.yml` runs the collector daily at 11:29
UTC with `--days 7` and opens a PR with the updated `metrics/review-burden.json`
(#5528). Before that workflow existed, nothing scheduled this collector at all:
the file held exactly one entry, from a one-off manual run on 2026-06-14, and
stayed that way for three months. `/learning-loop` could not have filled the gap
— it runs as a Claude Code Remote session, which has no `gh` CLI, and this
collector shells out to `gh` (`.claude/rules/gotchas.md` § Claude Code Remote).
GitHub Actions runners have `gh` preinstalled and authenticate with the job's
`GITHUB_TOKEN`, so no extra secret is needed.

### Where results live

Each run appends one timestamped entry to **`metrics/review-burden.json`**
(an array, so trend-over-time is preserved). The script also prints a
human-readable per-reviewer breakdown to stdout.

### Reading the JSON

```bash
# Most recent run's per-reviewer load
jq '.[-1].reviewers' metrics/review-burden.json

# Trend: overall rubber-stamp ratio across every run
jq '[.[] | { ts: .timestamp, ratio: .summary.overall_rubber_stamp_ratio }]' \
  metrics/review-burden.json
```

Each entry's shape:

```jsonc
{
  "timestamp": "2026-06-13T...Z",
  "window_days": 7,
  "rubber_stamp_threshold_minutes": 5,
  "total_closed_prs": 73,
  "reviewers": [
    {
      "login": "...",
      "prs_reviewed": 4,
      "mean_review_minutes": 12.5,
      "approvals": 4,
      "rubber_stamps": 0,
      "rubber_stamp_ratio": 0,
    },
  ],
  "summary": {
    "total_reviewers": 3,
    "total_reviews": 11,
    "overall_rubber_stamp_ratio": 0.09,
    "overall_rubber_stamps": 1,
    "overall_approvals": 11,
    "review_coverage": "measured",
    "no_formal_review_stage": false,
  },
}
```

The metric math is unit-tested in
[`scripts/__tests__/review-burden-metrics.test.mjs`](../../scripts/__tests__/review-burden-metrics.test.mjs).

### This repo has no formal review stage — and the JSON now says so (#5619)

Every entry carries `summary.review_coverage`, which is the reason behind the
numbers rather than just the numbers:

| `review_coverage`        | Meaning                                                                     |
| ------------------------ | --------------------------------------------------------------------------- |
| `measured`               | At least one formal review was counted. The burden metrics mean something.  |
| `no-formal-review-stage` | PRs were sampled, none carried a formal review. An honest structural zero.  |
| `no-prs-sampled`         | Nothing was sampled, so nothing was assessed. Never a clean bill of health. |
| `unknown`                | An entry written before #5619. Not classified, and never treated as a zero. |

`summary.no_formal_review_stage` is the boolean form, true only for the second
row. **It is never inferred from zero counts** — that is the whole point.

Measured 2026-09-21, this repo sits in the `no-formal-review-stage` row and the
zero is real, not a collector bug:

```console
$ gh pr list --state closed --limit 100 --json number,reviews \
    | jq '[.[] | select((.reviews|length) > 0)] | length'
0

$ gh api repos/mattbutlerengineering/mattbutlerengineering/pulls/5640/reviews --jq 'length'
0
```

`gh pr list --json reviews` and `GET /repos/.../pulls/{n}/reviews` were
cross-checked on the same 20 PR numbers and agreed on zero for every one — while
both report the single `APPROVED` review on PR #3711, which proves the
extraction works and the field shape is right. Only three PRs in the repo's
entire history carry a formal review (#397, #3687, #3711).

The cause is structural: PRs here merge via auto-merge on green CI, and the
`Automated PR Review` that runs on every one of them is a GitHub **check run**,
not a `PullRequestReview` submission — the API the collector queries never sees
it. So the rubber-stamp ratio is _undefined_, not 0%.

This distinction matters because a collector that fetched nothing also produces
`total_reviews: 0`. A metric that reads 0 for two different reasons is the
silent-zero defect class in
[`.claude/rules/gotchas.md`](../../.claude/rules/gotchas.md) § Metrics /
staleness detection — the explicit `review_coverage` field is what keeps the two
apart.

### Staleness self-check

A collector that stops producing looks exactly like one that has nothing to
report, which is how the three-month gap went unnoticed. `scripts/metrics-freshness.mjs`
(#5529) now grades the file itself: `empty` when it has no entries, `stale` when
the newest `timestamp` is older than the threshold in `FRESHNESS_POLICY` (3 days
for a daily collector). Run it by hand with `node scripts/metrics-freshness.mjs`
— it exits 1 on any non-fresh metric, and on an empty result set, so it can
never report a vacuous pass.

Two consumers, one decision function: the `metricsFreshness` sensor in
`scripts/sensors-registry.mjs` puts the verdict into `/learning-loop`'s normal
regression triage, and the workflow step above files a deduped `ci-fix` issue
directly (deliberately without `ready` — a stale or empty collector needs
human judgement about production access, not a queue pickup).

### On the AI-health page

The latest entry's headline numbers — reviewers, reviews, rubber-stamp ratio,
and closed PRs in the window — render in the **Review Burden** panel on
`/ai-health` (#5530), sourced from the `reviewBurden` sensor. When the sensor is
unavailable the panel says so explicitly rather than rendering nothing, so an
empty collector is visible on the page instead of looking like a quiet week.

When `no_formal_review_stage` is true the panel stops reporting a rubber-stamp
ratio at all (it renders the `—` placeholder) and prints a note naming the
structural zero. A literal "0.0% rubber-stamped" reads as a passing score, which
is exactly backwards for a repo whose human review gate does not exist: there is
no burden being carried well, there is no burden being measured.

## Integration with /progress-tracker

The `/progress-tracker` skill already reports issue and PR metrics. Review burden extends this with:

- **Review load per contributor**: PRs reviewed this week, average review time
- **Queue depth**: Open PRs awaiting review
- **Auto-merge ratio**: Percentage of PRs auto-merged vs manually merged
- **Rubber-stamp risk**: PRs merged with zero comments or sub-60-second review time

These metrics surface alongside existing progress data so the team sees both output velocity and review sustainability in one view.
