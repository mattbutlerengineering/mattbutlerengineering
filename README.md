# Matt Butler Engineering

[![CI](https://github.com/mattbutlerengineering/mattbutlerengineering/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/mattbutlerengineering/mattbutlerengineering/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](./LICENSE)
[![codecov](https://codecov.io/gh/mattbutlerengineering/mattbutlerengineering/graph/badge.svg?token=ANNEPED1FV)](https://codecov.io/gh/mattbutlerengineering/mattbutlerengineering)
[![ACMM Level 3](https://img.shields.io/badge/ACMM-Level%203-7a5a36?style=flat-square)](docs/acmm.md)

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
│   ├── api-versioning/       # API version negotiation middleware
│   ├── auth/                 # Auth utilities (React hooks + Fastify plugin)
│   ├── config/               # Shared ESLint, TypeScript, Prettier configs
│   ├── feature-flags/        # Feature flag evaluation library
│   ├── mcp-server/           # Infrastructure MCP server for Claude Code
│   ├── notifications/        # Email/SMS notification adapters
│   ├── observability/        # OpenTelemetry SDK wrapper
│   ├── rialto/               # Rialto design system (component library)
│   ├── rialto-catalog/       # Component catalog generator for Rialto
│   ├── rialto-plugin/        # Claude Code plugin for Rialto
│   ├── sentry/               # Sentry error tracking integration
│   └── types/                # Shared TypeScript type definitions
├── tools/
│   └── cli/                  # `mbe` CLI for dev, agents, and infrastructure
└── infrastructure/           # IaC, Docker, edge routing, DB migrations
    ├── docker/               # Docker Compose for local dev
    ├── migrate/              # Prisma migration runner (production)
    ├── pulumi/               # Pulumi TypeScript IaC
    └── worker/               # Cloudflare Worker edge router
```

## AI Maturity (ACMM)

Measured against the [AI Codebase Maturity Model](docs/acmm.md) ([arXiv:2604.09388](https://arxiv.org/abs/2604.09388)). Current scorecard: 104/108 criteria detected across 6 levels.

| Metric               | Value                 |
| -------------------- | --------------------- |
| Level                | L3 (Fully Autonomous) |
| Agent PR acceptance  | 97%                   |
| Agent PR revert rate | 0%                    |
| CI flake rate        | 0%                    |

See [`.claude/acmm/report.md`](.claude/acmm/report.md) for the full scorecard.

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
