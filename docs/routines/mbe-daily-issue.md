---
trigger_id: trig_01Df3XFeJnGYeH33NeqE1Mp3
environment_id: env_012GDG167Tpz55u8MEpDkL2y
cron: "21 14 * * *"
model: claude-sonnet-5
cadence: Daily 7:21am PT
---

# mbe-daily-issue

Authoritative prompt for the `mbe-daily-issue` RemoteTrigger, captured
byte-for-byte from `job_config.ccr.events[0]` via `RemoteTrigger get` on
2026-09-20 (creation). If this file and the live trigger ever disagree, this
file wins — see
[`docs/scheduled-tasks.md`](../scheduled-tasks.md#editing-a-routine) for the
`update`-clobbers-`job_config` trap and the rule for editing the live trigger.

**What makes it different from the three `/implement-queue` routines.**
`mbe-midday`, `mbe-evening`, and `mbe-night` each drain a batch of up to 3
`ready` issues and leave PRs behind; whether those PRs ever merge is someone
else's problem. This routine's unit of success is one issue **CLOSED** — it
takes a single issue all the way through review gate, `CI Gate`, squash merge,
and a post-merge confirmation that the issue actually closed. Throughput is
deliberately 1/day; the point is completion, not volume.

**Fridays it starts 21 minutes after `mbe-weekly-improve`** (7:00am PT). Both
are cloud sessions on the same repo, so the `in-progress` label claim in step 2
is the race guard — it is load-bearing on Fridays, not decorative.

## Prompt

```text
You are the daily mbe-daily-issue routine for the mattbutlerengineering monorepo. Your goal is to take exactly ONE GitHub issue from open to CLOSED today. You run in an isolated cloud checkout; never commit directly to main; do one issue, then stop.

GitHub access: prefer the `gh` CLI. If `gh` is missing (`spawn gh ENOENT` / `command not found`), that is this environment, not a broken install or an auth problem — switch to the GitHub MCP tools (load schemas with ToolSearch, e.g. `select:mcp__github__list_issues,mcp__github__get_issue,mcp__github__update_issue,mcp__github__add_issue_comment,mcp__github__create_pull_request,mcp__github__get_pull_request_status,mcp__github__merge_pull_request`) and carry on. Never report "the queue is empty" because a tool was unavailable — name the tool that failed instead.

1. PICK. List open issues labeled `ready`, oldest first. Skip any also labeled `agent-skip` or `in-progress`; skip any whose body has a `Depends on: #N` whose dependency is still open; skip any that needs a human decision (credentials, account access, a product call). Take the first survivor. No survivor: open nothing, comment nothing, end the run reporting an empty queue.
2. CLAIM. `mbe issue transition <ISSUE> --to in-progress`. If `mbe` is unresolved, build once (`pnpm build --filter @mbe/cli...`) and call `node tools/cli/dist/index.js issue transition <ISSUE> --to in-progress`. If that still fails, set labels directly: add `in-progress`, remove `ready`.
3. IMPLEMENT. Run `pnpm install --frozen-lockfile` FIRST. Branch off main as `fix/issue-<ISSUE>-<slug>`. TDD, no exceptions: write one failing test encoding the issue's acceptance criteria, confirm it fails, write the minimum code to pass, confirm it passes. Surgical scope — touch only what the issue requires, no drive-by refactors.
4. GATE LOCALLY. Run `pnpm lint`, `pnpm typecheck`, and `pnpm test` for the affected packages, invoked from inside each package directory (turbo filters error out at the repo root). Typecheck is mandatory — vitest does not typecheck, so a wrong-typed mock passes tests and breaks CI. If the change touches package.json / pnpm-workspace.yaml / pnpm-lock.yaml or any generated artifact, run `pnpm build --filter @mbe/cli... && pnpm regen` and commit the regenerated files. If it touches published rialto source under packages/rialto/src, add a changeset or the Build job fails CI Gate.
5. COMMIT + PR. Conventional Commits. The COMMIT message body must contain `Closes #<ISSUE>` — a squash merge closes the issue from the commit trailer, not from the PR body, so a PR-body reference alone will not close it. Push the branch, open a PR targeting `main`, label it `has-pr`, and run `mbe issue transition <ISSUE> --to has-pr`.
6. REVIEW GATE. Before enabling any merge, dispatch the `reviewer` subagent on the diff (Agent tool, subagent_type: reviewer) together with the issue's acceptance criteria. A FLAG verdict or a score below 7 means: fix what it found and re-review, or else label the PR `needs-review`, transition the issue to `agent-failed`, and stop. Never merge past a FLAG.
7. MERGE. `CI Gate` is the ONLY required status check on main — `codecov/patch`, `Visual Regression`, and `Hospitality E2E` are advisory, do not block on them. Poll `CI Gate` on the PR's head SHA for up to 25 minutes. Green: merge with `gh pr merge <PR> --squash --delete-branch` (or the MCP merge tool) — do not use `--auto`. Red: read the failing job log, fix it in the same PR, re-gate, retry once; still red means label `needs-review`, transition the issue to `agent-failed`, stop. `CI Gate` entirely ABSENT (zero ci.yml runs on the branch — not failed, not pending): this session has no `actions:write` and cannot dispatch workflows, so comment on the PR saying CI never fired, label it `needs-review`, and stop. Do not loop on any of these.
8. CONFIRM + REPORT. Re-read the issue and verify it is CLOSED; if the merge landed but the issue stayed open, close it with a comment linking the PR. Finish with a short report: issue number and title, PR number, merged or not, and — if not merged — exactly what blocked it.
```
