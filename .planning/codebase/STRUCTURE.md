# Codebase Structure

**Analysis Date:** 2026-02-27

## Directory Layout

```
mattbutlerengineering/
├── apps/                           # Frontend applications
│   ├── hospitality/                # Hospitality app (React + Vite)
│   ├── rialto-web/                 # Design system showcase (React + Vite)
│   └── marketing/                  # Public marketing site (React + Vite)
├── services/                       # Backend microservices
│   ├── agent/                      # Agent session management API (Fastify)
│   ├── reservations/               # Reservation & venue management API (Fastify)
│   └── users/                      # User management API (Fastify)
├── packages/                       # Shared packages
│   ├── agent-core/                 # Agent session runner and orchestration
│   ├── api-client/                 # HTTP client for backend APIs
│   ├── auth/                       # Auth0 integration and JWT utilities
│   ├── config/                     # Shared ESLint, TypeScript, Prettier configs
│   ├── rialto/                     # Design system component library (React)
│   ├── shared-layout/              # Reusable layout components
│   ├── types/                      # Shared TypeScript type definitions
│   └── ui/                         # Legacy UI components (being replaced by rialto)
├── tools/
│   └── cli/                        # `mbe` command-line tool
├── infrastructure/                 # Infrastructure as Code
│   ├── docker/                     # Docker compose files
│   ├── init/                       # Database initialization scripts
│   ├── pulumi/                     # Pulumi IaC (TypeScript)
│   └── traefik/                    # Reverse proxy configuration
├── docs/                           # Documentation
│   ├── evaluations/                # Technology decision documents
│   ├── one-man-dev-team/           # Methodology documentation
│   └── plans/                      # Architecture and planning docs
├── package.json                    # Root workspace manifest
├── pnpm-workspace.yaml             # pnpm workspace configuration
├── turbo.json                      # Turborepo build orchestration
├── prettier.config.js              # Code formatter config
└── CLAUDE.md                       # Project-specific development guidelines
```

## Directory Purposes

**apps/**
- Purpose: User-facing applications (frontend)
- Contains: React apps, pages, components, hooks, styling
- Key files: `src/main.tsx` (entry point), `src/App.tsx` (router), `src/pages/` (page components)

**services/**
- Purpose: Backend API microservices with business logic
- Contains: Fastify apps, route handlers, service layer, Prisma schemas, database migrations
- Structure: Each service mirrors pattern: `src/app.ts`, `src/index.ts`, `src/routes/`, `src/services/`, `src/schemas/`, `prisma/schema.prisma`

**packages/**
- Purpose: Shared code and utilities consumed by multiple apps/services
- Contains: Reusable libraries, type definitions, configuration
- All published/consumed via `@mbe/*` namespace

**tools/cli/**
- Purpose: Command-line interface for developer workflows
- Contains: Commander-based CLI with subcommands for auth, users, agent operations

**infrastructure/**
- Purpose: Infrastructure and deployment configuration
- Contains: Docker compose, Pulumi IaC definitions, Traefik reverse proxy config

**docs/**
- Purpose: Project documentation
- Contains: Technology evaluations, architecture decisions, methodology guides

## Key File Locations

**Entry Points:**

Frontend apps:
- Marketing: `apps/marketing/src/main.tsx` - React app entry, renders homepage
- Hospitality: `apps/hospitality/src/main.tsx` - React app entry, renders hospitality app
- Rialto Showcase: `apps/rialto-web/src/main.tsx` - Design system component showcase

Backend services:
- Users: `services/users/src/index.ts` - Starts Fastify server on :3001
- Agent: `services/agent/src/index.ts` - Starts Fastify server on :3003
- Reservations: `services/reservations/src/index.ts` - Starts Fastify server (port TBD)

CLI:
- `tools/cli/src/index.ts` - CLI program entry, registers subcommands

**Configuration:**

Root level:
- `package.json` - Root workspace, shared scripts (dev:local, build, test, lint)
- `pnpm-workspace.yaml` - Defines workspaces
- `turbo.json` - Task pipeline and caching
- `prettier.config.js` - Code formatter config

Build configs:
- `tsconfig.json` - Root TypeScript config (referenced by all packages)
- `.eslintrc` - Root ESLint config (referenced by all packages)
- `vitest.config.ts` - In each service/package that runs tests

App configs:
- `vite.config.ts` - In each frontend app and rialto package
- `playwright.config.ts` - E2E test config in rialto-web

Infrastructure:
- `infrastructure/docker-compose.yml` - Postgres, local dev setup
- `infrastructure/pulumi/` - Cloud infrastructure as code (TypeScript)

**Core Logic:**

Frontend apps:
- `apps/{app}/src/components/` - React components (organized by feature)
- `apps/{app}/src/pages/` - Page components (route-level)
- `apps/{app}/src/hooks/` - Custom React hooks
- `apps/{app}/src/App.tsx` - Router setup with react-router-dom

Backend services:
- `services/{service}/src/routes/` - Route handlers (organized by resource, e.g., `users.ts`, `sessions.ts`)
- `services/{service}/src/services/` - Business logic (e.g., `user.ts`, `reservation.ts`)
- `services/{service}/src/schemas/` - JSON Schema definitions for request/response validation
- `services/{service}/src/app.ts` - Fastify app factory with plugin registration
- `services/{service}/prisma/schema.prisma` - Database schema

Shared packages:
- `packages/types/src/` - Type definitions by domain (user.ts, reservation.ts, agent.ts, etc.)
- `packages/auth/src/types/` - Auth-specific types
- `packages/auth/src/react/` - React auth hooks
- `packages/auth/src/fastify/` - Fastify auth utilities
- `packages/agent-core/src/` - Agent execution, worktree management, PR creation
- `packages/api-client/src/` - HTTP client factories
- `packages/rialto/src/components/` - Design system components

**Testing:**

Test files colocated with source:
- `services/{service}/src/routes/*.test.ts` - Route/integration tests
- `services/{service}/src/services/*.test.ts` - Service unit tests
- `packages/auth/src/*.test.ts` - Auth package tests
- `apps/rialto-web/e2e/` - Playwright E2E tests

Test configuration:
- `vitest.config.ts` - In each service/package
- `playwright.config.ts` - In rialto-web for E2E tests

Coverage:
- `services/{service}/coverage/` - Generated coverage reports (v8 format)

## Naming Conventions

**Files:**

- Components: `PascalCase.tsx` (e.g., `UserCard.tsx`, `DashboardLayout.tsx`)
- Utilities: `camelCase.ts` (e.g., `formatDate.ts`, `parseJson.ts`)
- Services: `camelCase.ts` (e.g., `user.ts`, `reservation.ts`)
- Routes: `kebab-case.ts` (e.g., `users.ts`, `session-events.ts`)
- Tests: `*.test.ts` or `*.spec.ts` (e.g., `users.test.ts`)
- Schemas: `kebab-case.ts` (e.g., `user-schema.ts`, index.ts for barrel export)
- Migrations: `{timestamp}_{snake_case}.sql` (Prisma auto-generates)

**Directories:**

- Features: `kebab-case/` (e.g., `booking-widget/`, `floor-plans/`)
- Types: `camelCase/` (e.g., `services/`, `routes/`, `schemas/`)
- Internal packages: `kebab-case/` (e.g., `agent-core/`, `api-client/`)

**TypeScript:**

- Types/Interfaces: `PascalCase` (e.g., `User`, `CreateUserRequest`)
- Enums: `PascalCase` (e.g., `ReservationStatus`)
- Functions: `camelCase` (e.g., `getUserById`, `createReservation`)
- Constants: `UPPER_SNAKE_CASE` (e.g., `MAX_PAGE_SIZE`, `API_BASE_URL`)
- React components: `PascalCase` (e.g., `UserCard`)
- React hooks: `camelCase` starting with `use` (e.g., `useAuth`, `useReservations`)

## Where to Add New Code

**New Frontend Feature:**
- Primary code: `apps/{app}/src/components/{feature}/` and `apps/{app}/src/pages/{feature}.tsx`
- Shared types: Add to `packages/types/src/{domain}.ts`
- Tests: `apps/{app}/src/components/{feature}/{component}.test.tsx`

**New Backend API Endpoint:**
- Routes: `services/{service}/src/routes/{resource}.ts` (or extend existing route file)
- Business logic: `services/{service}/src/services/{resource}.ts`
- Schemas: `services/{service}/src/schemas/{resource}.ts` and register in `schemas/index.ts`
- Database: Modify `services/{service}/prisma/schema.prisma` and run `pnpm db:migrate dev`
- Tests: `services/{service}/src/routes/{resource}.test.ts` for integration tests

**New Shared Utility or Type:**
- Pure types: `packages/types/src/{domain}.ts`
- Auth utilities: `packages/auth/src/{react|fastify|types}/`
- API client: `packages/api-client/src/`
- Design system component: `packages/rialto/src/components/{ComponentName}/`
- General utility: Create new package under `packages/{name}/` with `src/index.ts` export

**New Backend Service:**
- Copy structure from `services/users/`:
  - `src/app.ts` - Fastify app factory
  - `src/index.ts` - Entry point
  - `src/routes/` - Route handlers
  - `src/services/` - Business logic
  - `src/schemas/` - JSON Schema definitions
  - `prisma/schema.prisma` - Database schema
- Register routes in `app.ts` and export buildApp
- Add to pnpm-workspace.yaml if not auto-detected

**CLI Command:**
- File: `tools/cli/src/commands/{command}.ts`
- Export function: `export const {command}Command = new Command()`
- Register in: `tools/cli/src/index.ts` via `program.addCommand()`

## Special Directories

**node_modules:**
- Purpose: Dependency installation
- Generated: Yes (by pnpm install)
- Committed: No

**dist/**
- Purpose: Compiled JavaScript output
- Generated: Yes (by pnpm build)
- Committed: No

**.agent-worktrees/**
- Purpose: Isolated git worktrees for agent execution (temporary)
- Generated: Yes (by agent-core during session)
- Committed: No

**coverage/**
- Purpose: Test coverage reports
- Generated: Yes (by vitest --coverage)
- Committed: No

**prisma/migrations/**
- Purpose: Database schema change history
- Generated: Yes (by prisma migrate dev)
- Committed: Yes (must be version controlled)

**docs/evaluations/**
- Purpose: Technology decision documents with evaluation criteria
- Generated: No (manually created)
- Committed: Yes

**.planning/codebase/**
- Purpose: Codebase analysis documents for AI-assisted development
- Generated: Yes (by GSD map-codebase command)
- Committed: No

---

*Structure analysis: 2026-02-27*
