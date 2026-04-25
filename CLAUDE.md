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
| `/acmm-audit` | Score repo against canonical AI Codebase Maturity Model (6 levels, 85 criteria from ACMM/Fullsend/AEF/Reflect), file next-level-gap issues, update README badge |

## mbe CLI Commands

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
| `audit` | Found by site-audit |
| `ci-fix` | CI failure needing fix |
| `feature` | New feature (created by `/decompose`) |
| `tracking` | Parent issue tracking multi-part feature |
| `meta-improvement` | Process improvement suggestion |
| `acmm` | AI Codebase Maturity Model finding (created by `/acmm-audit --apply`) |

### RemoteTriggers (scheduled background agents)

Managed at https://claude.ai/code/scheduled

| Trigger | Schedule (PT) |
|---------|--------------|
| `mbe-deep-audit` | Mon 8:23am |
| `mbe-light-audit` | Tue-Sun 9:41am |
| `mbe-issue-worker` | Every 2h (includes CI monitoring) |
| `mbe-progress-tracker` | Daily 5:11pm |
| `mbe-acmm-audit` | Daily 10:00am (runs `/acmm-audit --apply --badge`) |

---

## Before Committing

Always run these commands before committing:
```bash
pnpm lint        # Check code style
pnpm typecheck   # Verify types
pnpm test        # Run all tests
```

**Known gotchas:**
- Pre-commit hook runs `eslint --fix` + `check-adr` + `pack-changed` (the last one regenerates `llms.txt` / `llms-full.txt` in affected packages — expect them to appear in `git status` after your commit lands)
- JSX strings with `'` fail `react/no-unescaped-entities` at commit time — use `&apos;`
- Run `pnpm` from inside a package directory, not the monorepo root — turbo filter errors out at the root for `test`/`typecheck`/`build` in most packages
- **GitHub Actions is intentionally unpaid on this account — CI does not run.** Every PR's checks fail with a billing rejection by design. Verify work locally (`pnpm lint`/`typecheck`/`test`) and ignore red checks on `gh pr view`. Do NOT file `ci-fix` issues for failing workflow runs
- Parallel `Bash` tool calls don't share `cd` state and race each other — use absolute paths or `pnpm --dir <abs-path> <cmd>` when running in parallel
- **pnpm.overrides for CVEs: use the scoped pattern** `"pkg@<patched": "^patched"`, not `"pkg": ">=patched"` — the open range resolves to the latest satisfying version and can pull major bumps (e.g. `protobufjs@>=7.5.5` → 8.0.1)
- **Changesets require `GITHUB_TOKEN`**: run `GITHUB_TOKEN=$(gh auth token) pnpm version-packages` — without it, `@changesets/get-github-info` errors asking for a PAT
- **Changesets post-version prettier step errors with `Cannot find package '@mbe/config'`** — version bump + `.changeset/*.md` consumption succeed, but `packages/rialto/CHANGELOG.md` write is **silently skipped**. Manually prepend the new version block to `CHANGELOG.md` before committing the release
- **`pnpm release` regenerates `packages/rialto/package.json` exports map** when a new component folder was added — run `git status` after release and commit the follow-up diff. Otherwise the subpath `import from "@mattbutlerengineering/rialto/<NewComponent>"` works for registry consumers but is missing from the repo
- **`graphify-out/` is not gitignored** and accumulates wherever `/graphify` was invoked (repo root or package subdirs). Either `rm -rf graphify-out/` after use or add `graphify-out/` to `.gitignore`

## Manual Deployment (GH Actions unpaid — won't fire workflows)

The `/deploy` skill's workflows won't execute. Deploy locally via:

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
