# Matt Butler Engineering

[![CI](https://github.com/mattbutlerengineering/mattbutlerengineering/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/mattbutlerengineering/mattbutlerengineering/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](./LICENSE)
[![codecov](https://codecov.io/gh/mattbutlerengineering/mattbutlerengineering/graph/badge.svg?token=ANNEPED1FV)](https://codecov.io/gh/mattbutlerengineering/mattbutlerengineering)

<!-- acmm:begin -->[![ACMM Level 5](https://img.shields.io/badge/ACMM-Level%205-c4952c?style=flat-square)](docs/acmm.md)<!-- acmm:end -->

> **Build status:** GitHub Actions runs CI checks on every PR. Verify changes locally with `pnpm lint`/`typecheck`/`test`. See [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

Monorepo for [mattbutlerengineering.com](https://mattbutlerengineering.com) -- a hospitality management platform with a design system, multiple frontend apps, and backend API services.

## Tech Stack

- **Frontend**: React 19, Vite, React Router
- **Backend**: Fastify, Prisma, PostgreSQL
- **Design System**: [Rialto](packages/rialto/) (custom React component library)
- **Monorepo**: Turborepo + pnpm workspaces
- **Infrastructure**: Pulumi (TypeScript), Cloudflare Workers, DigitalOcean App Platform
- **Auth**: Auth0 (OIDC/JWT)
- **Testing**: Vitest, Playwright
- **CI/CD**: GitHub Actions

## Quick Start

```bash
# Install dependencies
pnpm install

# Start everything (Postgres via Docker, schema sync, dev servers)
pnpm dev:local
```

This starts PostgreSQL in Docker, syncs all database schemas, and launches all dev servers.

### Access Points

| App                       | URL                               |
| ------------------------- | --------------------------------- |
| Marketing site            | http://localhost:3000             |
| Hospitality app           | http://localhost:3002/hospitality |
| Users API (+ docs)        | http://localhost:3001/docs        |
| Agent API (+ docs)        | http://localhost:3003/docs        |
| Reservations API (+ docs) | http://localhost:3004/docs        |

## Project Structure

```
mattbutlerengineering/
├── apps/                     # Frontend applications
│   ├── gen/                  # Gen app (dynamic UI rendering)
│   ├── hospitality/          # Restaurant management SPA
│   ├── marketing/            # Public marketing site
│   └── rialto-web/           # Design system showcase
├── services/                 # Backend API services
│   ├── agent/                # Agent session management API
│   ├── reservations/         # Reservations and table management API
│   └── users/                # User management API
├── packages/                 # Shared libraries
│   ├── agent-core/           # Agent session runner and worktree management
│   ├── agent-test-utils/     # Test helpers for agent sessions
│   ├── api-client/           # Typed fetch client for frontend apps
│   ├── auth/                 # Auth utilities (React hooks + Fastify plugin)
│   ├── cancellation-policy/  # Pure cancellation-fee decision engine
│   ├── config/               # Shared ESLint, TypeScript, Prettier configs
│   ├── database/             # Prisma connection-pool wrapper
│   ├── gh-client/            # Typed GitHub wrapper (exec timeouts, REST fallback)
│   ├── jobs/                 # BullMQ background jobs over Redis
│   ├── mcp-server/           # Infrastructure MCP server for Claude Code
│   ├── notifications/        # Email/SMS notification adapters
│   ├── observability/        # OpenTelemetry SDK wrapper
│   ├── rialto/               # Rialto design system (component library)
│   ├── rialto-catalog/       # Component catalog generator for Rialto
│   ├── rialto-plugin/        # Claude Code plugin for Rialto
│   ├── sentry/               # Sentry error tracking integration
│   ├── service-bootstrap/    # createServiceApp — configured Fastify instance
│   ├── supply-chain-scanner/ # Static scan of third-party skills and MCP packages
│   ├── test-fixtures/        # Shared mock-data factories
│   └── types/                # Shared TypeScript type definitions
├── plugins/
│   └── acmm/                 # AI Codebase Maturity Model audit plugin
├── tools/
│   └── cli/                  # `mbe` CLI for dev, agents, and infrastructure
└── infrastructure/           # IaC, Docker, edge routing, DB migrations
    ├── docker/               # Docker Compose for local dev
    ├── init/                 # First-run bootstrap
    ├── migrate/              # Prisma migration runner (production)
    ├── pulumi/               # Pulumi TypeScript IaC
    ├── traefik/              # Local reverse proxy
    └── worker/               # Cloudflare Worker edge router
```

## How this repo builds itself

Most of the commits here are written by AI agents and merged without a human in
the loop. That is the point of the repo, not a side effect of it — the interesting
artifact is the machinery that makes it safe, not any single feature.

The loop:

1. **Work is filed, not assigned.** Scheduled routines audit the live site, triage
   Sentry, score the repo against a maturity model, and mine CI history for
   recurring failures — each files GitHub issues labeled `ready`.
2. **Agents claim and implement.** `/implement-queue` claims a batch of independent
   issues and runs one TDD worker per issue in an isolated git worktree: failing
   test first, minimal implementation, then lint/typecheck/test gates.
3. **Reviewers gate the merge.** Seven specialist subagents review by change shape —
   ADR compliance, Prisma migrations, Stripe flows, E2E selector drift, generated-
   artifact determinism, dependency bumps, Rialto prop drift — plus a universal
   reviewer that checks the diff against the issue's acceptance criteria.
4. **Green PRs auto-merge.** `CI Gate` is the single required check; auto-merge
   completes once it passes and the branch is up to date.
5. **Failures feed back.** Reverts trigger root-cause sessions, gotchas are harvested
   into [`.claude/rules/gotchas.md`](./.claude/rules/gotchas.md), and metrics drive a
   self-tuning circuit breaker.

The agent-facing contract lives in [CLAUDE.md](./CLAUDE.md) and [AGENTS.md](./AGENTS.md);
[docs/AGENT-WORKFLOW.md](./docs/AGENT-WORKFLOW.md) and
[docs/scheduled-tasks.md](./docs/scheduled-tasks.md) cover the routines.

### Maturity (ACMM)

Scored against the [AI Codebase Maturity Model](docs/acmm.md)
([arXiv:2604.09388](https://arxiv.org/abs/2604.09388)) by
[`plugins/acmm`](./plugins/acmm), which runs on a schedule and updates the badge
above in place.

The level and the behavioural metrics behind it — agent PR acceptance, revert rate,
CI flake rate, human-touch ratio — are deliberately **not** duplicated into this
README. They moved every week and this file did not, which is how it ended up
claiming three different levels at once. [`docs/acmm.md`](docs/acmm.md) is the
single source of truth.

## Quality gates

`CI Gate` is the only required status check on `main`; it aggregates the jobs below.

| Gate                   | What it catches                                                           |
| ---------------------- | ------------------------------------------------------------------------- |
| lint / typecheck       | ESLint + `tsc --noEmit` across every workspace package                    |
| test                   | Vitest unit + integration, coverage reported to Codecov                   |
| build                  | Every app and package builds, including generated artifacts               |
| integrity              | `llms.txt`, dependency graph, and catalog schemas match their sources     |
| architecture-audit     | ADR conformance, dependency boundaries, circular-import detection         |
| ai-antipattern-ratchet | A baselined count per antipattern; regressions fail, cleanups re-baseline |
| migrations             | Prisma migration dry-run plus a destructive-operation check               |
| hadolint / trivy       | Dockerfile lint and container vulnerability scan                          |

Beyond the gate: Playwright E2E suites, mutation testing via Stryker, Gitleaks
secret scanning (shifted left to a pre-commit hook), Lighthouse audits of the live
site, and a `pnpm audit` pass that can red `main` from a newly published CVE with no
code change.

## Commands

```bash
pnpm dev:local    # Start everything (Postgres + schema sync + dev servers)
pnpm dev          # Start dev servers (assumes Postgres is running)
pnpm build        # Build all packages and apps
pnpm test         # Run all tests
pnpm lint         # Lint all packages
pnpm typecheck    # Type-check all packages
pnpm clean        # Remove build artifacts and node_modules
```

### Service-Specific

Each service follows the same pattern:

```bash
cd services/<name>
pnpm dev              # Dev server with hot reload
pnpm test             # Run tests
pnpm test:coverage    # Test coverage report
pnpm db:migrate       # Run database migrations
pnpm db:studio        # Open Prisma Studio
```

### CLI (`mbe`)

```bash
mbe agent run "Fix the login bug"    # Run an AI agent end-to-end, get a PR
mbe agent orchestrate "Big task"     # Decompose and run sessions in parallel
mbe issue transition 123 --to ready  # Drive the issue coordination labels
mbe stats                            # Agent performance metrics
mbe health                           # Check local + deployed service health
mbe up                               # Start dev servers
```

The workspace bin is not linked into `node_modules/.bin`, so `pnpm exec mbe` does
not resolve. Build once with `pnpm build --filter @mbe/cli...`, then invoke
`node tools/cli/dist/index.js <cmd>` (or add it to your `PATH`).
See [tools/cli/](tools/cli/) for the full command reference.

## Using Rialto

The design system publishes to **GitHub Packages**, not npm — `npm view
@mattbutlerengineering/rialto` returns 404 by design.

```bash
echo "@mattbutlerengineering:registry=https://npm.pkg.github.com" >> .npmrc
pnpm add @mattbutlerengineering/rialto
```

```tsx
import { Button } from "@mattbutlerengineering/rialto";
import "@mattbutlerengineering/rialto/styles";
```

Live component showcase: [mattbutlerengineering.com/rialto](https://mattbutlerengineering.com/rialto/).
Authoring guidelines are in [packages/rialto/CLAUDE.md](./packages/rialto/CLAUDE.md).

## Documentation

| Topic               | Start here                                             |
| ------------------- | ------------------------------------------------------ |
| Architecture        | [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)         |
| Decision records    | [docs/adr/](./docs/adr/)                               |
| Agent workflow      | [docs/AGENT-WORKFLOW.md](./docs/AGENT-WORKFLOW.md)     |
| Scheduled routines  | [docs/scheduled-tasks.md](./docs/scheduled-tasks.md)   |
| Known traps         | [.claude/rules/gotchas.md](./.claude/rules/gotchas.md) |
| Review criteria     | [docs/review-criteria.md](./docs/review-criteria.md)   |
| Secrets and config  | [docs/SECRETS.md](./docs/SECRETS.md)                   |
| Rollback            | [docs/rollback.md](./docs/rollback.md)                 |
| Day-to-day commands | [docs/CHEATSHEET.md](./docs/CHEATSHEET.md)             |

## Development

Conventions, patterns, and the mandates agents follow live in
[CLAUDE.md](./CLAUDE.md) and [AGENTS.md](./AGENTS.md): code style and naming, API
patterns and the error envelope, testing structure and mocking, database migration
workflows, and deployment architecture.

Before pushing, `pnpm lint`, `pnpm typecheck`, and `pnpm test` reproduce most of
what CI runs. Note that the pre-push hook does **not** typecheck — see
[.claude/rules/gotchas.md](./.claude/rules/gotchas.md) for that and other traps
this repo has already paid for.

## License

[MIT](./LICENSE) © 2026 Matt Butler

Contributions welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md), [docs/review-criteria.md](./docs/review-criteria.md), and [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md). For security disclosures, see [SECURITY.md](./SECURITY.md).
