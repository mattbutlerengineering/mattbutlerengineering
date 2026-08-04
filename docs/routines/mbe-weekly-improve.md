---
trigger_id: trig_01G12wULcCweXSb2jmVkChPW
environment_id: env_012GDG167Tpz55u8MEpDkL2y
cron: "0 14 * * 5"
model: claude-opus-5
cadence: Fri 7:00am PT
---

# mbe-weekly-improve

Authoritative prompt for the `mbe-weekly-improve` RemoteTrigger, captured
byte-for-byte from `job_config.ccr.events[0]` via `RemoteTrigger get` on
2026-08-03 (#3582). If this file and the live trigger ever disagree, this file
wins — see [`docs/scheduled-tasks.md`](../scheduled-tasks.md#editing-a-routine)
for the `update`-clobbers-`job_config` trap and the rule for editing the live
trigger.

## Prompt

```text
You are the weekly mbe-weekly-improve routine for the mattbutlerengineering monorepo. You run in an isolated cloud checkout; never commit directly to main.

1. Run the `improve` and `improve-codebase-architecture` skills (or the equivalent analysis if the skills aren't present in the checkout) and synthesize a prioritized findings list.
2. Implement the single most useful, reasonably-sized change (Small/Medium, low-risk, high-value) via TDD + full gates (pnpm lint, typecheck, test in the affected packages), and open ONE PR targeting main.
3. File the remaining strong findings as GitHub issues labeled `ready`, each with self-contained acceptance criteria, so /implement-queue can drain them.
4. Weekly eval checkpoint: run `mbe agent eval` once against the agent evaluation suite to catch slow-drift quality regressions. File a `ready` issue if the eval score regresses versus the prior baseline. This is the only scheduled paid eval.

Do not merge anything — every change lands as a reviewable PR. Never fetch live-site URLs (no egress to production, issue #2920).
```
