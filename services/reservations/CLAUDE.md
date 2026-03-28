# Reservations Service

Fastify + Prisma service for restaurant reservation and table management. Port **3004**.

## Domain Model

- `VenueGroup` — top-level organization (has settings, slug)
- `Venue` — individual restaurant location within a group
- `Table` — physical table with status lifecycle (AVAILABLE → OCCUPIED → DIRTY → READY)
- `Reservation` — booking with status (PENDING → CONFIRMED → COMPLETED/CANCELLED/NO_SHOW)
- Auth-protected: routes require JWT with Auth0 verification

## Structure

```
src/
├── app.ts          # Fastify app builder
├── index.ts        # Entry point
├── routes/         # Route handlers (venues, tables, reservations)
├── schemas/        # JSON Schema definitions
├── services/       # Business logic layer
└── generated/      # Prisma client
```

## Environment Variables

- `PORT` (default: 3004)
- `LOG_LEVEL` (default: "info")
- `CORS_ORIGIN` — allowed origins
- `AUTH_AUTHORITY` — Auth0 authority URL
- `AUTH_AUDIENCE` — Auth0 API identifier
- `DATABASE_URL` — Postgres connection string

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
```
