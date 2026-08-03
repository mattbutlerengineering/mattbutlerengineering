# CLAUDE.md - Development Guidelines for Claude Code

> This file contains mandates and skills specific to **Claude Code**.
> For core project context, architecture, and code style, see [AGENTS.md](./AGENTS.md).

## Communication

Always use caveman mode (full intensity) for all responses — ultra-compressed, dropping filler, articles, and pleasantries while keeping full technical accuracy. Code, commits, and PRs use normal formatting. Disable only when user says "stop caveman" or "normal mode".

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

### Skill Directory

Claude Code loads project skills from **`.claude/skills/`** (alongside `~/.claude/skills/` and plugins). It holds both project-automation and general-engineering advisor skills. All skills are invocable via `/skill-name` and discoverable via the system's skill registry.

### Skills

**Project Automation** (`.claude/skills/`)

| Skill                            | Purpose                                                                                                                                                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/ideate`                        | Autonomous feature ideation: advance the batch cycle (vetoes → decompose → completion sweep), then propose 4-5 charter-grounded features when the batch is done                                                                                               |
| `/implement-queue`               | Drain ready backlog: claim batch → parallel TDD worktree agents → PRs → serial merge train                                                                                                                                                                    |
| `/site-audit`                    | Crawl live site with Playwright + Lighthouse, create issues                                                                                                                                                                                                   |
| `/issue-worker`                  | Pick up ready issues, implement via `mbe agent run`, create PRs                                                                                                                                                                                               |
| `/ci-monitor`                    | Check CI health, auto-fix simple failures, escalate complex ones                                                                                                                                                                                              |
| `/progress-tracker`              | Metrics, self-tuning circuit breaker, trend analysis                                                                                                                                                                                                          |
| `/learning-loop`                 | Sensor-driven improvement: collect metrics → detect regressions → create issues → verify fixes → self-tune                                                                                                                                                    |
| `/sentry-triage`                 | Query Sentry for production errors, filter by severity/frequency, deduplicate, create GitHub issues for implement-queue                                                                                                                                       |
| `/acmm-audit`                    | Score repo against canonical AI Codebase Maturity Model (6 levels, 100+ criteria from ACMM/Fullsend/AEF/Reflect), file next-level-gap issues, update README badge — now ships as the `plugins/acmm` plugin (extracted in #818), not a `.claude/skills/` entry |
| `/token-report`                  | Pull real-time token spend summary via ccusage: daily totals, session breakdown, block usage, per-model cost and cache-read/output/cache-creation breakdown                                                                                                   |
| `/chaos-agent`                   | Seed non-breaking but detectable bugs (lint violations, dead links) to verify autonomous audit/lint loops catch and file issues; runs weekly                                                                                                                  |
| `/claude-md-improver`            | Audit CLAUDE.md / AGENTS.md / `.claude/rules/*` for dangling paths, skill-table drift, mandates that don't resolve, and undocumented surfaces; runs monthly                                                                                                   |
| `/claude-automation-recommender` | Audit `.claude/hooks`, `.claude/agents`, `.claude/skills`, `.github/workflows` for guards that never fire, fire wrongly, or are missing; runs monthly                                                                                                         |
| `/codex`                         | Configure and use OpenAI Codex CLI (`.codex/config.toml`) for project-specific settings                                                                                                                                                                       |
| `/decompose`                     | Break a feature into ordered, agent-sized GitHub issues implement-queue can work through sequentially                                                                                                                                                         |
| `/dep-bump`                      | Batch-apply pnpm.overrides for CVE fixes across multiple Dependabot alerts in a single PR                                                                                                                                                                     |
| `/deploy`                        | Check deploy status, trigger deploys, debug failures across static sites (Cloudflare Workers), API services (DO App Platform), infrastructure (Pulumi)                                                                                                        |
| `/gotcha-harvest`                | Mine a session (or `--days N` history) for CI-failed-then-fixed arcs and recurring tool errors, propose entries for `.claude/rules/gotchas.md` or memory                                                                                                      |
| `/graphify`                      | Turn any input (code, docs, papers, images, video) into a persistent knowledge graph with community detection and query/path/explain tools                                                                                                                    |
| `/local-ci-precheck`             | Run lint + typecheck + architecture-audit + drift checks locally and in parallel before opening or pushing a PR                                                                                                                                               |
| `/opencode`                      | Configure and use OpenCode AI coding assistant (`opencode.json`) for project-specific settings                                                                                                                                                                |
| `/optimize-implement-queue`      | Daily loop: measure implement-queue efficiency via the queueEfficiency sensor, log trend, file de-duplicated issues on regression                                                                                                                             |
| `/perf-budget`                   | Check bundle size impact of current changes against size-limit baselines                                                                                                                                                                                      |
| `/prisma-migrations`             | Prisma Migrate best practices for dev/prod schema changes, baselining, and CI/CD deployment                                                                                                                                                                   |
| `/revert-rca-loop`               | Detect AI-authored PR reverts, match to the original PR, trigger a Reflection session for root-cause analysis; runs hourly                                                                                                                                    |

### Scaffolding Skills

| Skill                | Purpose                                                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `/new-adr`           | Scaffold a new ADR in docs/adr/ with canonical format and sequential numbering                                                           |
| `/new-component`     | Scaffold rialto component with all required files (component, styles, test, story, export)                                               |
| `/new-e2e-test`      | Scaffold Playwright E2E test matching existing fixtures and auth patterns                                                                |
| `/new-service`       | Scaffold a new Fastify + Prisma backend service (dir, package.json, app bootstrap, Prisma schema, health route, tests, Turborepo config) |
| `/new-service-route` | Scaffold Fastify route with validation, auth, ADR-002 error envelope, SSE (reservations), tests                                          |

**User-level skills** (not in this repo): `/caveman`, `/diagnose`, `/grill-with-docs`, `/improve`, `/improve-codebase-architecture`, `/tdd`, `/to-issues`, `/triage`, and `/write-a-skill` were retired from `.claude/skills/` by PR #3323 and now live only as user-level installs (`~/.claude/skills/`) — don't expect them to resolve in-repo.

### Subagents

`.claude/agents/` holds 9 specialist subagents (8 reviewers + 1 worker), dispatched via the `Agent` tool with `subagent_type: <name>` — `<name>` is each file's frontmatter `name:` field (not its filename; they happen to match here, but the registry keys on `name:`). Reviewers are typically spawned with a diff or list of changed files (e.g. `git diff --name-only origin/main...HEAD`); "when to invoke" below is derived verbatim from each agent's own frontmatter `description:`.

| Subagent                                  | Catches                                                                                                                                                                                                                                                                                                                    | When to invoke                                                                                                                                                                                                                            |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `adr-compliance-reviewer`                 | Semantic ADR violations beyond `check-adr.js`'s regex `prohibited_patterns` (e.g. `fetch` used directly where an ADR mandates `@mbe/api-client`)                                                                                                                                                                           | A commit or PR touches code that might violate an active ADR (`docs/adr/*.md`, `status: active`)                                                                                                                                          |
| `dependency-update-reviewer`              | Unsafe dependency version bumps, `pnpm.overrides` changes — see [gotchas.md § Dependencies](./.claude/rules/gotchas.md#dependencies)                                                                                                                                                                                       | Dependabot PRs arrive, `pnpm.overrides` change, or manual dependency upgrades are proposed                                                                                                                                                |
| `e2e-selector-drift-reviewer`             | Strict-mode Playwright selector collisions, volatile-text locators, stateful-mock gaps — the class that took Hospitality E2E from 31→7 failing specs across #2709/#2711/#2713/#2718                                                                                                                                        | Playwright E2E spec files under `apps/*/e2e/**` (e.g. `apps/hospitality/e2e/*.spec.ts`) are added or modified                                                                                                                             |
| `generated-artifact-determinism-reviewer` | `llms.txt`/`llms-full.txt`/`generated-schemas.ts`/dep-graph drift and cross-platform non-determinism that only surfaces in CI's `Integrity` job — this class wedged the #2195→#2217 merge train; see [gotchas.md § Build / pnpm / turbo](./.claude/rules/gotchas.md#build--pnpm--turbo)                                    | A PR touches generated artifacts (`**/llms.txt`, `**/llms-full.txt`, `**/generated-schemas.ts`, `infrastructure/worker/dep-graph.json`, `docs/architecture/dependency-graph.md`) or the pack generator (`tools/cli/src/commands/pack.ts`) |
| `implement-queue-worker`                  | (worker, not reviewer) implements a single GitHub issue in an isolated worktree via TDD — installs deps, writes a failing test first, implements, runs lint/typecheck/test gates, commits, pushes, and opens a PR targeting `main`; see [gotchas.md § Build / pnpm / turbo](./.claude/rules/gotchas.md#build--pnpm--turbo) | Designed to be spawned by `/implement-queue` with `isolation: "worktree"` — not invoked directly for review                                                                                                                               |
| `migration-reviewer`                      | Destructive operations, scope creep, and — critically — semantic mismatches between a Prisma migration and the code change it accompanies (e.g. a drop-column migration paired with code that still reads that column)                                                                                                     | A Prisma migration SQL file or a Prisma schema is added or modified                                                                                                                                                                       |
| `reviewer`                                | Hallucinations, regressions, gate bypasses, and acceptance-criteria gaps in a worker agent's diff, scored 0–10 pass/flag — see [gotchas.md § CI](./.claude/rules/gotchas.md#ci) (auto-merge bullet)                                                                                                                        | As the universal quality gate at the implement-queue worker→train boundary — after PR-level CI is green and before `gh pr merge --auto`                                                                                                   |
| `rialto-prop-drift-detector`              | Test-vs-component prop signature mismatches in `packages/rialto` — the class of bug behind commit `e08792a` (accessibility tests calling `<AppBar title="...">` long after the component switched to `<AppBar logo={...}>`)                                                                                                | Files in `packages/rialto/src/components/**` are added or modified, OR accessibility/unit tests in `packages/rialto/src/test/**` or `packages/rialto/src/**/*.test.tsx` reference rialto components                                       |
| `stripe-flow-reviewer`                    | Missing webhook signature verification, dropped idempotency keys, float/integer money-handling bugs, and broken refund/deposit/charge state-machine transitions                                                                                                                                                            | A PR touches payment, webhook, deposit, charge, or refund files — or any file whose name contains "stripe"                                                                                                                                |

## mbe CLI Commands

```bash
# Agent — local (runs directly via @mbe/agent-core)
mbe agent run "Fix the login bug"                 # Run agent → get PR
  --adapter <type>                                # auto, claude, gemini, opencode (default: claude)
  --model <model>                                 # default: claude-sonnet-5
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

Managed at https://claude.ai/code/scheduled. See [docs/scheduled-tasks.md](./docs/scheduled-tasks.md) for full schedule and prompts.

**Key principle:** Trust live output. For any actionable decision (which issues to close, what to build next), re-run source-of-truth checks (e.g., `node plugins/acmm/scripts/audit.js`) instead of recalling earlier summaries from conversation history.

## Dispatching Worktree Agents

Worktrees are bare checkouts without `node_modules`. Always include `pnpm install --frozen-lockfile` as the first step in agent prompts, and run `pnpm typecheck` before declaring done. See [gotchas.md#build--pnpm--turbo](./.claude/rules/gotchas.md) for recurring agent failure patterns.

## Feature Implementation

Always use TDD (test-driven development) for feature work: write one failing test (RED) → confirm it fails → write the minimal code to pass (GREEN) → confirm it passes → refactor. Never write implementation code before having a failing test. `/tdd` is a user-level-only skill (not in this repo, see the skills table above) — use it if installed locally, otherwise follow the steps above directly.

## Before Committing

Always perform the **Zero-Touch Audit** defined in [AGENTS.md](./AGENTS.md) before committing. This includes running `pnpm lint`, `pnpm typecheck`, and `pnpm test`, scanning for conflict markers, verifying imports, and updating generated files.

Use `/local-ci-precheck` before opening or pushing to a PR — it runs the same lint + typecheck + architecture-audit + drift checks CI runs, locally and in parallel, catching workspace issues and stale generated artifacts in 30 seconds instead of waiting 5 minutes for CI.

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

## MCP Servers & Observability

- **Langfuse tracing:** Agent sessions traced to [Langfuse Cloud](https://cloud.langfuse.com). Requires `LANGFUSE_PUBLIC_KEY` + `LANGFUSE_SECRET_KEY` env vars; unset = zero overhead.
- **Semgrep:** See [AGENTS.md](./AGENTS.md#security-scanning-semgrep). Available via `.mcp.json` for scans over `@semgrep/mcp`.
- **Playwright:** Shared browser tooling (`.mcp.json`) for `/site-audit` and E2E suite; no config needed beyond `.mcp.json` entry.
- **Stripe (test-mode):** Set `STRIPE_SECRET_KEY` to test-mode key (`sk_test_…`) in `.mcp.json`; **never** `sk_live_…`. Prefer Restricted API Keys (RAK) scoped to read-only.

## Cross-Session Memory & Knowledge Graph

- **claude-mem** (`/mem-search`, `/smart-explore`, `/make-plan`, `/do`, `/timeline-report`, `/babysit`): Persistent cross-session memory of code patterns, architecture decisions, debugging outcomes. **Unavailable by default** — not installed in this repo or in fresh checkouts; run `npx claude-mem install` first to make these commands resolve.
- **graphify** (`/graphify`): Knowledge graph from repo (or folder/PDF/image/video). Vendored at `.claude/skills/graphify/SKILL.md`, self-bootstraps `graphifyy` PyPI package (needs Python 3.10+). Graph artifacts in `graphify-out/` (gitignored). Use for concept-level subsystem maps, architecture audits, and tracing dependency paths.
