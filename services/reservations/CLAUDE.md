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
                     │
                     └────< FloorPlan (many)
                     │
                     └────< WaitlistEntry (many)
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

Individual restaurant location. Also holds the deposit policy configuration.

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
  // Deposit policy
  depositEnabled: boolean; // default: false
  depositType: "flat" | "per_person" | null;
  depositAmountCents: number | null;
  freeCancellationHours: number | null;
  lateCancellationFeePercent: number | null;
  noShowFeePercent: number | null;
  createdAt: Date;
  updatedAt: Date;
}
```

### FloorPlan

Visual layout of a venue. One floor plan per venue is active at a time.

```typescript
interface FloorPlan {
  id: string;
  venueId: string;
  name: string;
  isActive: boolean; // default: false
  layoutJson: Record<string, unknown>; // editor canvas layout
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
  occasion: Occasion | null;
  seatingPreference: SeatingPreference | null;
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

type Occasion = "birthday" | "anniversary" | "business" | "date_night" | "other" | "none";

type SeatingPreference = "booth" | "patio" | "bar" | "window" | "quiet" | "no_preference";
```

### Guest

Guest CRM entity. Full type is defined in `@mbe/types` (`packages/types/src/guest.ts`).

```typescript
interface Guest {
  id: string;
  venueId: string;
  email: string | null;
  phone: string | null;
  name: string;
  notes: string | null;
  visitCount: number;
  lifetimeSpend: string | null; // Decimal as string for precision
  lastVisit: string | null;
  tags: string[] | null;
  dietaryRestrictions: string[] | null; // e.g. ["gluten-free", "vegan", "nut-allergy"]
  communicationPreference: CommunicationPreference; // default: "both"
  staffNotes: StaffNote[]; // staff-only, never returned in public API responses
  createdAt: string;
  updatedAt: string;
}

type CommunicationPreference = "email_only" | "sms_only" | "both" | "transactional_only";

interface StaffNote {
  text: string;
  createdBy: string; // authenticated user id
  createdAt: string;
}
```

### Deposit

Payment hold associated with a reservation. One deposit per reservation (`reservationId` is unique).

```typescript
interface Deposit {
  id: string;
  reservationId: string; // unique — one deposit per reservation
  amountCents: number;
  currency: string; // ISO code, lowercase (e.g. "usd")
  status: DepositStatus;
  stripePaymentIntentId: string | null;
  stripeCustomerId: string | null;
  heldAt: Date | null;
  appliedAt: Date | null;
  refundedAt: Date | null;
  forfeitedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type DepositStatus = "pending" | "held" | "applied" | "refunded" | "partial_refunded" | "forfeited";

type DepositType = "flat" | "per_person"; // stored on Venue.depositType
```

**Lifecycle:**

```
pending ──(payment_intent.succeeded webhook)──> held
held    ──(capture / full no-show)──> applied | forfeited
held    ──(free cancellation)──> refunded
held    ──(late cancel / partial no-show)──> partial_refunded
```

`partial_refunded` is used when a late cancellation fee or a sub-100% no-show
fee applies: the hold is captured and the un-charged remainder is partially
refunded to the guest. A full `forfeited` is reserved for the true 100% case.

Stripe PaymentIntents are created with **manual capture** (authorize-only hold). The webhook transitions `pending → held` when the payment is authorized. Staff actions then capture (`held → applied`), refund (`held → refunded`), or forfeit (`held → forfeited`).

### WaitlistEntry

Walk-in queue entry for a venue.

```typescript
interface WaitlistEntry {
  id: string;
  venueId: string;
  partySize: number;
  guestName: string;
  guestPhone: string;
  position: number;
  estimatedWaitMinutes: number;
  status: WaitlistStatus;
  notifiedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type WaitlistStatus = "waiting" | "notified" | "seated" | "expired" | "cancelled";
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

### Floor Plans

| Method | Path                                         | Description                              |
| ------ | -------------------------------------------- | ---------------------------------------- |
| GET    | `/api/v1/floor-plans`                        | List floor plans (filterable by venueId) |
| GET    | `/api/v1/floor-plans/:id`                    | Get floor plan by ID                     |
| GET    | `/api/v1/floor-plans/venue/:venueId/active`  | Get active floor plan for venue          |
| POST   | `/api/v1/floor-plans`                        | Create floor plan                        |
| POST   | `/api/v1/floor-plans/:id/clone`              | Clone floor plan (copies all tables)     |
| POST   | `/api/v1/floor-plans/:id/activate`           | Set as active (deactivates others)       |
| PATCH  | `/api/v1/floor-plans/:id`                    | Update floor plan metadata               |
| DELETE | `/api/v1/floor-plans/:id`                    | Delete floor plan                        |
| POST   | `/api/v1/floor-plans/tables/positions`       | Bulk update table positions              |
| POST   | `/api/v1/floor-plans/tables/:tableId/assign` | Assign table to floor plan               |
| POST   | `/api/v1/floor-plans/tables/:tableId/remove` | Remove table from floor plan             |

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

### Guests

| Method | Path                            | Description                                     |
| ------ | ------------------------------- | ----------------------------------------------- |
| GET    | `/api/v1/guests`                | List guests for venue                           |
| GET    | `/api/v1/guests/search`         | Search guests by name/email/phone/tags          |
| GET    | `/api/v1/guests/segments`       | Get guest segments (VIP, At Risk, Lapsed, etc.) |
| GET    | `/api/v1/guests/lapsing`        | On-demand lapse detection scan                  |
| GET    | `/api/v1/guests/:id`            | Get guest by ID                                 |
| POST   | `/api/v1/guests`                | Create guest (accepts `dietaryRestrictions`)    |
| POST   | `/api/v1/guests/find-or-create` | Identity resolution — find or create            |
| PATCH  | `/api/v1/guests/:id`            | Update guest (accepts `dietaryRestrictions`)    |
| POST   | `/api/v1/guests/:id/notes`      | Append staff note                               |
| POST   | `/api/v1/guests/:id/win-back`   | Send win-back message to lapsing guest          |
| DELETE | `/api/v1/guests/:id`            | Delete guest (fails if guest has reservations)  |

`dietaryRestrictions` is a `string[]` field accepted on create, update, and `find-or-create`. It is stored as JSON on the `Guest` model. Tests for dietary-restriction flows live in `src/routes/guests-dietary.test.ts`.

### Deposits (authenticated)

| Method | Path                           | Description                        |
| ------ | ------------------------------ | ---------------------------------- |
| POST   | `/api/v1/deposits`             | Create deposit in `pending` state  |
| GET    | `/api/v1/deposits/:id`         | Get deposit by ID                  |
| POST   | `/api/v1/deposits/:id/capture` | Apply (capture) a `held` deposit   |
| POST   | `/api/v1/deposits/:id/refund`  | Refund a `held` deposit            |
| POST   | `/api/v1/deposits/:id/forfeit` | Forfeit a `held` deposit (no-show) |

### Stripe Webhook (unauthenticated)

| Method | Path                     | Description                                            |
| ------ | ------------------------ | ------------------------------------------------------ |
| POST   | `/api/v1/stripe/webhook` | Receive Stripe events; verifies signature via raw body |

Handled event types: `payment_intent.succeeded` (`pending → held`), `payment_intent.canceled` (`held → refunded`), `charge.refunded` (`held → refunded`).

Raw body access is required for HMAC signature verification — this route must be registered before any JSON body parsers.

### Waitlist

| Method | Path                          | Description                    |
| ------ | ----------------------------- | ------------------------------ |
| POST   | `/api/v1/waitlist`            | Add guest to waitlist          |
| GET    | `/api/v1/waitlist`            | List waiting entries for venue |
| GET    | `/api/v1/waitlist/:id`        | Get single waitlist entry      |
| PUT    | `/api/v1/waitlist/:id/seat`   | Mark guest as seated           |
| PUT    | `/api/v1/waitlist/:id/cancel` | Cancel waitlist entry          |
| PUT    | `/api/v1/waitlist/:id/expire` | Mark entry as expired          |

### Public Booking Widget (no auth)

| Method | Path                                              | Description                             |
| ------ | ------------------------------------------------- | --------------------------------------- |
| GET    | `/public/v1/venues/:slug`                         | Get public venue info                   |
| GET    | `/public/v1/venues/:slug/availability`            | Get available slots (public)            |
| POST   | `/public/v1/venues/:slug/holds`                   | Create hold (public)                    |
| DELETE | `/public/v1/venues/:slug/holds/:holdId`           | Release hold (public)                   |
| POST   | `/public/v1/venues/:slug/reservations`            | Confirm hold → reservation (public)     |
| POST   | `/public/v1/venues/:slug/deposits/payment-intent` | Create Stripe PaymentIntent for deposit |
| GET    | `/public/v1/reservations/manage`                  | Get reservation via manage token        |
| PATCH  | `/public/v1/reservations/manage`                  | Modify reservation via manage token     |
| DELETE | `/public/v1/reservations/manage`                  | Cancel reservation via manage token     |
| GET    | `/public/v1/reservations/confirm`                 | Confirm attendance via token            |

The public deposit route creates a Stripe PaymentIntent (manual capture) and a `Deposit` record in `pending` state, returning the `clientSecret` for Stripe.js to confirm on the frontend.

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
               ──> POST /public/v1/venues/:slug/deposits/payment-intent ──> Stripe PaymentIntent (if deposit enabled)
```

### Auth Flow

Authenticated routes (require JWT): all `/api/v1/*` routes except `/api/v1/availability`.

Unauthenticated routes: `/health`, `/ready`, `/api/v1/availability`, `/api/v1/stripe/webhook`, and all `/public/v1/*` routes (public booking widget, manage/cancel/modify reservation by token, confirm attendance).

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
pnpm dev               # Hot-reload dev server (port 3004)
pnpm start             # Run compiled output (production)
pnpm build             # Compile TypeScript
pnpm build:openapi     # Generate openapi.json from live app
pnpm test              # Run all tests
pnpm test:contract     # Run contract tests only
pnpm test:watch        # Watch mode
pnpm test:coverage     # Coverage report
pnpm lint              # ESLint
pnpm typecheck         # TypeScript type check
pnpm db:generate       # Generate Prisma client
pnpm db:push           # Push schema (dev only)
pnpm db:migrate        # Create + apply migrations
pnpm db:migrate:deploy # Apply migrations (production)
pnpm db:migrate:status # Show migration status
pnpm db:studio         # Open Prisma Studio
```

## Environment Variables

| Variable                | Required   | Description                                             |
| ----------------------- | ---------- | ------------------------------------------------------- |
| `PORT`                  | No         | Service port (default: 3004)                            |
| `LOG_LEVEL`             | No         | Logging level (default: info)                           |
| `CORS_ORIGINS`          | No         | Comma-separated allowed origins                         |
| `AUTH_AUTHORITY`        | Yes (prod) | Auth0 domain                                            |
| `AUTH_AUDIENCE`         | Yes (prod) | Auth0 API identifier                                    |
| `DATABASE_URL`          | Yes        | Postgres connection                                     |
| `MANAGE_TOKEN_SECRET`   | Yes (prod) | HMAC secret for self-service manage/cancel tokens       |
| `RESEND_API_KEY`        | No         | Resend API key — enables email notifications when set   |
| `EMAIL_FROM`            | No         | From address for emails (default: reservations@m...com) |
| `MANAGE_BASE_URL`       | No         | Base URL for manage/cancel links in emails              |
| `SENTRY_DSN`            | No         | Sentry DSN for error tracking                           |
| `STRIPE_SECRET_KEY`     | Yes (prod) | Stripe secret key — required when deposits are enabled  |
| `STRIPE_WEBHOOK_SECRET` | Yes (prod) | Stripe webhook signing secret for HMAC verification     |

## Related Documentation

- [SSE Documentation](../../apps/hospitality/docs/ARCHITECTURE.md#pattern-3-real-time-sse)
- [Cross-Service Flows](../../docs/CROSS-SERVICE-FLOWS.md)
- [API Versioning](../../docs/API-VERSIONING.md)
