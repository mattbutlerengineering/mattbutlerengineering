# Technology Stack

**Analysis Date:** 2026-02-27

## Languages

**Primary:**
- TypeScript 5.7-5.9 - All source code (services, packages, apps)
- JavaScript (ES2022+ with ES modules) - Runtime execution

**Secondary:**
- CSS 3 - Styling with CSS Modules and Tailwind CSS
- SQL - PostgreSQL database queries (via Prisma)
- YAML - Docker Compose, CI/CD configuration

## Runtime

**Environment:**
- Node.js 20.x - Production and development (implied by pnpm workspace setup)
- Browser (ES modules compatible) - Frontend applications

**Package Manager:**
- pnpm 9.15.4 - Workspace monorepo management
- Lockfile: `pnpm-lock.yaml` (present)

## Frameworks

**Core:**
- Fastify 5.7.3 - Backend API framework (services/users, services/agent)
  - @fastify/cors 10.0.0 - CORS middleware
  - @fastify/swagger 9.0.0 - OpenAPI documentation
  - @scalar/fastify-api-reference 1.44.1 - Interactive API docs UI

**Frontend:**
- React 19.0.0 - UI library (apps/marketing, apps/hospitality, packages/rialto)
- Vite 7.0.0 - Build tool and dev server
- React Router DOM 7.1.0 - Client-side routing (apps/marketing, apps/hospitality)

**Design System:**
- Rialto (internal @mbe/rialto) - Component library with motion, tokens, and styles
- Tailwind CSS 3.4.17 - Utility-first CSS framework
- Framer Motion 12.34.0 - Animation/motion library

**Data & ORM:**
- Prisma 6.0.0 - ORM for database access
  - @prisma/client 6.0.0 - Database client
  - Database migrations: via prisma migrate

**Authentication:**
- Auth0 (OIDC/JWT) - Identity provider
  - jose 5.2.0 - JWT signing/verification
  - react-oidc-context 3.1.0 - React OIDC integration
  - oidc-client-ts 3.0.1 - OIDC client implementation

**Validation & Schema:**
- Zod 3.23.0 - TypeScript-first schema validation
- Fastify JSON Schema - OpenAPI schema validation

**AI Integration:**
- @anthropic-ai/claude-agent-sdk 0.1.0 - Autonomous coding agent SDK (packages/agent-core)

**Testing:**
- Vitest 4.0.18 - Unit and integration test runner
  - @vitest/coverage-v8 4.0.18 - V8 coverage provider
- @testing-library/react 16.3.2 - React component testing
- @testing-library/user-event 14.6.1 - User interaction simulation
- jsdom 28.1.0 - DOM implementation for testing
- vitest-axe 0.1.0 - Accessibility testing

**Build & Development:**
- Turborepo 2.3.3 - Build orchestration and caching
- tsx 4.19.0 - TypeScript execution runner
- TypeScript 5.7.3, 5.9.3 - Type checking and compilation
- ESLint - Code linting (unified @mbe/config)
- Prettier - Code formatting

**Visual Testing:**
- Playwright 1.58.2 - E2E/visual regression testing
- Lighthouse CI 0.15.1 - Performance auditing
- axe-core 4.11.1 - Accessibility auditing

**Release Management:**
- Changesets - Versioning and changelog management
- size-limit 12.0.0 - Bundle size enforcement

## Key Dependencies

**Critical:**
- @prisma/client 6.0.0 - Database access layer; breaks app if unavailable
- fastify 5.7.3 - API server; no fallback
- react 19.0.0 - UI framework; fundamental to frontend

**Infrastructure:**
- zod 3.23.0 - Input validation; prevents invalid data in APIs
- jose 5.2.0 - JWT parsing; required for Auth0 token validation
- konva 9.3.22 - Canvas rendering library (hospitality app floor plan visualization)
- react-konva 19.0.0 - React bindings for Konva

**Development:**
- turbo 2.3.3 - Monorepo build caching; speeds up development
- vitest 4.0.18 - Test execution; required for CI/CD
- typescript 5.7.3 - Type safety; compilation step

## Configuration

**Environment:**
- Services load `.env` files at startup (tsx watch --env-file=.env)
- Environment variables are required per service:
  - Users service: `DATABASE_URL`, `PORT`, `LOG_LEVEL`, `CORS_ORIGIN`, `AUTH_AUTHORITY`, `AUTH_AUDIENCE`
  - Agent service: `DATABASE_URL`, `PORT`, `LOG_LEVEL`, `DEFAULT_MODEL`, `ANTHROPIC_API_KEY`, `MAX_CONCURRENT_SESSIONS`
- Separate databases for users and agent services (both PostgreSQL)

**Build:**
- `tsconfig.json` - Base TypeScript configuration (strict mode enabled)
- `prettier.config.js` - Delegates to `@mbe/config/prettier`
- `eslint.config.js` files - Per-package ESLint configs
- `vitest.config.ts` - Test framework configuration (per package)
- `vite.config.ts` - Frontend build configuration

**Secrets:**
- ANTHROPIC_API_KEY - Claude API key (required for agent service)
- Auth0 credentials - Authority URL and API audience
- Database credentials - Via DATABASE_URL connection string

## Platform Requirements

**Development:**
- Node.js 20.x
- pnpm 9.15.4
- Docker (for local PostgreSQL via docker-compose)
- macOS/Linux/Windows with standard build tools

**Production:**
- Node.js 20.x runtime
- PostgreSQL 16+ database (separate instances for users and agent)
- CORS configuration (environment variable)
- Auth0 tenant with API identifier configured

---

*Stack analysis: 2026-02-27*
