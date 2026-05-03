# AI Ops Runbook

How humans debug, audit, and override the autonomous systems running in this
repo. Read this when an AI agent or scheduled trigger does something
unexpected — a surprise commit, a strange PR, a label that shouldn't have
moved.

## What's running autonomously

| System                   | Where it runs                  | What it does                                                                                      | How to pause                                       |
| ------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `mbe-acmm-audit`         | RemoteTrigger, daily 10:00 PT  | `node plugins/acmm/scripts/audit.js --apply --badge` — files L+1 gap issues, updates README badge | Disable trigger at https://claude.ai/code/routines |
| `mbe-light-audit`        | RemoteTrigger, Tue–Sun 9:41 PT | `/site-audit` lite — crawls live site, files perf/a11y issues                                     | Same                                               |
| `mbe-deep-audit`         | RemoteTrigger, Mon 8:23 PT     | `/site-audit` deep — Lighthouse + Playwright full sweep                                           | Same                                               |
| `mbe-issue-worker`       | RemoteTrigger, every 2h        | Picks up `ready`-labeled issues, runs `mbe agent run`, opens PRs                                  | Same                                               |
| `mbe-progress-tracker`   | RemoteTrigger, daily 5:11 PT   | Logs metrics to `metrics/`, tunes circuit breaker                                                 | Same                                               |
| Local `/loop`            | Your terminal                  | Self-paced or fixed-interval prompt loop                                                          | Close terminal or omit `ScheduleWakeup` call       |
| `mbe agent run` (manual) | Your terminal                  | One-shot agent that opens a PR                                                                    | `mbe agent cancel <id>`                            |

## Trace a commit back to its trigger

When you find a commit on `main` and aren't sure what caused it:

1. **Check the commit author.** Agent commits use `Matt Butler` (your git user) — the agent shells out as you. The clue is timing + message style.
2. **Check the issue link.** Agent PRs always link the source issue: `gh pr view <N> --json body | jq -r .body | grep -E "(Closes|Fixes) #"`.
3. **Check label history.** Issues move through `ready` → `in-progress` → `has-pr`. `gh issue view <N> --json timelineItems` shows the transitions and timestamps.
4. **Check RemoteTrigger logs.** Each trigger run logs at https://claude.ai/code/routines/<trigger_id>. The logs show the agent's prompt, tool calls, and final state.
5. **Check the PR description.** Agent-created PRs include the trigger context in the body — search for `🤖 Generated with [Claude Code]` or the agent's session ID.

## Pause autonomous workflows

In order of escalating reach:

| Reach             | Action                                                                                                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One trigger       | Disable at https://claude.ai/code/routines/<trigger_id>                                                                                                                             |
| All triggers      | Set every routine to `enabled: false` via the routines UI                                                                                                                           |
| One label         | `gh label edit ready --description "PAUSED — no agent pickup"` (does not stop pickup, but signals intent)                                                                           |
| All agent pickup  | Remove `ready` label from every issue: `gh issue list --label ready --json number --jq '.[].number' \| xargs -I{} gh issue edit {} --remove-label ready`                            |
| Pre-commit hook   | The pre-commit hook runs `eslint --fix` + `check-adr` + `pack-changed`. Bypass with `git commit --no-verify` only when the hook itself is the problem, never to skip a real failure |
| Production deploy | Static sites: revert in `apps/<site>/` and re-run `pnpm dlx wrangler@latest deploy`. Services: `doctl apps create-deployment $DO_APP_ID --wait` after reverting on `main`           |

## Review an agent session transcript

Sessions are persisted at `~/.claude/projects/-Users-mbutler-github-mattbutlerengineering/*.jsonl` (one per session). Each line is a JSON event:

```bash
# Find recent sessions
ls -lt ~/.claude/projects/-Users-mbutler-github-mattbutlerengineering/ | head -5

# Extract user messages from a session
jq -r 'select(.type == "user" and .isMeta != true) | .message.content[0].text' <session>.jsonl

# Extract tool calls
jq -r 'select(.type == "assistant") | .message.content[] | select(.type == "tool_use") | "\(.name): \(.input)"' <session>.jsonl
```

For agent runs (not interactive), the session ID is the worktree name: `~/.claude/projects/-Users-mbutler-github-mattbutlerengineering--worktrees-agent-<id>/`.

## Override an autonomous decision

The system favors human override at every layer:

- **Wrong PR opened** → `gh pr close <N> --comment "rejected: <reason>"` and add `agent-failed` to the source issue
- **Wrong label applied** → `gh issue edit <N> --remove-label <bad-label>` (the `auto-label` workflow won't re-apply if it sees a human edit)
- **Wrong commit on main** → `git revert <sha>` (never `git reset --hard origin/main` — the agent may be queued to push more)
- **Wrong scheduled trigger output** → Disable the routine, then comment on the most recent issue/PR explaining the bad output so future runs don't re-derive it

## Trace observability

| Signal             | Where                                   | Notes                                                                  |
| ------------------ | --------------------------------------- | ---------------------------------------------------------------------- |
| LLM session traces | Langfuse Cloud                          | `LANGFUSE_PUBLIC_KEY`-gated; one trace per `runSession()` call         |
| ACMM trend         | `.claude/acmm/state.json` history array | Each run appended; `node plugins/acmm/scripts/audit.js --trend` prints |
| Agent metrics      | `metrics/*.jsonl`                       | Per-PR success rate, cost, turn count                                  |
| ACMM PR metrics    | `docs/metrics/pr-acceptance.json`       | Backfilled from PR history                                             |

## Incident severity classification

| Severity                    | Definition                                                    | Examples                                                                                       | Response time                                                  |
| --------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **S1 — Production down**    | User-facing service is unreachable or returning errors        | Deploy broke a live site; agent pushed a migration that corrupted data                         | Immediately — pause all routines, revert, then investigate     |
| **S2 — Autonomous misfire** | Agent acted correctly per its rules but the outcome was wrong | Auto-merged a PR that breaks a downstream consumer; wrong label caused cascading agent pickups | Within 1 hour — close/revert the bad output, pause the trigger |
| **S3 — Drift / noise**      | System is working but producing low-value output              | Flaky issue filed repeatedly; stale metric inflating dashboard; ACMM badge flickering          | Next business day — file `meta-improvement` issue              |

## Incident response flowchart

```
Something unexpected happened
        │
        ├─ Is production affected?
        │   YES → S1: revert immediately, pause all routines
        │   NO ─┐
        │       ├─ Did an agent act on its own?
        │       │   YES → S2: close/revert output, pause that trigger
        │       │   NO ─┐
        │       │       └─ S3: file meta-improvement issue
        │       │
        ├─ Trace the commit (see "Trace a commit" above)
        ├─ Identify root cause (see "Root cause checklist" below)
        ├─ Fix and verify
        └─ Run post-incident review
```

## Root cause checklist

When investigating an autonomous failure, check these in order:

1. **Was the trigger input wrong?** Check the issue body or audit output that triggered the agent. Bad input → bad output.
2. **Did the agent misread the codebase?** Check if the agent's tool calls read stale files (worktree not updated, cached checkout).
3. **Did CI pass but the change was still wrong?** This means a test gap — file a `ci-fix` issue for the missing coverage.
4. **Did the agent exceed its budget/turns?** Check `mbe agent status <id>` — a stuck agent may have committed partial work.
5. **Did a concurrent agent conflict?** Two agents editing the same file race. Check `git log --all --oneline --graph` for branch conflicts.
6. **Did credentials or quotas expire?** Check `gh auth status`, `doctl auth list`, and Langfuse dashboard for auth errors.

## Discovering problems proactively

Don't wait for users to report issues. These signals surface problems early:

| Signal                             | Where to check                              | What it means                                  |
| ---------------------------------- | ------------------------------------------- | ---------------------------------------------- |
| `agent-failed` label count rising  | `gh issue list --label agent-failed`        | Agent capability gap or recurring bad input    |
| ACMM level regression              | `.claude/acmm/state.json` → `history` array | A file was deleted or a workflow broke         |
| CI flake rate > 1%                 | ACMM report `Signal quality` section        | Test isolation problem or infrastructure flake |
| Agent PR rejection rate > 20%      | `docs/metrics/pr-acceptance.json`           | Agent instructions need tuning                 |
| Langfuse error rate spike          | Langfuse Cloud dashboard → Traces           | API quota, model error, or prompt regression   |
| RemoteTrigger consecutive failures | https://claude.ai/code/routines             | Auth token expired or repo state invalid       |

## Post-incident review process

After resolving any S1 or S2 incident:

1. **Document what happened.** Create a `docs/incidents/YYYY-MM-DD-<slug>.md` file with: timeline, root cause, impact, and resolution.
2. **Identify the missing gate.** Every autonomous failure represents a missing check. What test, hook, or policy would have caught this?
3. **Implement the gate.** Add the test, hook, or workflow that prevents recurrence. Link the incident doc in the commit message.
4. **Update this runbook.** If the incident revealed a new failure mode, add it to the severity table or root cause checklist.
5. **Re-enable the paused trigger.** Only after the gate is in place and verified.

## When to escalate to human-only mode

Stop all autonomous activity when:

- More than 3 consecutive agent PRs are rejected as wrong
- An agent commits to `main` with a message that doesn't match a known trigger
- The ACMM badge regresses unexpectedly (`acmm:state.json` shows a level drop)
- A scheduled trigger's most recent run errored with an authentication or quota issue you didn't expect
- Any deployment to production failed and the agent re-attempted it more than once

In all those cases: pause every routine in https://claude.ai/code/routines, then file an issue tagged `meta-improvement` describing what went wrong, then resume routines one at a time after the issue is resolved.
