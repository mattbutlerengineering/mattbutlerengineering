# AGENTS.md - Core Development Guidelines for AI Coding Agents

> This file is the primary source of project context for all AI agents (Gemini, Claude, OpenCode, Codex, Cursor).
> For tool-specific mandates, see [CLAUDE.md](./CLAUDE.md) (Claude), [GEMINI.md](./GEMINI.md) (Gemini), or [.cursorrules](./.cursorrules) (Cursor).
> OpenCode reads [opencode.json](./opencode.json). Codex reads [.codex/config.toml](./.codex/config.toml).
> Reference material (package inventory, tool lists, routing/Auth0/deploy facts, Semgrep config, Turborepo caching, AI context catalog) lives in [docs/agents-reference.md](./docs/agents-reference.md).

## Project Identity

- **Name:** mattbutlerengineering
- **Type:** Monorepo (Turborepo + pnpm)
- **Package Prefix:** `@mbe/`
- **Naming Exception:** `packages/rialto` publishes as `@mattbutlerengineering/rialto`, not `@mbe/rialto` — it's the design system's external npm publish scope (GitHub Packages), since it's consumed outside the monorepo as a public-facing package name.
- **External Prefix:** `mattbutlerengineering-` (for Auth0, DigitalOcean, DBs)

## Project Structure

- `apps/` — Frontend React (Vite) applications: `marketing` (/), `hospitality` (/hospitality), `rialto-web` (/rialto), `gen` (/gen).
- `services/` — Backend Fastify/Node APIs: `users` (3001), `agent` (3003), `reservations` (3004).
- `packages/` — Shared libraries; each has its own `CLAUDE.md`. Inventory: [docs/agents-reference.md § Packages](./docs/agents-reference.md#packages).
- `infrastructure/` — Pulumi (IaC) and Docker configuration.
- `tools/` — Developer CLI (`mbe`).

## Core Commands (Root Level)

```bash
pnpm dev:local      # Start DB + sync + all dev servers
pnpm dev            # Start all dev servers
pnpm build          # Turbo build all
pnpm test           # Run all Vitest suites
pnpm lint           # Run ESLint across workspace
pnpm typecheck      # Run tsc across workspace
pnpm clean          # Wipe artifacts and node_modules
```

## Development Flow with Metrics & Continuous Improvement

The continuous-improvement loop (audit → fix → ship → verify) runs as **slash-skills** for Claude Code, or `mbe` CLI subcommands for other tools. Claude Code loads project skills from `.claude/skills/` (both project automation and general engineering advice). See [docs/claude-reference.md](./docs/claude-reference.md) for the full skill catalog and [CLAUDE.md](./CLAUDE.md#continuous-improvement-loop) for scheduling.

Skill quick reference, ACMM audit commands, the synthetic-bug audit and the `mbe` subcommand list: [docs/agents-reference.md](./docs/agents-reference.md#continuous-improvement-quick-reference). Multi-repo coordination is manual: [docs/agents-reference.md § Multi-Repo Orchestration](./docs/agents-reference.md#multi-repo-orchestration).

---

## CI Policy (Green Main)

Main must always be green. All PRs require **CI Gate** to pass before merge.

- **No admin-merge through red checks.** Emergency revert is the only exception.
- **If main breaks, fix is top priority.** Drop current work and restore green.
- **Node 22 is pinned via `.nvmrc`.** Run `nvm use` before generating llms.txt files.
- **Revert watchdog** monitors every commit to main and files CRITICAL issues if CI fails.

## Zero-Touch Audit (Quality Mandate)

To minimize human intervention and maintain a low human-touch ratio, agents must perform a **Zero-Touch Audit** before finalizing any PR.

### Pre-Commit Checklist

- [ ] **No Residual Conflict Markers:** Scan for `<<<<`, `====`, `>>>>` in all modified files. Never commit them.
- [ ] **No Missing Imports:** Ensure every new component or utility (especially from Rialto or other packages) has a corresponding `import` statement.
- [ ] **Stale Generated Files:** If you modify schemas, dependencies, or Rialto components, run the relevant regeneration scripts:
  - `pnpm build` (to update dist/exports)
  - `mbe pack` (to update AI context skeletons)
  - `pnpm generate:dep-graph` (if package dependencies changed)
- [ ] **Synchronize Infrastructure:** If service dependencies (`package.json`) change, update the corresponding `Dockerfile` and `infrastructure/pulumi` if necessary.
- [ ] **No Linting Hacks:** Do NOT use `eslint-disable` or `@ts-ignore` to "fix" violations. Resolve the root cause.
- [ ] **No Silent TDD:** Do not skip the Red-Green-Refactor cycle. A change is not "done" until a failing test has been made to pass.
- [ ] **Verified verification:** Don't just run tests; provide the command output showing they passed.

---

## Domain Language

Core concepts are defined in the canonical glossary:
[`docs/domain/ubiquitous-language.md`](docs/domain/ubiquitous-language.md)

When naming a symbol or writing docs, check the glossary first.
Synonyms listed there as "avoid" must not appear in code or API responses.

---

## Architecture & Conventions

Routing & URLs, Auth0 configuration and deployment targets: [docs/agents-reference.md § Routing, Auth0 and Deployment](./docs/agents-reference.md#routing-auth0-and-deployment).

### Code Style

- **Components:** Functional React + Hooks.
- **Styling:** CSS Modules with Rialto tokens (`var(--rialto-*)`). **No Tailwind.**
- **Imports:** Explicit extensions (`.js/.ts`), `import type` for types.
- **Naming:** kebab-case for files, camelCase for functions/vars, PascalCase for types.

### API Development

- **Standardized Errors:** Use RFC 7807 (Problem Details).
- **Validation:** Strict Zod schema enforcement on all service boundaries.
- **Fastify:** Route structure with shared JSON schemas.

### Database (Prisma)

- `pnpm db:push` (root) — push all schemas, dev only.
- Prod migrations apply automatically: the `db-migrate` DO job runs `prisma migrate deploy` per service (`infrastructure/migrate/migrate.sh`). To apply by hand, run `pnpm db:migrate:deploy` from each service dir (`services/users`, `services/reservations`, `services/agent`) — never `pnpm db:migrate`, which is `prisma migrate dev` and can drop tables on drift. There is no root-level `db:migrate` script.
- Migrations must be version-controlled in each service's `prisma/migrations/`.

## Testing & Validation

- **Framework:** Vitest.
- **Patterns:** `*.test.ts` for unit/integration.
- **Location:** Colocate test files next to the source they test (`foo.ts` → `foo.test.ts` in the same directory). This is the repo-wide majority convention — new packages and new test files should follow it.
  - **Grandfather clause:** Packages that are already fully `__tests__/`-based (e.g. `packages/agent-core`, `tools/cli`) keep that style — do not migrate them to colocated. Within a package, pick one style and stay internally consistent; don't mix both in the same package.
- **Mandate:** All logic changes must be verified via automated tests.
- **UI:** Playwright for E2E and visual regression.

## Security Scanning (Semgrep)

Semgrep provides Static Application Security Testing (SAST) integrated into the AI development loop.

### Pre-commit Security Checks

The `.husky/pre-commit` hook runs `semgrep --config semgrep.yml --error` on staged files before commit.

Rules file, categories and manual commands: [docs/agents-reference.md § Semgrep configuration](./docs/agents-reference.md#semgrep-configuration).

## Model Governance

To ensure cost-efficiency and technical integrity, follow this model tiering strategy:

- **Tier 1: Haiku / Gemini Flash** - Lightweight chores, linting, dependency bumps, typos (< $0.05).
- **Tier 2: Sonnet / Gemini Pro** - Standard features, refactors, unit tests, logic fixes ($0.05 - $0.50).
- **Tier 3: Opus / Gemini Ultra** - Architectural design, complex migrations, cross-cutting system changes (>$0.50).

Use `mbe check-model "<directive>"` to verify the recommended tier before starting high-complexity work.

## RIPER Workflow

To maintain high-velocity engineering without sacrificing quality, agents follow the **RIPER** (Research, Innovate, Plan, Execute, Review) cycle:

1.  **Research:** Explore the codebase, identify root causes, and gather requirements. **No file edits.**
2.  **Innovate:** Brainstorm multiple approaches, evaluate trade-offs, and select the optimal path.
    - **Approach Score:** For each of 2–3 candidate solutions, score on correctness, code complexity, blast radius, and reversibility. Document trade-offs.
    - **Decision Log:** Record the chosen approach and rationale for rejected alternatives (in comments, the commit message, or — for a pipeline run — the run's `docs/features/<slug>/architecture.md` or `docs/fixes/<slug>/` artifact if complex).
    - **Time-box:** ~5 minutes for routine tasks; ~20 minutes for architectural decisions. If exceeding time-box, flag for HITL review.
3.  **Plan:** Create a detailed implementation plan including file changes and verification steps — for a pipeline run, the run's `docs/features/<slug>/breakdown.md` (or `docs/fixes/<slug>/`); for a one-off task, the PR body. There is no `.planning/` directory in this repo and nothing gitignores one, so do not create plan files there.
4.  **Execute:** Implement the approved plan using **Silent TDD Mode**. Break work into 5-minute micro-tasks.
5.  **Review:** Run tests, linting, and typechecks. Perform a self-review of the changes against the plan.

Agents must signal their current phase using the following tokens:

- `<riper:research>`
- `<riper:innovate>`
- `<riper:plan>`
- `<riper:execute>`
- `<riper:review>`

## AI Context Catalog

The files agents should know about, in load order (`CLAUDE.md`, `GEMINI.md`, `.cursorrules`, `.claude/rules/gotchas.md`, per-package `CLAUDE.md`, `llms.txt`, …): [docs/agents-reference.md § AI Context Catalog](./docs/agents-reference.md#ai-context-catalog).

## AI Tooling Adoption Gate

Before adding any new tool, skill, plugin, or MCP server to the workflow, run `/evaluate-tool <repo-url>` from the [`ai-tooling`](https://github.com/mattbutlerengineering/ai-tooling) plugin. It checks overlap against the catalog, maps the tool to a dev loop stage and quality signal, and outputs an ADOPT / REPLACE / SKIP / DEFER verdict.

The authoritative installed-vs-STACK gap report is at [`docs/ai-tooling-audit.md`](docs/ai-tooling-audit.md). Keep the report current whenever you add or remove tools. `/audit-workflow` does **not** resolve from a session here — it lives in the external `ai-tooling` marketplace, which that report itself records as not registered; the current report was produced by following its `SKILL.md` protocol by hand.

Marketplace install commands: [docs/agents-reference.md](./docs/agents-reference.md#installing-the-ai-tooling-marketplace).

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
