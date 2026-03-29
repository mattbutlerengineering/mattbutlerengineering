# Reservations Service

REST API for restaurant reservation and table management. Handles venues, tables, and bookings.

## Tech Stack

- Fastify 5 + TypeScript (port 3004)
- Prisma ORM + PostgreSQL
- Auth0 JWT verification (`@mbe/auth`)
- Vitest for testing

## Domain Model

- **VenueGroup** -- top-level organization
- **Venue** -- individual restaurant location
- **Table** -- physical table (AVAILABLE / OCCUPIED / DIRTY / READY)
- **Reservation** -- booking (PENDING / CONFIRMED / COMPLETED / CANCELLED / NO_SHOW)

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

See [CLAUDE.md](CLAUDE.md) for environment variables, route structure, and project layout.
