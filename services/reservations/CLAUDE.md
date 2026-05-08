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
  settings: VenueGroupSettings;
  createdAt: Date;
  updatedAt: Date;
}

interface VenueGroupSettings {
  timezone: string;
  weekStartsOn: 0 | 1; // 0 = Sunday, 1 = Monday
  bookingWindowDays: number; // How far ahead guests can book
}
```

### Venue

Individual restaurant location.

```typescript
interface Venue {
  id: string;
  venueGroupId: string;
  name: string;
  slug: string;
  address: Address;
  operatingHours: OperatingHours[];
  settings: VenueSettings;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface OperatingHours {
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  openTime: string; // "09:00"
  closeTime: string; // "22:00"
  isClosed: boolean;
}
```

### Table

Physical table with status lifecycle.

```typescript
interface Table {
  id: string;
  venueId: string;
  name: string; // "Table 1", "Booth A"
  capacity: number; // Max covers
  minPartySize: number;
  maxPartySize: number;
  status: TableStatus;
  position: { x: number; y: number };
  floorPlanId: string | null;
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
  venueId: string;
  tableId: string | null;
  guestId: string | null;
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  startTime: Date;
  duration: number; // Minutes
  partySize: number;
  status: ReservationStatus;
  notes: string | null;
  confirmationCode: string;
  source: "walk-in" | "online" | "phone";
  createdAt: Date;
  updatedAt: Date;
}

type ReservationStatus =
  | "PENDING" // Initial state after hold confirmed
  | "CONFIRMED" // Guest arrived, seated
  | "COMPLETED" // Dining finished
  | "CANCELLED" // Cancelled by guest or staff
  | "NO_SHOW"; // Guest didn't arrive
```

### Guest

Guest CRM entity.

```typescript
interface Guest {
  id: string;
  venueGroupId: string;
  email: string | null;
  phone: string | null;
  name: string;
  notes: string | null;
  visitCount: number;
  lastVisit: Date | null;
  preferences: GuestPreferences;
  createdAt: Date;
  updatedAt: Date;
}

interface GuestPreferences {
  dietaryRestrictions: string[];
  specialOccasions: string[];
  preferredTableIds: string[];
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

All routes except `/health` and `/api/v1/availability` require JWT authentication.

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

| Variable         | Required   | Description                   |
| ---------------- | ---------- | ----------------------------- |
| `PORT`           | No         | Service port (default: 3004)  |
| `LOG_LEVEL`      | No         | Logging level (default: info) |
| `CORS_ORIGIN`    | No         | Allowed origins               |
| `AUTH_AUTHORITY` | Yes (prod) | Auth0 domain                  |
| `AUTH_AUDIENCE`  | Yes (prod) | Auth0 API identifier          |
| `DATABASE_URL`   | Yes        | Postgres connection           |

## Related Documentation

- [SSE Documentation](../apps/hospitality/docs/ARCHITECTURE.md#pattern-3-real-time-sse)
- [Cross-Service Flows](../docs/CROSS-SERVICE-FLOWS.md)
- [API Versioning](../docs/API-VERSIONING.md)
