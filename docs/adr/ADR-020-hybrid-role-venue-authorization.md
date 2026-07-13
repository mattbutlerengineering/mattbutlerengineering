---
id: ADR-020
title: Hybrid Role/Venue Authorization
status: active
date: 2026-07-05
---

# ADR-020: Hybrid Role/Venue Authorization

## Context

Every staff route in `services/reservations` (`/api/v1/guests`, `/reservations`,
`/venues`, `/tables`, `/waitlist`, `/floor-plans`, `/briefing`) was
`requireAuth`-only — authentication with no role or tenant scoping. The
booking-widget guest flow mints a credential from the **same** Auth0 pool via
`POST /api/v1/reservations` (`optionalAuth`), so any signed-in guest could reach
every staff list/CRUD route: dump every venue's guest PII, mutate any record,
and fire win-back emails (issue #3101).

Three divergent admin-gate shapes had also drifted apart
(`services/reservations/src/routes/deposits.ts`, `services/users/src/routes/users.ts`,
`services/agent/src/routes/sessions.ts`), each re-deriving "is this an admin?"
locally.

Two authorization models were viable:

- **Auth0 custom claims only** — role _and_ venue membership carried in the JWT.
  Stateless, but venue grants cannot be revoked without re-issuing the token: a
  removed staffer keeps access until their token expires — a stale-access hole,
  and precisely the PII exposure this work closes.
- **Server-side membership only** — every check (including coarse role) hits the
  database, taxing simple role checks with per-request I/O.

## Decision

Adopt a **hybrid** convention: coarse role in the JWT (stateless), fine-grained
venue membership resolved server-side (DB) per request. Two shared preHandlers
land in `@mbe/auth/fastify`:

### `requireAdmin` — coarse role, stateless

- **Which claim carries the role:** the Auth0 **`permissions`** RBAC claim on
  the access token (the array already populated by Auth0's RBAC add-on and read
  by `hasPermission`). Reusing this claim keeps a _single_ admin notion across
  `requireAdmin`, `requireOwnershipOrAdmin`, and the test bypass — no second
  convention.
- **Valid operator role values:** `admin` (platform administrator) and `staff`
  (venue operator). `requireAdmin` requires `admin`. Coarse `staff` alone grants
  nothing on its own — venue access is decided by membership (below), so a staff
  role is never a substitute for a membership row.
- **How booking-widget guest JWTs are distinguished from operator JWTs:** guest
  credentials are issued **without** any operator `permissions` entry and hold
  **no venue-membership row**. Operators carry `admin`/`staff` permissions and/or
  membership rows. A booking-widget guest therefore fails `requireAdmin` (no
  `admin`) and fails `requireVenueAccess` (no membership) — closing the gap.

### `requireVenueAccess` — fine-grained membership, per request

- A **factory** taking (1) an injected membership lookup
  `(userSub, venueId) => Promise<boolean>` and (2) a per-route `VenueIdResolver`
  that extracts the target `venueId` from the request (query, body, route param,
  or a resource → venue lookup). The shared package cannot own a service's
  `PrismaClient`, so `services/reservations` injects a Prisma-backed lookup
  (`createVenueMembershipLookup`) wired through a Fastify decorator.
- Decision matrix (assumes `requireAuth` ran first): missing user → 401;
  platform `admin` → allow (skip lookup); unresolvable `venueId` → 403 (never
  leaking resource existence); membership present → allow; absent → 403.
- **Revocation rationale:** membership lives in a server-side `VenueMembership`
  table (`user_sub ↔ venue_id ↔ role`) keyed to the Auth0 `sub` and is queried
  **per request**. Deleting a membership row denies access on the very next
  call — **instant revocation**, without waiting for a token refresh. This is
  the property pure-JWT claims cannot provide and the direct fix for the PII
  exposure.

### Consolidation

`deposits.ts`'s local `requireAdmin` is deleted in favor of the shared one.
Every listed reservations staff route now carries `requireAdmin` and/or
`requireVenueAccess`; the booking-widget **public** paths (`/public/v1/...`) and
the `optionalAuth` `POST /api/v1/reservations` create path are unchanged, as is
the guest-owner self-service route `GET /api/v1/reservations/me`.

## Consequences

### Benefits

- The cross-tenant PII/mutation hole is closed: a signed-in booking-widget guest
  gets 403 on every staff route; an operator scoped to venue-group A gets 403 on
  a venue in group B.
- Coarse role checks stay stateless (no I/O); only venue scoping costs a query.
- Venue grants are revocable immediately — critical for offboarding staff.
- One admin notion, one venue-access guard, shared across services.

### Trade-offs

- Venue-scoped routes incur one membership `count` per request (indexed on
  `(user_sub, venue_id)`); `admin` short-circuits it.
- `:id`-addressed routes resolve the owning venue from the resource (an extra
  read in the preHandler) so a venue member — not only a platform admin — can
  manage their own venue's resources.

## Alternatives Considered

### Auth0 custom claims only (role + venue in the JWT)

**Rejected:** cannot revoke venue access without re-issuing the token — the
stale-access hole this work exists to close.

### Server-side membership for everything (including role)

**Rejected:** taxes every coarse role check with per-request database I/O for no
revocation benefit (platform-admin status changes rarely and safely rides token
lifetime).

## See Also

- **ADR-003**: Auth Architecture — OIDC/JWKS foundation these guards build on.
- **ADR-010**: Service Authentication — service-to-service auth context.
- **ADR-002 / ADR-008**: RFC 7807 error format returned by both guards.
- **Issue #3101**: the HITL decision recorded here.
- **Issue #3114**: consolidates the remaining local admin gates
  (`services/users/src/routes/users.ts`, `services/agent/src/routes/sessions.ts`)
  onto these shared preHandlers — deferred, out of scope for #3101.
