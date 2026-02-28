# Coding Conventions

**Analysis Date:** 2026-02-27

## Naming Patterns

**Files:**
- kebab-case for all files: `user-routes.ts`, `button.module.css`, `use-sessions.ts`
- Test files: `*.test.ts` or `*.test.tsx` (co-located with source)
- Service files: `*.ts` in services (no special suffix)
- Component files: `ComponentName.tsx` with PascalCase
- Hook files: `use-*.ts` pattern (React hooks)

**Functions:**
- camelCase for all functions: `getUserById()`, `buildSystemPrompt()`, `mapPrismaUser()`
- Async functions follow same pattern: `async function createSession()`, `async getByEmail()`
- Handler functions: `handleSelectEvent()`, `verifyAuth()`, `preHandler`

**Variables:**
- camelCase for all variables: `mockUser`, `totalPages`, `selectedParentId`
- Const objects follow camelCase: `userService`, `JWKS`
- Destructured variables preserve original naming

**Types:**
- PascalCase for all types, interfaces: `User`, `SessionConfig`, `ApiResponse<T>`, `UserPreferences`
- Type exports use `export type {}` syntax
- Interface naming: Avoid `I` prefix; use `ComponentNameProps`, `ComponentNameState`

**Constants:**
- UPPER_SNAKE_CASE for module-level constants: `MOCK_MODE`, `BASE_CONFIG`, `API_BASE_URL`
- Avoid magic numbers; extract to named constants
- Environment config: Use PascalCase for constructor options, camelCase for destructured env vars

**Discriminated Unions:**
- Use lowercase string literals for type discriminators: `status: "running" | "completed"`
- Type names remain PascalCase: `type SessionStatus = "running" | "completed"`

## Code Style

**Formatting:**
- Tool: Prettier
- Key settings from `packages/config/prettier/index.js`:
  - Semi-colons: true
  - Single quotes: false (use double quotes)
  - Tab width: 2 spaces
  - Trailing commas: "es5"
  - Print width: 100 characters

**Linting:**
- Tool: ESLint with flat config format
- Base config: `packages/config/eslint/base.js`
- Node env extends: `packages/config/eslint/node.js` (allows console.log)
- React env extends: `packages/config/eslint/react.js` (React-specific rules)
- Key rules enforced:
  - `@typescript-eslint/consistent-type-imports: "error"` - Use `import type {}` for types
  - `@typescript-eslint/no-unused-vars: ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }]` - Unused vars must be prefixed with `_`
  - `react/react-in-jsx-scope: "off"` - Not needed in JSX transform
  - `react/prop-types: "off"` - TypeScript provides prop validation
  - `react-refresh/only-export-components: ["warn", { allowConstantExport: true }]` - Fast refresh compatibility

## Import Organization

**Order:**
1. External packages (Node.js, npm)
2. Internal absolute imports (using `@mbe/` aliases)
3. Relative imports (using `../`, `./`)
4. Type imports (using `import type {}`)

**Path Aliases:**
- `@mbe/types` - Shared TypeScript types
- `@mbe/auth` - Authentication utilities (React + Fastify)
- `@mbe/ui` - Legacy UI components (being replaced by Rialto)
- `@mbe/rialto` - New design system components
- `@mbe/config` - ESLint, Prettier, TypeScript configs
- `@mbe/agent-core` - Agent session runner and utilities
- `@mbe/api-client` - Generated API client

**Example Pattern:**
```typescript
// External packages
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";

// Internal absolute imports
import type { User, ApiResponse } from "@mbe/types";
import { authPlugin } from "@mbe/auth/fastify";

// Relative imports
import { userService } from "../services/user.js";
import { registerSchemas } from "./schemas/index.js";

// Type imports must use import type syntax
import type { AuthUser } from "@mbe/auth/types";
```

**File Extensions:**
- Always use explicit file extensions in ESM: `.js`, `.ts` (required for proper ES module resolution)
- Examples: `../services/user.js`, `./schemas/index.js`

## Error Handling

**Patterns:**
- Errors are handled explicitly at every level
- Service layer returns `null` or throws on internal errors
- Route handlers check null returns and convert to HTTP responses
- No silent catch-blocks; log errors or convert to meaningful responses

**Service Layer:**
```typescript
async update(id: string, data: UpdateUserRequest): Promise<User | null> {
  try {
    const user = await prisma.user.update({
      where: { id },
      data: { /* ... */ },
    });
    return mapPrismaUser(user);
  } catch {
    // Log not shown but error is suppressed
    return null;
  }
}
```

**Route Layer:**
```typescript
async (request, reply) => {
  const user = await userService.update(request.params.id, request.body);
  if (!user) {
    return reply.code(404).send({
      error: "Not Found",
      message: "User not found",
      statusCode: 404,
    });
  }
  return { data: user };
}
```

**HTTP Error Format:**
```typescript
{
  error: "Error Category",        // "Not Found", "Unauthorized", "Invalid Request"
  message: "User-friendly message",
  statusCode: 404,
}
```

**Async/Await:**
- Preferred over `.then()` chains
- Always `await` promises before using results
- Use `Promise.all()` for parallel operations

## Logging

**Framework:**
- Node.js backends: Fastify's built-in logger
- Frontend/React: `console` directly (no special logging library)

**Patterns:**
- Fastify logger: `fastify.log.warn({ error }, "message")` for structured logs
- Frontend: `console.error()`, `console.warn()` for errors
- JWT validation: `fastify.log.warn({ error }, "JWT validation failed")`
- Avoid logging sensitive data (passwords, tokens, emails in JWT context)

## Comments

**When to Comment:**
- Complex logic requiring explanation
- Non-obvious workarounds or temporary fixes
- JSDoc on public API functions
- Clarify "why" not "what" (code shows what it does)

**JSDoc/TSDoc:**
- Used on service functions for API clarity
- Example: Schema definitions include descriptions in Fastify swagger config
- Props interfaces have inline description comments only when needed
- Export statements don't require JSDoc unless public-facing

**Example:**
```typescript
// Service function
async getById(id: string): Promise<User | null> {
  const user = await prisma.user.findUnique({ where: { id } });
  return user ? mapPrismaUser(user) : null;
}

// Schema documentation (in routes)
schema: {
  summary: "Get user by ID",
  operationId: "getUserById",
  description: "Retrieve a single user by their unique identifier.",
  tags: ["Users"],
  params: { /* ... */ },
}
```

## Function Design

**Size:**
- Target <50 lines per function
- Extract utilities to keep functions focused
- Route handlers typically 10-30 lines

**Parameters:**
- Use TypeScript generic types: `FastifyPluginAsync<{ prefix?: string }>`
- Destructure objects in parameters for clarity
- Use readonly for immutable props: `interface Props { readonly sessions: readonly Session[] }`

**Return Values:**
- Use explicit return types: `Promise<User | null>`, `ApiResponse<T>`
- Never return `undefined` without type annotation; use `null` for "not found"
- Fastify routes return data via `reply.code().send()` or `reply` object directly

**Immutability:**
- Create new objects instead of mutating: `{ ...currentPrefs, ...newPrefs }`
- Spread operator for updates: `const updated = { ...original, field: newValue }`
- Never modify function parameters

## Module Design

**Exports:**
- One primary export per file when possible
- Use `export {}` syntax with explicit type exports: `export type { User }; export { userService };`
- Default exports for main module implementations: `export default buildApp;`
- Named exports for utilities and helpers

**Barrel Files:**
- Used in `/schemas/index.ts` to re-export all schemas
- Avoid default exports from barrel files
- Keep index files focused on re-exports only

**Service Objects:**
- Exported as constants: `export const userService = { ... }`
- Contains async methods for data operations
- Optionally handle null responses for optional resources

**Example Pattern:**
```typescript
// src/services/user.ts
export const userService = {
  async list(page: number, limit: number): Promise<PaginatedResponse<User>> { /* ... */ },
  async getById(id: string): Promise<User | null> { /* ... */ },
  async create(data: CreateUserRequest): Promise<User> { /* ... */ },
};

// src/routes/users.ts
import { userService } from "../services/user.js";
fastify.get<{ Params: { id: string }; Reply: ApiResponse<User> }>(
  "/:id",
  async (request, reply) => {
    const user = await userService.getById(request.params.id);
    // ...
  }
);
```

## React Patterns

**Components:**
- Functional components only (no class components)
- Use `React.forwardRef` for all components that need ref support
- Props interface: `ComponentNameProps` pattern
- Export props interface: `export type { ComponentNameProps }`

**Hooks:**
- Custom hooks use `use-` prefix: `useDeviceContext()`, `useSessions()`
- Place in `hooks/` directory
- Return object or tuple depending on use case

**State Management:**
- React hooks for local component state (`useState`)
- Context for app-level state (Auth, Theme)
- Custom hooks to manage complex state logic

**Example:**
```typescript
interface StatsBarProps {
  readonly sessions: readonly Session[];
  readonly mockMode: boolean;
}

export function StatsBar({ sessions, mockMode }: StatsBarProps) {
  const totalSessions = sessions.length;
  const running = sessions.filter((s) => s.status === "running").length;

  return (
    <header className="flex items-center justify-between">
      {/* JSX */}
    </header>
  );
}
```

## Fastify Patterns

**Route Type Safety:**
```typescript
fastify.get<{
  Params: { id: string };
  Querystring: { page?: string };
  Body?: never;
  Reply: ApiResponse<User> | ApiError;
}>(
  "/:id",
  { schema: { /* OpenAPI schema */ } },
  async (request, reply) => {
    // Implementation
  }
);
```

**Schema Definitions:**
- Include `summary`, `operationId`, `description`, `tags`
- Define request/response schemas with `properties` and `required`
- Use `$ref: "User#"` to reference shared schemas via `registerSchemas(fastify)`

**Authentication:**
- JWT verification via `preHandler` hook
- Store user in `request.user` (via FastifyRequest module augmentation)
- Auth errors return 401 with standardized error format

## Styling (React Components)

**Rialto Design System Components:**
- Use component library components from `@mbe/rialto`
- Custom styling: CSS Modules with `var()` tokens
- Token usage: `--rialto-*` CSS custom properties for all colors, spacing, typography
- Example: `color: var(--rialto-text-primary)`, `padding: var(--rialto-space-md)`

**Tailwind CSS:**
- Used in some apps as fallback
- Preferred: use Rialto components with design tokens
- Class names: standard Tailwind utilities (`flex`, `gap-2`, `text-sm`, etc.)

---

*Convention analysis: 2026-02-27*
