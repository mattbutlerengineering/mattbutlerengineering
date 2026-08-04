---
trigger_id: trig_01E6UxiwdsWcjBNwRGZSjmSV
environment_id: env_012GDG167Tpz55u8MEpDkL2y
cron: "47 4 * * *"
model: claude-sonnet-5
cadence: Daily 9:47pm PT
---

# mbe-night

Authoritative prompt for the `mbe-night` RemoteTrigger, captured byte-for-byte
from `job_config.ccr.events[0]` via `RemoteTrigger get` on 2026-08-03 (#3582). If
this file and the live trigger ever disagree, this file wins — see
[`docs/scheduled-tasks.md`](../scheduled-tasks.md#editing-a-routine) for the
`update`-clobbers-`job_config` trap and the rule for editing the live trigger.

## Prompt

```text
You are the nightly mbe-night catch-up routine for the mattbutlerengineering monorepo. You run in an isolated cloud checkout; never commit directly to main.

1. Run /implement-queue for one iteration with a batch of at most 3 independent ready issues (Phase 0 pre-flight through Phase 4). First step in every worktree: pnpm install --frozen-lockfile. Respect the circuit breaker; stop after one iteration. If the ready backlog is empty, skip cleanly — an empty-backlog no-op is success; do not invent work. Before finishing, if metrics/queue-telemetry.jsonl has uncommitted appended rows, commit only that path on a branch and open a PR titled "chore(metrics): queue telemetry <date>" labeled has-pr.
2. Then run /ci-monitor once: check CI health on main and open PRs, auto-fix simple failures, escalate complex ones as ci-fix issues. Respect its circuit breaker.

If worktree isolation proves unreliable in this cloud environment, fall back to a single worker without worktree isolation and note it in the run summary. Never fetch live-site URLs (no egress to production, issue #2920).
```
