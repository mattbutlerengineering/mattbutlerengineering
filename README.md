# Matt Butler Engineering

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](./LICENSE)
[![codecov](https://codecov.io/gh/mattbutlerengineering/mattbutlerengineering/graph/badge.svg)](https://codecov.io/gh/mattbutlerengineering/mattbutlerengineering)

<!-- acmm:begin -->![ACMM Level 3](https://img.shields.io/badge/ACMM-Level%203-7a5a36?style=flat-square)<!-- acmm:end -->

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

| App | URL |
|-----|-----|
| Marketing site | http://localhost:3000 |
| Hospitality app | http://localhost:3002/hospitality |
| Users API (+ docs) | http://localhost:3001/docs |
| Agent API (+ docs) | http://localhost:3003/docs |
| Reservations API (+ docs) | http://localhost:3004/docs |

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
│   ├── api-client/           # Typed fetch client for frontend apps
│   ├── auth/                 # Auth utilities (React hooks + Fastify plugin)
│   ├── config/               # Shared ESLint, TypeScript, Prettier configs
│   ├── rialto/               # Rialto design system (component library)
│   ├── rialto-catalog/       # Component catalog generator for Rialto
│   ├── rialto-plugin/        # Claude Code plugin for Rialto
│   └── types/                # Shared TypeScript type definitions
├── tools/
│   └── cli/                  # `mbe` CLI for agent management
└── infrastructure/           # IaC (Pulumi) and edge routing
    └── pulumi/               # Pulumi TypeScript project
```

## AI Maturity (ACMM)

This repository is measured against the [AI Codebase Maturity Model (ACMM)](docs/acmm.md) to track how well each project is set up for autonomous agent workflows.

| Project | Level | Role | Next Gap |
|---|---|---|---|
| **Repository Root** | **L3** | **Analyst** | Activity Audit, Rollback drills |
| [apps/gen](apps/gen/) | L2 | Rule-writer | PR acceptance tracking |
| [apps/hospitality](apps/hospitality/) | L2 | Rule-writer | PR acceptance tracking |
| [apps/marketing](apps/marketing/) | L2 | Rule-writer | PR acceptance tracking |
| [apps/rialto-web](apps/rialto-web/) | L2 | Rule-writer | PR acceptance tracking |
| [packages/agent-core](packages/agent-core/) | L2 | Rule-writer | PR acceptance tracking |
| [packages/api-client](packages/api-client/) | L2 | Rule-writer | PR acceptance tracking |
| [packages/api-versioning](packages/api-versioning/) | L2 | Rule-writer | PR acceptance tracking |
| [packages/auth](packages/auth/) | L2 | Rule-writer | PR acceptance tracking |
| [packages/config](packages/config/) | L2 | Rule-writer | PR acceptance tracking |
| [packages/observability](packages/observability/) | L2 | Rule-writer | PR acceptance tracking |
| [packages/rialto](packages/rialto/) | L2 | Rule-writer | PR acceptance tracking |
| [packages/rialto-catalog](packages/rialto-catalog/) | L2 | Rule-writer | PR acceptance tracking |
| [packages/rialto-plugin](packages/rialto-plugin/) | L2 | Rule-writer | PR acceptance tracking |
| [packages/types](packages/types/) | L2 | Rule-writer | PR acceptance tracking |
| [packages/feature-flags](packages/feature-flags/) | L2 | Rule-writer | PR acceptance tracking |
| [packages/agent-test-utils](packages/agent-test-utils/) | L2 | Rule-writer | PR acceptance tracking |
| [packages/mcp-server](packages/mcp-server/) | L2 | Rule-writer | PR acceptance tracking |
| [infrastructure](infrastructure/) | L2 | Rule-writer | PR acceptance tracking |

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
mbe agent run "Fix the login bug"    # Run an AI agent to fix an issue
mbe agent orchestrate "Big task"     # Decompose and run in parallel
```

See [tools/cli/](tools/cli/) for the full command reference.

## Development

See [CLAUDE.md](CLAUDE.md) for detailed development guidelines including:

- Code style and naming conventions
- API patterns and error handling
- Testing structure and mocking
- Database migration workflows
- Deployment architecture

## License

[MIT](./LICENSE) © 2026 Matt Butler

Contributions welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md), [docs/review-criteria.md](./docs/review-criteria.md), and [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md). For security disclosures, see [SECURITY.md](./SECURITY.md).
