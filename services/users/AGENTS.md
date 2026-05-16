# AGENTS.md — services/users

Fastify + Prisma service for user management. Port **3001**.

## Service Purpose

User management API backed by Postgres + Auth0. Handles user CRUD, profile management, and preferences. Deployed on DigitalOcean App Platform.

## Auth Model

Auth0 OIDC with JWT verification on every request. The `sub` claim maps to internal user ID.

- Token verification via `@mbe/auth` Fastify plugin
- `request.user.sub` contains the Auth0 user ID
- All `/api/v1/users/*` routes require authentication except `/health`

## Prisma Schema

```
model User {
  id            String          @id @default(uuid())
  email         String          @unique
  name          String?
  picture       String?
  emailVerified  Boolean         @default(false)
  preferences   Json            @default("{}")
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt

  @@map("users")
}
```

## Health Endpoints

| Path | Purpose | Checks |
|------|---------|--------|
| `/health` | Liveness (DO App Platform) | None — always returns ok |
| `/api/v1/users/health` | Readiness + DB | Touches Postgres, returns `degraded` when dead |

## Critical Rules

- Never bypass JWT verification
- Never log raw access tokens
- Never accept user-provided `sub` claims
- All DB writes must go through Prisma client
- No destructive migrations without `-- DESTRUCTIVE: <reason>` marker

## Build / Test Commands

```bash
pnpm --dir services/users dev              # Hot-reload dev server (port 3001)
pnpm --dir services/users build           # Compile TypeScript
pnpm --dir services/users test            # Run all tests
pnpm --dir services/users test:watch      # Watch mode
pnpm --dir services/users test:coverage  # Coverage report
pnpm --dir services/users lint           # ESLint
pnpm --dir services/users typecheck      # TypeScript type check
pnpm --dir services/users db:generate   # Generate Prisma client
pnpm --dir services/users db:push       # Push schema (dev only)
pnpm --dir services/users db:migrate    # Create + apply migrations
```

## Deployment Target

DigitalOcean App Platform — component name: `users-service`

## API Routes

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/v1/users/me` | Required |
| PUT | `/api/v1/users/me` | Required |
| PUT | `/api/v1/users/me/preferences` | Required |
| POST | `/api/v1/users/me/preferences` | Required |
