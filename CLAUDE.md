# CLAUDE.md - Development Guidelines for Claude Code

> This file contains mandates and skills specific to **Claude Code**.
> For core project context, architecture, and code style, see [AGENTS.md](./AGENTS.md).

## Core reference
- **Primary Source of Truth:** [AGENTS.md](./AGENTS.md)
- **Design System Specs:** [packages/rialto/CLAUDE.md](./packages/rialto/CLAUDE.md)
- **Domain Context:** See `CLAUDE.md` files in each `services/*` or `packages/*` directory.

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
| `/learning-loop` | Sensor-driven improvement: collect metrics → detect regressions → create issues → verify fixes → self-tune |
| `/sentry-triage` | Query Sentry for production errors, filter by severity/frequency, deduplicate, create GitHub issues for ship-loop |
| `/acmm-audit` | Score repo against canonical AI Codebase Maturity Model (6 levels, 100+ criteria from ACMM/Fullsend/AEF/Reflect), file next-level-gap issues, update README badge |

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

# Development
mbe stats                                         # Agent performance metrics
mbe up                                           # Start dev servers
```

### GitHub Labels (coordination state machine)

| Label | Meaning |
|-------|---------|
| `ready` | Available for agent pickup |
| `in-progress` | Agent is working on it |
| `has-pr` | PR created, awaiting merge/review |
| `agent-failed` | Agent could not complete — needs manual review or retry |
| `agent-skip` | Exhausted max retries — needs manual review or different approach |
| `audit` | Found by site-audit |
| `ci-fix` | CI failure needing fix |
| `feature` | New feature (created by `/decompose`) |
| `tracking` | Parent issue tracking multi-part feature |
| `meta-improvement` | Process improvement suggestion |
| `acmm` | AI Codebase Maturity Model finding (created by `/acmm-audit --apply`) |
| `sentry` | Production error triaged from Sentry |

### RemoteTriggers (scheduled background agents)

Managed at https://claude.ai/code/scheduled

| Trigger | Schedule (PT) |
|---------|--------------|
| `mbe-deep-audit` | Mon 8:23am |
| `mbe-light-audit` | Tue-Sun 9:41am |
| `mbe-issue-worker` | Every 2h (includes CI monitoring) |
| `mbe-progress-tracker` | Daily 5:11pm |
| `mbe-acmm-audit` | Daily 10:00am (runs `/acmm-audit --apply --badge`) |
| `mbe-learning-loop` | Daily 11:00am (sensor report → verify fixes → triage regressions) |

---

## Dispatching Worktree Agents

When spawning subagents with `isolation: "worktree"`, always include `pnpm install --frozen-lockfile` as the first step in the agent prompt. Worktrees are bare checkouts without `node_modules` — without this, every `vitest`/`pnpm test`/`pnpm build` call fails with `command not found`. The retry cost of a failed agent (wasted tokens + time) far exceeds the 15s install step.

---

## Before Committing

Always perform this **Zero-Touch Audit** before committing:
1.  **Run Verifications:**
    ```bash
    pnpm lint        # Check code style
    pnpm typecheck   # Verify types
    pnpm test        # Run all tests
    ```
2.  **Scan for Markers:** Search for `<<<<`, `====`, or `>>>>` in modified files.
3.  **Verify Imports:** Check that every new component/function usage has an import.
4.  **Update Generated Files:**
    - If schemas/RIALTO changed: `pnpm build && mbe pack`
    - If dependencies changed: `pnpm --dir tools/mbe generate-dep-graph`
5.  **Sync Infrastructure:** Check Dockerfiles if package dependencies changed.

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

Semgrep MCP server is configured in `.mcp.json` for AI-powered static analysis.

### What's enabled
- **30+ languages** supported (JavaScript, TypeScript, Python, Go, etc.)
- **Security rulesets**: Code, Secrets, Supply Chain
- **Pre-commit hook**: Runs `semgrep --config semgrep.yml --error` on staged files
- **MCP integration**: Agents can invoke Semgrep scans via `@semgrep/mcp`

### Configuration
- Rules file: `semgrep.yml` (root) — covers CWE-top, OWASP, secrets, injection
- Pre-commit: `.husky/pre-commit` runs security scan before commit
- Custom rules cover: eval/Function injection, SQL injection, XSS, hardcoded secrets, missing auth

### Running manually
```bash
semgrep --config semgrep.yml --error .
semgrep --config "p/security-audit" --error .  # Use Semgrep registry rules
```

### Skipping (emergencies only)
```bash
SKIP=semgrep git commit -m "emergency fix"
