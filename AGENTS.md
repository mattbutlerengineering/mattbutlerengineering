# AGENTS.md - Core Development Guidelines for AI Coding Agents

> This file is the primary source of project context for all AI agents (Gemini, Claude, Cursor, etc.).
> For tool-specific mandates, see [CLAUDE.md](./CLAUDE.md) or [GEMINI.md](./GEMINI.md).

## Project Identity
- **Name:** mattbutlerengineering
- **Type:** Monorepo (Turborepo + pnpm)
- **Package Prefix:** `@mbe/`
- **External Prefix:** `mattbutlerengineering-` (for Auth0, DigitalOcean, DBs)

## Project Structure
- `apps/` — Frontend React (Vite) applications: `marketing` (/), `hospitality` (/hospitality), `rialto-web` (/rialto), `gen` (/gen).
- `services/` — Backend Fastify/Node APIs: `users` (3001), `agent` (3003), `reservations` (3004).
- `packages/` — Shared libraries: `rialto` (Design System), `api-client`, `types`, `auth`, `config`.
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

## Architecture & Conventions

### Routing & URLs
- Served via Cloudflare Worker `edge-router` at `mattbutlerengineering.com`.
- Apps use path-prefix routing (e.g., `apps/foo` -> `/foo`).
- API services at `api.mattbutlerengineering.com` (DO App Platform).

### Auth0 Configuration
- Domain: `dev-ytbgmz5ls3wh4xdx.us.auth0.com`
- API Identifier: `https://api.mattbutlerengineering.com`

### Deployment
- Static sites (`apps/*`): `wrangler deploy` to Workers Static Assets.
- API Services (`services/*`): DO App Platform via `doctl`.
- Infrastructure: Pulumi (TypeScript).

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
- Use `pnpm db:migrate` (prod) or `pnpm db:push` (proto).
- Migrations must be version-controlled in `prisma/migrations/`.

## Testing & Validation
- **Framework:** Vitest.
- **Patterns:** `*.test.ts` for unit/integration.
- **Mandate:** All logic changes must be verified via automated tests.
- **UI:** Playwright for E2E and visual regression.

## AI Context Catalog
- `llms.txt` — Rialto component catalog (UI patterns).
- `llms-full.txt` — Detailed prop tables and advanced examples.
- `GEMINI.md` — Gemini-specific mandates (Silent TDD, Extreme Speed).
- `CLAUDE.md` — Claude-specific commands and continuous improvement loops.
