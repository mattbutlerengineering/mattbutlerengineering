# Evaluation: Multi-Agent Orchestrator for Claude/Gemini/OpenCode

**Date:** 2026-05-09
**Status:** Complete
**Issue:** #1164

## Problem

We run three AI coding CLIs (Claude Code, Gemini CLI, OpenCode) on subscription auth with independent rate limits. When one tool hits its limit, we manually switch to another. No coordination layer detects capacity or routes work automatically.

## Requirements

1. Dispatch work from GitHub issue queue (`ready` label) to whichever tool has capacity
2. Subscription/CLI auth (not API keys)
3. Git worktree isolation (existing pattern)
4. Rate-limit detection + failover
5. Compatible with existing label state machine (`ready` → `in-progress` → `has-pr`)

## Candidates Evaluated

### Scoring (1-5 scale)

| Criterion | Claude Squad | Bernstein | MCO | Conductor | Agent of Empires | amux | Composio AO |
|---|---|---|---|---|---|---|---|
| Multi-tool support | 3 | 5 | 4 | 1 | 5 | 1 | 4 |
| Rate-limit awareness | 1 | 3 | 4 | 1 | 1 | 1 | 1 |
| GitHub integration | 1 | 4 | 1 | 1 | 1 | 1 | 5 |
| Worktree isolation | 5 | 5 | 1 | 4 | 5 | 2 | 5 |
| Subscription auth | 5 | 5 | 5 | 5 | 5 | 5 | 5 |
| Maturity | 4 | 2 | 2 | 3 | 4 | 1 | 4 |
| Setup effort | 4 | 4 | 3 | 5 | 4 | 2 | 3 |
| **Weighted Total** | **23** | **28** | **20** | **20** | **25** | **13** | **27** |

### Detailed Assessments

#### 1. Claude Squad (smtg-ai/claude-squad)
- **Stars:** 7,393 | **Language:** Go | **License:** AGPL-3.0
- **Install:** `brew install claude-squad`
- **Supports:** Claude Code, Codex, Gemini, Aider (4 tools)
- **Strengths:** Most popular, excellent worktree isolation, simple TUI, auto-yes mode
- **Weaknesses:** No rate-limit detection, no GitHub issue queue, no CI integration. It's a session manager, not an orchestrator.
- **Verdict:** Good for watching parallel sessions. Not useful for automated dispatch.

#### 2. Bernstein (sipyourdrink-ltd/bernstein)
- **Stars:** 305 | **Language:** Python | **License:** Apache-2.0
- **Install:** `pipx install bernstein` or `brew install bernstein`
- **Supports:** 43 CLI agents (Claude, Codex, Gemini, OpenCode, Copilot, Aider, and 37 more)
- **Strengths:** Deterministic Python scheduler (zero LLM tokens on coordination). GitHub/Linear/Jira ticket ingestion via `bernstein from-ticket`. CI autofix via `bernstein autofix`. Quality gates (lint/types/tests/PII). HMAC audit trail. Bandit router learns which model works best per task type. Pluggable sandbox backends (worktrees, Docker, Firecracker VMs).
- **Weaknesses:** Solo maintainer, no funding, 305 stars. No explicit HTTP 429 rate-limit failover (bandit learning is implicit). Low maturity relative to feature claims.
- **Verdict:** Most feature-complete by far. The ticket ingestion + CI autofix + quality gates match our ship-loop pattern closely. Risk is maturity — solo maintainer, early stage.

#### 3. MCO (mco-org/mco)
- **Stars:** 335 | **Language:** Python | **License:** MIT
- **Install:** `npm i -g @tt-a1i/mco`
- **Supports:** Claude Code, Codex, Gemini, OpenCode, Qwen (5+ custom)
- **Strengths:** Best rate-limit retry logic (exponential backoff, error classification). Consensus-based code review (`mco review`). SARIF output for GitHub Code Scanning.
- **Weaknesses:** Not a workspace manager — no worktree isolation, no issue queue, no CI integration. It's a prompt multiplexer for code review, not an orchestrator.
- **Verdict:** Useful as a review layer on top of another orchestrator. Not standalone.

#### 4. Conductor (conductor.build)
- **Stars:** N/A (closed source) | **License:** Proprietary | **Platform:** macOS only
- **Install:** Download .app from conductor.build
- **Supports:** Claude Code and Codex only (2 tools)
- **Strengths:** Polished native macOS GUI. Zero config — uses existing Claude login. Visual diff viewer.
- **Weaknesses:** Closed source, macOS only, only 2 agents, no rate-limit handling, no issue queue, no CI integration, no programmability.
- **Verdict:** Nice visual layer for manual parallel work. Not suitable for automation.

#### 5. Agent of Empires (njbrake/agent-of-empires)
- **Stars:** 2,136 | **Language:** Rust | **License:** MIT
- **Install:** `brew install aoe`
- **Supports:** 11 agents (Claude, OpenCode, Gemini, Codex, Copilot, Mistral, Pi, etc.)
- **Strengths:** Web dashboard with real terminal rendering. Mobile access via Tailscale/Cloudflare. Docker sandboxing. Auto-detects installed agents. Active Rust codebase (755 commits).
- **Weaknesses:** No rate-limit detection, no GitHub issue queue, no CI integration. Session manager like Claude Squad but with a web UI.
- **Verdict:** Best TUI/web experience. Good for supervision, not automation.

#### 6. amux (mixpeek/amux)
- **Stars:** 171 | **Language:** Python | **License:** MIT + Commons Clause
- **Install:** `git clone` + `./install.sh`
- **Supports:** Claude Code only (1 tool)
- **Strengths:** Self-healing (auto-compact, auto-restart, auto-continue). Kanban board with SQLite. Inter-agent messaging.
- **Weaknesses:** Claude-only. No worktree isolation. Commons Clause restricts commercial use. Low maturity.
- **Verdict:** Niche tool for overnight Claude fleets. Not suitable for multi-tool orchestration.

#### 7. Composio Agent Orchestrator (ComposioHQ/agent-orchestrator)
- **Stars:** 6,912 | **Language:** TypeScript | **License:** MIT
- **Install:** `npm install -g @aoagents/ao`
- **Supports:** Claude Code, Codex, Aider, Cursor, OpenCode, KimiCode (6 tools)
- **Strengths:** Strongest GitHub integration — reads backlog from GitHub/Linear/GitLab, decomposes features into tasks, assigns to agents. CI failure auto-routing back to agents. Review comment routing. Git worktree isolation. Web dashboard. YC-backed company.
- **Weaknesses:** No rate-limit detection or multi-model routing. No bandit learning. Newer project (v0.2.2).
- **Verdict:** Closest to our existing ship-loop pattern. Reads issue queues, decomposes work, monitors CI. The missing piece is rate-limit failover.

## Recommendation

### Primary: Composio Agent Orchestrator

**Why:** It's the only tool that reads GitHub issue queues, decomposes work, and monitors CI — matching our existing `ready` → `in-progress` → `has-pr` pipeline. YC-backed (real company), 6.9k stars, MIT license, TypeScript (our stack). The gap (no rate-limit failover) can be patched.

### Runner-up: Bernstein

**Why:** Most feature-complete orchestrator overall. 43 agent adapters, ticket ingestion, CI autofix, quality gates, bandit routing, HMAC audit trail. The feature set is unmatched. The risk is maturity — solo maintainer, 305 stars, early stage. Worth watching as it matures.

### Complementary: MCO (for code review)

**Why:** `mco review` fans out code review to multiple agents and returns structured findings. Could layer on top of Composio AO for multi-agent PR review.

### Not recommended for our use case

- **Claude Squad / Agent of Empires** — session managers, not orchestrators. Good for watching parallel work but no automation.
- **Conductor** — closed source, macOS only, 2 agents, no programmability.
- **amux** — Claude-only, no worktrees, Commons Clause license.

## Integration Plan (Composio AO)

1. `npm install -g @aoagents/ao`
2. Configure GitHub as tracker (uses `gh` CLI auth)
3. Map our label state machine to AO's task states
4. Configure agent profiles for Claude Code, Gemini CLI, OpenCode
5. Test with a single `ready` issue before enabling batch mode
6. Layer MCO for multi-agent PR review on output PRs

## Open Questions

- Does Composio AO's GitHub integration support custom label schemes or only its defaults?
- Can we add rate-limit detection as a plugin/hook?
- How does it handle agent failure + retry (our `agent-failed` label)?
- Can Bernstein's bandit router be used standalone for model selection?
