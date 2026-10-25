# Reservations Service

Fastify + Prisma service for restaurant reservation and table management. Port **3004**.

## Reference

Domain model, API routes, SSE events and error handling: [docs/reference.md](./docs/reference.md). Read it before changing routes, entities or error codes.

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

Authenticated routes (require JWT): all `/api/v1/*` routes except `/api/v1/stripe/webhook` (including `/api/v1/availability/*`, which also requires venue membership).

Unauthenticated routes: `/health`, `/ready`, `/api/v1/stripe/webhook`, and all `/public/v1/*` routes (public booking widget, manage/cancel/modify reservation by token, confirm attendance).

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

## Invariants

- Every `Table.status` change must call `recordTableEvent(tx, …)` in the same transaction. **No test enforces this**, so a missed call silently drops events from `table_events`.
- Every `reservation` mutation or deposit status CAS must call `recordReservationEvent` in the same function, or be allowlisted with a reason in `src/services/reservation-event-coverage.test.ts` (fails `CI Gate` otherwise).

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

**How `app.venue_id` gets set:** a route's venue context is entered by
`venueScoped` (see "Venue scope" below) or, in public/token/webhook/cron/job
paths, by an explicit `runWithVenueContext` (`src/services/venue-context-store.ts`),
which stashes the venue id in a request-scoped `AsyncLocalStorage` store.
There is no global hook: the ADR-026 part-6 `preHandler` that guessed a
venue from the query/body/params is deleted. The
actual Postgres session variable is set later, inside the transaction that
issues the query: `src/services/venue-scoped-prisma.ts`'s
`withVenueScopedQueries` wraps the exported `prisma` client so every
model-delegate call (`prisma.table.findMany(...)`, etc.) automatically opens
a `$transaction` and calls `setVenueContext(tx, ...)`. That helper's first
statement is `SET LOCAL ROLE "app_reservations"` (`assumeAppRole`); when a
venue id is set it then runs `SELECT set_config('app.venue_id', <id>, true)`,
the parameterized equivalent of `SET LOCAL`, before the wrapped query runs.
A handful of call sites that already manage their own explicit
`$transaction` (`reservation.ts`, `floor-plan.ts`, `book-slot.ts`,
`waitlist.ts`) call `setVenueContext` directly instead. When no venue id is
resolved (public routes, background jobs), the role is still assumed,
`set_config` is skipped, and `app.venue_id` stays unset so every policy's
`current_setting('app.venue_id', true)` evaluates to `NULL` — default-deny,
not an error and not "every venue".

**Venue-self-addressed routes — closed (ADR-026 §3.3 item 5 / #5369 PR 7).**
`GET/PATCH/DELETE /api/v1/venues/:id` (and `/:id/table-statuses`) address the
venue by its own `:id`; they declare `venueScoped({ venue: { from: "params",
field: "id" } })`, so the context is the venue itself (`venues`' own
`venue_isolation` policy is keyed on the row's `id`). Proved against a real,
migrated, FORCE'd database as a non-superuser owner role in
`src/routes/rls-route-sweep.integration.test.ts`.

**Current caveat:** the seven tables above carry `FORCE ROW LEVEL SECURITY`
in `prisma/migrations/20261009000100_grant_app_reservations_and_force_rls`.
FORCE subjects the table owner, so the policies apply to `DATABASE_URL` once
that migration is applied. Migrate stays that owner: `db-migrate-reservations`
still receives the same `databaseUrl` secret and does not assume the runtime
role. The role is `app_reservations` (`NOLOGIN NOINHERIT`,
`20261009000000_create_app_reservations_role`), granted to the migrate user
so a transaction can `SET LOCAL ROLE`. The service process still connects as
the owner. Each app transaction assumes `app_reservations` via
`assumeAppRole` before its first query, including when no venue id is set.
Health and readiness `SELECT 1` do not. The role is not a member of the
owner. Cross-tenant proof against a separate non-owner probe role remains in
`src/routes/rls-isolation.integration.test.ts`.

**FORCE on those seven tables is guarded in ordinary CI (#5369).** An
RLS-enabled table that is not forced is inert against the owning role. Two
checks keep that from shipping again:

- `src/services/rls-force-coverage.ts` parses the committed migration SQL and
  fails if any RLS-enabled table is neither forced nor listed in
  `PENDING_FORCE_TABLES`, and fails if a listed name is already forced.
  `PENDING_FORCE_TABLES` is empty. It needs no database, so it runs in the
  normal `test` job on every PR. (It strips SQL comments first: an earlier
  migration mentions FORCE only in prose saying it does not set it.)
- `src/routes/rls-owner-enforcement.integration.test.ts` is the real-Postgres
  proof, and deliberately uses **no probe role** — it asserts its connection is
  owner-privileged for all seven tables (checked against `pg_class.relowner`) and
  is neither `SUPERUSER` nor `BYPASSRLS`, then measures enforcement. Both guards
  are assertions, not comments, so a run that could not prove anything fails
  instead of passing. Its expectations are derived from the migrations, so it
  keeps working when the migrations declare FORCE.

ADR-026 §3.3 records the route-by-route breakage measured on 2026-09-21, before
the `SECURITY DEFINER` resolvers and this FORCE migration. That measurement is
history.

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

**Background jobs do not go through the request middleware at all — both
halves of this are now fixed.** `src/services/lapsed-guest-cron.ts` is fine
(it sets per-venue context on its own transaction, #5401).
`src/services/job-worker.ts`'s `BOOKING_REMINDER` / `DAY_OF_REMINDER` handlers,
wired in `app.ts`, call `reservationService.getById` / `venueService.getById`
from a BullMQ consumer with no request — `deliverReminder` wraps its whole
body in `runWithVenueContext(payload.venueId, …)` (ADR-026 §3.3 item 7,
reminder-handler half), since `ReminderPayload` already declares `venueId`
required at dispatch. `WAITLIST_EXPIRY` / `waitlistNotifier.handleExpiry` is
the other half and is closed too: `handleWaitlistExpiryJob` does the same
`runWithVenueContext` wrap whenever `payload.venueId` is present, populated at
the job's one enqueue site (`waitlist-notifier.ts`'s `notifyTableReady`). Its
`venueId` stays optional on the payload type (not required, unlike
`ReminderPayload`) for a job already sitting in Redis when this shipped — see
ADR-026 §3.3 item 7 for the legacy-payload fallback and its deletion
condition. When adding any new background/scheduled caller that touches the
seven tables, wrap it in
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
Venue lookup for those routes goes through `app_resolve_venue_id`, and the
cross-venue list goes through `app_cross_venue_venues`. The seven venue tables
are forced in `20261009000100_grant_app_reservations_and_force_rls`. The
2026-09-21 measurement that the `/public/v1/venues/:slug/*` funnel 404'd under
FORCE was taken while those lookups were still unscoped reads.

### Venue scope

Every `/api/v1` route declares its venue once, in
`src/routes/venue-scope.ts` (ADR-020 access, ADR-026 context). Never wire
`requireVenueAccess` plus a hand-written resolver plus a second
`runWithVenueContext` in the handler: `venueScoped` does all three, in a
test-pinned order (resolve once, `admitIdentity`, access decision, then
`runWithVenueContext(load -> handler)`; a denied request never enters a
context).

```typescript
fastify.get<{ Querystring: { venueId: string } }>(
  "/",
  { preHandler: requireAuth },
  venueScoped({ venue: "query" }, async (request, reply, { venueId }) => {
    return { data: await thingService.list(venueId) };
  })
);
```

Pick the source (`venue:`) and access (`access:`, default `"member"`):

- **Direct key:** `"query"`, `"body"` or `"params"` (the field is `venueId`), or
  `{ from, field, missing }` for another name or message.
- **Entity:** `{ entity, key, notFound, load? }` (for example `entity: "table"`
  with `key: (request) => request.params.id`) resolves the owning venue through
  `app_resolve_venue_id`. With `load`, the row is read inside the venue's
  context and handed to the handler as `scope.entity`.
- **Custom:** `{ resolve: (request) => venueId | null, label, notFound }` (for
  example a hold's venue, or `reservationId | venueId`).
- **Access:** `"member"` (admin or venue member), `"authenticated"` (any signed-in
  caller), or `{ owner: (entity) => email }` for admin-or-owner routes.

Unauthenticated routes whose authority is not membership use sibling helpers,
which resolve the venue once and run the handler inside `runWithVenueContext`:

- `publicVenueScoped` (`src/routes/public-venue-scope.ts`) for `/public/v1/venues/:slug/*`
  and `by-slug`: the slug resolves through `app_resolve_venue_id`; an unknown slug
  is a 404 whose title/detail each route keeps via `notFound`. Checks that must
  answer before the slug lookup (per-IP hold cap, `x-session-id`) go in `before`.
- `manageTokenScoped` (`src/routes/manage-token-scope.ts`) for the manage-token
  routes: verifies the token (400/410/401), resolves the venue once, loads the
  reservation once, checks the token email (403), and hands the handler
  `{ venueId, reservation, token }`. `missing` is the route's own answer when the
  venue or reservation is gone.

Neither adds route-level `config.rateLimit`; the route keeps its own.

If a route genuinely cannot name a venue, it does not use `venueScoped`; add it
to `UNSCOPED_ROUTES` in `src/routes/venue-scope-coverage.test.ts` with a reason
(`cross-venue fan-out`, `cross-venue fan-out (admin)`, `venue-create`,
`user-scoped (/me)`, `webhook (signature-verified)`, ...).
`pending-migration` is forbidden. An admin-fan-out route keeps its own
`requireVenueAccess` guard and enters context itself with `inNamedVenueContext`
(`src/routes/named-venue.ts`).

Adding a route also needs an RLS sweep fixture: add an entry to
`FIXTURES` in `src/routes/rls-route-sweep.fixtures.ts` (or
`rls-route-sweep.fixtures-public.ts`), then run
`pnpm exec vitest run src/routes/venue-scope-coverage.test.ts` locally. It
fails if a route declares no scope and has no reason, or has no fixture, and
needs no database. The Postgres-backed sweep runs in CI's `rls-integration` job.

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
