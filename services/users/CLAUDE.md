# Users Service

Fastify + Prisma service for user management. Port **3001**.

## Domain Model

Single `User` model with fields: `id`, `email`, `name`, `picture`, `emailVerified`, `preferences` (JSON), timestamps.
- Table mapped to `users` (snake_case columns via `@map`)
- Prisma client output: `src/generated/prisma`

## Structure

```
src/
├── app.ts          # Fastify app builder (plugins, routes, schemas)
├── index.ts        # Entry point (starts server)
├── routes/         # Route handlers (one file per resource)
├── schemas/        # JSON Schema definitions with $id refs
├── services/       # Business logic layer
└── generated/      # Prisma client (gitignored, run db:generate)
```

## Environment Variables

- `PORT` (default: 3001)
- `LOG_LEVEL` (default: "info")
- `CORS_ORIGIN` — allowed origins
- `AUTH_AUTHORITY` — Auth0 authority URL
- `AUTH_AUDIENCE` — Auth0 API identifier (`https://api.mattbutlerengineering.com`)
- `DATABASE_URL` — Postgres connection string

## Auth

Routes are protected via `@mbe/auth` Fastify plugin. JWT verification against Auth0.
See `packages/auth/` and the `auth-package` skill for details.

## Commands

```bash
pnpm dev              # Hot-reload dev server
pnpm build            # Compile TypeScript
pnpm test             # Run all tests
pnpm test:watch       # Watch mode
pnpm test:coverage    # Coverage report
pnpm db:generate      # Generate Prisma client
pnpm db:push          # Push schema (dev only)
pnpm db:migrate       # Create + apply migrations
pnpm db:studio        # Open Prisma Studio
```

## Testing

Tests use `app.inject()` to test routes without a running server. Mock services with `vi.mock()`.
See root CLAUDE.md for test structure and mocking patterns.
