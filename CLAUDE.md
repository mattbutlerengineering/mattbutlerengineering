# Development Guidelines

> This file is the primary source of project context. Also available as [AGENTS.md](./AGENTS.md) for non-Claude AI tools.

## Naming Conventions

- Use `mattbutlerengineering-` prefix for all external resources
- Examples:
  - Auth0 App: `mattbutlerengineering-app`
  - Auth0 API: `mattbutlerengineering-api`
  - DigitalOcean resources: `mattbutlerengineering-*`
  - Database: `mattbutlerengineering-db`

## Project Structure

- Monorepo using Turborepo + pnpm
- Package prefix: `@mbe/`
- Infrastructure as Code: Pulumi (TypeScript) in `infrastructure/pulumi/`

## Auth0 Configuration

- Domain: `dev-ytbgmz5ls3wh4xdx.us.auth0.com`
- API Identifier: `https://api.mattbutlerengineering.com`
- Managed via Pulumi IaC

## URL Convention

All apps are served under `mattbutlerengineering.com` using path-prefix routing:

| Path | App | Hosted On |
|------|-----|-----------|
| `/` | Marketing site (catch-all) | Workers Static Assets (`mattbutlerengineering-marketing`) |
| `/hospitality` | Hospitality app | Workers Static Assets (`mattbutlerengineering-hospitality`) |
| `/rialto` | Design system showcase | Workers Static Assets (`mattbutlerengineering-rialto-web`) |
| `/api/v1/users` | Users API | DO App Platform (`mattbutlerengineering-api`) |
| `/api` | Reservations API (catch-all) | DO App Platform (`mattbutlerengineering-api`) |

**Convention for new apps:**
- Frontend apps get a path prefix matching their directory name: `apps/foo` → `/foo`
- The marketing site is the sole exception — it owns the root `/` path
- Each app sets `base: "/<name>/"` in `vite.config.ts` (except marketing, which stays at root)
- Dev ports are assigned sequentially: 3000 (marketing), 3001 (users-api), 3002 (hospitality), 3003 (agent-api), 3004 (reservations-api), 3005+ (future apps)

## Deployment Architecture

Split deployment with independent deploy pipelines:

```
Client → mattbutlerengineering.com (Cloudflare Worker "edge-router")
  /hospitality*  → Workers Static Assets (Service Binding, CDN-free)
  /rialto*       → Workers Static Assets (Service Binding, CDN-free)
  /api/*         → api.mattbutlerengineering.com (DO App Platform)
  /*             → Workers Static Assets (Service Binding, CDN-free)
```

**Key components:**
- **Edge Router** (`infrastructure/worker/edge-router.js`): CF Worker that routes traffic by path prefix
- **Static Sites**: 3 Workers with Static Assets, deployed via `wrangler deploy` from CI. Called via Service Bindings from the edge router, bypassing CDN entirely (prevents stale HTML after deploys).
- **API Services**: DO App Platform at `api.mattbutlerengineering.com` with `deployOnPush: false` (CI triggers deploys via `doctl`)
- **Infrastructure**: Pulumi (TypeScript) in `infrastructure/pulumi/`

**Deploy pipelines (all independent):**

| Change | Workflow | Speed |
|--------|----------|-------|
| Static site (`apps/*`) | `deploy-static.yml` → Workers Static Assets | ~30-60 sec |
| Service (`services/*`) | `deploy-services.yml` → DO App Platform | ~3-5 min |
| Infrastructure (`infrastructure/*`) | `pulumi-up.yml` → Pulumi | ~2 min |

**Required GitHub Secrets:**
- `CLOUDFLARE_ACCOUNT_ID` — CF account ID (for Pages deploys + Worker)
- `MBE_CLOUDFLARE_API_TOKEN` — CF API token scoped to this project (Pulumi + wrangler)
- `DIGITALOCEAN_TOKEN` — DO API token (Pulumi + doctl)
- `AUTH0_HOSPITALITY_CLIENT_ID` — Auth0 client ID (hospitality build env)
- `PULUMI_ACCESS_TOKEN`, `PULUMI_CONFIG_PASSPHRASE` — Pulumi state
- `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET` — Auth0 provider

**Required Pulumi Config:**
- `mbe-infrastructure:cloudflareAccountId` — Cloudflare account ID

## Work Tracking

When the user mentions work they want to do but we don't address immediately, create a GitHub issue to track it:

```bash
gh issue create --title "Brief description" --body "Details from conversation"
```

This ensures ideas and tasks don't get lost between sessions.

## Build/Lint/Test Commands

### Root Level Commands
```bash
# Start everything (Postgres + schema sync + dev servers)
pnpm dev:local

# Start all development servers (assumes Postgres is already running)
pnpm dev

# Build all packages/apps
pnpm build

# Run tests across all packages
pnpm test

# Run linting across all packages
pnpm lint

# Run type checking across all packages
pnpm typecheck

# Clean all build artifacts and node_modules
pnpm clean
```

### Service-Specific Commands

Each service has its own CLAUDE.md with full command reference. Common pattern:

```bash
cd services/<name>
pnpm dev / pnpm build / pnpm test / pnpm test:coverage
pnpm db:generate / pnpm db:push / pnpm db:migrate / pnpm db:studio
```

### Running Single Tests
```bash
npx vitest run src/routes/users.test.ts           # Specific file
npx vitest --grep "GET /api/v1/users"             # Pattern match
```

### CLI Commands (`mbe`)
```bash
# Agent — local (runs directly via @mbe/agent-core)
mbe agent run "Fix the login bug"                 # Run agent → get PR
  --model <model>                                 # default: claude-sonnet-4-6
  --max-budget <usd>                              # default: 1.00
  --max-turns <n>                                 # default: 50
  --no-pr                                         # skip PR, keep worktree
  -v, --verbose                                   # stream agent events

# Agent — API-backed (requires agent service running on :3003)
mbe agent start "Fix the login bug"               # Create session via API
mbe agent list                                    # List all sessions
mbe agent status <id>                             # Get session details
mbe agent logs <id>                               # Stream SSE events
mbe agent cancel <id>                             # Cancel running session
mbe agent delete <id>                             # Delete session + cleanup
mbe agent orchestrate "Big task"                  # Decompose → parallel sessions → PRs
```

### Rialto Design System

See `packages/rialto/CLAUDE.md` for design philosophy, token rules, and component APIs.

```bash
cd packages/rialto && pnpm build / pnpm test / pnpm lint / pnpm typecheck
# From root: pnpm size / pnpm size:check / pnpm test:visual / pnpm lighthouse
```

## Project Architecture

### Monorepo Structure
- **Package Manager**: pnpm with workspaces
- **Build System**: Turborepo for orchestrating builds and caching
- **Package Prefix**: `@mbe/` for all internal packages
- **Module System**: ES modules (`"type": "module"`)

### Directory Layout
```
mattbutlerengineering/
├── apps/                    # Frontend applications
│   ├── gen/                 # Code generator app (React + Vite)
│   ├── hospitality/        # Hospitality app (React + Vite)
│   ├── marketing/          # Public marketing site (React + Vite)
│   └── rialto-web/         # Design system showcase (React + Vite)
├── services/                # Backend services
│   ├── users/              # Users API (Fastify + Prisma) — port 3001
│   ├── agent/              # Agent Session API (Fastify + Prisma) — port 3003
│   └── reservations/       # Reservations API (Fastify + Prisma) — port 3004
├── packages/               # Shared packages
│   ├── agent-core/        # Agent session runner, worktree mgmt, tool permissions
│   ├── api-client/        # Typed API client for frontend apps (wraps fetch + auth)
│   ├── rialto/            # Rialto design system (React component library)
│   ├── rialto-catalog/    # Rialto component catalog/registry
│   ├── rialto-plugin/     # Rialto Claude Code plugin (skills, agents, hooks)
│   ├── types/             # Shared TypeScript types (incl. agent types)
│   ├── auth/              # Auth utilities (React + Fastify)
│   └── config/            # ESLint/TypeScript/Prettier configs
├── tools/                   # Developer tooling
│   └── cli/               # `mbe` CLI (users, auth, agent commands)
└── infrastructure/         # Infrastructure as Code
    └── pulumi/            # Pulumi (TypeScript)
```

## Harness Engineering Controls

Automated guardrails that keep the codebase correct as it grows. See `docs/superpowers/specs/2026-04-03-harness-engineering-design.md` for full design.

### Module Boundary Enforcement (ESLint)

Import restrictions enforced by `no-restricted-imports` in the ESLint configs:

| Config | Blocked Imports | Error Message Suggests |
|--------|----------------|----------------------|
| `react.js` (apps) | `@mbe/agent-core`, `@mbe/observability` | "Backend-only package" |
| `react.js` (apps) | `@mbe/auth/fastify`, `@mbe/sentry/node` | Use `/react` entrypoint |
| `node.js` (services) | `@mbe/rialto`, `@mbe/api-client` | "Frontend-only package" |
| `node.js` (services) | `@mbe/auth/react`, `@mbe/sentry/react` | Use `/fastify` or `/node` entrypoint |

Package classification: `@mbe/rialto-catalog` is **shared** (used by agent service for AI code gen).

### API Schema Snapshot Tests

Every JSON Schema object in `services/*/src/schemas/index.ts` is snapshot-tested. Any schema change fails tests with a clear diff. Accept intentional changes with `vitest -u`.

### Pre-commit Typecheck

`.husky/pre-commit` runs `pnpm turbo typecheck --filter='...[HEAD]'` after lint-staged. This typechecks only packages with uncommitted changes (plus their dependents). Turbo cache makes repeated runs fast (~12s).

## Code Style Guidelines

### Import/Export Conventions
```typescript
// Use explicit file extensions (.js/.ts) for ES modules
import { userService } from "../services/user.js";
import type { User } from "@mbe/types";

// Export types separately from implementations
export type { User };
export { userService };

// Prefer default exports for main module exports
export default buildApp;
```

### TypeScript Configuration
- **Strict mode enabled** with strict null checks
- **Consistent type imports** enforced by ESLint
- **Unused variables/parameters** must be prefixed with `_`
- **ES2022 target** with ESNext modules

### ESLint Rules
```javascript
// Key enforced rules
"@typescript-eslint/consistent-type-imports": "error",  // Use `import type`
"@typescript-eslint/no-unused-vars": ["error", {
  argsIgnorePattern: "^_",
  varsIgnorePattern: "^_"
}]
```

### Prettier Formatting
```javascript
{
  semi: true,              // Use semicolons
  singleQuote: false,      // Use double quotes
  tabWidth: 2,             // 2-space indentation
  trailingComma: "es5",    // ES5 trailing commas
  printWidth: 100          // 100 character line limit
}
```

### Naming Conventions

#### External Resources
- Prefix all external resources with `mattbutlerengineering-`
- Examples: `mattbutlerengineering-app`, `mattbutlerengineering-api`, `mattbutlerengineering-db`

#### Code Naming
```typescript
// Files: kebab-case
user-service.ts
user-routes.test.ts

// Functions/Variables: camelCase
const getUserById = async (id: string) => {};
const userService = {};

// Types/Interfaces: PascalCase
interface User {}
type ApiResponse<T> = {};

// Constants: UPPER_SNAKE_CASE
const API_BASE_URL = "https://api.example.com";
```

## Testing Guidelines

### Test Framework
- **Vitest** for unit/integration tests
- **Test pattern**: `*.test.ts` files
- **Coverage**: V8 provider with text/json/html reporters

### Test Structure
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Feature Name", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    // Setup
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    // Cleanup
    await app.close();
    vi.clearAllMocks();
  });

  it("should do something specific", async () => {
    // Arrange, Act, Assert
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/users",
    });

    expect(response.statusCode).toBe(200);
  });
});
```

### Mocking Pattern
```typescript
// Mock external dependencies
vi.mock("../services/user.js", () => ({
  userService: {
    getById: vi.fn(),
    create: vi.fn(),
  },
}));

// Access mocked functions
vi.mocked(userService.getById).mockResolvedValueOnce(mockUser);
```

## API Development Patterns

### Fastify Route Structure
```typescript
fastify.get<{
  Params: { id: string };
  Querystring: { page?: string };
  Reply: ApiResponse<User>;
}>(
  "/:id",
  {
    schema: {
      description: "Get user by ID",
      tags: ["Users"],
      params: { /* ... */ },
      response: { /* ... */ },
    },
  },
  async (request, reply) => {
    const user = await userService.getById(request.params.id);
    if (!user) {
      return reply.code(404).send({
        error: "Not Found",
        message: "User not found",
        statusCode: 404,
      });
    }
    return { data: user };
  }
);
```

### Error Handling
```typescript
// Standardized error response format
{
  error: "Not Found",
  message: "User not found",
  statusCode: 404
}

// HTTP status codes
200 - OK
201 - Created
204 - No Content
400 - Bad Request
401 - Unauthorized
404 - Not Found
500 - Internal Server Error
```

### Schema Definitions
```typescript
// Use shared schemas with $id references
export const UserSchema = {
  $id: "User",
  type: "object",
  properties: {
    id: { type: "string" },
    email: { type: "string" },
    // ...
  },
} as const;

// Reference schemas in route responses
response: {
  200: {
    type: "object",
    properties: {
      data: { $ref: "User#" },
    },
  },
}
```

## Environment Variables

Each service documents its own env vars in its CLAUDE.md. Common across all services:
- `PORT`, `LOG_LEVEL`, `DATABASE_URL` (Prisma connection string)
- Auth-protected services also need `AUTH_AUTHORITY` and `AUTH_AUDIENCE`

## Database Migrations

Use Prisma Migrate for database schema changes. See `.claude/skills/prisma-migrations/` for detailed workflows.

### Quick Reference

| Environment | Command | Purpose |
|-------------|---------|---------|
| Development | `npx prisma migrate dev` | Create and apply migrations |
| Production | `npx prisma migrate deploy` | Apply existing migrations only |
| Prototyping | `npx prisma db push` | Quick schema sync (no history) |

### Critical Rules

1. **Never run `migrate dev` in production** - It can reset data
2. **Always commit migrations** - Migration files in `prisma/migrations/` must be version controlled
3. **Deploy migrations before code** - Database schema must exist before code that uses it

### Creating Migrations

```bash
cd services/users   # or: cd services/agent

# Make changes to schema.prisma, then:
npx prisma migrate dev --name add_feature_name

# This creates prisma/migrations/<timestamp>_add_feature_name/migration.sql
```

### CI/CD Deployment

```bash
# In production/CI, only use:
npx prisma migrate deploy
```

## Local Development Workflow

**Quick start (recommended):**
```bash
pnpm dev:local
```
Starts Postgres (Docker), syncs all database schemas, and launches all dev servers.

**Manual steps** (if you need more control):
1. **Start database**: `cd infrastructure && docker compose up postgres -d`
2. **Apply schemas**:
   - `cd services/users && pnpm db:migrate` (or `pnpm db:push` for quick prototyping)
   - `cd services/agent && pnpm db:migrate` (or `pnpm db:push`)
   - `cd services/reservations && pnpm db:migrate` (or `pnpm db:push`)
3. **Start dev servers**: `pnpm dev`

**Access points**:
   - Marketing: http://localhost:3000
   - Hospitality: http://localhost:3002/hospitality
   - Users API: http://localhost:3001
   - Users API Docs: http://localhost:3001/docs
   - Agent API: http://localhost:3003
   - Agent API Docs: http://localhost:3003/docs
   - Reservations API: http://localhost:3004
   - Reservations API Docs: http://localhost:3004/docs

**Production API docs** are available at `api.mattbutlerengineering.com/docs/` (direct domain), not via the public `mattbutlerengineering.com/api/docs` path. The edge router forwards `/api/*` to DO App Platform which preserves path prefixes, so `/api/docs` would arrive as `/api/docs` at the service — but Scalar is registered at `/docs`.

## Rialto Design System Usage

Full component APIs, token rules, and design philosophy: see `packages/rialto/CLAUDE.md`.

Quick reference:
```typescript
import { Button, Input, Card, Text, Stack } from "@mbe/rialto";
import "@mbe/rialto/styles";  // Must import before any component rendering
```

Wrap app root with `<RialtoProvider theme="light">`. Never hardcode colors — use `var(--rialto-*)` tokens.

```bash
mbe new <app-name>   # Scaffold app with RialtoProvider, routing, and example page
```

## Continuous Improvement Loop

Automated system that audits the live site, finds and fixes issues, builds features, and verifies deploys — all autonomously.

### Two Modes

| Mode | How | Pushes to | Best for |
|------|-----|-----------|----------|
| **Scheduled** (conservative) | RemoteTriggers on claude.ai | PRs for review | Background maintenance |
| **Ship Loop** (aggressive) | `/loop 5m /ship-loop` locally | Directly to main | Active development sprints |

### Skills

| Skill | Purpose |
|-------|---------|
| `/ship-loop` | Full cycle: audit → fix → push → CI → E2E → deploy verify → close |
| `/site-audit` | Crawl live site with Playwright + Lighthouse, create issues |
| `/issue-worker` | Pick up ready issues, implement via `mbe agent run`, create PRs |
| `/ci-monitor` | Check CI health, auto-fix simple failures, escalate complex ones |
| `/progress-tracker` | Metrics, self-tuning circuit breaker, trend analysis |
| `/decompose` | Break a feature into ordered, agent-sized issues for the loop |

### Quick Start

```bash
# Aggressive mode — audit, fix, push, verify every 5 min
claude --auto
> /loop 5m /ship-loop

# Feature development — decompose then let the loop build it
/decompose Add a guest check-in kiosk to hospitality
/loop 5m /ship-loop

# One-off audit
/site-audit

# Check loop health
/progress-tracker
```

### GitHub Labels (coordination state machine)

| Label | Meaning |
|-------|---------|
| `ready` | Available for agent pickup |
| `in-progress` | Agent is working on it |
| `has-pr` | PR created, awaiting merge/review |
| `agent-failed` | Agent could not complete — needs manual review or retry |
| `audit` | Found by site-audit |
| `ci-fix` | CI failure needing fix |
| `feature` | New feature (created by `/decompose`) |
| `tracking` | Parent issue tracking multi-part feature |
| `meta-improvement` | Process improvement suggestion |

### RemoteTriggers (scheduled background agents)

Managed at https://claude.ai/code/scheduled

| Trigger | Schedule (PT) |
|---------|--------------|
| `mbe-deep-audit` | Mon 8:23am |
| `mbe-light-audit` | Tue-Sun 9:41am |
| `mbe-issue-worker` | Every 2h (includes CI monitoring) |
| `mbe-progress-tracker` | Daily 5:11pm |

**GitHub Actions scheduling backups:** `audit-sweep.yml` (weekly Monday) and `audit-scout.yml` (monthly 1st) serve as cron-based reminders in case RemoteTriggers are missed. They do not execute audits directly — see `.github/workflows/` for details.

---

## Before Committing

Always run these commands before committing:
```bash
pnpm lint        # Check code style
pnpm typecheck   # Verify types
pnpm test        # Run all tests
```

These commands ensure code quality and prevent common issues. The monorepo uses Turborepo for efficient caching, so subsequent runs are fast.
