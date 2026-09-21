---
id: ADR-026
title: Postgres Row-Level Security as a Venue-Scoping Backstop
status: active
date: 2026-09-13
---

# ADR-026: Postgres Row-Level Security as a Venue-Scoping Backstop

## Context

`services/reservations` enforces multi-tenant venue scoping entirely in
application code: `requireVenueAccess` (ADR-020) checks membership in a
Fastify preHandler, and every service function is trusted to add the correct
`where: { venueId }` clause to its Prisma query. That trust has a single
point of failure — a service function that omits or mis-scopes a `venueId`
filter leaks or corrupts another venue's data, and nothing below the
application layer would notice. There is no independent, second layer that
would catch this class of bug the way the database itself already prevents
(for example) writing a row that violates a foreign key.

Postgres Row-Level Security (RLS) can provide that second layer: a
`CREATE POLICY` bound to a session variable, enforced by Postgres on every
statement issued in a session, is not reachable from application code no
matter how a query is constructed (`findMany`, `$queryRaw`, a future ORM
migration). This issue is the design step for that backstop — it produces no
migration and changes no code. Issues #2–4 (blocked on this one) implement it
per-table.

This decision is written as an ADR rather than a per-service doc because it
changes how **every** future route and service function in
`services/reservations` must be written: every request handler must set the
`app.venue_id` session variable before issuing a query, or every query silently
returns zero rows. That is exactly the kind of cross-cutting, hard-to-reverse
constraint ADR-020 and ADR-008 already exist to record.

## Decision

### 1. Table list (verified against `schema.prisma`, `@@map` names — not model names)

Seven tables in `services/reservations/prisma/schema.prisma` are venue-scoped
and are the target of the RLS backstop:

| Model           | Postgres table (`@@map`) | `venue_id` column                                                   |
| --------------- | ------------------------ | ------------------------------------------------------------------- |
| `Venue`         | `venues`                 | N/A — the row's own `id` **is** the venue identifier                |
| `FloorPlan`     | `floor_plans`            | `venue_id`, `NOT NULL`                                              |
| `Table`         | `tables`                 | `venue_id`, **nullable**                                            |
| `Guest`         | `guests`                 | `venue_id`, `NOT NULL`                                              |
| `Reservation`   | `reservations`           | `venue_id`, **nullable**                                            |
| `Deposit`       | `deposits`               | **no `venue_id` column** — scoped transitively via `reservation_id` |
| `WaitlistEntry` | `waitlist_entries`       | `venue_id`, `NOT NULL`                                              |

`Deposit` needs a flag of its own: it carries no `venue_id` at all (verified —
`schema.prisma` lines ~235-260), only a unique `reservation_id` FK. Its policy
must join through `reservations` rather than compare a local column (§5).

`ReservationHold` (`reservation_holds`, `venue_id` `NOT NULL`) and
`VenueMembership` (`venue_memberships`) are also venue-scoped tables in this
schema but are **not** in the issue's seven-table list and are out of scope
for issues #2–4. Note them here so a future pass doesn't assume the backstop
is complete once the listed seven land — the deferral is real scope, not an
oversight.

### 2. The nullable-`venue_id` problem

`Table.venueId` and `Reservation.venueId` are `String? @map("venue_id")`.
A naive `USING (venue_id = current_setting('app.venue_id', true))` policy
relies on standard SQL three-valued comparison: `NULL = 'anything'` evaluates
to `NULL`, not `TRUE`, so a row with `venue_id IS NULL` **never** satisfies
`USING` for **any** session's `app.venue_id` — including a session that itself
has no venue set. This is the correct behavior and requires no special-casing
in the policy SQL: a NULL-venue row is invisible to every venue-scoped
session, by the ordinary semantics of `=`, not because of any policy authored
specifically for the NULL case.

**Decision: this is intentional default-deny, and it is not a new
restriction.** `services/reservations/src/routes/venue-access.ts`'s
`VenueIdResolver` already does `entity?.venueId ?? null`, and ADR-020's
`requireVenueAccess` decision matrix already treats an unresolvable
(`null`) `venueId` as **403**, before RLS is even in the picture. In other
words, a row with `venue_id IS NULL` already has no valid access path through
the application layer today. RLS hiding the same rows from every session is
consistent with, not a change to, existing behavior — it just makes the
guarantee hold even if a future route forgets to call `requireVenueAccess`.

**Audited call sites that can currently produce a NULL `venue_id` row**
(`grep -rn "venueId: data.venueId ?? null"` across `services/reservations/src`):
`reservation.ts` (three create/update paths) and `table.ts` (one create path)
default to `null` when the caller doesn't supply a `venueId`. None of these
call sites is reachable from a route that skips venue resolution — every
mutating route on `tables`/`reservations` runs `requireVenueAccess` or derives
`venueId` from an already-scoped parent (e.g. the table a reservation is
booked against). No route was found that depends on reading back a
NULL-`venue_id` row it just wrote. If issues #2–4 uncover one during
migration testing, that route is a latent access-control bug independent of
RLS and must be fixed, not exempted from the policy.

### 3. Cross-venue query audit

`grep -rn "findMany\|findFirst\|\$queryRaw" services/reservations/src/routes
services/reservations/src/services | grep -v test` was reviewed function by
function. Two legitimate cross-venue read paths were found; both need an
explicit escape hatch rather than being covered by the per-venue policies:

1. **`venueService.list()` / `venueGroupService.list()`**
   (`services/reservations/src/services/venue.ts`). `GET /api/v1/venues` calls
   `venueService.list()` with no venue filter when the caller is a platform
   `admin` (`services/reservations/src/routes/venues.ts` line ~410, gated by
   `requireAdmin`); `GET /api/v1/venue-groups` is `requireAdmin`-only end to
   end (line ~117). Both are admin reporting/aggregation surfaces by design —
   the whole point is to list across venues.
2. **`lapsed-guest-cron.ts`'s `buildPrismaCallbacks.getVenueIds`**
   (`services/reservations/src/services/lapsed-guest-cron.ts` line 47). A
   background interval job with no HTTP request and no authenticated user —
   it iterates every venue's `id` to run a per-venue lapse scan
   (`prisma.guest.findMany({ where: { venueId: vid, ... } })` per venue). It
   cannot set `app.venue_id` to a single value because it needs all of them,
   one at a time, in a loop with no per-request session boundary.

No other cross-venue query was found. `venueService.listForMember` (the
non-admin path) already scopes through `VenueMembership`, and every other
`findMany`/`findFirst`/`$queryRaw` reviewed filters by a `venueId` (or a FK
that resolves to one venue) already.

**Amendment (issue #5382) — `deposits.ts` was missing from this audit, and is
resolved WITHOUT a bypass.** The original audit asked "which queries read
across venues", which is why `services/reservations/src/routes/deposits.ts`
did not appear: none of its five admin routes (`POST /`, `GET /:id`,
`/:id/capture`, `/:id/refund`, `/:id/forfeit`) is a cross-venue query. They
are single-venue queries that could not _name_ their venue — gated only on
`requireAdmin` (a stateless, platform-wide role check, not venue-scoped) and
addressed only by an opaque deposit/reservation id, so the global
venue-context preHandler resolved `null` for them and `app.venue_id` was
never set. Under §4 default-deny that is not a leak but the opposite failure:
every deposit would become silently invisible to staff — a broken
capture/refund/forfeit with no error, just empty results. Found by the
`migration-reviewer` subagent while reviewing the `deposits`/`waitlist_entries`
part of this series.

Resolved by **resolving a real venue context, not by adding a third bypass
call site**: each of the five routes now resolves the owning venue through the
deposit's reservation (`resolveReservationVenueId` in
`services/reservations/src/services/deposit-venue.ts` — a
`reservation.findUnique` selecting only `venue_id`, matching the transitive
scoping the `deposit_isolation` policy itself performs in §5) and runs its
deposit work inside that context via `runWithVenueContext`
(`services/reservations/src/services/venue-context-store.ts`). An unresolvable
venue — reservation deleted, or `Reservation.venueId` NULL per §2 — **fails
closed with a 404 before any state transition or Stripe call**, rather than
proceeding venue-less. `requireAdmin` is unchanged and still gates all five
routes; this adds venue resolution beneath it, it does not replace the
authorization check.

Why option 1 (resolve) over option 2 (bypass): `app_rls_bypass` exists for
paths that legitimately need to see _every_ venue at once, which none of these
routes does. Routing an admin payment surface through `BYPASSRLS` would throw
away venue scoping on the one table family where a cross-tenant write is worst,
and would grow the standing bypass surface this ADR's own Trade-offs section
names as an ongoing maintenance burden.

**Residual, deliberately not solved by #5382:** the single lookup that
_determines_ the scope cannot itself run inside the scope it is computing — for
the four `/:id` routes that is one primary-key read of the addressed deposit,
plus the reservation's `venue_id`. This is a property of every
entity-addressed route in this service (`venueIdFromEntity` in
`services/reservations/src/routes/venue-access.ts` has the identical shape),
not something `deposits.ts` can fix alone, and it is inert today because
`FORCE ROW LEVEL SECURITY` is deliberately not set and the service's own DB
role owns these tables. It must be settled — for the whole service, not just
deposits — by whichever change finally sets `FORCE`. The same class is already
recorded for the venue-self-addressed `GET/PATCH/DELETE /api/v1/venues/:id`
family in `services/reservations/CLAUDE.md`.

**Escape hatch, not a blanket policy:** both cases will run under a dedicated
Postgres role, e.g. `app_rls_bypass`, granted `BYPASSRLS`. The service issues
`SET ROLE app_rls_bypass` immediately before the cross-venue query and `RESET
ROLE` immediately after, inside the same transaction/connection-checkout so
the elevated role can never leak onto an unrelated query on a pooled
connection. This is implemented in issues #2–4, not here; this ADR fixes the
mechanism (a named bypass role, narrowly and explicitly invoked) so all three
issues implement the same shape instead of three different ones.

### 4. Session variable design

| Aspect                     | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name                       | `app.venue_id` (Postgres custom GUC namespace convention: `app.*` for application-defined settings, avoids colliding with any built-in or extension GUC)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Type                       | `text` — venue ids are `cuid()` strings, not integers; compared with `=` against the `text`/`varchar` `venue_id` columns, no cast needed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| How it's set               | `SET LOCAL app.venue_id = '<id>'`, issued as the first statement inside the same transaction that runs the request's queries                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Why `SET LOCAL`, not `SET` | `SET` persists for the life of the **session** (i.e. the underlying Postgres connection); `SET LOCAL` is scoped to the current **transaction** and is automatically reset at `COMMIT`/`ROLLBACK`. This service's connections are pooled (Prisma's own pool, potentially fronted by PgBouncer in transaction-pooling mode in production) — a connection is reused across unrelated requests, so a plain `SET` would leak one request's venue scope into whatever request happens to reuse that connection next. `SET LOCAL` inside an explicit per-request transaction (Prisma `$transaction`) makes the venue scope exactly as long-lived as the request's own queries and no longer. |
| Behavior when unset        | `current_setting('app.venue_id', true)` — the second (`missing_ok`) argument makes an unset GUC return SQL `NULL` instead of raising an error. Every policy's `USING`/`WITH CHECK` compares a column against that `NULL`, which (per §2's three-valued-logic argument) is never `TRUE` — so an unset session variable is **default-deny**: it can see and write zero rows in any RLS-protected table, not "every venue" and not an error. This is deliberate: a code path that forgets to set `app.venue_id` fails closed (empty result / rejected write) rather than either crashing or silently exposing all venues.                                                                |

### 5. Policy shape per table

All seven policies below are `FOR ALL` (covers `SELECT`/`INSERT`/`UPDATE`/`DELETE`
in one policy) — this is a backstop against **any** cross-venue statement, not
only reads, so there's no case here where a narrower `FOR SELECT` policy is
correct. `WITH CHECK` is written identically to `USING` for every table: there
is no scenario in this domain where a session should be allowed to _read_
venue A's rows but be allowed to _write_ a row that claims to belong to venue
B (or vice versa) — tenant isolation is symmetric for reads and writes here,
so a divergent `WITH CHECK` would be an unjustified special case, not a
simplification.

```sql
-- venues: the row's own id is the venue identifier (no separate venue_id column)
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
CREATE POLICY venue_isolation ON venues
  FOR ALL
  USING (id = current_setting('app.venue_id', true))
  WITH CHECK (id = current_setting('app.venue_id', true));

-- floor_plans: venue_id NOT NULL
ALTER TABLE floor_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY floor_plan_isolation ON floor_plans
  FOR ALL
  USING (venue_id = current_setting('app.venue_id', true))
  WITH CHECK (venue_id = current_setting('app.venue_id', true));

-- tables: venue_id nullable — NULL rows are invisible to every session (§2)
ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
CREATE POLICY table_isolation ON tables
  FOR ALL
  USING (venue_id = current_setting('app.venue_id', true))
  WITH CHECK (venue_id = current_setting('app.venue_id', true));

-- guests: venue_id NOT NULL
ALTER TABLE guests ENABLE ROW LEVEL SECURITY;
CREATE POLICY guest_isolation ON guests
  FOR ALL
  USING (venue_id = current_setting('app.venue_id', true))
  WITH CHECK (venue_id = current_setting('app.venue_id', true));

-- reservations: venue_id nullable — NULL rows are invisible to every session (§2)
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY reservation_isolation ON reservations
  FOR ALL
  USING (venue_id = current_setting('app.venue_id', true))
  WITH CHECK (venue_id = current_setting('app.venue_id', true));

-- deposits: no venue_id column — scope transitively through reservations
ALTER TABLE deposits ENABLE ROW LEVEL SECURITY;
CREATE POLICY deposit_isolation ON deposits
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM reservations r
      WHERE r.id = deposits.reservation_id
        AND r.venue_id = current_setting('app.venue_id', true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM reservations r
      WHERE r.id = deposits.reservation_id
        AND r.venue_id = current_setting('app.venue_id', true)
    )
  );

-- waitlist_entries: venue_id NOT NULL
ALTER TABLE waitlist_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY waitlist_isolation ON waitlist_entries
  FOR ALL
  USING (venue_id = current_setting('app.venue_id', true))
  WITH CHECK (venue_id = current_setting('app.venue_id', true));
```

The `deposits` policy is the one table whose `USING`/`WITH CHECK` cannot be a
plain column comparison — it must join `reservations` because `deposits`
carries no `venue_id` of its own. A `Deposit` created for a `Reservation` with
`venue_id IS NULL` is therefore also invisible under this policy, consistent
with §2.

## Consequences

### Benefits

- A second, independent enforcement layer: a service function that forgets a
  `where: { venueId }` clause now fails closed at the database instead of
  leaking or corrupting cross-venue data.
- The failure mode of an unset/misconfigured session variable is empty
  results or a rejected write, never silent cross-venue exposure.
- The two identified cross-venue call sites are made explicit and auditable
  (`SET ROLE app_rls_bypass` is greppable) instead of implicit "this Prisma
  query happens not to filter."

### Trade-offs

- Every request handler in `services/reservations` must now run its queries
  inside a transaction that opens with `SET LOCAL app.venue_id = ...` — a
  request that doesn't will see zero rows on every RLS-protected table, not
  an error. Issues #2–4 must land the shared plumbing (a Fastify hook or
  Prisma middleware wrapping every request in this transaction) before or
  alongside enabling RLS on any table, or every existing route breaks at
  once.
- The `deposits` policy's `EXISTS` subquery against `reservations` on every
  statement adds a join the other six tables don't need; it is indexed
  (`deposits.reservation_id` is unique, `reservations.id` is the PK), so the
  cost is a single indexed lookup, not a scan.
- `app_rls_bypass` is a second privileged path (alongside the app's normal
  DB role) that must be provisioned, and any future write path added to it
  reopens the exact hole RLS exists to close — this is a real ongoing
  maintenance burden, not a one-time cost, and worth revisiting with a
  second reviewer whenever a new bypass call site is proposed.

## Alternatives Considered

### Enforce `WITH CHECK` more strictly than `USING` (e.g. reject any write, allow degraded reads)

**Rejected:** no route in this service has a legitimate need to read across
venues without also being one of the two audited admin/cron escape hatches
(§3), so a divergent `USING`/`WITH CHECK` would add complexity without a
corresponding use case.

### Application-level scoping only (status quo, no RLS)

**Rejected:** this is the gap this ADR exists to close — a single missed
`where: { venueId }` in any of dozens of service functions is a silent
cross-venue leak, and nothing catches it before it ships (see Context).

### Auth0/JWT-carried venue scoping enforced at the database via a Postgres extension

**Rejected:** would require the database to validate a JWT signature to
derive `app.venue_id` itself, duplicating (and potentially drifting from)
ADR-020's existing JWT/membership validation in `@mbe/auth`. Simpler and more
consistent to let the application layer (which already resolves and trusts a
`venueId` via `requireVenueAccess`) hand that single resolved value to
Postgres via `SET LOCAL`, and let RLS only re-check what the app already
decided — a backstop, not a second authority.

## See Also

- **ADR-020**: Hybrid Role/Venue Authorization — the application-layer
  membership check this backstop sits behind, and the source of the
  `requireVenueAccess` null-`venueId` → 403 precedent this ADR reuses in §2.
- **Issue #5107**: seeded this line of work.
- **Issues #2–4** (children of this one): implement the migration, the
  per-request `SET LOCAL` plumbing, and the `app_rls_bypass` escape hatch for
  the two audited cross-venue call sites, per the policy SQL in §5.
