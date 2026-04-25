# Matt Butler Engineering

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](./LICENSE)
<!-- acmm:begin -->![ACMM Level 4](https://img.shields.io/badge/ACMM-Level%204-c4952c?style=flat-square)<!-- acmm:end -->

> **Build status:** GitHub Actions billing is intentionally unconfigured on this repo. Workflows in `.github/workflows/` exist as encoded policy and run via [claude.ai RemoteTriggers](https://claude.ai/code/scheduled), not on PR open. Verify changes locally with `pnpm lint`/`typecheck`/`test`. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full story.

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
