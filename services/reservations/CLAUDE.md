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

| Method | Path                           | Description                     |
| ------ | ------------------------------ | ------------------------------- |
| GET    | `/api/v1/reservations`         | List reservations (filterable)  |
| GET    | `/api/v1/reservations/me`      | Get current user's reservations |
| GET    | `/api/v1/reservations/:id`     | Get reservation                 |
| POST   | `/api/v1/reservations`         | Create reservation              |
| POST   | `/api/v1/reservations/walk-in` | Create walk-in reservation      |
| PATCH  | `/api/v1/reservations/:id`     | Update reservation              |
| DELETE | `/api/v1/reservations/:id`     | Cancel reservation              |

### Availability

| Method | Path                   | Description              |
| ------ | ---------------------- | ------------------------ |
| GET    | `/api/v1/availability` | Get available time slots |

### Holds (authenticated — staff)

All four require a JWT (#4487). Anonymous guests use the `/public/v1` hold
routes below, which resolve the venue by slug instead of trusting a
client-supplied `venueId`.

| Method | Path                        | Description                                  |
| ------ | --------------------------- | -------------------------------------------- |
| POST   | `/api/v1/holds`             | Create reservation hold (venue default 10 m) |
| GET    | `/api/v1/holds/:id`         | Get hold status                              |
| DELETE | `/api/v1/holds/:id`         | Release hold (requires `x-session-id`)       |
| POST   | `/api/v1/holds/:id/confirm` | Confirm hold → reservation                   |

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
| GET    | `/public/v1/venues/:slug/holds/:holdId`           | Get hold status (public)                |
| DELETE | `/public/v1/venues/:slug/holds/:holdId`           | Release hold (public)                   |
| POST   | `/public/v1/venues/:slug/holds/:holdId/confirm`   | Confirm hold → reservation (public)     |
| POST   | `/public/v1/venues/:slug/reservations`            | Confirm hold → reservation (public)     |
| POST   | `/public/v1/venues/:slug/deposits/payment-intent` | Create Stripe PaymentIntent for deposit |
| GET    | `/public/v1/reservations/manage`                  | Get reservation via manage token        |
| PATCH  | `/public/v1/reservations/manage`                  | Modify reservation via manage token     |
| DELETE | `/public/v1/reservations/manage`                  | Cancel reservation via manage token     |
| GET    | `/public/v1/reservations/confirm`                 | Confirm attendance via token            |

The public deposit route creates a Stripe PaymentIntent (manual capture) and a `Deposit` record in `pending` state, returning the `clientSecret` for Stripe.js to confirm on the frontend.

Every `/holds` route above requires the `x-session-id` returned at hold
creation (a high-entropy capability token) for reads, releases and confirms —
the hold id is a guessable cuid and is never treated as proof of ownership.
`…/holds/:holdId/confirm` (#4487) is what the booking widget uses; the older
`…/reservations` route does the same job but takes the hold id in the body,
performs no session check, and requires `guestName` + `guestEmail`.

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

### Standard Error Response

```typescript
// RFC 7807 Problem Details (ADR-008) — the single error shape on the wire.
interface ProblemDetails {
  type: string; // URI identifying the error type (default: "about:blank")
  title: string; // Short human-readable summary (e.g. "Conflict")
  status: number; // HTTP status code
  detail: string; // Human-readable explanation for this occurrence
  instance?: string; // URI identifying this specific occurrence
}
```

Domain-specific context (e.g. which table conflicted) is carried as RFC 7807
extension members (Section 3.2) alongside the standard fields, not nested in a
`details` bag — see ADR-008's "Extension Members" example:

```json
{
  "type": "/errors/table-not-available",
  "title": "Table Not Available",
  "status": 409,
  "detail": "Table 5 is already booked for 19:00",
  "tableId": "table-5",
  "conflictingReservationId": "res-123"
}
```

## Integration Points

### Hospitality App

```
Hospitality UI ──> Reservations API ──> SSE ──> Hospitality UI (updates)
```

### Booking Widget

```
Booking Widget ──> GET /public/v1/venues/:slug/availability ──> Time slots
               ──> POST /public/v1/venues/:slug/holds ──> Hold created (venue default 10 m) + x-session-id
               ──> POST /public/v1/venues/:slug/holds/:holdId/confirm ──> Reservation created
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

## Postgres Row-Level Security (RLS) Backstop

Per [ADR-026](../../docs/adr/ADR-026-postgres-rls-venue-backstop.md),
`venues`, `floor_plans`, `tables`, `guests`, `reservations`, `deposits`, and
`waitlist_entries` carry Postgres `FOR ALL` RLS policies keyed on the
`app.venue_id` session variable — `venues`' own policy (`venue_isolation`)
uses the row's own `id` as the venue identifier, since it has no separate
`venue_id` column (ADR-026 Section 1). This is a **second, database-enforced
layer**, not a replacement for application-level scoping: every service
function must still write its own `where: { venueId }` filter (or the
equivalent join) exactly as before. RLS exists to catch the case where that
filter is missing or wrong — a query that forgets `venueId` now fails closed
(returns/writes zero rows) at the database instead of leaking or corrupting
another venue's data.

**How `app.venue_id` gets set:** `venueContextPreHandler`
(`src/middleware/venue-context.ts`) is a global Fastify preHandler
(registered in `app.ts`) that resolves the request's venue id the same way
`requireVenueAccess` does and stashes it in a request-scoped
`AsyncLocalStorage` store (`src/services/venue-context-store.ts`). The
actual Postgres session variable is set later, inside the transaction that
issues the query: `src/services/venue-scoped-prisma.ts`'s
`withVenueScopedQueries` wraps the exported `prisma` client so every
model-delegate call (`prisma.table.findMany(...)`, etc.) automatically opens
a `$transaction` and calls `setVenueContext(tx, ...)` — `SELECT
set_config('app.venue_id', <id>, true)`, the parameterized equivalent of
`SET LOCAL` — as that transaction's first statement, before the wrapped
query runs. A handful of call sites that already manage their own explicit
`$transaction` (`reservation.ts`, `floor-plan.ts`, `book-slot.ts`,
`waitlist.ts`) call `setVenueContext` directly instead. When no venue id is
resolved (public routes, background jobs), `app.venue_id` stays unset and
every policy's `current_setting('app.venue_id', true)` evaluates to `NULL`
— default-deny, not an error and not "every venue".

**Known gap — venue-self-addressed routes:** the global resolver
(`resolveGlobalVenueId` in `app.ts`) only reads a `venueId` key from the
query, body, or route params; `GET/PATCH/DELETE /api/v1/venues/:id` (and
`/:id/table-statuses`) address the venue by its own `:id` param instead, so
that resolver returns `null` for these routes and `app.venue_id` is never
set via the global preHandler for them (`requireVenueAccess`'s own
`venueIdFromRouteId` resolver in `routes/venues.ts` does read `:id`
correctly, but that only drives the application-layer membership check, not
the RLS session variable). All of these routes still go through the
venue-scoped `prisma.venue.*` wrapper (`venueService`, `services/venue.ts`),
so nothing here is an unwrapped/bypassing call site — the gap is purely in
venue-id _resolution_ for this one route family. Per the caveat below,
`FORCE ROW LEVEL SECURITY` is not set, so this has no functional impact
today (the app's own DB role is the table owner and bypasses RLS
regardless); it does mean the DB-level backstop doesn't yet actually engage
for these particular routes the way it does for routes that pass `venueId`
via query/body/param.

**Current caveat:** the tables above do not have `FORCE ROW LEVEL SECURITY`
set, so RLS does not apply to the table **owner** — and the service's own
`DATABASE_URL` role is that owner (it's also the role `prisma migrate
deploy` runs as). Forcing RLS was tried and reverted (see PR #5370's commit
history) because it would 500 any request whose venue id doesn't resolve,
which was not yet guaranteed at the time; it must land atomically with the
`SET LOCAL`/`set_config` plumbing above, not as an earlier, separate
migration. In practice this means the policies are verified against a
second, non-owner Postgres role rather than the app's own connection — see
`src/routes/rls-isolation.integration.test.ts` for the real, migrated-database
proof (cross-tenant reads on `reservations`, `guests`, `venues`, and the
join-based `deposits` policy all return zero rows — or, for `venues`, no
other venue's row — with the app-level `venueId`/`id` filter deliberately
removed).

**The gap that caveat describes is now guarded, and the guard runs in ordinary
CI (#5369).** "No `FORCE`" is not a footnote — it means every policy above is
provably inert against the one role the service actually connects as, so the
backstop reads as protection while providing none. Two checks now keep that from
recurring silently:

- `src/services/rls-force-coverage.ts` parses the committed migration SQL and
  fails if any RLS-**enabled** table is neither forced nor listed in
  `PENDING_FORCE_TABLES` with its reason. It needs no database, so it runs in the
  normal `test` job on every PR — add an eighth venue-scoped table with `ENABLE`
  alone and it fails at the moment the migration is written. (It strips SQL
  comments first: the one migration in this service that mentions FORCE mentions
  it only in prose saying it does _not_ set it.)
- `src/routes/rls-owner-enforcement.integration.test.ts` is the real-Postgres
  proof, and deliberately uses **no probe role** — it asserts its connection is
  owner-privileged for all seven tables (checked against `pg_class.relowner`) and
  is neither `SUPERUSER` nor `BYPASSRLS`, then measures enforcement. Both guards
  are assertions, not comments, so a run that could not prove anything fails
  instead of passing. Its expectations are derived from the migrations, so it
  keeps working unchanged across the flip.

ADR-026 §3.3 carries the measured route-by-route breakage (8 of 17 probed routes
404 under FORCE, including `GET /public/v1/venues/:slug` — the first call of
every public booking) and is the list to close before the flip.

**If you ever smoke-test the FORCE flip, do NOT do it as a platform admin — the
damage is a 404, not the 403 the ADR predicts, and an admin sees neither.**
ADR-026 §3.3 item 2 says an entity-addressed route answers **403** under FORCE,
because `venueIdFromEntity`'s unscoped load resolves `null` and
`requireVenueAccess` rejects. That is true only for a non-admin. `requireVenueAccess`
(`packages/auth/src/fastify/authz.ts`) short-circuits on `hasPermission(user, "admin")`
**before** it ever calls the resolver, so for a platform admin the request sails
past the guard and dies in the handler's own read instead — `404 Table not found`,
`404 No venue found with slug '…'`. Measured 2026-09-21; the auth-bypass identity
used by every route test in this service (`AUTH_BYPASS_IN_TESTS`) is exactly such
an admin, so a test or manual check run through it observes the 404 path and never
the 403 one.

Why that matters more than the status code: a 404 from these routes is
**indistinguishable from an empty venue**. Nothing goes red — no 5xx, no Sentry
event, no failed health check (`/health` is liveness-only and stays 200; even
`/api/v1/users/health`'s `$queryRaw` is unaffected, since RLS returns zero rows
rather than erroring). The observable symptom is "no bookings today". Treat any
post-flip verification that only checks for errors as having verified nothing.

**Background jobs do not go through the request middleware at all, and one of
them is unguarded.** `src/services/lapsed-guest-cron.ts` is fine (it sets
per-venue context on its own transaction, #5401) — but
`src/services/job-worker.ts`'s reminder handlers, wired in `app.ts`, call
`reservationService.getById` / `venueService.getById` from a BullMQ consumer with
no request, so `getCurrentVenueId()` is `null`. Under FORCE both return `null` and
`deliverReminder` **returns early without throwing**: reminders silently stop
being delivered. This is ADR-026 §3.3 item 7 — the one entry the original sweep
missed, because a `findMany|findFirst|$queryRaw` grep cannot see a background
caller that reaches those tables through a service function. When adding any new
background/scheduled caller that touches the seven tables, wrap it in
`runWithVenueContext(venueId, …)` and say so in its doc comment; nothing else in
the service will do it for you.

**Cross-venue reads go through one named function.** Two reads cannot name a
single venue by construction — the lapsed-guest cron's venue list
(`getAllVenueIds`) and the platform-admin venue list (`venueService.list`) —
and both now read through `app_cross_venue_venues()`
(`prisma/migrations/20260920000000_add_cross_venue_read_escape_hatch`), a
`SECURITY DEFINER` function admitted by a `SELECT`-only policy keyed on the
transaction-local marker it sets and restores around its own `venues` scan
(ADR-026 §3.1). Before adding a third caller, read §3.1: the hatch is
`SELECT`-only on purpose, `grep -rn app_cross_venue_venues` is the whole review
surface, and a read that CAN name its venue must use `setVenueContext` instead.
ADR-026 §3.3 lists what still blocks the FORCE flip — including that every
entity-addressed `/:id` route and the entire `/public/v1/venues/:slug/*` funnel
would break under it, because the lookup that resolves their venue is itself an
unscoped read.

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

| Variable                   | Required   | Description                                             |
| -------------------------- | ---------- | ------------------------------------------------------- |
| `PORT`                     | No         | Service port (default: 3004)                            |
| `LOG_LEVEL`                | No         | Logging level (default: info)                           |
| `CORS_ORIGINS`             | No         | Comma-separated allowed origins                         |
| `AUTH_AUTHORITY`           | Yes (prod) | Auth0 domain                                            |
| `AUTH_AUDIENCE`            | Yes (prod) | Auth0 API identifier                                    |
| `DATABASE_URL`             | Yes        | Postgres connection                                     |
| `MANAGE_TOKEN_SECRET`      | Yes (prod) | HMAC secret for self-service manage/cancel tokens       |
| `RESEND_API_KEY`           | No         | Resend API key — enables email notifications when set   |
| `EMAIL_FROM`               | No         | From address for emails (default: reservations@m...com) |
| `MANAGE_BASE_URL`          | No         | Base URL for manage/cancel links in emails              |
| `SENTRY_DSN`               | No         | Sentry DSN for error tracking                           |
| `STRIPE_SECRET_KEY`        | Yes (prod) | Stripe secret key — required when deposits are enabled  |
| `STRIPE_WEBHOOK_SECRET`    | Yes (prod) | Stripe webhook signing secret for HMAC verification     |
| `UNSUBSCRIBE_TOKEN_SECRET` | Yes (prod) | HMAC secret for post-visit-email unsubscribe tokens     |

## Related Documentation

- [SSE Documentation](../../apps/hospitality/docs/ARCHITECTURE.md#pattern-3-real-time-sse)
- [Cross-Service Flows](../../docs/CROSS-SERVICE-FLOWS.md)
- [API Versioning](../../docs/API-VERSIONING.md)
