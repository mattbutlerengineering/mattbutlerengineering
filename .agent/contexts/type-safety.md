# Type Safety Context

## TypeScript Patterns

### Enforce `noImplicitAny`
This project **requires explicit types** — no `any`.

### Type Patterns

1. **Function parameters and returns**: Always explicit
   ```typescript
   function greet(name: string): string {
     return `Hello, ${name}`;
   }
   ```

2. **Object types**: Use interfaces or type aliases
   ```typescript
   interface User {
     id: string;
     email: string;
     name?: string;  // optional
   }
   ```

3. **Arrays**: Generic syntax preferred
   ```typescript
   const users: User[] = [];
   ```

4. **Avoid**: `any`, `as`, `// @ts-ignore`

### Zod Validation
For runtime validation, use **Zod** from `@mbe/types`:
```typescript
import { z } from "zod";
const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
});
```

### Useful Types
- `@mbe/types` - shared types (ApiResponse, ApiError, etc.)
- `@mbe/config` - shared config

### Files to Check
- `packages/types/src/` - shared type definitions
- `services/*/src/schemas/` - route validation schemas
- `AGENTS.md` → "Code Style" for full conventions

### Anti-patterns
- ❌ `const foo: any = ...`
- ❌ `return value as SomeType`
- ❌ `// @ts-expect-error` without explanation
