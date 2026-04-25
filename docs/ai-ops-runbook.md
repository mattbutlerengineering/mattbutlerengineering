# AI Ops Runbook

How humans debug, audit, and override the autonomous systems running in this
repo. Read this when an AI agent or scheduled trigger does something
unexpected — a surprise commit, a strange PR, a label that shouldn't have
moved.

## What's running autonomously

| System | Where it runs | What it does | How to pause |
|---|---|---|---|
| `mbe-acmm-audit` | RemoteTrigger, daily 10:00 PT | `node scripts/acmm/audit.js --apply --badge` — files L+1 gap issues, updates README badge | Disable trigger at https://claude.ai/code/routines |
| `mbe-light-audit` | RemoteTrigger, Tue–Sun 9:41 PT | `/site-audit` lite — crawls live site, files perf/a11y issues | Same |
| `mbe-deep-audit` | RemoteTrigger, Mon 8:23 PT | `/site-audit` deep — Lighthouse + Playwright full sweep | Same |
| `mbe-issue-worker` | RemoteTrigger, every 2h | Picks up `ready`-labeled issues, runs `mbe agent run`, opens PRs | Same |
| `mbe-progress-tracker` | RemoteTrigger, daily 5:11 PT | Logs metrics to `metrics/`, tunes circuit breaker | Same |
| Local `/loop` | Your terminal | Self-paced or fixed-interval prompt loop | Close terminal or omit `ScheduleWakeup` call |
| `mbe agent run` (manual) | Your terminal | One-shot agent that opens a PR | `mbe agent cancel <id>` |

## Trace a commit back to its trigger

When you find a commit on `main` and aren't sure what caused it:

1. **Check the commit author.** Agent commits use `Matt Butler` (your git user) — the agent shells out as you. The clue is timing + message style.
2. **Check the issue link.** Agent PRs always link the source issue: `gh pr view <N> --json body | jq -r .body | grep -E "(Closes|Fixes) #"`.
3. **Check label history.** Issues move through `ready` → `in-progress` → `has-pr`. `gh issue view <N> --json timelineItems` shows the transitions and timestamps.
4. **Check RemoteTrigger logs.** Each trigger run logs at https://claude.ai/code/routines/<trigger_id>. The logs show the agent's prompt, tool calls, and final state.
5. **Check the PR description.** Agent-created PRs include the trigger context in the body — search for `🤖 Generated with [Claude Code]` or the agent's session ID.

## Pause autonomous workflows

In order of escalating reach:

| Reach | Action |
|---|---|
| One trigger | Disable at https://claude.ai/code/routines/<trigger_id> |
| All triggers | Set every routine to `enabled: false` via the routines UI |
| One label | `gh label edit ready --description "PAUSED — no agent pickup"` (does not stop pickup, but signals intent) |
| All agent pickup | Remove `ready` label from every issue: `gh issue list --label ready --json number --jq '.[].number' \| xargs -I{} gh issue edit {} --remove-label ready` |
| Pre-commit hook | The pre-commit hook runs `eslint --fix` + `check-adr` + `pack-changed`. Bypass with `git commit --no-verify` only when the hook itself is the problem, never to skip a real failure |
| Production deploy | Static sites: revert in `apps/<site>/` and re-run `pnpm dlx wrangler@latest deploy`. Services: `doctl apps create-deployment $DO_APP_ID --wait` after reverting on `main` |

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

| Signal | Where | Notes |
|---|---|---|
| LLM session traces | Langfuse Cloud | `LANGFUSE_PUBLIC_KEY`-gated; one trace per `runSession()` call |
| ACMM trend | `.claude/acmm/state.json` history array | Each run appended; `node scripts/acmm/audit.js --trend` prints |
| Agent metrics | `metrics/*.jsonl` | Per-PR success rate, cost, turn count |
| ACMM PR metrics | `metrics/acmm-pr-history.jsonl` | Backfilled from PR history |

## When to escalate to human-only mode

Stop all autonomous activity when:

- More than 3 consecutive agent PRs are rejected as wrong
- An agent commits to `main` with a message that doesn't match a known trigger
- The ACMM badge regresses unexpectedly (`acmm:state.json` shows a level drop)
- A scheduled trigger's most recent run errored with an authentication or quota issue you didn't expect
- Any deployment to production failed and the agent re-attempted it more than once

In all those cases: pause every routine in https://claude.ai/code/routines, then file an issue tagged `meta-improvement` describing what went wrong, then resume routines one at a time after the issue is resolved.
