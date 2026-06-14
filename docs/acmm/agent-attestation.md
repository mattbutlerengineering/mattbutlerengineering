# Agent Identity & Attestation

## Purpose

Establish non-repudiation for AI agent actions — prove which agent made which change, when, and under what authorization. This document describes what is **currently operational** in this repo and where gaps remain.

## Current Attribution Signals

### 1. Branch Naming Convention

Agent-authored branches follow two patterns visible in git history:

- `worktree-agent-<sha>` — branches created by `mbe agent run` (Claude Code isolation: worktree). The SHA suffix is the worktree commit hash, linking back to the spawning session.
- `feat/issue-<N>-<slug>` and `chore/acmm-<N>` — branches created by worktree agents dispatched against a specific GitHub issue.
- `claude-*`, `ai-fix-*` — older conventions still matched by the attribution workflow regex.
- `chaos/synthetic-bug-*` — branches created by the chaos agent.

The `ai-attribution.yml` workflow (Signal 2) matches these with the regex:

```regexp
/^(claude|agent|ai-fix|chore\/(?:dependabot|acmm))-/
```

Note: `worktree-agent-*` and `feat/issue-*` branches are NOT matched by this regex — they are detected indirectly via Signal 1 (linked-issue label check). See [Gaps](#gaps).

### 2. `ai-attribution.yml` Workflow

`.github/workflows/ai-attribution.yml` fires on every PR open/sync and infers agent authorship from up to 5 signals:

| Signal | Mechanism                                                           | Coverage                                 |
| ------ | ------------------------------------------------------------------- | ---------------------------------------- |
| 1      | Linked issue (`Closes #N`) carries `has-pr` or `in-progress` label  | Primary path for implement-queue agents  |
| 2      | Branch name matches `^(claude\|agent\|ai-fix\|chore/...)` regex     | Older branch conventions                 |
| 3      | Commit message contains `Co-Authored-By: Claude`                    | When attribution trailer is enabled      |
| 4      | PR author is a known bot (`dependabot[bot]`, `github-actions[bot]`) | Dependabot and GHA-triggered commits     |
| 5      | PR body contains a Langfuse trace ID                                | When agents embed trace IDs in PR bodies |

When any signal fires, the workflow:

- Applies the `agent-authored` label to the PR
- Posts an audit comment listing which signals fired, with a Langfuse deep-link if a trace ID was found

### 3. GitHub Label State Machine

The implement-queue uses labels as the coordination state machine. These labels are durable, queryable, and constitute a per-issue audit trail:

| Label            | Meaning for attribution                                            |
| ---------------- | ------------------------------------------------------------------ |
| `in-progress`    | Set when agent claims the issue; records which issue was claimed   |
| `has-pr`         | Set when PR is created; used by Signal 1 to infer agent authorship |
| `agent-failed`   | Set on failure; records that an agent attempt occurred             |
| `agent-skip`     | Set after max retries; records exhausted attempts                  |
| `agent-authored` | Applied to the PR by `ai-attribution.yml`                          |

The `ai-audit.yml` workflow runs weekly (Fridays, 9am UTC) and queries all merged PRs carrying `has-pr` to produce a weekly AI activity report as a GitHub issue. This provides a searchable weekly ledger of agent-authored merges.

### 4. Co-Authored-By Commit Trailers

When the Claude Code attribution trailer is enabled, agent commits include trailers such as:

```
Co-authored-by: Claude <noreply@anthropic.com>
Co-authored-by: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```

The model variant is embedded in the trailer, recording which Claude model authored the commit. **However:** attribution trailers are globally disabled in `~/.claude/settings.json` for this repo. Signal 3 in `ai-attribution.yml` explicitly compensates: the workflow header notes it "Compensates for `Co-Authored-By: Claude` being globally disabled." Trailers appear in some commits (when the `implement-queue-worker.md` agent prompt includes them) but not consistently across all agent sessions.

### 5. Langfuse Session Traces

All `mbe agent run` sessions are traced to Langfuse Cloud with:

- **Session ID** — links to the git branch and worktree
- **Model** — `claude-sonnet-4-6`, `claude-haiku-4-5`, `claude-opus-4-6`
- **Task description** — the issue title or task string passed to the agent
- **Cost (USD) and token usage** — per-session
- **Success/failure status** — `success`, `stuck`, `agent-failed`
- **Generation spans** — one per SDK turn, with input/output and token usage

The Langfuse MCP server (`.mcp.json`) exposes traces to Claude Code sessions for retrospective audit.

## Non-Repudiation Guarantees

| Level        | Guarantee                                                            | Active signals                                                |
| ------------ | -------------------------------------------------------------------- | ------------------------------------------------------------- |
| Weak         | "This looks like an agent PR"                                        | Branch naming, linked-issue label                             |
| Medium       | "This PR was labeled agent-authored by workflow with stated signals" | `ai-attribution.yml` + `agent-authored` label + audit comment |
| Operational  | "This issue was claimed and completed by an agent session on date X" | Issue label timeline + weekly AI audit report                 |
| Trace-linked | "This PR links to a Langfuse trace with model, cost, and task"       | Langfuse trace ID in PR body (when present)                   |

The current system provides **Medium + Operational** guarantees for the vast majority of implement-queue PRs, and **Trace-linked** for sessions where the agent embeds the trace ID in the PR body.

## Gaps

These are real gaps — not aspirational items:

1. **Branch regex misses `worktree-agent-*`** — Signal 2 in `ai-attribution.yml` does not match the most common branch prefix. These PRs rely solely on Signal 1 (linked-issue label). If an agent PR does not link an issue, it goes undetected. The implement-queue always closes an issue, so Signal 1 fires for normal runs — but out-of-band agent invocations are invisible.

2. **Co-Authored-By is inconsistently applied** — globally disabled in settings but enabled in some agent prompt templates. The attribution workflow compensates, but git log alone is not a reliable source of agent attribution.

3. **No dedicated bot account** — all agent commits appear under the repo owner's git config (`Matt Butler <mattwbutler@gmail.com>`). Git author is indistinguishable from human commits without cross-referencing branch name or labels.

4. **No GPG signing** — agent commits are unsigned. The "Verified" badge does not appear on GitHub for agent-authored commits. Required for SOC2/regulated environments.

5. **Langfuse trace ID not always embedded** — the PR body template in `implement-queue-worker.md` does not currently include a Langfuse trace ID field, so Signal 5 rarely fires. The trace exists in Langfuse but is not linked from the PR.

## Recommended Next Steps

Ordered by impact-to-effort ratio:

1. **Fix the branch regex** — add `worktree-agent-` prefix to the Signal 2 pattern in `ai-attribution.yml` so all agent branches are directly detected without requiring a linked issue.
2. **Embed Langfuse trace ID in PR body** — add `Langfuse-Trace: <id>` to the `gh pr create` body template in `implement-queue-worker.md` to activate Signal 5.
3. **Dedicated bot account** — create `mbe-agent[bot]` GitHub App or bot user; configure `@mbe/agent-core` to commit under it in worktrees. Commits become distinguishable by git author alone.
4. **GPG-signed commits** — generate a bot GPG key; configure worktree git config to sign. Provides cryptographic non-repudiation.

## References

- `.github/workflows/ai-attribution.yml` — runtime detection and labeling
- `.github/workflows/ai-audit.yml` — weekly AI activity audit report
- `.github/workflows/agent-task.yml` — agent dispatch via `workflow_dispatch`
- `CLAUDE.md` — GitHub Labels table (state machine) and AI Observability (Langfuse) sections
- `packages/agent-core/` — `runSession()` which creates Langfuse traces
