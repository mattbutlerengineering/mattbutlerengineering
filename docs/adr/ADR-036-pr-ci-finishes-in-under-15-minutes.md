---
id: ADR-036
title: PR CI Reaches CI Gate in Under 15 Minutes at p90, Measured Push to Result
status: active
date: 2026-11-27
---

# ADR-036: PR CI Reaches CI Gate in Under 15 Minutes at p90, Measured Push to Result

## Context

On 2026-11-27 PR CI took 38-48 minutes of wall time from push to `CI Gate`, while the critical path did about 8 minutes of work. The rest was waiting: jobs sat queued for 5-26 minutes under the account's concurrent-job cap.

Two things fed that queue:

- **Job count.** `ci.yml` fans out into about 25 jobs, and each push also starts about 12 bookkeeping workflow runs (labelling, merge-queue, attribution, ADR checks).
- **Advisory work ahead of required work.** The Hospitality E2E shards (advisory, not part of `CI Gate`) ran 24.7, 17.4 and 13.5 minutes, about 56 runner-minutes per push, and started ahead of `CI` jobs.

A slow gate costs the hospitality work it guards: every fix waits on it, and agents and the Owner stack unmerged work behind it. ADR-016 (§ CI critical-path composition) describes what the gate is made of; it set no time target for it.

## Decision

**PR CI must reach `CI Gate` in under 15 minutes at p90, push to result.**

**The clock.** It starts at the `ci.yml` run's `created_at`, so time spent queued counts, and stops at the `CI Gate` job's `completed_at`. The population is `pull_request` runs of `ci.yml` over a rolling 7 days. Cancelled, still-running and re-run attempts are excluded before sampling; the skipped count is sampled runs whose `CI Gate` never completed. A p90 of exactly 15.0 minutes meets the target; anything above breaches it.

**Rules.**

1. New CI work (jobs, steps, workflows) must not push the p90 over 15 minutes. A change that adds runner time says what it costs in its PR.
2. Advisory workflows (E2E, visual, scheduled checks) must not starve required jobs of runners. They start after, or in a lane that cannot hold slots ahead of, the required path.
3. Bookkeeping workflows run only when their event applies (job-level `if:`), so a push does not start runs that will exit immediately.

**The check.** `scripts/collect-sdlc-speed.mjs` computes `pushToGate` (p50, p90, queue share, skipped count, slowest jobs) from each run's jobs, and records `absoluteBreach` in its `sdlcSpeed` row when p90 is above `CI_PUSH_TO_GATE_P90_MAX_MIN` (15). The daily `metrics-collectors.yml` workflow files or refreshes one `ci-fix` issue under dedupe key `ci-push-to-gate-p90` on a breach. That issue is never labelled `ready`: a human picks the lever. Tracking is #10009.

## Consequences

- The target is measurable and its breaches reach a durable issue, not a chat message.
- Queue time is now the Owner's and the factory's problem, not just job duration. Levers include fewer, fatter jobs, gating advisory runs, and more runner capacity.
- Some levers need the Owner (a plan change, a self-hosted runner); they are tracked as issues, not assumed.
- The sensor samples up to 150 runs a week with one API call each; on a busier week the runs are sampled evenly across the whole 7 days (every ceil(n/150)-th success/failure run, first attempts only), so the window stays 7 days; `skipped` counts sampled runs with no completed CI Gate.
- Until #10009 closes, the check is expected to breach daily; the single deduped issue keeps that to one open item.

## Alternatives Considered

- **Median (p50) target.** Rejected. A median hides the slow tail, and the tail is what blocks merges and makes agents wait.
- **Clock starts at run start (`run_started_at`).** Rejected. It excludes queue time, which was most of the 2026-11-27 delay, so it would have read about 8 minutes while pushes waited 40.
- **Move to the GitHub Pro plan to double the concurrent-job cap (#10012).** Not an alternative to the target but one lever toward it; an Owner decision, tracked there.
- **Self-hosted runner (#10013).** Also a lever, with maintenance and security costs; an Owner decision, tracked there.

## See Also

- [ADR-016](ADR-016-green-main-merge-gating.md), § CI critical-path composition
- #10009 (tracking: PR CI under 15 minutes)
- `scripts/collect-sdlc-speed.mjs`, `.github/workflows/metrics-collectors.yml`
