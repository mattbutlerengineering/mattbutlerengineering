# Reservations service reference

Domain model, API routes, SSE events, error handling, integration flows, code examples and environment variables for `services/reservations`, moved out of [CLAUDE.md](../CLAUDE.md) so they don't load into context every time a reservations file is read. The source of truth is the code: `prisma/schema.prisma` for the model and `src/routes/` for the API.

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
  estimatedWaitMinutes: number | null; // null = no estimate (no fitting table); never 0
  status: WaitlistStatus;
  notifiedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type WaitlistStatus = "waiting" | "notified" | "seated" | "expired" | "cancelled";
```

### ReservationEvent

Append-only log of what happened to a reservation (the `reservations` row stays the source of truth; no backfill). `venueId` is NOT NULL so rows pass FORCE RLS `WITH CHECK` — reservations with a NULL `venueId` get no events. `app_reservations` holds `SELECT, INSERT` only on `reservation_events` (no UPDATE/DELETE), so append-only is enforced by the database.

```typescript
interface ReservationEvent {
  id: string;
  reservationId: string; // FK → reservations, ON DELETE CASCADE
  venueId: string; // FK → venues, ON DELETE CASCADE
  kind: string;
  actorType: string;
  actorId: string | null;
  fromState: unknown | null; // JSON snapshot
  toState: unknown | null; // JSON snapshot
  createdAt: Date;
}
```

Every new `reservation` mutation or deposit status CAS must call `recordReservationEvent` in the same function (transaction), or be added to `ALLOWLIST` in `src/services/reservation-event-coverage.test.ts` with a written reason; that guard fails `CI Gate` otherwise, and also fails a stale allowlist entry.

### TableEvent

Append-only log of every `Table.status` transition (the `tables` row stays the source of truth; no backfill, no read endpoint yet). Written by `recordTableEvent(tx, …)` in the same transaction as the change: `tableService.updateStatus` (staff actor, or system with no user) and the walk-in seat in `createWalkIn` (carries the new `reservationId`). A CAS-lost or rolled-back change writes nothing. `venueId` is NOT NULL so rows pass FORCE RLS `WITH CHECK` — tables with a NULL `venueId` get no events. `app_reservations` holds `SELECT, INSERT` only on `table_events`, so append-only is enforced by the database. Any new code path that changes `Table.status` must call `recordTableEvent` too.

```typescript
interface TableEvent {
  id: string;
  tableId: string; // FK → tables, ON DELETE CASCADE
  venueId: string; // FK → venues, ON DELETE CASCADE
  fromStatus: TableStatus;
  toStatus: TableStatus;
  actorType: "staff" | "system";
  actorId: string | null;
  reservationId: string | null; // plain column, not a FK
  createdAt: Date;
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

| Method | Path                              | Description                                                             |
| ------ | --------------------------------- | ----------------------------------------------------------------------- |
| GET    | `/api/v1/reservations`            | List reservations (filterable)                                          |
| GET    | `/api/v1/reservations/me`         | Get current user's reservations                                         |
| GET    | `/api/v1/reservations/:id`        | Get reservation                                                         |
| POST   | `/api/v1/reservations`            | Create reservation                                                      |
| POST   | `/api/v1/reservations/walk-in`    | Create walk-in reservation                                              |
| PATCH  | `/api/v1/reservations/:id`        | Update reservation                                                      |
| DELETE | `/api/v1/reservations/:id`        | Cancel reservation                                                      |
| GET    | `/api/v1/reservations/:id/events` | List reservation event history (venue members; `limit` ≤ 200, `cursor`) |

### Availability

Authenticated (staff): requires a JWT and membership of the `:venueId` venue (ADR-020, `venueScoped`). The anonymous booking widget uses `/public/v1/venues/:slug/availability` instead.

| Method | Path                                  | Description                     |
| ------ | ------------------------------------- | ------------------------------- |
| GET    | `/api/v1/availability/:venueId`       | Get available time slots        |
| GET    | `/api/v1/availability/:venueId/dates` | Get dates with any availability |

### Availability config

Declared in `@mbe/types` (`availabilityConfigEndpoints`); the store is `src/services/availability-config.ts`. Reads need venue membership; the write needs Manager (`access: "manager"`).

| Method | Path                                      | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------ | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/venues/:id/availability/config`  | Config rows, `version` and `source` (`rows`, `legacy`-derived, or `empty`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| PUT    | `/api/v1/venues/:id/availability/config`  | `{expectedVersion, changes, scopeConflicts}`; 409 `version-conflict` (with `winningChange`), 422 `invalid-config`, 409 `stranded-bookings`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| GET    | `/api/v1/venues/:id/availability/days`    | `?from&to` (≤62 days): per-date label, closure bands, service count                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| POST   | `/api/v1/venues/:id/availability/preview` | Manager. `{draft, scope, focusDate, strandedOffset}`: 30-day added/removed times, the focus day, a page (50) of stranded bookings in scope; 422 `invalid-config`, 503 `preview-timeout` (5 s)                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| POST   | `/api/v1/venues/:id/closures/impact`      | `{rule}` (Manager, or a Host for tonight's whole-venue close when `hostEmergencyClose` is on; read-only): future bookings the draft closure / special hours would affect, grouped by date and kind, with covers, held deposits and `runsIntoClosure`; 422 `invalid-config`, 400 over a year                                                                                                                                                                                                                                                                                                                                                     |
| POST   | `/api/v1/venues/:id/closures`             | `{expectedVersion, rule, decisions[{groupKey, action, acknowledged?}]}` plus a required `Idempotency-Key` header; same Manager / Host limits. One transaction writes the rule, audit row, legacy hours projection and a `ClosureOutcome` per affected booking; cancels (staff, full refund) and moves then run from the outcome rows, and a replay of the key returns the first result and finishes any that failed (`unapplied`). Guest notices (#7523) and the refund job (#7524) are not part of it. 409 `version-conflict` / `idempotency-key-reused`, 422 `decision-required` / `invalid-decision` / `move-unavailable` / `invalid-config` |
| DELETE | `/api/v1/venues/:id/closures/:ruleId`     | `{tellCancelledGuests}`: soft-deletes the rule (reopens); cancelled guests stay cancelled. A Host only for tonight's emergency close                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

### Holds (authenticated — staff)

All four require a JWT (#4487) and membership of the hold's venue (ADR-020):
`POST` checks the body's `venueId`, the `/:id` routes the hold's own
`venueId` (an unknown hold is a 403 for non-admins, so existence never leaks;
admins get 404). Anonymous guests use the `/public/v1` hold routes below,
which resolve the venue by slug instead of trusting a client-supplied
`venueId`.

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

| Method | Path                              | Description                                                                        |
| ------ | --------------------------------- | ---------------------------------------------------------------------------------- |
| POST   | `/api/v1/deposits`                | Create deposit in `pending` state                                                  |
| GET    | `/api/v1/deposits?reservationId=` | Operator visibility: look up a reservation's deposit, or `null` if none            |
| GET    | `/api/v1/deposits?venueId=&date=` | Deposit-exposure dashboard: list all deposits for a venue's reservations on a date |
| GET    | `/api/v1/deposits/:id`            | Get deposit by ID                                                                  |
| POST   | `/api/v1/deposits/:id/capture`    | Apply (capture) a `held` deposit                                                   |
| POST   | `/api/v1/deposits/:id/refund`     | Refund a `held` deposit                                                            |
| POST   | `/api/v1/deposits/:id/forfeit`    | Forfeit a `held` deposit (no-show)                                                 |

### Stripe Webhook (unauthenticated)

| Method | Path                     | Description                                            |
| ------ | ------------------------ | ------------------------------------------------------ |
| POST   | `/api/v1/stripe/webhook` | Receive Stripe events; verifies signature via raw body |

Handled event types: `payment_intent.succeeded` (`pending → held`), `payment_intent.amount_capturable_updated` (`pending → held` — the actual event a manual-capture authorization fires; `succeeded` only fires later, on capture), `payment_intent.canceled` on a `held` deposit branches on Stripe's own `cancellation_reason` — `automatic` (Stripe's ~7-day auto-expiry, nobody decided to cancel) goes to `uncollectable`, unified with the no-show/forfeit capture-failure path's own label for the identical "authorization died before capture" condition; every other reason, including `null`/unset (what our own `cancelPaymentIntent` call sends) and a dashboard cancel, is a deliberate release and goes to `refunded` via the same path a staff-initiated refund uses (#5725 item 3, MEDIUM-3). `charge.refunded` (`held → refunded`; for a deposit already `applied`/`forfeited`/`partial_refunded` — a dashboard-issued refund after our own capture — reconciles `postCaptureRefundCents` against Stripe's `amount_refunded` minus any `refundAmountCents` leg `refundPartial` already issued itself, monotonically, without changing `status`, #5725).

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
| POST   | `/public/v1/venues/:slug/waitlist`                | Join the walk-in waitlist (public)      |
| GET    | `/public/v1/venues/:slug/waitlist/status?token=`  | Live position + wait estimate (public)  |
| POST   | `/public/v1/venues/:slug/deposits/payment-intent` | Create Stripe PaymentIntent for deposit |
| GET    | `/public/v1/reservations/manage`                  | Get reservation via manage token        |
| PATCH  | `/public/v1/reservations/manage`                  | Modify reservation via manage token     |
| DELETE | `/public/v1/reservations/manage`                  | Cancel reservation via manage token     |
| GET    | `/public/v1/reservations/confirm`                 | Confirm attendance via token            |

The public deposit route creates a Stripe PaymentIntent (manual capture) and a `Deposit` record in `pending` state, returning the `clientSecret` for Stripe.js to confirm on the frontend.
It requires the `x-session-id` of the booking session that confirmed the
reservation (`Reservation.originSessionId`, copied from the hold by
`confirmHold`), compared in constant time before any Stripe call; a missing
header, a mismatch, or a reservation with no originating session (created
outside the widget) is a 403 (#6304).

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

The event vocabulary is owned by `SSE_EVENT_CATALOG` / `SsePayloadMap` in `packages/types/src/sse-events.ts`; do not restate it here. `SseEvent` (also exported as `ReservationEvent` from `services/events.ts`) is a discriminated union: `type` selects the `data` payload, so emitting `guest:lapsing` with a `Reservation` is a compile error. The current event list is tabulated in `apps/hospitality/docs/ARCHITECTURE.md` § Event Types Reference, which a test keeps equal to the catalog.

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

The auth rules (which routes require a JWT) stay in [CLAUDE.md § Auth Flow](../CLAUDE.md#auth-flow).

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

### Auth Flow example

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

## Venue scope example

The rules for declaring a route's venue stay in [CLAUDE.md § Venue scope](../CLAUDE.md#venue-scope).

```typescript
fastify.get<{ Querystring: { venueId: string } }>(
  "/",
  { preHandler: requireAuth },
  venueScoped({ venue: "query" }, async (request, reply, { venueId }) => {
    return { data: await thingService.list(venueId) };
  })
);
```

## RLS history

ADR-026 §3.3 records the route-by-route breakage measured on 2026-09-21, before
the `SECURITY DEFINER` resolvers and this FORCE migration. That measurement is
history.

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
  app.reservationEvents.on("reservation:created", (data) => {
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

## Availability backfill

`src/scripts/backfill-availability.ts` turns each venue's legacy `operatingHours` into availability rows (#7502). It is run by an operator, once per environment, after the `add_venue_availability` migration is applied. It is not part of `prisma migrate deploy` or the deploy job.

```bash
# Deployed image (matches the Dockerfile CMD):
node --conditions production dist/scripts/backfill-availability.js            # dry run: reports what it would do
node --conditions production dist/scripts/backfill-availability.js --apply    # writes
# Dev checkout (tsx):
pnpm db:backfill-availability [--apply]
```

- It needs `DATABASE_URL` and prints one JSON line per venue, then a `summary` line. Exit code is 1 only if a venue errored.
- It is idempotent: a venue that already has a regular schedule is skipped (`already_migrated`).
- Each venue is its own transaction in its own venue context. A venue whose hours cannot be read is left untouched and reported `unrecognised`: unknown shape or version, a time the parser cannot read on an open day (`unreadable_time`), a past-midnight window longer than 16 hours (`implausible_span`), a bad interval or buffer, or overlapping windows.
- It only inserts, and it never touches `Venue.operatingHours`. Every outcome line (dry run and apply) carries the original `operatingHours` value, so keep the log: it is the backup. `notes.pastMidnightWindows` lists each window read as running past midnight so a typo is visible in the dry run.
- Weekdays with the same hours share one schedule. The largest group is the regular week, the rest become `alternate` schedules, and a closed weekday gets no assignment.

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
