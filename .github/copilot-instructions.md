# GitHub Copilot Instructions

> For full project context, see [AGENTS.md](../AGENTS.md) (primary source of truth).

## Project Overview

TypeScript monorepo (`mattbutlerengineering`) using **Turborepo + pnpm**.

- `apps/` — React (Vite) frontends: marketing, hospitality, rialto-web, gen
- `services/` — Fastify + Prisma backends: users (3001), agent (3003), reservations (3004)
- `packages/` — Shared libraries: agent-core, api-client, api-versioning, auth, config, observability, rialto (design system), types
- `infrastructure/` — Pulumi IaC + Docker

## Code Style

- **Immutability first** — never mutate objects in place; return new copies
- **Functional React** — hooks only, no class components
- **CSS Modules** with Rialto design tokens (`var(--rialto-*)`) — no Tailwind
- **Naming:** kebab-case files, camelCase functions/vars, PascalCase types
- **Imports:** explicit extensions (`.js`/`.ts`), `import type` for type-only imports
- **File size:** 200-400 lines typical, 800 max

## API Conventions

- RFC 7807 Problem Details for errors
- Zod schema validation at all service boundaries
- Fastify route structure with shared JSON schemas
- Repository pattern for data access

## Testing

- Framework: **Vitest** for unit/integration, **Playwright** for E2E
- TDD: write tests first (red), implement (green), refactor
- Target: 80%+ coverage
- Pattern: `*.test.ts` colocated with source

## Git & Commits

- **Conventional Commits:** `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`, `perf:`, `ci:`
- Run before committing: `pnpm lint && pnpm typecheck && pnpm test`

## Do Not

- Use `console.log` in production code (use the observability package)
- Use Tailwind or inline styles (use CSS Modules with Rialto tokens)
- Hardcode secrets, API keys, or tokens
- Mutate function arguments or shared state
- Skip error handling — validate inputs and handle errors at every level
- Use `any` type — prefer `unknown` with type narrowing

## Database

- Prisma ORM with per-service schemas
- Migrations version-controlled in `services/*/prisma/migrations/`
- Dev: `pnpm db:push` from root; Prod: `pnpm db:migrate` from service dir

## Deployment

- Static sites: Cloudflare Workers Static Assets via `wrangler`
- API services: DigitalOcean App Platform via `doctl`
- Infrastructure: Pulumi (TypeScript)
