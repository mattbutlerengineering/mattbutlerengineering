# AGENTS.md — services/reservations

Fastify + Prisma service for restaurant reservation and table management. Port **3004**.

## Service Purpose

Reservation API with SSE event publishing and table-status broadcasts. Handles venue management, table assignments, reservation lifecycle, and real-time updates. Deployed on DigitalOcean App Platform.

## Reservation State Machine

```
PENDING ──(seat)──> CONFIRMED ──(complete)──> COMPLETED
                     │──(cancel)──> CANCELLED
                     │──(no-show)──> NO_SHOW

Table: AVAILABLE ──(seat)──> OCCUPIED ──(complete)──> DIRTY ──(clean)──> READY ──(reset)──> AVAILABLE
```

Terminal states: `COMPLETED`, `CANCELLED`, `NO_SHOW`, `READY`

## SSE Event Contract

| Event Type | Payload | Trigger |
|-----------|---------|--------|
| `reservation:created` | Reservation | POST /api/v1/reservations |
| `reservation:updated` | Reservation | PUT /api/v1/reservations/:id |
| `reservation:cancelled` | Reservation | PUT /api/v1/reservations/:id/cancel |
| `table:updated` | Table | PUT /api/v1/tables/:id/status |

Fan-out: all clients subscribed to `venueId` receive the event.

## Prisma Schema (Key Models)

```
Reservation: id, venueId, tableId, guestId, startTime, duration, partySize, status, confirmationCode
Table: id, venueId, name, capacity, minPartySize, maxPartySize, status, position
Venue: id, venueGroupId, name, slug, address, operatingHours, settings
Guest: id, venueGroupId, email, phone, name, visitCount, preferences
```

## Health Endpoints

| Path | Purpose | Checks |
|------|---------|--------|
| `/health` | Liveness (DO App Platform) | None — always returns ok |
| `/api/v1/reservations/health` | Readiness + DB | Touches Postgres, returns `degraded` when dead |

## Critical Rules

- SSE callbacks via refs only (inline callbacks reconnect on every render)
- All DB writes through Prisma client
- Reservation state changes MUST publish SSE event
- No broadcast leakage across venues (filter by `venueId`)
- No destructive migrations without `-- DESTRUCTIVE: <reason>` marker

## Build / Test Commands

```bash
pnpm --dir services/reservations dev              # Hot-reload dev server (port 3004)
pnpm --dir services/reservations build           # Compile TypeScript
pnpm --dir services/reservations test            # Run all tests
pnpm --dir services/reservations test:watch      # Watch mode
pnpm --dir services/reservations test:coverage  # Coverage report
pnpm --dir services/reservations lint           # ESLint
pnpm --dir services/reservations typecheck      # TypeScript type check
pnpm --dir services/reservations db:generate   # Generate Prisma client
pnpm --dir services/reservations db:push       # Push schema (dev only)
pnpm --dir services/reservations db:migrate    # Create + apply migrations
```

## Deployment Target

DigitalOcean App Platform — component name: `reservations-service`
