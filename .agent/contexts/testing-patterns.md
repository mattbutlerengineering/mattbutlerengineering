# Testing Patterns Context

## Test Framework

This project uses **Vitest**.

## Test Patterns

### Unit Tests

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("myModule", () => {
  it("does something", () => {
    expect(result).toBe(expected);
  });
});
```

### Test File Location

- Next to source: `src/foo.ts` → `src/foo.test.ts`
- Or `__tests__/foo.test.ts`

### Mocking

1. **Service mocks**:

```typescript
vi.mock("../services/user.js", () => ({
  userService: {
    getById: vi.fn(),
  },
}));
```

2. **Module mocks**:

```typescript
vi.mock("jose", () => ({
  jwtVerify: vi.fn(),
}));
```

3. **Global mocks**:

```typescript
vi.stubGlobal("fetch", vi.fn());
```

### Fixtures

- Use constant data at top of test file
- Mock JWT payloads include: `sub`, `email`, `permissions`

### Testing Routes

```typescript
const response = await app.inject({
  method: "POST",
  url: "/api/v1/users",
  payload: { email: "test@example.com" },
  headers: { authorization: "Bearer valid-token" },
});

expect(response.statusCode).toBe(201);
```

### Running Tests

```bash
pnpm test              # all
pnpm test --run        # single run
pnpm test:watch        # watch mode
```

### Anti-patterns

- ❌ Don't forget `vi.clearAllMocks()` in afterEach
- ❌ Don't use real services (mock everything)
- ❌ Don't skip tests (fix or delete)
- ❌ Don't test implementation details

### Files to Check

- `AGENTS.md` → "Testing & Validation"
- Existing tests in `services/*/src/routes/*.test.ts`
