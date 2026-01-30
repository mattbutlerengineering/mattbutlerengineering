# AGENTS.md - Development Guidelines for AI Coding Agents

This file contains project-specific guidelines, commands, and conventions for AI coding agents working in this monorepo.

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

## Build/Lint/Test Commands

### Root Level Commands
```bash
# Start all development servers
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
Navigate to specific service directories first:
```bash
cd services/users

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
# In services/users directory
npx vitest run src/routes/users.test.ts           # Run specific test file
npx vitest run --reporter=verbose src/routes/     # Run with detailed output
npx vitest --grep "GET /api/v1/users"             # Run tests matching pattern
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
│   ├── web/                # Public marketing site (React + Vite)
│   └── dashboard/          # Authenticated dashboard (React + Vite)
├── services/                # Backend services
│   └── users/              # Users API (Fastify + Prisma)
├── packages/               # Shared packages
│   ├── types/             # Shared TypeScript types
│   ├── auth/              # Auth utilities (React + Fastify)
│   ├── ui/                # Shared UI components
│   └── config/            # ESLint/TypeScript/Prettier configs
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

### Service Configuration
- **PORT**: Service port (default: 3001)
- **LOG_LEVEL**: Logging level (default: "info")
- **CORS_ORIGIN**: CORS origin configuration
- **AUTH_AUTHORITY**: Auth0 authority URL
- **AUTH_AUDIENCE**: Auth0 API identifier

### Database
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
cd services/users

# Make changes to schema.prisma, then:
npx prisma migrate dev --name add_feature_name

# This creates prisma/migrations/<timestamp>_add_feature_name/migration.sql
```

### CI/CD Deployment

```bash
# In production/CI, only use:
npx prisma migrate deploy
```

## Local Development

```bash
# Start Postgres
cd infrastructure && docker compose up postgres -d

# Push database schema
cd services/users && pnpm db:push

# Start dev servers
pnpm dev
```

- Web: http://localhost:3000
- Dashboard: http://localhost:3002/dashboard
- API: http://localhost:3001
- API Docs: http://localhost:3001/docs

## Local Development Workflow

1. **Start database**: `cd infrastructure && docker compose up postgres -d`
2. **Apply schema**: `cd services/users && pnpm db:migrate` (or `pnpm db:push` for quick prototyping)
3. **Start dev servers**: `pnpm dev`
4. **Access points**:
   - Web: http://localhost:3000
   - Dashboard: http://localhost:3002/dashboard
   - API: http://localhost:3001
   - API Docs: http://localhost:3001/docs

## Before Committing

Always run these commands before committing:
```bash
pnpm lint        # Check code style
pnpm typecheck   # Verify types
pnpm test        # Run all tests
```

These commands ensure code quality and prevent common issues. The monorepo uses Turborepo for efficient caching, so subsequent runs are fast.