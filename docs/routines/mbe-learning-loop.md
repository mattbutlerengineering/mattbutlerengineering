---
trigger_id: trig_018hcYeu5uCXgiddRwqaeYwd
environment_id: env_012GDG167Tpz55u8MEpDkL2y
cron: "CRON_TZ=America/Los_Angeles 0 11 * * *"
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

Constraints: never fetch live-site URLs — this cloud environment has no egress to production (issue #2920); use only repo-committed signals. Persist with `node scripts/persist-metrics.mjs --routine learning-loop`: telemetry goes straight to the metrics-data branch (checked out at .metrics-data/ when the session starts), and only main-located files (.claude/improvement-loop/*, apps/marketing/public/*.json) go through a PR titled "chore(metrics): learning-loop <date>" labeled has-pr. Do not auto-merge anything.
```

**Comment marker (#9428).** Every issue or PR comment this routine posts — claims, verdicts, hand-offs, heartbeats — ends with the hidden marker `<!-- mbe-automation -->` on its own last line, so the stale-human-blocked detector does not read routine comments as human touches. Put it LAST, never first: `heartbeat:` and `reviewed-merge:` comments are parsed by their first line.
