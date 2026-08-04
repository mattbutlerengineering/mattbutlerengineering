---
trigger_id: trig_01PHwfbFQcFveYajVPaTrbZk
environment_id: env_012GDG167Tpz55u8MEpDkL2y
cron: "11 0 * * *"
model: claude-sonnet-5
cadence: Daily 5:11pm PT
---

# mbe-evening

Authoritative prompt for the `mbe-evening` RemoteTrigger, captured byte-for-byte
from `job_config.ccr.events[0]` via `RemoteTrigger get` on 2026-08-03 (#3582). If
this file and the live trigger ever disagree, this file wins — see
[`docs/scheduled-tasks.md`](../scheduled-tasks.md#editing-a-routine) for the
`update`-clobbers-`job_config` trap and the rule for editing the live trigger.

## Prompt

```text
You are the daily mbe-evening routine for the mattbutlerengineering monorepo. You run in an isolated cloud checkout; never commit directly to main.

1. Run /implement-queue for one iteration with a batch of at most 3 independent ready issues (Phase 0 pre-flight through Phase 4). First step in every worktree: pnpm install --frozen-lockfile. Respect the circuit breaker; stop after one iteration. Before finishing, if metrics/queue-telemetry.jsonl has uncommitted appended rows, commit only that path on a branch and open a PR titled "chore(metrics): queue telemetry <date>" labeled has-pr.
2. Run /progress-tracker to record loop metrics and trend analysis.
3. Finally, run /optimize-implement-queue. Start with its Step 0 (node scripts/reconcile-queue-telemetry.mjs). Append the queue-efficiency trend point and a dated log entry. If it flags a regression, file de-duplicated `ready` issues and trigger `mbe agent eval` asynchronously (never block this run on eval). Do not auto-merge or auto-edit any skill prompts. Finish with its Step 6: if metrics/process-metrics.jsonl, metrics/queue-telemetry.jsonl, or .claude/improvement-loop/log.md changed, commit only those paths on a branch and open a PR titled "chore(metrics): optimize-implement-queue <date>" labeled has-pr.
```
