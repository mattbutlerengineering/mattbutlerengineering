# CLAUDE.md - Development Guidelines for Claude Code

> This file contains mandates and skills specific to **Claude Code**.
> For core project context, architecture, and code style, see [AGENTS.md](./AGENTS.md).
> It loads into every session, so its size is budgeted by `scripts/__tests__/instruction-budget.test.mjs`. Reference tables (skills, subagents, `mbe` CLI, GitHub labels, the learning-loop directories) live in [docs/claude-reference.md](./docs/claude-reference.md). Read them there when you need them.

## Communication

Always use caveman mode (full intensity) for all responses — ultra-compressed, dropping filler, articles, and pleasantries while keeping full technical accuracy. Code, commits, and PRs use normal formatting. Disable only when user says "stop caveman" or "normal mode".

## Core reference

- **Primary Source of Truth:** [AGENTS.md](./AGENTS.md)
- **Design System Specs:** [packages/rialto/CLAUDE.md](./packages/rialto/CLAUDE.md)
- **Domain Context:** See `CLAUDE.md` files in each `services/*` or `packages/*` directory.
- **UI rules:** [.claude/rules/ui-quality.md](./.claude/rules/ui-quality.md) — loads automatically for `apps/**/*.{tsx,css}` and `packages/rialto/**`; read it before writing UI anywhere else.
- **Known gotchas:** [.claude/rules/gotchas.md](./.claude/rules/gotchas.md) plus path-scoped `gotchas-*.md` siblings.

## Behavioral Guidelines

Bias toward **caution over speed** (adapted from [Karpathy's CLAUDE.md](https://github.com/multica-ai/andrej-karpathy-skills/blob/main/CLAUDE.md)).

1. **Think before coding:** state assumptions, surface trade-offs, push back when a simpler approach exists, and ask immediately when terminology is ambiguous.
2. **Simplicity first:** the minimum code that meets the requirement. No speculative features, abstractions, or configurability. Would a senior engineer call it overcomplicated?
3. **Surgical changes:** touch only what the task needs, match existing style, no drive-by fixes, and remove only what your change orphaned.

## Continuous Improvement Loop

Automated system that audits the live site, finds and fixes issues, builds features, and verifies deploys.

- **Modes** (Scheduled, Implement Queue, Conductor), Conductor setup and upgrades, and where skills, plugins and subagents come from: [docs/claude-reference.md § Continuous Improvement Loop](./docs/claude-reference.md#continuous-improvement-loop).
- **Conductor:** `standing_consent` is off, so every merge needs the Owner's in-session answer. Never edit `.github/factory.json` or `docs/factory/` as part of an upgrade.
- **Plugin skills** (`idea-to-prod`) load in local sessions only — cloud routines and Actions don't (#6332). Retired user-level skills (`/caveman`, `/tdd`, `/diagnose`, `/reflect`) resolve nowhere; caveman _mode_ is a standing instruction, not a skill call.
- **RemoteTriggers** are managed at https://claude.ai/code/routines ([docs/scheduled-tasks.md](./docs/scheduled-tasks.md)). `docs/routines/<name>.md` is the authoritative prompt of each `mbe-*` routine: merge a docs PR editing it first, then apply it to the live trigger, then `get_trigger` to verify. Never edit a live trigger directly.

**Key principle:** Trust live output. For any actionable decision (which issues to close, what to build next), re-run source-of-truth checks (e.g., `node plugins/acmm/scripts/audit.js`) instead of recalling earlier summaries from conversation history.

## Dispatching Worktree Agents

Worktrees are bare checkouts without `node_modules`. Always include `pnpm bootstrap:worktree` as the first step in agent prompts, and run `pnpm typecheck` before declaring done. See [gotchas.md § Build](./.claude/rules/gotchas.md#build--pnpm--turbo).

## Feature Implementation

Always use TDD: one failing test (RED) → confirm it fails → minimal code to pass (GREEN) → confirm → refactor. Never write implementation code before a failing test. `/tdd` is retired, so follow these steps directly.

## Before Committing

Perform the **Zero-Touch Audit** in [AGENTS.md](./AGENTS.md): `pnpm lint`, `pnpm typecheck`, `pnpm test`, conflict-marker scan, import check, generated files updated. Run the `/local-ci-precheck` steps before opening or pushing a PR (lint + typecheck + architecture-audit + drift checks, in parallel, ~30 s).

## Pipeline Stage Hooks (idea-to-prod / autorun)

Every stage — including autorun's per-stage subagents — must run the hook for its stage and record the outcome in that stage's artifact.

| Stage                                       | Hook                                                                                                                                                                                                                                                 | Record in                                       |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `implement` (before the first push of a PR) | Run the checks in [`.claude/skills/local-ci-precheck/SKILL.md`](./.claude/skills/local-ci-precheck/SKILL.md) — read the file and execute its steps directly (it is `disable-model-invocation`). Fix every failure before pushing.                    | PR body / `breakdown.md` note                   |
| `ship` (pre-flight)                         | Same `local-ci-precheck` steps against the final branch head. A red check is a failed pre-flight, not a warning.                                                                                                                                     | `release.md` pre-flight list                    |
| `operate` (retro)                           | `/idea-to-prod:knowledge-base` harvest over the run's sessions (`kb.py harvest <main checkout root> --days N`). Proposed `gotchas.md` entries go in the retro's follow-ups for human review, never written silently. Zero findings is valid; say so. | `retro.md` (a "Gotcha harvest" line or section) |

A hook that did not run must be stated as skipped, with the reason, in the stage artifact — never omitted.

## Manual Deployment

GH Actions runs on this account (verify with `gh run list --limit 5`). To ship without waiting on CI:

- **Static sites**: `cd apps/<marketing|hospitality|rialto-web> && pnpm dlx wrangler@latest deploy`
- **DO services** (all services + db-migrate, single app): `doctl apps create-deployment $DO_APP_ID --wait` (`DO_APP_ID` from your local `.env` or shell)
- **DO build logs**: `doctl apps logs $DO_APP_ID <agent-api|users-api|reservations-api|db-migrate> --type=build --deployment <id>` (component is positional, NOT `--component`)
- **Pulumi**: `cd infrastructure/pulumi && pulumi up --stack prod`
- **Rialto visuals without an npm republish:** consumers use `workspace:*`, so `pnpm --dir packages/rialto build && pnpm --dir apps/rialto-web build`, then deploy rialto-web. Only `npm publish` from `packages/rialto` for a real registry release.

## MCP Servers & Observability

- **Langfuse, Semgrep, Playwright:** [docs/claude-reference.md § MCP Servers & Observability](./docs/claude-reference.md#mcp-servers--observability).
- **Stripe:** from the user-level `stripe` plugin. Test-mode keys only (`sk_test_…`, prefer read-only RAKs); **never** `sk_live_…`.

## Session Learning

`.claude/memory/` (corrections and reinforcements, hand-written — there is no `/reflect` skill), `.claude/reflections/` (synthesis and RCAs), `.claude/improvement-loop/` (loop telemetry) and `.claude/sessions/` (archived session summaries) feed lessons back into `gotchas.md`. Mechanics, the promotion path, and how to capture a correction by hand: [docs/claude-reference.md § Session Learning](./docs/claude-reference.md#session-learning--feedback-loop).
