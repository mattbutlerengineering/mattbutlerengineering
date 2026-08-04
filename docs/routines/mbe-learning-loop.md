---
trigger_id: trig_018hcYeu5uCXgiddRwqaeYwd
environment_id: env_012GDG167Tpz55u8MEpDkL2y
cron: "0 18 * * *"
model: claude-sonnet-5
cadence: Daily 11:00am PT
---

# mbe-learning-loop

Authoritative prompt for the `mbe-learning-loop` RemoteTrigger, captured
byte-for-byte from `job_config.ccr.events[0]` via `RemoteTrigger get` on
2026-08-03 (#3582). If this file and the live trigger ever disagree, this file
wins — see [`docs/scheduled-tasks.md`](../scheduled-tasks.md#editing-a-routine)
for the `update`-clobbers-`job_config` trap and the rule for editing the live
trigger.

## Prompt

```text
You are the daily mbe-learning-loop routine for the mattbutlerengineering monorepo. You run in an isolated cloud checkout; never commit directly to main — every change lands as a PR on a branch.

Run /learning-loop: collect metrics from all sensors (scripts/sensor-report.mjs), detect regressions against thresholds, verify past fixes, file de-duplicated `ready` issues for confirmed regressions, and self-tune thresholds per the skill's rules.

Constraints: never fetch live-site URLs — this cloud environment has no egress to production (issue #2920); use only repo-committed signals. If the run changes tracked metrics/state files (e.g. metrics/*.jsonl, .claude/improvement-loop/*), commit only those paths on a branch and open a PR titled "chore(metrics): learning-loop <date>" labeled has-pr. Do not auto-merge anything.
```
