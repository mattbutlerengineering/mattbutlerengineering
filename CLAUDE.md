# CLAUDE.md - Development Guidelines for Claude Code

> This file contains mandates and skills specific to **Claude Code**.
> For core project context, architecture, and code style, see [AGENTS.md](./AGENTS.md).

## Core reference
- **Primary Source of Truth:** [AGENTS.md](./AGENTS.md)
- **Design System Specs:** [packages/rialto/CLAUDE.md](./packages/rialto/CLAUDE.md)
- **Domain Context:** See `CLAUDE.md` files in each `services/*` or `packages/*` directory.

## Claude-Specific Commands

### CLI Commands (`mbe`)
```bash
# Agent — local (runs directly via @mbe/agent-core)
mbe agent run "Fix the login bug"                 # Run agent → get PR
  --model <model>                                 # default: claude-sonnet-4-6
  --max-budget <usd>                              # default: 1.00
  --max-turns <n>                                 # default: 50
  --no-pr                                         # skip PR, keep worktree
  -v, --verbose                                   # stream agent events

# Agent — API-backed (requires agent service running on :3003)
mbe agent start "Fix the login bug"               # Create session via API
mbe agent list                                    # List all sessions
mbe agent status <id>                             # Get session details
mbe agent logs <id>                               # Stream SSE events
mbe agent cancel <id>                             # Cancel running session
mbe agent delete <id>                             # Delete session + cleanup
mbe agent orchestrate "Big task"                  # Decompose → parallel sessions → PRs
```

## Continuous Improvement Loop (Ship Loop)

Automated system that audits the live site, finds and fixes issues, builds features, and verifies deploys — all autonomously.

### Two Modes

| Mode | How | Pushes to | Best for |
|------|-----|-----------|----------|
| **Scheduled** (conservative) | RemoteTriggers on claude.ai | PRs for review | Background maintenance |
| **Ship Loop** (aggressive) | `/loop 5m /ship-loop` locally | Directly to main | Active development sprints |

### Skills

| Skill | Purpose |
|-------|---------|
| `/ship-loop` | Full cycle: audit → fix → push → CI → E2E → deploy verify → close |
| `/site-audit` | Crawl live site with Playwright + Lighthouse, create issues |
| `/issue-worker` | Pick up ready issues, implement via `mbe agent run`, create PRs |
| `/ci-monitor` | Check CI health, auto-fix simple failures, escalate complex ones |
| `/progress-tracker` | Metrics, self-tuning circuit breaker, trend analysis |
| `/decompose` | Break a feature into ordered, agent-sized issues for the loop |

### GitHub Labels (coordination state machine)

| Label | Meaning |
|-------|---------|
| `ready` | Available for agent pickup |
| `in-progress` | Agent is working on it |
| `has-pr` | PR created, awaiting merge/review |
| `agent-failed` | Agent could not complete — needs manual review or retry |
| `audit` | Found by site-audit |
| `ci-fix` | CI failure needing fix |
| `feature` | New feature (created by `/decompose`) |
| `tracking` | Parent issue tracking multi-part feature |
| `meta-improvement` | Process improvement suggestion |

### RemoteTriggers (scheduled background agents)

Managed at https://claude.ai/code/scheduled

| Trigger | Schedule (PT) |
|---------|--------------|
| `mbe-deep-audit` | Mon 8:23am |
| `mbe-light-audit` | Tue-Sun 9:41am |
| `mbe-issue-worker` | Every 2h (includes CI monitoring) |
| `mbe-progress-tracker` | Daily 5:11pm |

---

## Before Committing

Always run these commands before committing:
```bash
pnpm lint        # Check code style
pnpm typecheck   # Verify types
pnpm test        # Run all tests
```
