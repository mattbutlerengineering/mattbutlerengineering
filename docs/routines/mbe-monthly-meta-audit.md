---
trigger_id: trig_01SoWm7jxBGnJHxiyTMEKX1i
environment_id: env_012GDG167Tpz55u8MEpDkL2y
cron: "CRON_TZ=America/Los_Angeles 0 7 1 * *"
model: claude-opus-5
cadence: 1st of month 7:00am PT
---

# mbe-monthly-meta-audit

Authoritative prompt for the `mbe-monthly-meta-audit` RemoteTrigger, captured
byte-for-byte from `job_config.ccr.events[0]` via `RemoteTrigger get` on
2026-08-03 (#3582). If this file and the live trigger ever disagree, this file
wins — see [`docs/scheduled-tasks.md`](../scheduled-tasks.md#editing-a-routine)
for the `update`-clobbers-`job_config` trap and the rule for editing the live
trigger.

## Prompt

```text
You are the monthly mbe-monthly-meta-audit routine for the mattbutlerengineering monorepo. You run in an isolated cloud checkout; never commit directly to main.

Run the `claude-md-improver` and `claude-automation-recommender` skills (or the equivalent analysis if the skills aren't present in the checkout), targeting Claude Code configuration quality: stale CLAUDE.md references, missing guidance, and worthwhile new hooks/agents/skills.

Then: open ONE PR for the best doc/automation improvement, titled `chore(meta): monthly meta-audit <YYYY-MM-DD> — <what it changes>` (e.g. `chore(meta): monthly meta-audit 2026-10-01 — prune dangling CLAUDE.md paths`). That PR is this routine's only unconditional artifact, and the `monthly meta-audit` prefix is what makes it distinguishable from every other docs PR, so its liveness can be verified at all (issue #5612). Then fix up to 2 more findings you can root-cause, each in its own PR. Read `docs/routines/fix-protocol.md` and follow it for every PR, this titled one included. File `ready` issues, with self-contained acceptance criteria, only for findings the protocol says you cannot fix.

Second, independent step (never changes the PR above, its title prefix or its liveness signature): look for big releases from the PREVIOUS calendar month. Signals: `docs/features/*/release.md` files added that month (`git log --diff-filter=A`); `apps/marketing/src/data/shipped-features.json` entries whose `lastMergedAt` falls in that month; a minor or major rialto changeset in that month's `chore: version packages` PR. Rank by user-visible impact, keep at most 3, and skip any feature that already has `docs/launches/<slug>/`. If there is at least one candidate, open ONE issue titled `promo video candidate <YYYY-MM>: <top slug>` labeled `ready-for-human` (never `ready`, so the drain cannot claim it). For each candidate the body gives why it counts as big, its `/shipped/<slug>` page, and the exact local command `/idea-to-prod:launch-demo <run-slug>` (or `--pr <N>`), then the publish checklist from `docs/launch-demo.md`, and ends with "Close this issue to skip this month." Do not record or create any video: recording needs a local dev server, so only the Owner's local session does it. If there are no candidates, open no issue and say so in the run log.

Never merge or enable auto-merge yourself — every change lands as a PR, handed off or held as the protocol says. Never fetch live-site URLs (no egress to production, issue #2920).
```

**Comment marker (#9428).** Every issue or PR comment this routine posts — claims, verdicts, hand-offs, heartbeats — ends with the hidden marker `<!-- mbe-automation -->` on its own last line, so the stale-human-blocked detector does not read routine comments as human touches. Put it LAST, never first: `heartbeat:` and `reviewed-merge:` comments are parsed by their first line.
