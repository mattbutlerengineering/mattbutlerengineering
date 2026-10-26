# Users Service

Fastify + Prisma service for user management. Port **3001**.

## Reference

Domain model and Prisma schema, `src/` file map, route tables and response shapes, health/readiness endpoints, Auth0 and API-client integration examples, the error-code table and full test examples: [docs/reference.md](./docs/reference.md).

## Error Handling

Errors use RFC 7807 Problem Details (ADR-008) — the single error shape on the wire (`type`, `title`, `status`, `detail`, optional `instance`). Interface, error-code table and example: [docs/reference.md](./docs/reference.md#error-handling).

## Testing Patterns

Test routes with `app.inject()` against `buildApp({ logger: false })`, mocking `../services/database.js` (the Prisma singleton) and `@mbe/auth/fastify`. Full examples: [docs/reference.md](./docs/reference.md#testing-patterns).

## Environment Variables

| Variable         | Required   | Default | Description                          |
| ---------------- | ---------- | ------- | ------------------------------------ |
| `PORT`           | No         | 3001    | Service port                         |
| `LOG_LEVEL`      | No         | info    | Logging level                        |
| `CORS_ORIGINS`   | No         | `*`     | Comma-separated allowed CORS origins |
| `AUTH_AUTHORITY` | Yes (prod) | —       | Auth0 domain URL                     |
| `AUTH_AUDIENCE`  | Yes (prod) | —       | Auth0 API identifier                 |
| `DATABASE_URL`   | Yes        | —       | Postgres connection string           |
| `SENTRY_DSN`     | No         | —       | Sentry DSN for error tracking        |

## Commands

```bash
pnpm dev                # Hot-reload dev server (port 3001)
pnpm build              # Compile TypeScript
pnpm start              # Run compiled server (node dist/index.js)
pnpm build:openapi      # Emit openapi.json to stdout
pnpm test               # Run all tests
pnpm test:contract      # Run contract tests only
pnpm test:watch         # Watch mode
pnpm test:coverage      # Coverage report
pnpm lint               # ESLint
pnpm typecheck          # TypeScript type check
pnpm db:generate        # Generate Prisma client
pnpm db:push            # Push schema (dev only)
pnpm db:migrate         # Create + apply migrations
pnpm db:migrate:status  # Show pending/applied migration status
pnpm db:studio          # Open Prisma Studio
```

## Related Documentation

- [Auth Package](../../packages/auth/CLAUDE.md)
- [API Versioning](../../docs/API-VERSIONING.md)
- [Cross-Service Flows](../../docs/CROSS-SERVICE-FLOWS.md)
