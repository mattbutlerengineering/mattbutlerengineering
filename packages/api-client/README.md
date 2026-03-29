# API Client

Typed fetch wrapper for frontend apps. Provides a consistent interface for calling backend APIs with automatic auth token injection.

## Usage

```typescript
import { createApiClient } from "@mbe/api-client";
import { usersClient } from "@mbe/api-client/users";
```

Used by the [Hospitality app](../../apps/hospitality/) and other frontend apps that need authenticated API access.

## Features

- Typed request/response with `@mbe/types`
- Automatic Bearer token injection
- Timeout and retry handling
- Consistent error formatting

## Commands

```bash
pnpm test             # Run tests
pnpm lint             # ESLint
pnpm typecheck        # TypeScript check
```
