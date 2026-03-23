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
| `/` | Marketing site (catch-all) | CF Pages (`mattbutlerengineering-marketing`) |
| `/hospitality` | Hospitality app | CF Pages (`mattbutlerengineering-hospitality`) |
| `/rialto` | Design system showcase | CF Pages (`mattbutlerengineering-rialto-web`) |
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
  /hospitality*  → CF Pages (hospitality project, prefix stripped)
  /rialto*       → CF Pages (rialto-web project, prefix stripped)
  /api/*         → api.mattbutlerengineering.com (DO App Platform)
  /*             → CF Pages (marketing project)
```

**Key components:**
- **Edge Router** (`infrastructure/worker/edge-router.js`): CF Worker that routes traffic by path prefix
- **Static Sites**: 3 CF Pages projects, deployed via `wrangler pages deploy` from CI
- **API Services**: DO App Platform at `api.mattbutlerengineering.com` with `deployOnPush: false` (CI triggers deploys via `doctl`)
- **Infrastructure**: Pulumi (TypeScript) in `infrastructure/pulumi/`

**Deploy pipelines (all independent):**

| Change | Workflow | Speed |
|--------|----------|-------|
| Static site (`apps/*`) | `deploy-static.yml` → CF Pages | ~30-60 sec |
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

All backend services (`services/users`, `services/agent`, and `services/reservations`) share the same command structure:

```bash
cd services/users   # or: cd services/agent, cd services/reservations

# Development (with hot reload)
pnpm dev

# Build the service
pnpm build

# Testing
pnpm test                    # Run all tests once
pnpm test:watch             # Run tests in watch mode
pnpm test:coverage          # Run with coverage report

# Database operations
pnpm db:generate            # Generate Prisma client
pnpm db:push                # Push schema (dev only, no migration history)
pnpm db:migrate             # Create and apply migrations (development)
pnpm db:migrate:deploy      # Apply pending migrations (production/CI)
pnpm db:migrate:status      # Check migration status
pnpm db:studio              # Open Prisma Studio

# Linting and type checking
pnpm lint                   # ESLint
pnpm typecheck              # TypeScript type checking
```

### Running Single Tests
```bash
# In any service directory
npx vitest run src/routes/users.test.ts           # Run specific test file
npx vitest run --reporter=verbose src/routes/     # Run with detailed output
npx vitest --grep "GET /api/v1/users"             # Run tests matching pattern
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
```bash
cd packages/rialto

# Build library (Vite lib mode + types)
pnpm build

# Testing
pnpm test                    # Run component tests
pnpm test:watch             # Run tests in watch mode

# Linting and type checking
pnpm lint                   # ESLint
pnpm typecheck              # TypeScript type checking

# From root:
pnpm size                   # Check bundle size
pnpm size:check             # Enforce bundle size limits
pnpm test:visual            # Run Playwright visual regression tests
pnpm lighthouse             # Run Lighthouse CI performance audit
pnpm changeset              # Create a changeset for versioning
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
│   ├── agent-viz/           # Agent session visualizer (React + Vite)
│   ├── marketing/          # Public marketing site (React + Vite)
│   ├── hospitality/        # Hospitality app (React + Vite)
│   └── rialto-web/         # Design system showcase (React + Vite)
├── services/                # Backend services
│   ├── users/              # Users API (Fastify + Prisma) — port 3001
│   ├── agent/              # Agent Session API (Fastify + Prisma) — port 3003
│   └── reservations/       # Reservations API (Fastify + Prisma) — port 3004
├── packages/               # Shared packages
│   ├── agent-core/        # Agent session runner, worktree mgmt, tool permissions
│   ├── api-client/        # Typed API client for frontend apps (wraps fetch + auth)
│   ├── rialto/            # Rialto design system (React component library)
│   ├── rialto-plugin/     # Rialto Claude Code plugin (skills, agents, hooks)
│   ├── types/             # Shared TypeScript types (incl. agent types)
│   ├── auth/              # Auth utilities (React + Fastify)
│   └── config/            # ESLint/TypeScript/Prettier configs
├── tools/                   # Developer tooling
│   └── cli/               # `mbe` CLI (users, auth, agent commands)
└── infrastructure/         # Infrastructure as Code
    └── pulumi/            # Pulumi (TypeScript)
```

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

### Users Service (`services/users`)
- **PORT**: Service port (default: 3001)
- **LOG_LEVEL**: Logging level (default: "info")
- **CORS_ORIGIN**: CORS origin configuration
- **AUTH_AUTHORITY**: Auth0 authority URL
- **AUTH_AUDIENCE**: Auth0 API identifier
- **DATABASE_URL**: Prisma database connection string

### Agent Service (`services/agent`)
- **PORT**: Service port (default: 3003)
- **LOG_LEVEL**: Logging level (default: "info")
- **DATABASE_URL**: Prisma database connection string (separate DB from users)
- **ANTHROPIC_API_KEY**: Claude API key (required for agent sessions)
- **DEFAULT_MODEL**: Default Claude model (default: "claude-sonnet-4-6")
- **MAX_CONCURRENT_SESSIONS**: Rate limit (default: 5)
- **GITHUB_WEBHOOK_SECRET**: HMAC secret for GitHub webhook signature verification
- **AGENT_API_URL**: Base URL for agent API (used by CLI, default: "http://localhost:3003")

### Reservations Service (`services/reservations`)
- **PORT**: Service port (default: 3004)
- **LOG_LEVEL**: Logging level (default: "info")
- **CORS_ORIGIN**: CORS origin configuration
- **AUTH_AUTHORITY**: Auth0 authority URL
- **AUTH_AUDIENCE**: Auth0 API identifier
- **DATABASE_URL**: Prisma database connection string

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

## Rialto Design System Usage

### Import Paths

```typescript
// Components (barrel export — always use this, never subpaths)
import { Button, Input, Card, Text, Stack } from "@mbe/rialto";

// Styles (must be imported before any component rendering)
import "@mbe/rialto/styles";

// Motion tokens
import { spring, precision } from "@mbe/rialto/motion";
```

### RialtoProvider Setup

```tsx
import { RialtoProvider } from "@mbe/rialto";

// Wrap your app root (main.tsx):
<RialtoProvider theme="light"> {/* "light" | "dark" | "system" */}
  <App />
</RialtoProvider>
```

`vibe` prop adjusts component density: `"default"` (standard), `"transacting"` (tighter, sharper — for checkout/payments), `"presenting"` (more whitespace, softer — for dashboards/demos).

### Top 10 Component APIs

| Component | Key Props |
|-----------|-----------|
| **Button** | `variant` (`"primary" \| "secondary" \| "ghost" \| "danger"`), `size` (`"sm" \| "md" \| "lg"`), `loading`, `disabled`, `onClick` |
| **Input** | `label`, `hint`, `error`, `type`, `placeholder` |
| **Card** | `variant`, `padding` (`"sm" \| "md" \| "lg"`), `title`, `subtitle` |
| **Text** | `variant` (`"body" \| "heading" \| "display" \| "label" \| "caption"`), `size`, `weight`, `as` |
| **Stack** | `direction` (`"row" \| "column"`), `gap` (spacing token), `align`, `justify` (`"between"` not `"space-between"`) |
| **Badge** | `variant` (`"neutral" \| "success" \| "warning" \| "error" \| "info"`), `size`, `dot` |
| **Select** | `label`, `options` (`{ value, label }[]`), `placeholder`, `value`, `onChange` |
| **Toggle** | `label`, `checked`, `onChange`, `disabled` |
| **Dialog** | `open`, `onClose`, `title`, `children` |
| **Toast** | Use `useToast()` hook: `const { toast } = useToast();` then `toast.success("msg")` / `toast.error("msg")` — requires `<ToastProvider>` ancestor |

### Token Rules

- **Never hardcode colors** — always use `var(--rialto-*)` tokens
- **Spacing**: `--rialto-space-{xs|sm|md|lg|xl|2xl|3xl}`
- **Radius**: `--rialto-radius-{sharp|default|soft|round}`
- **Accent** (`--rialto-accent`) is gold — use only for focus rings, active states, primary buttons. Never decorative.
- **Always use CSS logical properties**: `margin-inline-start` not `margin-left`, `padding-inline-start` not `padding-left`
- **Do NOT call `useToast()` without `<ToastProvider>`** or `useUIEnvironment()` without `<RialtoProvider>`

### AI Reference Files

- `llms.txt` — condensed component catalog and token reference (<20KB, fits in AI context windows)
- `llms-full.txt` — complete prop tables, composition examples, and advanced patterns (26KB)
- `packages/rialto/CLAUDE.md` — component authoring guidelines (for contributing to Rialto)

### Scaffold New Apps

```bash
mbe new <app-name>   # creates apps/<name>/ with RialtoProvider, routing, and example page
```

---

## Before Committing

Always run these commands before committing:
```bash
pnpm lint        # Check code style
pnpm typecheck   # Verify types
pnpm test        # Run all tests
```

These commands ensure code quality and prevent common issues. The monorepo uses Turborepo for efficient caching, so subsequent runs are fast.
