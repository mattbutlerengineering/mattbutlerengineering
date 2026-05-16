# Types

Shared TypeScript type definitions used across the monorepo.

## Usage

```typescript
import type { User } from "@mbe/types";
import type { ApiResponse } from "@mbe/types/api";
import type { AgentSession } from "@mbe/types/agent";
```

## Exports

| Entry Point | Contents |
|-------------|----------|
| `@mbe/types` | All types (re-exported) |
| `@mbe/types/api` | API response and error types |
| `@mbe/types/user` | User model types |
| `@mbe/types/agent` | Agent session and event types |

## Commands

```bash
pnpm lint         # ESLint
pnpm typecheck    # TypeScript check
```
