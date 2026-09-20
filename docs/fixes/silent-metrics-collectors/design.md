---
title: Silent metrics collectors — root cause and fix design
date: 2026-09-20
issues: [5527, 5528, 5529, 5530, 5531]
tracking: 5532
proposal: 5442
---

# Silent metrics collectors: root cause and fix design

Two metrics collectors exist, are unit-tested, are referenced from docs, and
have between them produced **one row, once, three months ago**. This note
records what was verified (not assumed), what the fix is, and the one part of
it no agent can complete.

| Metric                       | File                           | State on `origin/main` @ 2026-09-20               |
| ---------------------------- | ------------------------------ | ------------------------------------------------- |
| `domain-metrics` (jsonl)     | `metrics/domain-metrics.jsonl` | **0 bytes** — never produced a single row         |
| `review-burden` (json array) | `metrics/review-burden.json`   | **1 entry**, `2026-06-14T04:52:03.798Z`, ~98d old |

## Verification (re-run for this note, not inherited from the issue body)

Run from the repo root at commit `origin/main`:

```bash
# 1. No workflow has ever invoked either collector.
git grep -l "domain-metrics\|review-burden-metrics" origin/main -- .github/workflows/
#   -> no output, exit 1

# 2. No documented secret for the domain collector.
grep -n "DOMAIN_METRICS" docs/SECRETS.md
#   -> no output, exit 1

# 3. The review-burden collector shells out to `gh`.
grep -n "execFileSync" scripts/acmm/review-burden-metrics.js
#   -> 24: import { execFileSync } from "node:child_process";
#   -> 69:   const raw = execFileSync(

# 4. The `gh`-absent-in-cloud-sessions gotcha this depends on.
grep -n "gh\` CLI does not exist" .claude/rules/gotchas.md
#   -> 138: - **The `gh` CLI does not exist in Claude Code Remote ...**
```

All four confirm the decomposition's diagnosis. Nothing was found to correct.

## Root cause 1 — `scripts/collect-domain-metrics.mjs` (two independent faults)

**(a) It never runs anywhere with production egress.** Its only caller is
`.claude/skills/learning-loop/SKILL.md`, invoked by the `mbe-learning-loop`
RemoteTrigger — a Claude Code Remote cloud session. Those sessions have no
egress to production (the constraint #2920 records for the `mbe-morning`
routine). The script is explicit that this must degrade quietly: its own
header says "a network error or non-2xx response must degrade gracefully,
never throw. `main()` always exits 0." That is correct behaviour for a
collector, and it is also exactly why the failure was invisible for months —
a skipped run and a successful run are indistinguishable from the outside.

**(b) Even with egress, nothing has ever configured `DOMAIN_METRICS_VENUE_ID`.**
No workflow set it, and `docs/SECRETS.md` does not document it. Without a
venue id the script skips by design.

Either fault alone produces zero rows. Both were present the whole time, so
fixing only the egress half would still yield an empty file.

## Root cause 2 — `scripts/acmm/review-burden-metrics.js`

It shells out to the `gh` CLI (`execFileSync("gh", …)`, line 69). Per
`.claude/rules/gotchas.md` § Claude Code Remote / cloud sessions, **`gh` does
not exist in Claude Code Remote sessions** — any script invoking it dies with
`ENOENT`. Separately, nothing schedules this collector at all; the single
`2026-06-14` entry was a one-off manual run.

This is a _different_ gap from the domain collector's. The domain collector is
scheduled but unreachable and unconfigured; this one is reachable-in-principle
but never scheduled.

## Recommended fix: a scheduled GitHub Actions workflow

GitHub Actions runners have both production egress and `gh` preinstalled —
the two things cloud RemoteTrigger sessions lack. The precedent in this repo
is `.github/workflows/production-feedback.yml`: a `schedule:`-triggered
workflow that already reaches `mattbutlerengineering.com` and commits its
results back on a recurring cadence.

Implemented in #5528 as `.github/workflows/metrics-collectors.yml` — a new
workflow rather than a new job on `production-feedback.yml`, so that a failure
in either concern cannot mask the other and each keeps its own cron and
concurrency group. It follows the same shape:

1. run both collectors (each degrades to a skip, neither fails the job);
2. run the freshness self-check (#5529) and file a deduped `ci-fix` issue when
   the data is still dead;
3. open a PR with the changed metrics files — a bare push to protected `main`
   is rejected (GH006);
4. dispatch `ci.yml` and `tier-classifier.yml` on the automation branch (the
   `GITHUB_TOKEN` anti-recursion trap), then enable auto-merge through
   `scripts/merge-queue-eligibility.mjs check-merge`.

### Why the job does not fail on stale data

`scripts/scheduled-workflow-health.mjs` files a `["ci-fix", "ready"]` issue
after three consecutive failed _scheduled_ runs. A workflow that goes red
because the data is dead would (a) be read as "the workflow is broken" when
the workflow is the only part working, and (b) push an agent-unfixable issue
(the fix is a human-supplied secret) into implement-queue's pickup set. The
verdict therefore becomes a deduped issue **without** the `ready` label,
through the existing `fileIssue()` seam — durable, and not a second alerting
path.

## Why the existing guard did not catch this

`scripts/check-orphaned-collectors.mjs` exists for what looks like exactly this
failure — "a collector wired to nothing" — and it was green the whole time. Its
own header names the limitation: reachability is **import-level**, from a "live
root" (a script named by a workflow, a root `package.json` script, or a skill).
Both collectors were reachable from a live root. `.claude/skills/learning-loop/SKILL.md`
is a skill, and it named both. The root just could not do anything when it ran.

Measured during this work: adding both collectors to that check's
`GUARDED_MODULES` and then deleting `.github/workflows/metrics-collectors.yml`
leaves the check **passing** — the skill reference alone satisfies it. So the
entries would have been decorative, and they were not added.

**Reachability and capability are different questions.** The existing guard
answers the first. Only output freshness answers the second, which is why
#5529's check reads the produced data rather than the call graph.

## Hard blocker: a human must supply `DOMAIN_METRICS_VENUE_ID`

**This fix cannot fully self-heal.** `DOMAIN_METRICS_VENUE_ID` is a real
production venue identifier; no agent can invent it, and no code change can
derive it. Until a human sets it, the domain-metrics step will keep skipping
and the freshness check will keep reporting it — loudly, in an issue, every
day, which is the entire improvement over the previous silence.

```bash
gh secret set DOMAIN_METRICS_VENUE_ID --body "<venue-id>"
# Optional, only if production moves off the script's default base URL
# (https://api.mattbutlerengineering.com) or starts requiring auth:
gh secret set DOMAIN_METRICS_API_BASE_URL --body "<url>"
gh secret set DOMAIN_METRICS_TOKEN --body "<token>"
```

**Never omit `--body`** — in a non-interactive shell `gh secret set NAME`
reads from stdin, and empty stdin silently sets the secret to `""`
(`.claude/rules/gotchas.md` § Auth0 / E2E). An empty `DOMAIN_METRICS_VENUE_ID`
is indistinguishable from an unset one to the collector, so this would look
like the fix not working.

The workflow wires all three secrets now, so collection starts the next
scheduled run after the secret exists, with no further code change.

## `review-burden` needs no comparable secret

`scripts/acmm/review-burden-metrics.js` only reads this repo's own PRs and
reviews. `gh` on an Actions runner authenticates with the job's
`GITHUB_TOKEN`, which already carries `pull-requests: read`. Verified in this
session by running the collector locally with `--dry-run`: it produced a real
entry over a 100-closed-PR window. So the review-burden half of the fix is
expected to start working the first time the workflow runs, with no human
step at all.
