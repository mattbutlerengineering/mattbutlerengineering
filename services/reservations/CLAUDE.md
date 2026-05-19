# Reservations Service

Fastify + Prisma service for restaurant reservation and table management. Port **3004**.

## Domain Model

### Entity Hierarchy

```
VenueGroup (1) ──────< Venue (many)
                     │
                     └────< Table (many)
                     │
                     └────< Reservation (many)
                     │
                     └────< Guest (many)
                     │
                     └────< ReservationHold (many)
```

### VenueGroup

Top-level organization (e.g., restaurant chain).

```typescript
interface VenueGroup {
  id: string;
  name: string;
  slug: string; // URL-friendly identifier
  settings: Record<string, unknown> | null; // JSON — structure not enforced at DB level
  createdAt: Date;
}
```

### Venue

Individual restaurant location.

```typescript
interface Venue {
  id: string;
  venueGroupId: string | null;
  name: string;
  slug: string;
  ianaTimezone: string;
  currencyCode: string; // default: "USD"
  operatingHours: Record<string, unknown> | null; // JSON — structure at app level
  settings: Record<string, unknown> | null; // JSON
  createdAt: Date;
  updatedAt: Date;
}
```

### Table

Physical table with status lifecycle.

```typescript
interface Table {
  id: string;
  venueId: string | null;
  name: string; // "Table 1", "Booth A"
  tableNumber: string | null;
  capacity: number; // Max covers
  minCovers: number;
  maxCovers: number | null;
  location: string | null;
  isActive: boolean;
  status: TableStatus;
  priority: number;
  floorPlanId: string | null;
  shapeMetadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

type TableStatus = "AVAILABLE" | "OCCUPIED" | "DIRTY" | "READY";
```

**Status Transitions:**

```
AVAILABLE ──(seat)──> OCCUPIED
OCCUPIED ──(complete)──> DIRTY
DIRTY ──(clean)──> READY
READY ──(reset)──> AVAILABLE
```

### Reservation

Booking with status lifecycle.

```typescript
interface Reservation {
  id: string;
  venueId: string | null;
  tableId: string;
  guestId: string | null;
  guestName: string | null;
  guestPhone: string | null;
  guestEmail: string | null;
  userId: string | null;
  date: Date; // Date-only (no time component)
  startTime: Date;
  endTime: Date;
  partySize: number;
  status: ReservationStatus;
  notes: string | null;
  cancellationReason: string | null;
  cancellationNote: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type ReservationStatus =
  | "PENDING" // Initial state — hold confirmed, not yet seated
  | "CONFIRMED" // Reservation confirmed (arriving)
  | "COMPLETED" // Dining finished
  | "CANCELLED" // Cancelled by guest or staff
  | "NO_SHOW"; // Guest didn't arrive
```

### Guest

Guest CRM entity.

```typescript
interface Guest {
  id: string;
  venueId: string;
  email: string | null;
  phone: string | null;
  name: string;
  notes: string | null;
  visitCount: number;
  lifetimeSpend: number | null;
  lastVisit: Date | null;
  tags: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}
```

## API Routes

### Venues

| Method | Path                 | Description                       |
| ------ | -------------------- | --------------------------------- |
| GET    | `/api/v1/venues`     | List all venues for user's groups |
| GET    | `/api/v1/venues/:id` | Get venue details                 |
| POST   | `/api/v1/venues`     | Create venue (admin)              |
| PUT    | `/api/v1/venues/:id` | Update venue                      |

### Tables

| Method | Path                        | Description                     |
| ------ | --------------------------- | ------------------------------- |
| GET    | `/api/v1/tables`            | List tables for venue           |
| POST   | `/api/v1/tables`            | Create table                    |
| PUT    | `/api/v1/tables/:id`        | Update table (position, status) |
| PUT    | `/api/v1/tables/:id/status` | Update table status             |
| DELETE | `/api/v1/tables/:id`        | Delete table                    |

### Reservations

| Method | Path                                | Description                          |
| ------ | ----------------------------------- | ------------------------------------ |
| GET    | `/api/v1/reservations`              | List reservations (filterable)       |
| GET    | `/api/v1/reservations/:id`          | Get reservation                      |
| POST   | `/api/v1/reservations`              | Create walk-in                       |
| PUT    | `/api/v1/reservations/:id`          | Update reservation                   |
| PUT    | `/api/v1/reservations/:id/cancel`   | Cancel reservation                   |
| PUT    | `/api/v1/reservations/:id/seat`     | Seat guest (transition to CONFIRMED) |
| PUT    | `/api/v1/reservations/:id/complete` | Complete dining                      |

### Availability

| Method | Path                        | Description                     |
| ------ | --------------------------- | ------------------------------- |
| GET    | `/api/v1/availability`      | Get available time slots        |
| POST   | `/api/v1/holds`             | Create reservation hold (5 min) |
| PUT    | `/api/v1/holds/:id/confirm` | Confirm hold → reservation      |

### Public Booking Widget (no auth)

| Method | Path                                    | Description                         |
| ------ | --------------------------------------- | ----------------------------------- |
| GET    | `/public/v1/venues/:slug`               | Get public venue info               |
| GET    | `/public/v1/venues/:slug/availability`  | Get available slots (public)        |
| POST   | `/public/v1/venues/:slug/holds`         | Create hold (public)                |
| DELETE | `/public/v1/venues/:slug/holds/:holdId` | Release hold (public)               |
| POST   | `/public/v1/venues/:slug/reservations`  | Confirm hold → reservation (public) |
| GET    | `/public/v1/reservations/manage`        | Get reservation via manage token    |
| PATCH  | `/public/v1/reservations/manage`        | Modify reservation via manage token |
| DELETE | `/public/v1/reservations/manage`        | Cancel reservation via manage token |
| GET    | `/public/v1/reservations/confirm`       | Confirm attendance via token        |

### Events (SSE)

| Method | Path                    | Description                      |
| ------ | ----------------------- | -------------------------------- |
| GET    | `/api/v1/events/stream` | SSE stream for real-time updates |

## Real-time SSE Events

### Event Types

```typescript
type ReservationEvent = {
  id: string; // Sequence number
  type: "reservation:created" | "reservation:updated" | "reservation:cancelled";
  timestamp: string;
  data: Reservation;
};

type TableEvent = {
  id: string;
  type: "table:updated";
  timestamp: string;
  data: Table;
};

type HoldEvent = {
  id: string;
  type: "hold:created" | "hold:released" | "hold:confirmed";
  timestamp: string;
  data: ReservationHold | Reservation;
};
```

### SSE Connection

```typescript
// Client connects with venue ID
const eventSource = new EventSource(`/api/v1/events/stream?venueId=${venueId}`, {
  headers: {
    Authorization: `Bearer ${accessToken}`,
  },
});

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // Handle based on data.type
};
```

### Reconnection Strategy

- Exponential backoff: 1s, 2s, 4s, ... 30s max
- Uses `Last-Event-ID` for resumption
- Deduplicates using event ID

## Error Handling

### Error Codes

| Code                       | HTTP | Description                            |
| -------------------------- | ---- | -------------------------------------- |
| `VENUE_NOT_FOUND`          | 404  | Venue doesn't exist                    |
| `TABLE_NOT_AVAILABLE`      | 409  | Table already booked                   |
| `TABLE_OCCUPIED`           | 409  | Table status prevents action           |
| `RESERVATION_NOT_FOUND`    | 404  | Reservation doesn't exist              |
| `HOLD_EXPIRED`             | 410  | Hold exceeded 5-minute timeout         |
| `OUTSIDE_HOURS`            | 422  | Requested time outside operating hours |
| `PARTY_SIZE_EXCEEDS_TABLE` | 422  | Party larger than table capacity       |

### Error Response Format

```json
{
  "error": "TABLE_NOT_AVAILABLE",
  "message": "Table 5 is already booked for 19:00",
  "statusCode": 409,
  "details": {
    "tableId": "table-5",
    "requestedTime": "19:00",
    "conflictingReservationId": "res-123"
  }
}
```

## Integration Points

### Hospitality App

```
Hospitality UI ──> Reservations API ──> SSE ──> Hospitality UI (updates)
```

### Booking Widget

```
Booking Widget ──> GET /availability ──> Time slots
               ──> POST /holds ──> Hold created (5 min)
               ──> PUT /holds/:id/confirm ──> Reservation created
```

### Auth Flow

Authenticated routes (require JWT): all `/api/v1/*` routes except `/api/v1/availability`.

Unauthenticated routes: `/health`, `/ready`, `/api/v1/availability`, and all `/public/v1/*` routes (public booking widget, manage/cancel/modify reservation by token, confirm attendance).

```typescript
// Routes use @mbe/auth plugin
fastify.get(
  "/api/v1/reservations",
  {
    preHandler: [fastify.requireAuth],
  },
  async (request) => {
    const { venueId, date } = request.query;
    // Filter by user's accessible venues
  }
);
```

## Testing Patterns

### Mocking Database

```typescript
vi.mock("../services/database.js", () => ({
  prisma: {
    venue: { findMany: vi.fn(), findUnique: vi.fn() },
    table: { findMany: vi.fn(), update: vi.fn() },
    reservation: { findMany: vi.fn(), create: vi.fn() },
  },
}));
```

### SSE Event Testing

```typescript
it("broadcasts reservation:created event", async () => {
  const app = await buildApp({ logger: false });
  await app.ready();

  // Track SSE broadcasts
  const broadcasts: unknown[] = [];
  app.sseBroadcaster.on("reservation:created", (data) => {
    broadcasts.push(data);
  });

  // Create reservation
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/reservations",
    headers: { authorization: `Bearer ${token}` },
    payload: validReservationPayload,
  });

  expect(response.statusCode).toBe(201);
  expect(broadcasts).toHaveLength(1);
  expect(broadcasts[0]).toMatchObject({
    type: "reservation:created",
    data: expect.objectContaining({ id: expect.any(String) }),
  });
});
```

## Commands

```bash
pnpm dev              # Hot-reload dev server (port 3004)
pnpm build            # Compile TypeScript
pnpm test             # Run all tests
pnpm test:watch       # Watch mode
pnpm test:coverage    # Coverage report
pnpm lint             # ESLint
pnpm typecheck        # TypeScript type check
pnpm db:generate      # Generate Prisma client
pnpm db:push          # Push schema (dev only)
pnpm db:migrate       # Create + apply migrations
pnpm db:migrate:deploy # Apply migrations (production)
```

## Environment Variables

| Variable              | Required   | Description                                             |
| --------------------- | ---------- | ------------------------------------------------------- |
| `PORT`                | No         | Service port (default: 3004)                            |
| `LOG_LEVEL`           | No         | Logging level (default: info)                           |
| `CORS_ORIGINS`        | No         | Comma-separated allowed origins                         |
| `AUTH_AUTHORITY`      | Yes (prod) | Auth0 domain                                            |
| `AUTH_AUDIENCE`       | Yes (prod) | Auth0 API identifier                                    |
| `DATABASE_URL`        | Yes        | Postgres connection                                     |
| `MANAGE_TOKEN_SECRET` | Yes (prod) | HMAC secret for self-service manage/cancel tokens       |
| `RESEND_API_KEY`      | No         | Resend API key — enables email notifications when set   |
| `EMAIL_FROM`          | No         | From address for emails (default: reservations@m...com) |
| `MANAGE_BASE_URL`     | No         | Base URL for manage/cancel links in emails              |
| `SENTRY_DSN`          | No         | Sentry DSN for error tracking                           |

## Related Documentation

- [SSE Documentation](../apps/hospitality/docs/ARCHITECTURE.md#pattern-3-real-time-sse)
- [Cross-Service Flows](../docs/CROSS-SERVICE-FLOWS.md)
- [API Versioning](../docs/API-VERSIONING.md)
