# Auth

Shared authentication utilities for both frontend and backend packages. Wraps Auth0 OIDC for React apps and JWT verification for Fastify services.

## Usage

### React (frontend)

```typescript
import { AuthProvider, useAuth } from "@mbe/auth/react";
```

Provides `AuthProvider` context, `useAuth` hook, and login/logout helpers.

### Fastify (backend)

```typescript
import { authPlugin } from "@mbe/auth/fastify";

fastify.register(authPlugin, {
  authority: process.env.AUTH_AUTHORITY,
  audience: process.env.AUTH_AUDIENCE,
});
```

Registers JWT verification as a Fastify plugin. Protected routes automatically validate the Bearer token.

## Commands

```bash
pnpm test             # Run tests
pnpm test:coverage    # Coverage report
pnpm lint             # ESLint
pnpm typecheck        # TypeScript check
```
