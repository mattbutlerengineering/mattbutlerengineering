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
2. Implement the single most useful, reasonably-sized change (Small/Medium, low-risk, high-value) via TDD + full gates (pnpm lint, typecheck, test in the affected packages), and open ONE PR targeting main, titled `<type>(<scope>): weekly improve <YYYY-MM-DD> — <short description>` (e.g. `fix(routines): weekly improve 2026-09-19 — dedupe stale worktree reaper`) so the PR is identifiable as this routine's output rather than indistinguishable background implement-queue traffic.
3. File the remaining strong findings as GitHub issues labeled `ready`, each with self-contained acceptance criteria, so /implement-queue can drain them.
4. Weekly eval checkpoint: run the agent evaluation suite once to catch slow-drift quality regressions. Invoke it as `pnpm build --filter @mbe/cli... && node tools/cli/dist/index.js agent eval` — there is no `mbe` binary on PATH and `pnpm exec mbe` fails with `Command "mbe" not found`, because nothing in the workspace depends on `@mbe/cli`, so no `node_modules/.bin/mbe` symlink is ever created. Act on the exit code, never on the printed score: **exit 1** is a genuine run whose pass rate regressed — file a `ready` issue. **Exit 2** is `suiteDidNotRun` (0 turns / $0 cost, no `ANTHROPIC_API_KEY`), which is the expected result in this sandbox per the #3571 decision not to provision eval credentials here — treat it as a silent no-op, never file an issue for it, and never report it as a baseline. If a run does exit 0, `metrics/eval-reports.jsonl` gained a row: commit only that path on a branch and open a PR titled `chore(metrics): eval baseline <date>` labeled `has-pr`, or the row dies with this ephemeral checkout. This is the only scheduled paid eval.
5. Append a dated entry to `.claude/improvement-loop/log.md` naming the PR number you opened in step 2 — or, if no change was implemented this week, explicitly recording that no PR opened and why. A no-op week must be a positive, logged signal, not a silent absence.

Do not merge anything — every change lands as a reviewable PR. Never fetch live-site URLs (no egress to production, issue #2920).
```
