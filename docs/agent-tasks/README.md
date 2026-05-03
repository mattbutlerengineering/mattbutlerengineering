# Agent Task Traceability

This directory documents the agent task tracking system used in the mattbutlerengineering monorepo. Every autonomous agent task is logged with intent, inputs, outputs, and outcome for full auditability.

## Task Lifecycle

```
created → in-progress → completed | failed
   │           │             │         │
   │           │             │         └── labeled `agent-failed`, needs triage
   │           │             └── PR created, labeled `has-pr`
   │           └── agent working, labeled `in-progress`
   └── issue filed, labeled `ready` for pickup
```

### States

| State           | GitHub Label   | Description                                            |
| --------------- | -------------- | ------------------------------------------------------ |
| **Created**     | `ready`        | Task identified and available for agent pickup         |
| **In Progress** | `in-progress`  | Agent has claimed the task and is working              |
| **Completed**   | `has-pr`       | Agent finished; PR created and awaiting review/merge   |
| **Failed**      | `agent-failed` | Agent could not complete; needs manual review or retry |

### Origin Labels

Tasks are also tagged by how they were created:

| Label              | Source                                                 |
| ------------------ | ------------------------------------------------------ |
| `audit`            | Found by `/site-audit` (Playwright + Lighthouse crawl) |
| `ci-fix`           | CI failure detected by `/ci-monitor`                   |
| `feature`          | Feature decomposed by `/decompose`                     |
| `tracking`         | Parent issue for multi-part features                   |
| `meta-improvement` | Process improvement identified by agents               |
| `acmm`             | AI Codebase Maturity Model finding from `/acmm-audit`  |

## Task Logging

Every agent task records:

| Field        | Description                                 | Where Stored                                 |
| ------------ | ------------------------------------------- | -------------------------------------------- |
| **Intent**   | What the agent was asked to do              | GitHub Issue title + body                    |
| **Inputs**   | Issue number, model, budget, source trigger | Issue labels + Langfuse trace metadata       |
| **Outputs**  | PR number, files changed, test results      | PR body + linked issue                       |
| **Outcome**  | Success/failure, cost, turns used           | Langfuse session metrics + `metrics/*.jsonl` |
| **Duration** | Wall-clock time from start to PR/failure    | Langfuse trace duration                      |

### Langfuse Observability

Agent sessions are traced to Langfuse Cloud with:

- **Session traces** — one per `runSession()` call, with task description, model, and budget metadata
- **Generation spans** — one per SDK turn, with model, input/output, and token usage
- **Session metrics** — `success` (0/1), `cost_usd`, `num_turns`, `stuck` (0/1), `evaluation_confidence`

## Auditing Agent Work

### List All Agent PRs

```bash
# PRs created by agents (via GitHub Actions bot)
gh pr list --author app/github-actions --state all --limit 20

# PRs linked to agent-completed issues
gh issue list --label has-pr --state all --limit 20
```

### List Failed Tasks

```bash
# Issues where agents failed
gh issue list --label agent-failed --state open

# Review failure details in issue comments
gh issue view <issue-number> --comments
```

### List Tasks by Origin

```bash
# Site audit findings
gh issue list --label audit --state all

# CI fixes
gh issue list --label ci-fix --state all

# ACMM compliance items
gh issue list --label acmm --state all

# Decomposed features
gh issue list --label feature --state all
```

### Performance Metrics

```bash
# Agent performance summary
mbe stats

# Detailed metrics in JSONL logs
ls metrics/*.jsonl
```

The `/progress-tracker` skill runs daily at 5:11 PM PT and generates trend analysis across all agent tasks. Metrics include:

- Issues created vs. closed (velocity)
- PR merge rate (quality)
- Agent failure rate (reliability)
- Average cost per task (efficiency)

## Task Flow: End-to-End

1. **Discovery:** `/site-audit` or `/acmm-audit` identifies work, files a GitHub issue with the `ready` label
2. **Pickup:** `/issue-worker` (runs every 2h) picks the oldest `ready` issue, relabels to `in-progress`
3. **Execution:** `mbe agent run` creates a worktree, implements the fix, runs lint/typecheck/test
4. **Output:** Agent creates a PR linked to the issue, relabels issue to `has-pr`
5. **Review:** Tier classification determines review path (see `docs/change-classification.md`)
6. **Merge:** PR merged after approval; issue auto-closed
7. **Failure:** If agent fails, issue labeled `agent-failed` for manual triage

## Cross-References

- `CLAUDE.md` — Agent skills, scheduling, and label definitions
- `docs/governance.md` — Branch protection and review policies
- `docs/change-classification.md` — Risk tier classification
- `metrics/` — Raw JSONL performance logs
- `.claude/skills/` — Skill definitions for each agent capability
