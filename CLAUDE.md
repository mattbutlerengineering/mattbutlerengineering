# CLAUDE.md - Development Guidelines for Claude Code

> This file contains mandates and skills specific to **Claude Code**.
> For core project context, architecture, and code style, see [AGENTS.md](./AGENTS.md).

## Communication

Always use caveman mode (full intensity) for all responses. Invoke `/caveman` at session start. Code, commits, and PRs use normal formatting. Disable only when user says "stop caveman" or "normal mode".

## Core reference

- **Primary Source of Truth:** [AGENTS.md](./AGENTS.md)
- **Design System Specs:** [packages/rialto/CLAUDE.md](./packages/rialto/CLAUDE.md)
- **Domain Context:** See `CLAUDE.md` files in each `services/*` or `packages/*` directory.

## Behavioral Guidelines

These guidelines are adapted from [Karpathy's CLAUDE.md](https://github.com/multica-ai/andrej-karpathy-skills/blob/main/CLAUDE.md) and bias toward **caution over speed**.

### 1. Think Before Coding

- **State Assumptions:** Explicitly list assumptions before starting implementation.
- **Surface Tradeoffs:** Identify potential downsides or alternatives to your proposed approach.
- **Push Back:** If a simpler approach exists or a request is overcomplicated, suggest the alternative.
- **Name Confusion:** If any part of the task or domain terminology is ambiguous, ask for clarification immediately.

### 2. Simplicity First

- **Minimum Viable Code:** Write the absolute minimum code required to satisfy the requirement.
- **No Speculation:** Never add "just-in-case" features, abstractions, or configurability.
- **Senior Engineer Test:** Ask: "Would a senior engineer consider this implementation overcomplicated?"
- **Aggressive Refactoring:** Prefer 50 lines of clear code over 200 lines of complex logic, even if it requires significant refactoring.

### 3. Surgical Changes

- **Strict Scope:** Modify only the files and lines strictly necessary for the task.
- **No Drive-by Improvements:** Do not fix unrelated formatting, linting, or logic unless it is directly broken by your changes.
- **Match Style:** Rigorously adhere to the existing codebase patterns and idiomatic style.
- **Orphan Cleanup:** Only remove code (imports, variables, functions) that your changes made redundant.

## Continuous Improvement Loop

Automated system that audits the live site, finds and fixes issues, builds features, and verifies deploys — all autonomously.

### Two Modes

| Mode                             | How                                  | Pushes to             | Best for                   |
| -------------------------------- | ------------------------------------ | --------------------- | -------------------------- |
| **Scheduled** (conservative)     | RemoteTriggers on claude.ai          | PRs for review        | Background maintenance     |
| **Implement Queue** (aggressive) | `/loop 30m /implement-queue` locally | Auto-merges green PRs | Active development sprints |

### Skills

| Skill               | Purpose                                                                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/implement-queue`  | Drain ready backlog: claim batch → parallel TDD worktree agents → PRs → serial merge train                                                                        |
| `/site-audit`       | Crawl live site with Playwright + Lighthouse, create issues                                                                                                       |
| `/issue-worker`     | Pick up ready issues, implement via `mbe agent run`, create PRs                                                                                                   |
| `/ci-monitor`       | Check CI health, auto-fix simple failures, escalate complex ones                                                                                                  |
| `/progress-tracker` | Metrics, self-tuning circuit breaker, trend analysis                                                                                                              |
| `/learning-loop`    | Sensor-driven improvement: collect metrics → detect regressions → create issues → verify fixes → self-tune                                                        |
| `/sentry-triage`    | Query Sentry for production errors, filter by severity/frequency, deduplicate, create GitHub issues for implement-queue                                           |
| `/acmm-audit`       | Score repo against canonical AI Codebase Maturity Model (6 levels, 100+ criteria from ACMM/Fullsend/AEF/Reflect), file next-level-gap issues, update README badge |

## mbe CLI Commands

```bash
# Agent — local (runs directly via @mbe/agent-core)
mbe agent run "Fix the login bug"                 # Run agent → get PR
  --adapter <type>                                # auto, claude, gemini, opencode (default: claude)
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
mbe agent frontmatter                             # stdin issue body → mbe agent run flags (yaml agent block)
mbe agent cost [id]                               # Show per-turn cost breakdown or summary

# Model governance
mbe check-model "<directive>"                     # Verify recommended model tier for task complexity

# Development
mbe stats                                         # Agent performance metrics
mbe up                                           # Start dev servers
```

### GitHub Labels (coordination state machine)

| Label              | Meaning                                                               |
| ------------------ | --------------------------------------------------------------------- |
| `ready`            | Available for agent pickup                                            |
| `in-progress`      | Agent is working on it                                                |
| `has-pr`           | PR created, awaiting merge/review                                     |
| `agent-failed`     | Agent could not complete — needs manual review or retry               |
| `agent-skip`       | Exhausted max retries — needs manual review or different approach     |
| `audit`            | Found by site-audit                                                   |
| `ci-fix`           | CI failure needing fix                                                |
| `feature`          | New feature (created by `/decompose`)                                 |
| `tracking`         | Parent issue tracking multi-part feature                              |
| `meta-improvement` | Process improvement suggestion                                        |
| `acmm`             | AI Codebase Maturity Model finding (created by `/acmm-audit --apply`) |
| `sentry`           | Production error triaged from Sentry                                  |

### RemoteTriggers (scheduled background agents)

Managed at https://claude.ai/code/scheduled

| Trigger             | Schedule (PT)                                                     |
| ------------------- | ----------------------------------------------------------------- |
| `mbe-deep-audit`    | Mon 8:23am (weekly full site audit)                               |
| `mbe-morning`       | Daily 9:03am (light audit + ACMM audit + issue-worker)            |
| `mbe-midday`        | Daily 1:07pm (issue-worker + CI monitor)                          |
| `mbe-evening`       | Daily 5:11pm (issue-worker + progress-tracker)                    |
| `mbe-learning-loop` | Daily 11:00am (sensor report → verify fixes → triage regressions) |

> **Max 5x plan**: 5 scheduled runs/day. The above fits exactly. `mbe-deep-audit` only fires Mon so Tue-Sun has 4 daily runs + headroom.

---

## Dispatching Worktree Agents

Worktrees are bare checkouts without `node_modules`. Always include `pnpm install --frozen-lockfile` as the first step in agent prompts, and run `pnpm typecheck` before declaring done. See [gotchas.md#build--pnpm--turbo](./.claude/rules/gotchas.md) for recurring agent failure patterns.

---

## Feature Implementation

Always use TDD (test-driven development) for feature work. Write tests FIRST, verify they fail, then implement. Never write implementation code before having a failing test. Use `/tdd` skill for the workflow.

## Before Committing

Always perform the **Zero-Touch Audit** defined in [AGENTS.md](./AGENTS.md) before committing. This includes running `pnpm lint`, `pnpm typecheck`, and `pnpm test`, scanning for conflict markers, verifying imports, and updating generated files.

**Known gotchas:** see [.claude/rules/gotchas.md](./.claude/rules/gotchas.md) — covers pre-commit, builds, CI, dependencies, releases, tooling artifacts, and Prisma/DO migrate.

## Manual Deployment

GH Actions runs on this account (verify with `gh run list --limit 5`). When you want to ship without waiting on CI/`/deploy`, deploy locally via:

- **Static sites**: `cd apps/<marketing|hospitality|rialto-web> && pnpm dlx wrangler@latest deploy` (wrangler auto-refreshes oauth on use)
- **DO services** (all services + db-migrate, single app): `doctl apps create-deployment $DO_APP_ID --wait` (export `DO_APP_ID` from your local `.env` or shell — fork maintainers will use their own DigitalOcean app ID)
- **DO build logs**: `doctl apps logs $DO_APP_ID <agent-api|users-api|reservations-api|db-migrate> --type=build --deployment <id>` (component is positional, NOT `--component`)
- **Pulumi**: `cd infrastructure/pulumi && pulumi up --stack prod`

### Iterating on rialto component visuals (no npm republish)

Consumer apps (`apps/hospitality`, `apps/rialto-web`, etc.) reference rialto via `workspace:*`, so they pick up source changes directly. The npm publish is only needed for external consumers. Iteration loop:

```bash
pnpm --dir packages/rialto build           # regenerate dist + exports map
pnpm --dir apps/rialto-web build           # rebuild showcase
cd apps/rialto-web && pnpm dlx wrangler@latest deploy
```

Only run `npm publish` from `packages/rialto` when actually cutting a registry release.

## AI Observability (Langfuse)

Agent sessions are traced to [Langfuse Cloud](https://cloud.langfuse.com) for LLM-specific observability.

### What's traced

- **Session traces** — one per `runSession()` call, with task description, model, and budget metadata
- **Generation spans** — one per SDK turn, with model, input/output, and token usage
- **Session metrics** — success (0/1), cost_usd, num_turns, stuck (0/1), evaluation_confidence

### Environment variables

```bash
LANGFUSE_PUBLIC_KEY=pk-lf-...    # Required for Langfuse tracing
LANGFUSE_SECRET_KEY=sk-lf-...    # Required for Langfuse tracing
LANGFUSE_BASEURL=https://cloud.langfuse.com  # Default
```

When `LANGFUSE_PUBLIC_KEY` is unset, Langfuse is not loaded — zero overhead.

### MCP Server

The Langfuse MCP server (`.mcp.json`) gives Claude Code access to:

- `get-prompts` — List prompts in the Langfuse project
- `get-prompt` — Fetch a specific prompt by name

## Security Scanning (Semgrep)

See [AGENTS.md](./AGENTS.md#security-scanning-semgrep) for Semgrep configuration, rules, and usage. Claude Code additionally has the Semgrep MCP server (`.mcp.json`) for invoking scans via `@semgrep/mcp`.

## Browser Automation (Playwright)

The Playwright MCP server (`.mcp.json`) provides shared browser tooling for the whole team and CI headless runs — the same server that drives `/site-audit` and the E2E suite.

- No auth or secrets required — resolves cleanly in a fresh checkout
- Requires no configuration beyond the entry in `.mcp.json`
- If you also have the personal Playwright plugin installed, both coexist without conflict (Claude Code deduplicates tools by server name)

## Cross-Session Memory (claude-mem)

[claude-mem](https://github.com/thedotmack/claude-mem) provides persistent cross-session memory — observations about code patterns, architecture decisions, and domain context survive between conversations.

### Install

```bash
npx claude-mem install
```

### Available skills

| Skill              | Purpose                                |
| ------------------ | -------------------------------------- |
| `/mem-search`      | Search past observations and decisions |
| `/smart-explore`   | Token-efficient AST-based code search  |
| `/make-plan`       | Create phased implementation plans     |
| `/do`              | Execute plans with subagents           |
| `/timeline-report` | Project development history analysis   |
| `/babysit`         | Watch PR until merge-ready             |

### Auto-observation

claude-mem automatically records observations during sessions — code patterns discovered, architecture decisions made, debugging outcomes. These are searchable in future sessions via `/mem-search`.

## Knowledge Graph (graphify)

[graphify](https://github.com/safishamsi/graphify) turns the repo (or any folder/PDF/image/video) into a persistent, queryable knowledge graph: nodes are concepts/files/symbols, edges are tagged `EXTRACTED` / `INFERRED` / `AMBIGUOUS` (honest audit trail), and community detection surfaces cross-file connections you wouldn't think to ask about. The skill is vendored at `.claude/skills/graphify/SKILL.md` (v0.8.39) and self-bootstraps the `graphifyy` PyPI package on first run (needs Python 3.10+; uses `uv tool` or `pip`). Graph artifacts land in `graphify-out/` (gitignored).

### Where it fits in our process

| Use case                   | How graphify helps                                                                                                                                                                                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Onboarding a subsystem** | `/graphify packages/<pkg>` then `/graphify query "how does X work"` — concept-level map of an unfamiliar package before touching it. Goes deeper than `docs/architecture/dependency-graph.md`, which is package-level only.                          |
| **Architecture audits**    | Feed graphify's community clusters + cross-file edges into `/improve-codebase-architecture` to spot coupling and deepening opportunities.                                                                                                            |
| **Agent context priming**  | Once `graphify-out/graph.json` exists, codebase questions are answered from the graph (BFS/DFS traversal, token-budgeted) instead of re-reading files — cheaper context for `implement-queue` workers. `--mcp` exposes the graph to agents over MCP. |
| **PR / change review**     | `/graphify path "ModuleA" "ModuleB"` traces the shortest dependency path between two concepts to reason about blast radius.                                                                                                                          |

### Boundaries (avoid tool overlap)

- **vs `dependency-graph.md`** — that artifact stays the source of truth for _package_-level deps and is CI-enforced. graphify is for _concept/symbol_-level exploration; its output is gitignored and never gates CI.
- **vs claude-mem (`/smart-explore`, `/mem-search`)** — claude-mem is session memory + AST search. graphify is a durable graph you query. Reach for graphify when you want a navigable map of how things connect; reach for claude-mem when recalling what happened in past sessions.

### Quick start

```bash
/graphify packages/rialto                 # build graph for one package (scoped; fast)
/graphify query "how does the booking widget reach the reservations service"
/graphify .                                # full monorepo graph (slow — LLM extraction over all packages)
```

> **Feedback Loop Log**: historical sensor-issue-fix-verify cycles are tracked via [GitHub Issues](https://github.com/mattbutlerengineering/mattbutlerengineering/issues?q=label%3A%22sensor%22) and the [progress-tracker skill](#continuous-improvement-loop) — see the live dashboard for current metrics.
