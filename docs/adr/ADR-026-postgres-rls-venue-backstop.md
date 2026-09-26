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

> **Wrong, on both counts — see §3.2 (#5369).** `listForMember`'s membership
> filter is an application predicate, not a value of `app.venue_id`, so it is
> cross-venue for any staff user who belongs to more than one venue; and
> `GET /api/v1/reservations/me` is cross-venue for the same reason. The
> sentence above is left standing because the mistake it encodes — answering
> "does this read across venues?" from a query's `where` clause rather than
> from whether it can name one venue id — is the point of §3.2.

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

| Cross-venue read                                                       | Status                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cron's per-venue guest scan                                            | **Resolved** (#5401), and without a bypass: per-venue `set_config` (§4) on the scan's own transaction. Correct today and under `FORCE ROW LEVEL SECURITY`.                                                                                                               |
| Cron's venue-list read (`getAllVenueIds`)                              | **Resolved** (#5369) via `app_cross_venue_venues()` — see §3.1. Correct today and under FORCE, proven as a non-owner role in `routes/rls-isolation.integration.test.ts`.                                                                                                 |
| Admin `venueService.list()`                                            | **Resolved** (#5369) via the same function, with the venue-group filter passed as its one argument.                                                                                                                                                                      |
| Admin `venueGroupService.list()`                                       | **Not an RLS problem at all** — corrected here. `venue_groups` carries no RLS policy: §1's table list never included it and no migration enables it (measured against a migrated database, 2026-09-20: `relrowsecurity` is false for `venue_groups`). It needs no hatch. |
| Staff `venueService.listForMember()` and `GET /api/v1/reservations/me` | **Resolved** (#5369 PR 6) via a per-venue fan-out — see §3.2 and §3.3 item 1. Correct today and under FORCE, proven in `routes/rls-route-sweep.integration.test.ts`.                                                                                                     |

### 3.1 The cross-venue mechanism: a `SECURITY DEFINER` function plus one admitting policy

**Decision.** Cross-venue reads go through
`app_cross_venue_venues(p_venue_group_id text DEFAULT NULL)` — a
`SECURITY DEFINER` set-returning function owned by the table owner, which sets
the transaction-local marker `app.cross_venue = 'on'` inside its own body, scans
`venues`, and restores the marker before returning — admitted by exactly one
additive policy on `venues`:

```sql
CREATE POLICY venue_cross_venue_read ON "venues"
  FOR SELECT
  USING (
    current_setting('app.cross_venue', true) = 'on'
    AND pg_catalog.pg_has_role(
      current_user,
      (SELECT c.relowner FROM pg_catalog.pg_class c WHERE c.oid = 'public.venues'::regclass),
      'USAGE'
    )
  );
```

`venue_isolation` is untouched, and nothing sets `FORCE ROW LEVEL SECURITY`.
Migration: `20260920000000_add_cross_venue_read_escape_hatch`.

**Why the mechanism is the composition and not just the function.** The three
candidates this section previously listed were measured against Postgres 16.13
with a **non-superuser** table owner — the shape DO Managed Postgres gives us.
(The first run of that measurement used the image's default `postgres`
superuser and every owner-side result was worthless: a superuser bypasses RLS
unconditionally and FORCE does not apply to it. Check `rolsuper`/`rolbypassrls`
before trusting any owner-side RLS measurement.)

| Measurement (non-superuser owner, RLS enabled, 2 venues)               | FORCE absent | FORCE set  |
| ---------------------------------------------------------------------- | ------------ | ---------- |
| Owner reads the table directly, `app.venue_id` unset                   | all rows     | 0 rows     |
| Owner reads the table directly, `app.venue_id` set to one venue        | all rows     | that venue |
| Owner's `UPDATE` / `INSERT` / `DELETE` across venues                   | all succeed  | blocked    |
| Non-owner reads directly, `app.venue_id` unset / set to one venue      | 0 / 1 row    | 0 / 1 row  |
| **Plain `SECURITY DEFINER` function owned by the owner (candidate 1)** | **all rows** | **0 rows** |
| Marked function + admitting policy (this decision), owner or non-owner | all rows     | all rows   |
| Caller sets the marker itself, then reads directly — **non-owner**     | 0 rows       | 0 rows     |
| Caller sets the marker itself, then reads directly — **owner (today)** | all rows     | all rows   |
| `UPDATE` / `INSERT` / `DELETE` across venues with the marker set       | blocked      | blocked    |
| Marker still set after the function returns                            | no           | no         |

The decisive row is the fifth: **a `SECURITY DEFINER` function owned by the
table owner does not survive the FORCE flip.** Inside the definer's context
`current_user` _is_ the owner, and FORCE is precisely the flag that stops the
owner being exempt — so on its own that function reads every venue today only
through the owner-bypass this issue exists to remove. It is the same bug wearing
a function. Candidate 1 is therefore necessary (it is the only thing that can
carry a privileged marker without a role attribute) but not sufficient: it needs
a policy to admit it, and it cannot admit itself.

**Candidate 2 (a bare `app.cross_venue` GUC set by application code) is
rejected as the whole mechanism and kept only as the policy's predicate.** As a
standalone hatch it has no named database object to grant, revoke or audit, no
bounded projection, and it stays set for the rest of the caller's transaction
rather than for one statement. Two further measured constraints shaped how the
function carries it:

- A non-superuser owner **cannot** name a custom GUC in `CREATE FUNCTION`'s
  `SET` clause — `ERROR: permission denied to set parameter "app.cross_venue"`.
  So Postgres cannot be asked to set-and-restore the marker around the function
  body for us (that needs superuser, or `GRANT SET ON PARAMETER`, which also
  needs superuser). The function sets it in its body and restores it before
  returning; on error the (sub)transaction abort unwinds the GUC stack, so no
  exception handler is required.
- The function must be `LANGUAGE plpgsql`, not `LANGUAGE sql`: a SQL-language
  set-returning function can be inlined into the calling query, which would
  hoist the `venues` scan out of the context that sets the marker.

**Candidate 3 (a separately-provisioned `BYPASSRLS` role) stays rejected** on
the measurement already recorded above — unprovisionable on this platform at
all, not merely inconvenient.

**What the second conjunct buys, and what it does not.** The `pg_has_role`
clause asks whether the reader is (a member of) the table's real owner, read
from `pg_class.relowner` rather than from a literal role name, so it follows the
owner across deployments (`doadmin` in production, a scratch role in CI) and
across a restore instead of silently going false on a rename. Today the service
connects **as** the owner, so that conjunct is satisfied by every query and the
marker alone gates the hatch — which is **no weaker than the
`SET ROLE app_rls_bypass` marker this ADR originally specified**, since any
application code could equally have issued that. Nor is it a boundary today: with
one role owning the schema, every escape hatch is reachable from application
code, which is exactly why #5369's other half (moving the service onto a
non-owner role) is the real fix. What the conjunct does is make that fix pay off
with no further migration — measured, a non-owner that sets the marker itself
still reads zero rows, while the same role calling the function reads every
venue. `EXECUTE` is revoked from `PUBLIC` for the same reason: it becomes the
gate the moment the app is not the owner, and until then it costs nothing.

**Writes stay out of the hatch by construction.** The admitting policy is
`FOR SELECT`, so `venue_isolation` remains the only policy governing writes and
no cross-venue `INSERT`/`UPDATE`/`DELETE` is reachable through the marker
(measured above). That is the property that keeps this from reopening the hole
the ADR exists to close, and it is why the hatch returns rows rather than
granting a mode.

### 3.2 Two more cross-venue reads this audit missed (resolved, #5369 PR 6)

The sweep accompanying §3.1 found two reads with the same irreducible shape as
the admin venue list, both of which this section previously waved past:

1. **`venueService.listForMember()`** (`services/venue.ts`, reached from
   `routes/venues.ts`'s `GET /api/v1/venues` for a non-admin). §3 above says it
   "already scopes through `VenueMembership`" — true, and irrelevant to RLS: a
   membership filter is an application predicate, not a value of
   `app.venue_id`. A staff user belonging to two venues has no single venue id
   that makes the query correct, so under FORCE it returns **zero rows** and the
   venue picker goes blank.
2. **`GET /api/v1/reservations/me`** (`routes/reservations.ts` →
   `reservationService.listByUserId`). A diner's own reservations span whatever
   venues they booked at; same shape, same zero-rows outcome.

Neither was fixed here — they were reported rather than patched, each getting
its own reviewed change (both closed by #5369 PR 6 — see §3.3 item 1 for how).
They sit in the table above so nothing claims this audit was closed on the
strength of §3.1 alone.

**The general lesson is #5382's, in the other direction:** "does this query read
across venues" was asked of the query but answered from the route's intent.
`listForMember` reads like a scoped list because it has a `where` clause; it is
cross-venue because the clause it has is not the one RLS enforces. The question
that actually separates the classes is _can this query name exactly one venue
id_ — and a query can have a perfectly good filter and still answer no.

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

> **Measured, and it means "Resolved" above is only half true (2026-09-21,
> #5369).** That residual is not a theoretical remainder — it is load-bearing:
> `GET /api/v1/deposits/:id` **still answers 404 under FORCE**, confirmed by
> injecting it against the real app on a migrated database (§3.3's table).
> `resolveReservationVenueId`'s own `reservation.findUnique` is an unscoped read
> of an RLS table, so it resolves `null` and the route fails closed _before_
> `runWithVenueContext` is ever entered. Read this whole section as resolving the
> **authorization** gap for those five routes — which it does — and as clearing
> **none** of them for the flip. A reader who takes "Resolved by giving the
> routes a real venue context" at face value and moves the deposits family out of
> §3.3's blocker list would be wrong; that is precisely the propagation path this
> ADR has already corrected itself on twice.

### 3.3 What the `FORCE ROW LEVEL SECURITY` flip still needs

§3.1 makes the flip _decidable_; it does not make it safe on its own, and no
migration in this repo sets FORCE. The flip is gated on these, all identified by
the #5369 sweep and none of them fixed by it:

1. **Closed (#5369 PR 6).** The two newly-open cross-venue reads in §3.2
   (`listForMember`, `GET /api/v1/reservations/me`) used to return zero rows
   under FORCE — a single delegate call filtered by an application predicate
   (`memberships: { some: { userSub } } }` / `{ userId }`) has no single venue
   to name. Fixed by fanning out one venue at a time instead of one
   cross-venue query: `listForMember` resolves the member's venue ids from
   `venue_memberships` (`services/venue-membership.ts`'s sibling helper,
   `getMemberVenueIds` in `services/member-venues.ts` — no RLS policy on that
   table at all, so this first step needs no escape hatch), then reads each
   venue inside `runWithVenueContext`, admitted by `venues`' own
   `venue_isolation` policy (the row's own `id` equals `app.venue_id`) — a
   correctly-scoped single-venue read, not a cross-venue one.
   `GET /api/v1/reservations/me` resolves the set of venues a diner's
   reservations span via `app_reservation_venue_ids_for_user()` (the
   `SECURITY DEFINER` function added in PR 3,
   `prisma/migrations/20260925010000_add_rls_venue_resolution_functions`),
   then reads each venue's reservations for that user inside its own
   `runWithVenueContext` and merges, preserving the pre-existing
   `date desc, startTime desc` ordering. Pagination moves from the database
   into application code in both cases, since the fan-out can no longer
   express it as one query. Proved against a real, migrated, FORCE'd database
   as a non-superuser owner role in `routes/rls-route-sweep.integration.test.ts`
   (the item-1 fixtures for both routes).
2. **Closed (#5369 PR 5).** Every entity-addressed route used to fail under
   FORCE: `venueIdFromEntity` (`routes/venue-access.ts`) resolved a route's
   venue by loading the addressed entity, itself an unscoped read of an RLS
   table, so it resolved `null` and `requireVenueAccess` answered **403** on
   every `/:id` route of `tables`, `guests`, `floor-plans`, `waitlist` and
   `reservations`. `venueIdFromEntity` now takes an entity kind and resolves
   the venue through the `SECURITY DEFINER` `app_resolve_venue_id` (PR 3) via
   the shared `resolveVenueId` helper (`services/resolve-venue.ts`, a
   parameterized `$queryRaw` on the raw client; `null` always means deny).
   Handlers then load or mutate the entity inside that venue's context
   (`loadInVenueContext`), so their own reads are scoped too.
   `POST /api/v1/holds/:id/confirm` resolves its venue the same way. Proved
   against a real, migrated, FORCE'd database as a non-superuser owner role
   in `routes/rls-route-sweep.integration.test.ts` (the item-2 fixtures now
   assert admin and member-own-venue success and member-other-venue denial).
3. **Closed (#5369 PR 8).** Every `/public/v1/venues/:slug/*` route (plus the
   authenticated `GET /api/v1/venues/by-slug/:slug`, which shared the same
   unscoped read) used to open with
   `venueService.getBySlug`/`getPublicConfigBySlug`/`getPolicyBySlug` — a
   `venues` read addressed by slug, which the global resolver cannot turn into
   an `app.venue_id`. Each route now resolves the slug first, through the same
   `SECURITY DEFINER` `app_resolve_venue_id` (PR 3) via
   `resolveVenueId("venue_slug", slug, group?)`, then runs the rest of the
   request — the venue re-fetch, availability generation, hold create/read/
   confirm, reservation creation, guest recognition/risk lookups, the waitlist
   join, and the deposit PaymentIntent flow — inside `runWithVenueContext`. A
   NULL resolution answers the route's pre-existing 404, never a fall-through.
   Proved against a real, migrated, FORCE'd database as a non-superuser owner
   role in `routes/rls-route-sweep.integration.test.ts` (the item-3 fixtures
   now assert the correct venue is served by slug and an unknown or
   wrong-venue slug is denied or 404'd, split across `rls-route-sweep.fixtures.ts`'s
   `by-slug` entry and `rls-route-sweep.fixtures-public.ts`'s public-funnel
   entries).
4. **Closed (#5369 PR 8).** The token-addressed guest surfaces
   (`/public/v1/reservations/manage`, `/confirm`,
   `/public/v1/guests/unsubscribe`) each resolved their target row by an
   opaque id or token with no venue in the request —
   `reservationService.getById`/`guestService.markUnsubscribed` read an RLS
   table unscoped. Each now resolves its venue first, via
   `resolveVenueId("reservation", id)` / `resolveVenueId("guest", id)`, then
   runs the read or mutation inside `runWithVenueContext`; a NULL resolution
   answers the route's existing 404 (`public-unsubscribe.ts` gained a
   `GUEST_NOT_FOUND` extension for its case, since it previously fell through
   to a manually-caught 500). `requireManageToken`'s own venue-scoped
   ownership check uses `runWithVenueContext`, not `enterVenueContext` — the
   latter's AsyncLocalStorage `.enterWith()` resolves one full request late
   when called after an `await` inside a preHandler (`venue-context-store.ts`'s
   own doc comment), a landmine that would have silently corrupted every other
   route sharing the same global preHandler chain. The **Stripe webhook**'s
   `depositService.getByPaymentIntentId` lookup (`onPaymentIntentSucceeded`,
   `onPaymentIntentAmountCapturableUpdated`, `onPaymentIntentCanceled`,
   `onChargeRefunded`, all funneled through the shared `holdIfPending`/
   `withDepositVenueContext` helper) resolves via
   `resolveVenueId("payment_intent", paymentIntentId)` the same way; a NULL
   resolution is the handler's pre-existing no-deposit no-op, so Stripe never
   sees a 500 and never retries an event no deposit exists for — the helper
   also logs a warning naming the PaymentIntent id and event type on this
   branch, so a payload that never resolves is observable without becoming a 500. No deposit state-machine logic changed — only the scope the lookups
   run inside. Proved against a real, migrated, FORCE'd database as a
   non-superuser owner role in `routes/rls-route-sweep.integration.test.ts`
   (the item-4 fixtures assert the correct reservation/guest is reached, the
   deposit transitions `pending` → `held` for its own PaymentIntent id, and a
   gone token or an unknown PaymentIntent id is denied, 404'd, or silently
   no-op'd — the fixture does not exercise a PaymentIntent id belonging to
   another venue's deposit).
5. **Closed (#5369 PR 7).** The venue-self-addressed family
   (`GET/PATCH/DELETE /api/v1/venues/:id`, `/:id/table-statuses`) — the
   global preHandler (`resolveGlobalVenueId` in `app.ts`) only reads a
   `venueId` KEY off the query/body/params, and these routes address the
   venue by its own `:id` instead, so `app.venue_id` was never set for them.
   Fixed the same way item 2 was: `resolveVenueId("venue", id)` /
   `loadInVenueContext` (`routes/venue-access.ts`) — `venues`' own
   `venue_isolation` policy is keyed on the row's own `id`, so `"venue"` is
   the correct kind. `PATCH /:id`'s venueGroupId-reassignment pre-check (its
   own unscoped `venueService.getById`, #5515-adjacent) now runs inside the
   same resolved context too. Proved against a real, migrated,
   FORCE'd database as a non-superuser owner role in
   `routes/rls-route-sweep.integration.test.ts`.
6. **Closed (#5369 PR 7).** The deposits admin family
   (`GET /api/v1/deposits?reservationId=`, `GET /api/v1/deposits/:id` and its
   `/capture`, `/refund`, `/forfeit` siblings, and `POST /api/v1/deposits`).
   Listed here explicitly, not folded into item 2, because §3.2 records these
   five routes as **resolved** by #5382 and a reader could reasonably move
   them off this list on that basis — they were not off it: measured 404
   under FORCE (§3.3's table below), because `resolveReservationVenueId`
   (`services/deposit-venue.ts`) and the `/:id` family's own
   scope-determining read were themselves unscoped reads of RLS-scoped
   tables (`reservations` / `deposits`) — exactly item 2's trap, just not yet
   closed here when §3.2 landed. Both now resolve through the same
   `SECURITY DEFINER` `app_resolve_venue_id` function
   (`resolveVenueId`/`loadInVenueContext`) — the `"deposit"` kind joins to
   the owning reservation inside the resolver's own definer body, so the
   venue resolves without a separate unscoped Prisma read. Proved against a
   real, migrated, FORCE'd database in
   `routes/rls-route-sweep.integration.test.ts`; capture/refund/forfeit are
   proven only up to the point Stripe is required (this environment
   provisions no Stripe key) — the assertion is that the venue resolves (no
   403/404/tripwire), not a full 2xx, the same shape the waitlist `/notify`
   fixture uses for its own unprovisioned dependency.
7. **The in-process job worker** (`services/reservations/src/services/job-worker.ts`,
   wired in `app.ts`). Its `BOOKING_REMINDER` / `DAY_OF_REMINDER` handlers call
   `reservationService.getById` and `venueService.getById`, and `WAITLIST_EXPIRY`
   reaches `waitlistNotifier.handleExpiry` — all from a BullMQ consumer with no
   HTTP request, so `getCurrentVenueId()` is `null` and the per-call auto-wrap has
   nothing to set. Under FORCE both finder calls return `null` and
   `deliverReminder` **returns early without throwing**: reminders stop being
   delivered, with no error, no retry and no log line. This is the one item the
   original sweep missed entirely — it was found by probing the wiring in `app.ts`
   during #5369, not by §3's `findMany|findFirst|$queryRaw` grep, which cannot see
   a background caller that reaches those tables through a service function. It is
   also the only item on this list whose failure is **silent in production rather
   than visible to a user**, which makes it the one most likely to survive a
   post-flip smoke test. The cron in the same service is _not_ affected (it sets
   per-venue context, §3's table); nothing generalises from that to the worker.
   **Both halves are now closed:** `deliverReminder` (`job-worker.ts`) runs its
   whole body inside `runWithVenueContext(payload.venueId, …)`, exactly the
   decided fix below, and `handleWaitlistExpiryJob` does the same for
   `WAITLIST_EXPIRY` / `waitlistNotifier.handleExpiry` — see the split
   immediately below for how its payload-compatibility wrinkle was handled.
8. **Closed (#5369 PR 7).** `POST /api/v1/venues` — added here rather than
   left as a fixtures-only `"item-8"` label (its name in
   `routes/rls-route-sweep.fixtures.ts` and the #5369 PR 3 migration-review
   carry-forward that first found it): the INSERT has no PRIOR venue context
   to satisfy its own `WITH CHECK`, because the row's own `id` — what
   `venue_isolation` checks — does not exist until this statement creates
   it. `venueService.create()`'s writes went through an unwrapped
   `prisma.$transaction(...)` ($-prefixed methods pass through
   `withVenueScopedQueries`'s proxy unscoped by design, §3.3 item 2's own
   note), so the app-level unscoped-query tripwire never saw this write — it
   reached real Postgres with no `app.venue_id` set and failed the FORCE'd
   `WITH CHECK` at the DB layer as a plain `PrismaClientKnownRequestError`,
   not the app's own tripwire error. Fixed by generating the id up front
   (`randomUUID()`, overriding the schema's client-side `@default(cuid())`)
   and calling `setVenueContext(tx, id)` as the first statement of the SAME
   transaction that inserts the row — never `app.cross_venue` (that marker
   is for reads that cannot name a single venue; this INSERT names exactly
   one, the venue it is creating). Proved against a real, migrated, FORCE'd
   database in `routes/rls-route-sweep.integration.test.ts`.

Items 2–6 share one shape, and it is the shape the deposits fix (#5382) solved
for five routes: the lookup that _determines_ the venue cannot run inside the
scope it is computing. Whatever closes them generally — a resolver that reads
through a `SECURITY DEFINER` projection, or a scope-free lookup table of
`(entity id → venue id)` — is a larger change than this ADR, and it must land
before FORCE, not after.

**Item 7 splits into two shapes, and only one of them is new.** The two reminder
handlers are _not_ lookups trapped inside their own scope: `ReminderPayload`
(`packages/jobs/src/job-types.ts`) declares `reservationId` and `venueId` as
required fields, so the venue is already in hand at dispatch and is simply never
set. Those take the cron's answer — `runWithVenueContext(payload.venueId, …)`
around the handler body, per §4, no hatch — and are blockers only because nothing
does that today, not because anything is undecided about how.

**Closed.** `deliverReminder` now wraps its body in exactly that call, proved by
a unit test that asserts `getCurrentVenueId()` — read from inside the handler,
via the finder mocks — equals `payload.venueId` for both `BOOKING_REMINDER` and
`DAY_OF_REMINDER` (`services/reservations/src/services/job-worker.test.ts`); a
test that only asserted the finders were called would not have distinguished
this from the pre-fix behavior.

`WAITLIST_EXPIRY` was the other shape and was genuinely harder: `WaitlistExpiryPayload`
carried only `waitlistEntryId`, with `venueId` declared **optional and enqueued by
nothing**, and `expireEntry(waitlistEntryId)` derived the venue by reading the
RLS-protected `waitlist_entries` row. That was items 2–6's trapped-lookup shape
wearing a job payload.

**Closed.** The cheapest fix — populate `venueId` at enqueue time, where the
venue is known — is what shipped, at the job's one enqueue site
(`waitlist-notifier.ts`'s `notifyTableReady`, called from `routes/waitlist.ts`'s
`PUT /:id/notify` and from `handleExpiry`'s own next-guest re-notify).
`WaitlistExpiryPayload.venueId` stays **optional on the type**, not required,
because that enqueue-time change is a payload-compatibility change across
in-flight BullMQ jobs: a job already sitting in Redis when this deployed was
serialized under the old shape and BullMQ never re-serializes a queued
payload. `job-worker.ts`'s `handleWaitlistExpiryJob` branches on
`payload.venueId` — present, it wraps `deps.handleWaitlistExpiry` in
`runWithVenueContext(payload.venueId, …)`, exactly `deliverReminder`'s
mechanism above; absent (the legacy in-flight case), it falls back to the
pre-fix behavior and logs a warning naming the job and entry id, rather than
inventing a cross-venue lookup. That legacy branch is safe to delete once one
WAITLIST_EXPIRY TTL (`FIVE_MINUTES_MS`, `waitlist-notifier.ts`) has elapsed
post-deploy — every job enqueued before the fix will have drained by then.
Proved by `services/reservations/src/services/job-worker.test.ts` (the
venue-context-carrying case, the enqueue-site case in
`waitlist-notifier.test.ts`, and the legacy no-`venueId` case) and by
`services/reservations/src/routes/rls-route-sweep.integration.test.ts`'s
non-HTTP `WAITLIST_EXPIRY` case against a real, migrated database.

**Measured, not predicted (2026-09-21, #5369).** The list above was derived by
reading code. It has since been run: the real `buildApp()` was booted against a
migrated scratch database owned by a plain non-superuser role (production's
shape), and 17 representative routes were injected with FORCE off, then on. **8
of the 17 break**, and the delta is exactly items 2–5 — no more, and no fewer:

| Route                                                                                    | FORCE absent | FORCE set                           |
| ---------------------------------------------------------------------------------------- | ------------ | ----------------------------------- |
| `GET /public/v1/venues/:slug`                                                            | 200          | **404** `No venue found with slug`  |
| `GET /public/v1/venues/:slug/availability`                                               | 200          | **404** (same, before availability) |
| `GET /api/v1/tables/:id`                                                                 | 200          | **404** `Table not found`           |
| `GET /api/v1/guests/:id`                                                                 | 200          | **404** `Guest not found`           |
| `GET /api/v1/floor-plans/:id`                                                            | 200          | **404** `Floor plan not found`      |
| `GET /api/v1/reservations/:id`                                                           | 200          | **404** `Reservation not found`     |
| `GET /api/v1/venues/:id`                                                                 | 200          | **404** `Venue not found`           |
| `GET /api/v1/deposits/:id`                                                               | 200          | **404**                             |
| `…?venueId=` list routes (tables, guests, floor-plans, reservations, waitlist, briefing) | 200          | 200 (unchanged)                     |
| `GET /api/v1/venues` (admin cross-venue list)                                            | 200 rows=2   | 200 rows=2 (the §3.1 hatch holds)   |

Two things this measurement settles that the code read did not. First, the
damage is **404, not 403**: the bypass-identity used was a platform admin, and
`requireVenueAccess` short-circuits for admins _before_ calling the resolver, so
the failure surfaces in the handler's own read rather than in the guard — a
non-admin staff user gets the 403 item 2 predicts, an admin gets a 404. Both are
broken; they are not the same symptom, and a smoke test run as an admin will
never see the 403. Second, **`GET /api/v1/deposits/:id` is still in the broken
set**, even though §3.2 records the deposits family as resolved by #5382. That is
the "Residual, deliberately not solved by #5382" paragraph coming true verbatim:
`resolveReservationVenueId`'s own `reservation.findUnique` is an unscoped read of
an RLS table, so it returns `null` under FORCE and the route fails closed before
its venue context is ever entered. Treat §3.2 as resolving the _authorization_
gap for those five routes, not as clearing them for the flip.

**Consequence for the flip:** `FORCE ROW LEVEL SECURITY` is not a migration that
can land on its own. The public booking funnel begins with
`GET /public/v1/venues/:slug`, so the first row of that table is a total outage
of guest-facing booking. Nothing in the repo prevented such a migration from
being written, which is why `services/reservations/src/services/rls-force-coverage.ts`
now fails CI on an RLS-enabled table that is neither forced nor listed as a
tracked gap, and `services/reservations/src/routes/rls-owner-enforcement.integration.test.ts`
proves the enable-vs-force semantics against the deployed role rather than a
probe role. Neither flips the switch.

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
  for this turned out to be unprovisionable here (§3), and the hatch that
  replaced it (§3.1) narrows the burden rather than removing it: it is
  `SELECT`-only, so no write path can be added to it without a new policy, and
  it returns rows from one named function rather than granting a mode — but it
  is still a second privileged path, and `grep -rn app_cross_venue_venues` is
  the review surface for it.

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
- **Issue #5369**: the app connecting as the table owner, which made the whole
  backstop inert. Its first half — a cross-venue mechanism that does not depend
  on owner-bypass — is §3.1; its sweep produced §3.2 and §3.3. Still open under
  it: moving the service onto a non-owner role, and the FORCE flip itself.
