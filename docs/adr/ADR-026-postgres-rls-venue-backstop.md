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
2. **`lapsed-guest-cron.ts`'s venue loop**
   (`services/reservations/src/services/lapsed-guest-cron.ts`). A background
   interval job with no HTTP request and no authenticated user — it reads
   every venue's `id` (`getAllVenueIds`), then runs a per-venue lapse scan
   for each (`findGuestsForVenue`). These are two different problems, and
   only one of them is genuinely cross-venue:
   - The **per-venue guest scan** is not cross-venue at all. It already knows
     which venue it is scanning, so it needs no escape hatch: it opens its
     own transaction and sets `app.venue_id` to that venue as the first
     statement, exactly like the request-path call sites that manage their
     own transaction boundary (`book-slot.ts`, `waitlist.ts`). Resolved in
     issue #5401 this way, not with a bypass role.
   - The **venue-list read** is irreducibly cross-venue: `venues`' policy is
     keyed on each row's own `id` (§5), and this query exists to discover
     those ids, so no value of `app.venue_id` makes it correct.

No other cross-venue query was found. `venueService.listForMember` (the
non-admin path) already scopes through `VenueMembership`, and every other
`findMany`/`findFirst`/`$queryRaw` reviewed filters by a `venueId` (or a FK
that resolves to one venue) already.

**Superseded — the `app_rls_bypass` role this ADR originally specified is not
implementable on this deployment.** The plan was a dedicated Postgres role
granted `BYPASSRLS`, entered via `SET LOCAL ROLE` inside the same
transaction as the cross-venue query. It cannot be provisioned here:
Postgres permits the `BYPASSRLS` attribute to be set only by a superuser or
by another role that already holds `BYPASSRLS` — `CREATEROLE` is explicitly
not sufficient — and DigitalOcean Managed Postgres grants no true superuser,
including to the `doadmin` role this service's migrations run as. Measured
directly against Postgres 16.13 with a non-superuser `CREATEROLE` role
(2026-09-20, while reworking PR #5409): that role creates a plain role fine,
and `CREATE ROLE app_rls_bypass NOLOGIN BYPASSRLS` fails with `permission
denied to create role` / `Only roles with the BYPASSRLS attribute may create
roles with the BYPASSRLS attribute`. A migration attempting it would not
degrade quietly — it would fail the `db-migrate` deploy outright.

**Where each case stands, therefore:**

| Cross-venue read                                                 | Status                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cron's per-venue guest scan                                      | **Resolved** (#5401), and without a bypass: per-venue `set_config` (§4) on the scan's own transaction. Correct today and under `FORCE ROW LEVEL SECURITY`.                                                                                                                                                                                                                              |
| Cron's venue-list read (`getAllVenueIds`)                        | **OPEN PREREQUISITE.** Works today only because Postgres skips RLS for a table's owner and this service connects as the role that owns `venues`; no table sets `FORCE ROW LEVEL SECURITY`. Returns zero rows — silently turning the cron into a no-op — as soon as either of those changes (#5369). Pinned by a real-Postgres assertion in `lapsed-guest-cron.rls.integration.test.ts`. |
| Admin `venueService.list()` / `venueGroupService.list()` (above) | **OPEN PREREQUISITE**, for the same reason and with the same owner-bypass dependency.                                                                                                                                                                                                                                                                                                   |

Both open cases need a mechanism this ADR does not yet specify, decided
together with whichever change removes owner-bypass — candidates include a
`SECURITY DEFINER` function owned by the table owner (no role attribute
required), a policy predicate that admits a second GUC such as
`app.cross_venue = on`, or a separately-provisioned role on a platform that
permits `BYPASSRLS`. Nothing should claim the audit is closed until one is
chosen: the two reads above are the remaining blockers to forcing RLS.

**Addendum (issue #5382) — a separate class this audit's question did not
reach: single-venue queries that could not _name_ their venue.** Everything
above answers "which queries read across venues". `services/reservations/src/routes/deposits.ts`
answers it with "none of them" — and was still broken, which is why it does
not appear in the list. Its five admin routes (`POST /`, `GET /:id`,
`/:id/capture`, `/:id/refund`, `/:id/forfeit`) each address exactly one
venue's data, but were gated only on `requireAdmin` (a stateless,
platform-wide role check, not venue-scoped) and addressed only by an opaque
deposit/reservation id — no `venueId` in the query, body, or params. The
global venue-context preHandler therefore resolved `null` for all five and
`app.venue_id` was never set. Under §4 that is default-deny, so the failure
mode is not a leak but its opposite: every deposit becomes invisible to
staff once `FORCE ROW LEVEL SECURITY` lands — capture/refund/forfeit
silently broken, no error, just empty results. Found by the
`migration-reviewer` subagent while reviewing the `deposits`/`waitlist_entries`
part of this series.

**This is not a third cross-venue path, and it does not reopen the two
above.** "No other cross-venue query was found" remains true as written, and
the two OPEN PREREQUISITE rows in the table are unchanged — neither is
blocked or unblocked by this addendum. The lesson is about the audit's
_question_, not its answer: "does this query read across venues" and "can
this query state which venue it reads" are different questions, and only the
first was asked. A route can pass the first and fail the second.

Resolved by giving the routes a real venue context: each resolves the owning
venue through the deposit's reservation (`resolveReservationVenueId` in
`services/reservations/src/services/deposit-venue.ts` — a
`reservation.findUnique` selecting only `venue_id`, matching the transitive
scoping the `deposit_isolation` policy itself performs in §5, since
`deposits` carries no `venue_id` column of its own per §1) and runs its
deposit work inside that context via `runWithVenueContext`
(`services/reservations/src/services/venue-context-store.ts`). An
unresolvable venue — reservation deleted, or `Reservation.venueId` NULL per
§2 — **fails closed with a 404 before any state transition or Stripe call**,
rather than proceeding venue-less. `requireAdmin` is unchanged and still
gates all five routes; this adds venue resolution beneath it, it does not
replace the authorization check.

No escape hatch was needed or used, and none was available: per the
superseded-bypass finding above, `app_rls_bypass` is not implementable on
this deployment at all. Even had it been, it would have been the wrong
instrument here — a bypass exists for reads that must see _every_ venue at
once, which none of these routes does, and routing an admin payment surface
through it would discard venue scoping on the table family where a
cross-tenant write is worst. These routes are the same shape as the cron's
per-venue guest scan: a single known venue, resolved and set, no bypass.

**Residual, deliberately not solved by #5382:** the single lookup that
_determines_ the scope cannot itself run inside the scope it is computing —
for the four `/:id` routes that is one primary-key read of the addressed
deposit, plus the reservation's `venue_id`. This is a property of every
entity-addressed route in this service (`venueIdFromEntity` in
`services/reservations/src/routes/venue-access.ts` has the identical shape),
not something `deposits.ts` can fix alone, and it is inert today for the same
owner-bypass reason the table above records. It must be settled — for the
whole service, not just deposits — by whichever change finally removes
owner-bypass or sets `FORCE`, alongside the two open cross-venue cases. The
same class is already recorded for the venue-self-addressed
`GET/PATCH/DELETE /api/v1/venues/:id` family in
`services/reservations/CLAUDE.md`.

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
- The identified cross-venue call sites are made explicit and auditable — each
  one is named in §3 with its current status — instead of implicit "this
  Prisma query happens not to filter." (The originally-planned
  `SET ROLE app_rls_bypass` marker is not available; see §3.)

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
- Any cross-venue escape hatch is a second privileged path alongside the
  app's normal DB role, and any future write path added to it reopens the
  exact hole RLS exists to close — a real ongoing maintenance burden, not a
  one-time cost, and worth revisiting with a second reviewer whenever a new
  bypass call site is proposed. The `app_rls_bypass` role originally planned
  for this turned out to be unprovisionable here (§3), so the two remaining
  cross-venue reads currently depend on owner-bypass instead — which is the
  same burden, just unnamed, and is why §3 tracks them as open prerequisites
  rather than as a solved escape hatch.

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
- **Issues #2–4** (children of this one): implement the migration and the
  per-request `SET LOCAL` plumbing, per the policy SQL in §5. The third part —
  an `app_rls_bypass` escape hatch for the audited cross-venue call sites —
  was not implementable as specified; see §3 for what replaced it and what
  remains open.
- **Issue #5401**: the lapsed-guest cron's per-venue scan, resolved with
  per-venue `set_config` rather than a bypass role.
- **Issue #5369**: the app connecting as the table owner — the dependency the
  two remaining cross-venue reads in §3 currently rest on.
