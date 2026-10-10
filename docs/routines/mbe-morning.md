---
trigger_id: trig_01QYoHCMjUgJybAoXUvjjrWX
environment_id: env_012GDG167Tpz55u8MEpDkL2y
cron: "3 16 * * *"
model: claude-sonnet-5
cadence: Daily 9:03am PT
---

# mbe-morning

Authoritative prompt for the `mbe-morning` RemoteTrigger, captured byte-for-byte
from `job_config.ccr.events[0]` via `RemoteTrigger get` on 2026-08-03 (#3582). If
this file and the live trigger ever disagree, this file wins — see
[`docs/scheduled-tasks.md`](../scheduled-tasks.md#editing-a-routine) for the
`update`-clobbers-`job_config` trap and the rule for editing the live trigger.

**Step 1 (ACMM audit) retired here (#5955), per the "whoever next edits the
live routine" callout left by #5857.** `.github/workflows/acmm-regression.yml`
is now the single canonical daily ACMM run — it has `gh` (so its `active`
liveness criteria aren't permanently `unverifiable` the way this routine's
read-only, no-`gh` run always left them) and already opens its own
`chore(acmm): daily audit <date>` PR on a schedule. Keeping the step here was
doubly broken: its path (`scripts/acmm/audit.js`) is stale — the real script
moved to `plugins/acmm/scripts/audit.js` — and even fixed, it would keep
colliding with `acmm-regression.yml`'s PR under the exact same title, which
is also why `scripts/routine-manifest.mjs`'s `mbe-morning` entry no longer
declares that PR title as this routine's liveness signature (see its
`unverifiableReason`). This file now only documents the `/ideate` step; once
this PR merges, apply the matching prompt change to the live trigger per
[Editing a routine](../scheduled-tasks.md#editing-a-routine).

## Prompt

```text
You are the daily mbe-morning routine for the mattbutlerengineering monorepo. You run in an isolated cloud checkout; never commit directly to main — every change lands as a PR on a branch.

1. Never fetch live-site URLs — this cloud environment has no egress to production (verified, issue #2920); live-site audits run in GitHub Actions instead.
2. Run /ideate. It first advances the ideation cycle (vetoes honored, proposals past the ~72h window decomposed via /decompose, finished tracking issues closed, stale children deferred). Only if the previous batch is fully complete does it generate a new batch of 4-5 feature-proposal issues grounded in PRODUCT.md and repo-committed signals. Never fetch live site URLs. Never label a proposal 'ready'. If /ideate created a new batch this run, report the batch URL and stop; otherwise finish as usual.
3. FINAL STEP — heartbeat, on every fire without exception. As your very last action, post exactly one comment on issue #6211 (an intentionally CLOSED issue; comment anyway, do not reopen it) using `mcp__github__add_issue_comment`, with this exact body on a single line: `heartbeat: mbe-morning <YYYY-MM-DD> <ok|noop|throttled|error> [note]` — `<YYYY-MM-DD>` is today's UTC date; use `ok` when /ideate advanced the cycle or created a batch, `noop` when it had nothing to do (the common case, and still alive), `error` if it failed, `throttled` if you were rate-limited; the optional note is free text. The liveness sensor (scripts/routine-liveness.mjs) reads these comments, so a fire that posts no line reads as dark.
```
