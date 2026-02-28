# Testing Patterns

**Analysis Date:** 2026-02-27

## Test Framework

**Runner:**
- Vitest 4.0.18 - Unit and integration tests
- Config: `vitest.config.ts` (per package)

**Assertion Library:**
- Vitest's built-in expect() API
- @testing-library/react for React component testing
- vitest-axe for accessibility assertions

**Run Commands:**
```bash
pnpm test                   # Run all tests once
pnpm test:watch             # Watch mode (Vitest default behavior)
pnpm test:coverage          # Generate coverage reports
```

**Coverage:**
- Provider: V8
- Reporters: text (console), json, html (coverage/)
- Target: No explicit requirement enforced, but recommended 80%+
- Excluded from coverage: test files, index exports, React showcase components

## Test File Organization

**Location:**
- Co-located with source: `src/**/*.test.ts` and `src/**/*.test.tsx`
- Services: `src/routes/*.test.ts` (same directory as routes)
- Packages: `src/__tests__/` directory for integration tests
- Components: `src/components/*.test.tsx` alongside component files

**Naming:**
- Exact match to source: `user.ts` → `user.test.ts`
- Routes: `users.ts` → `users.test.ts`
- Hooks: `use-sessions.ts` → `use-sessions.test.ts`

**Structure:**
```
services/users/
├── src/
│   ├── services/
│   │   ├── user.ts
│   │   └── database.ts
│   ├── routes/
│   │   ├── users.ts
│   │   └── users.test.ts
│   └── app.ts
├── vitest.config.ts
└── package.json
```

## Test Structure

**Suite Organization:**

Fastify routes example (`services/users/src/routes/users.test.ts`):
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";

// Mock dependencies at top
vi.mock("../services/user.js", () => ({
  userService: {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import { userService } from "../services/user.js";

const mockUser = {
  id: "user-123",
  email: "test@example.com",
  name: "Test User",
  // ... full object
};

describe("User Routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  describe("GET /v1/users", () => {
    it("returns paginated list of users", async () => {
      vi.mocked(userService.list).mockResolvedValueOnce({
        data: [mockUser],
        pagination: { /* ... */ },
      });

      const response = await app.inject({
        method: "GET",
        url: "/v1/users",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(1);
    });
  });
});
```

**React Component Smoke Tests** (`packages/rialto/src/components/components.test.tsx`):
```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "./Button/Button";
import { Input } from "./Input/Input";

describe("Smoke tests — every component renders without crashing", () => {
  it("Button", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
  });

  it("Input", () => {
    render(<Input label="Email" />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });
});
```

**Accessibility Tests** (`packages/rialto/src/components/accessibility.test.tsx`):
```typescript
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "vitest-axe";
import { Button } from "./Button/Button";

describe("Accessibility — axe-core WCAG 2.1 AA", () => {
  it("Button", async () => {
    const { container } = render(<Button>Click me</Button>);
    expect(await axe(container)).toHaveNoViolations();
  });
});
```

**Patterns:**
- Setup: `beforeEach()` for app initialization, `afterEach()` for cleanup
- Mocks: `vi.mock()` at top, imported after vi.hoisted() if needed
- Teardown: Always close resources and clear mocks
- Globals: Enabled in vitest.config.ts (no imports needed for describe/it/expect)

## Mocking

**Framework:**
- Vitest's `vi` object for all mocking
- `vi.mock()` for module-level mocks
- `vi.hoisted()` for shared mock setup (ESM hoisting)
- `vi.mocked()` to type-safely access mock implementations

**Patterns:**

Module mocking (Fastify plugin test):
```typescript
const mockJwtVerify = vi.hoisted(() => vi.fn());
const mockCreateRemoteJWKSet = vi.hoisted(() => vi.fn(() => "mock-jwks"));

vi.mock("jose", () => ({
  createRemoteJWKSet: mockCreateRemoteJWKSet,
  jwtVerify: mockJwtVerify,
}));

import { jwtVerify } from "jose";

// Later in tests
vi.mocked(jwtVerify).mockResolvedValueOnce({
  payload: mockJWTPayload,
  protectedHeader: { alg: "RS256" },
} as never);
```

Service mocking (route tests):
```typescript
vi.mock("../services/user.js", () => ({
  userService: {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
  },
}));

import { userService } from "../services/user.js";

// In tests
vi.mocked(userService.getById).mockResolvedValueOnce(mockUser);
expect(userService.getById).toHaveBeenCalledWith("user-123");
```

**What to Mock:**
- External services (databases via Prisma, auth providers)
- API calls (HTTP requests)
- File system operations
- Date/time for deterministic tests
- Environment-dependent code

**What NOT to Mock:**
- Core business logic (test the actual implementation)
- Utility functions called by code under test
- React hooks unless testing hook behavior in isolation
- HTTP response parsing (test with real response shapes)

## Fixtures and Factories

**Test Data:**

Mock objects at top of test file:
```typescript
const mockUser = {
  id: "user-123",
  email: "test@example.com",
  name: "Test User",
  picture: "https://example.com/pic.jpg",
  emailVerified: true,
  preferences: {},
  createdAt: "2026-01-25T00:00:00.000Z",
  updatedAt: "2026-01-25T00:00:00.000Z",
};

const mockJWTPayload = {
  sub: "auth0|user-123",
  iss: "https://test.auth0.com/",
  aud: "https://api.example.com",
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
  email: "test@example.com",
  email_verified: true,
  name: "Test User",
  picture: "https://example.com/pic.jpg",
};
```

Fixtures in tests:
```typescript
it("creates user with email only", async () => {
  const userWithoutName = { ...mockUser, name: null };
  vi.mocked(userService.create).mockResolvedValueOnce(userWithoutName);

  const response = await app.inject({
    method: "POST",
    url: "/v1/users",
    payload: { email: "minimal@example.com" },
  });

  expect(response.statusCode).toBe(201);
});
```

**Location:**
- Inline in test file for simple cases
- Consider utility factory if reused across multiple test files
- No dedicated fixtures directory currently used

## Coverage

**Requirements:**
- No hard minimum enforced in CI
- Target: 80%+ for high-risk areas
- Focus: Business logic, service layer, critical paths

**View Coverage:**
```bash
pnpm test:coverage
# Opens coverage/ directory with HTML report
```

**Coverage Configuration** (`vitest.config.ts`):
```typescript
coverage: {
  provider: "v8",
  reporter: ["text", "json", "html"],
  include: ["src/**/*.ts"],
  exclude: ["src/**/*.test.ts", "src/index.ts", "src/react/**"],
},
```

## Test Types

**Unit Tests:**
- Scope: Individual functions, services, utilities
- Approach: Mock external dependencies, test in isolation
- Example: `userService.getById()` tested with mocked database
- Isolation: Each test should be independent

**Integration Tests:**
- Scope: API endpoints, route handlers, service chains
- Approach: Build app instance, inject real HTTP requests
- Example: `GET /v1/users/:id` tested via `app.inject()`
- Setup: Use `beforeEach()` to initialize Fastify app
- Database: Mocked via service mocks (not real DB calls)

**E2E Tests:**
- Framework: Playwright 1.58.2
- Scope: Critical user workflows
- Config: `playwright.config.ts` in relevant app
- Status: Visual regression tests via Playwright + Lighthouse CI
- Not mandatory for all features, used for key flows

**Accessibility Tests:**
- Tool: vitest-axe with axe-core
- Scope: All Rialto components tested for WCAG 2.1 AA
- Pattern: Render component, run `axe(container)`, assert no violations
- Location: `src/components/accessibility.test.tsx`

## Common Patterns

**Async Testing:**

Fastify endpoint with async call:
```typescript
it("returns paginated list of users", async () => {
  vi.mocked(userService.list).mockResolvedValueOnce({
    data: [mockUser],
    pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/users",
  });

  expect(response.statusCode).toBe(200);
});
```

Promise handling in tests:
```typescript
it("handles errors properly", async () => {
  vi.mocked(userService.getById).mockRejectedValueOnce(new Error("DB error"));

  const response = await app.inject({
    method: "GET",
    url: "/v1/users/123",
  });

  expect(response.statusCode).toBe(500);
});
```

**Error Testing:**

Route returning error response:
```typescript
it("returns 404 when user not found", async () => {
  vi.mocked(userService.getById).mockResolvedValueOnce(null);

  const response = await app.inject({
    method: "GET",
    url: "/v1/users/nonexistent",
  });

  expect(response.statusCode).toBe(404);
  const body = JSON.parse(response.body);
  expect(body.error).toBe("Not Found");
  expect(body.message).toBe("User not found");
});
```

Auth error testing:
```typescript
it("returns 401 for invalid token", async () => {
  vi.mocked(jwtVerify).mockRejectedValueOnce(new Error("Invalid token"));

  const response = await app.inject({
    method: "GET",
    url: "/v1/users/me",
    headers: { authorization: "Bearer invalid-token" },
  });

  expect(response.statusCode).toBe(401);
  const body = JSON.parse(response.body);
  expect(body.message).toBe("Invalid token");
});
```

**Verifying Mock Calls:**

```typescript
it("respects page and limit query params", async () => {
  vi.mocked(userService.list).mockResolvedValueOnce({
    data: [],
    pagination: { /* ... */ },
  });

  await app.inject({
    method: "GET",
    url: "/v1/users?page=2&limit=5",
  });

  expect(userService.list).toHaveBeenCalledWith(2, 5);
  expect(userService.list).toHaveBeenCalledOnce();
});
```

**React Component Testing:**

Rendering with props:
```typescript
it("renders with provided data", () => {
  const { container } = render(
    <Table
      columns={[
        { key: "name", header: "Name" },
        { key: "role", header: "Role" },
      ]}
      data={[{ name: "Alice", role: "Admin" }]}
      rowKey={(r) => r.name}
    />
  );

  expect(screen.getByText("Alice")).toBeInTheDocument();
  expect(screen.getByText("Admin")).toBeInTheDocument();
});
```

Querying elements:
```typescript
it("renders form inputs", () => {
  render(<Input label="Email" />);
  const input = screen.getByLabelText("Email");
  expect(input).toBeInTheDocument();
  expect(input).toHaveAttribute("type", "text");
});
```

**Environment Setup:**

Jest-like test setup file (`packages/rialto/src/test/setup.ts`):
```typescript
// Test environment configuration
// Referenced in vitest.config.ts setupFiles
```

Env variables in tests:
```typescript
describe("Auth with env vars", () => {
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = {
      ...originalEnv,
      AUTH_AUTHORITY: "https://test.auth0.com",
      AUTH_AUDIENCE: "https://api.example.com",
    };
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    process.env = originalEnv;
  });
});
```

---

*Testing analysis: 2026-02-27*
