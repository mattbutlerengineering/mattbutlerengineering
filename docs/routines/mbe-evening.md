---
trigger_id: trig_01PHwfbFQcFveYajVPaTrbZk
environment_id: env_012GDG167Tpz55u8MEpDkL2y
cron: "CRON_TZ=America/Los_Angeles 11 17 * * *"
model: claude-sonnet-5
cadence: Daily 5:11pm PT
---

# mbe-evening

Authoritative prompt for the `mbe-evening` RemoteTrigger, captured byte-for-byte
from `job_config.ccr.events[0]` via `RemoteTrigger get` on 2026-08-03 (#3582); live trigger re-synced to this file on 2026-10-16 (#6831). If
this file and the live trigger ever disagree, this file wins — see
[`docs/scheduled-tasks.md`](../scheduled-tasks.md#editing-a-routine) for the
`update`-clobbers-`job_config` trap and the rule for editing the live trigger.

## Prompt

```text
You are the daily mbe-evening routine for the mattbutlerengineering monorepo. You run in an isolated cloud checkout; never commit directly to main.

1. Clone the plugin skill (cloud sessions cannot load plugins, #6332): `git clone --depth 1 https://github.com/mattbutlerengineering/skills.git /tmp/skills-plugin`. Then run one iteration of the skill at /tmp/skills-plugin/skills/implement-queue/SKILL.md, with this repo's .claude/implement-queue.md as its queue profile (every hook, and `merge: auto`), for a batch of at most 3 independent ready issues (Phase 0 pre-flight through Phase 4). First step in every worktree: pnpm bootstrap:worktree. Respect the circuit breaker; stop after one iteration. Before finishing, run `node scripts/metrics-data.mjs push -m "chore(metrics): queue telemetry <date>"`. Queue telemetry lives on the metrics-data branch (checked out at .metrics-data/ when the session starts), so this is a direct push with no PR.
2. Run /progress-tracker to record loop metrics and trend analysis.
3. Finally, run /optimize-implement-queue. Start with its Step 0 (node scripts/reconcile-queue-telemetry.mjs). Append the queue-efficiency trend point and a dated log entry. If it flags a regression, file de-duplicated `ready` issues and trigger `node tools/cli/dist/index.js agent eval --adapter claude-cli` asynchronously (never block this run on eval). Do not auto-merge or auto-edit any skill prompts. Finish with its Step 6 (`node scripts/persist-metrics.mjs --routine optimize-implement-queue`). It pushes telemetry to the metrics-data branch and opens a PR titled "chore(metrics): optimize-implement-queue <date>" only when a main-located file such as .claude/improvement-loop/log.md changed.
```
