# Users Service

REST API for user management. Handles user profiles, preferences, and authentication verification.

## Tech Stack

- Fastify 5 + TypeScript (port 3001)
- Prisma ORM + PostgreSQL
- Auth0 JWT verification (`@mbe/auth`)
- Vitest for testing

## API

Base path: `/api/v1/users`

All routes are JWT-protected. API documentation available at `/docs` when running locally.

## Commands

```bash
pnpm dev              # Dev server with hot reload
pnpm build            # Compile TypeScript
pnpm test             # Run tests
pnpm test:coverage    # Coverage report
pnpm db:migrate       # Create and apply migrations
pnpm db:push          # Quick schema sync (dev only)
pnpm db:studio        # Open Prisma Studio
```

See [CLAUDE.md](CLAUDE.md) for domain model, environment variables, and project structure.
