---
stage: architect
run: feature:first-venue-self-serve
date: 2026-08-22
ux: skipped — "No new screen, state, or copy — the onboarding wizard already exists and is unchanged; the work is a server-side authorization narrowing plus test coverage. Improving the wizard's 403 copy is explicitly out of scope."
assumptions:
  - 'The PRD''s guest-identity criterion is satisfied structurally rather than by new code, because the premise behind it turned out to be wrong. Guests never hold an Auth0 JWT: `/public/v1/*` routes authenticate with an HMAC-signed opaque manage token (`generateManageToken`, `public-reservations.ts:16`) and never reach `requireAuth`. The comment at `packages/auth/src/fastify/authz.ts:24` claiming "booking-widget guest JWTs carry no operator permission, so they are rejected here" describes a rejection that cannot occur, because such a JWT is never issued. Recorded rather than silently relied on — the real residual risk is stated below and is larger.'
  - "Whether the guard's rule is safe depends on a fact outside this repository: whether the Auth0 tenant permits open self-signup. Nothing in the tree configures or records it. The design is written so that the answer changes one route's rate limit rather than its shape, but a definitive yes/no is still required before this ships. Surfaced, not assumed."
---

# Architecture: first-venue bootstrap

## Approach

Add one authorization rule in the place the codebase already keeps
authorization rules, and enforce its invariant in the place that owns the
data.

`POST /api/v1/venues` swaps `requireAdmin` for a new
`requireVenueCreateAccess` preHandler: platform admins are allowed as they are
today, and **an authenticated identity holding no venue membership at all** is
allowed to create their first. Everything else is refused. Membership is read
server-side per request through an injected lookup — the same seam ADR-020
already uses for `requireVenueAccess`, so the shared auth package never learns
what a `PrismaClient` is.

The preHandler alone is not sufficient, and this is the part worth getting
right: two concurrent requests from the same new identity would both observe
zero memberships and both be admitted. So the guard is the cheap gate, and the
**authority is a re-check inside `venueService.create`'s transaction** — the
same place that already seeds the creator as owner. The rule lives with the
data that proves it.

The alternative shape considered was a separate `POST /venues/bootstrap` route
with `requireAdmin` left untouched. It loses in _Decisions_ below: two routes
with one body schema is a drift generator, and it moves the rule out of the
guard layer where every sibling rule lives.

## Components

### `requireVenueCreateAccess` (packages/auth)

- Responsibility: owns the single rule "who may create a venue" — admin, or no
  existing membership. Nothing else decides this.
- Collaborators: `hasPermission` (stateless role read), an injected
  `HasAnyVenueMembership` lookup, `createProblemDetails` for the refusal.
- Deletion test: if it vanished, the rule would reappear inline in the route
  handler and in every future venue-creating caller. It survives.

### `hasAnyVenueMembership` implementation (services/reservations)

- Responsibility: answers, from persisted data, whether one Auth0 `sub` holds
  any venue membership. Owns the query and its index; owns nothing about
  policy.
- Collaborators: `PrismaClient`, registered onto the Fastify instance beside
  the existing `venueMembershipLookup`.

### `venueService.create` (services/reservations, existing — extended)

- Responsibility: owns the bootstrap invariant. Inside the same transaction
  that creates the venue and seeds the owner membership, re-asserts that a
  non-admin caller still holds zero memberships, and aborts otherwise.
- Collaborators: `PrismaClient` transaction, the venue and `VenueMembership`
  entities.

### Non-admin journey case (apps/hospitality/e2e)

- Responsibility: proves the guarantee holds against a real deployment, and —
  equally — proves its own identity is not an admin, so a silently granted role
  fails the run instead of hiding behind it.
- Collaborators: the existing journey harness, its cleanup block, a second
  Auth0 identity.

## Data model

**No new entities, no migration.** `VenueMembership` already exists and already
records the creator as owner (`#3069`).

Access patterns this design actually requires:

| Interaction             | Query                                                   | Consistency                                          |
| ----------------------- | ------------------------------------------------------- | ---------------------------------------------------- |
| Guard admits or refuses | existence of any `VenueMembership` for one `sub`        | Best-effort. May be stale; it is not the authority.  |
| Create commits          | same existence check, **inside** the create transaction | **Strong, read-your-writes.** This is the authority. |
| Every other venue write | unchanged                                               | unchanged                                            |

The existence check is already indexed: `VenueMembership` declares
`@@index([userSub])` alongside `@@unique([userSub, venueId])`
(`services/reservations/prisma/schema.prisma:305-318`). No schema change.

**The transaction already exists.** `venueService.create` runs a
`prisma.$transaction` whenever `ownerSub` is supplied
(`services/reservations/src/services/venue.ts:404-413`), creating the venue and
the owner membership together. The re-check is the first statement inside that
existing callback, not a new transaction.

**Isolation is load-bearing, and the default is not enough.** Under Prisma's
default `READ COMMITTED`, two genuinely concurrent bootstraps each open a
transaction, each re-check sees zero memberships (neither sees the other's
uncommitted insert), and both commit. The in-transaction re-check closes the
_sequential_ race and narrows the concurrent one, but does not eliminate it.
Closing it requires `isolationLevel: "Serializable"` on this transaction — cheap
here, because the path runs at most once per account and never on a hot route.
The cost is that a serialization abort becomes a real failure mode the caller
must translate (see contracts below); the alternative is accepting that a
brand-new account can, under a deliberate race, end up owning two venues.

The invariant — _a non-admin ends a successful create holding exactly one
membership, and could only have started with zero_ — is owned by the create
transaction. The preHandler learns about it only as a cheap early refusal.

## Interfaces & contracts

### `HasAnyVenueMembership` (policy-owned, service-implemented)

```ts
export type HasAnyVenueMembership = (userSub: string) => Promise<boolean>;
```

- **Input:** the Auth0 `sub` from a verified JWT. Never a client-supplied
  field — the guard reads `request.user.raw.sub` and accepts nothing from the
  body, query, or headers.
- **Output:** `true` when at least one membership row exists.
- **Failure modes:** a rejected promise **propagates** and surfaces as a 500. It
  is never caught and coerced to `false`. Coercing to `false` would mean a
  database outage silently grants every authenticated identity permission to
  mint venues — fail-open on the one path where failing open is worst.
- **Ordering:** assumes `requireAuth` ran first, matching every existing guard.
- **Cost:** one indexed existence query per venue-create attempt. Not on any hot
  path.

### `requireVenueCreateAccess(hasAnyVenueMembership)`

- **Input:** a Fastify request whose `user` is set.
- **Output:** admits, or replies and halts.
- **Decision order** (first match wins, and the order is load-bearing — the
  stateless check must precede the query so admins cost no I/O):
  1. no `request.user` → `401`
  2. `hasPermission(user, "admin")` → **admit**, no query
  3. lookup returns `true` (already has a venue) → `403 "Admin role required to create additional venues"`
  4. lookup returns `false` → **admit** (bootstrap)
- **Failure modes:** lookup rejection propagates (see above). The `403` message
  deliberately does not reveal whether the caller has memberships beyond what
  they already know about themselves.

### `venueService.create(body, userSub, { isAdmin })` — extended

- **Input:** gains the caller's admin status, so the transaction can re-apply
  the rule without re-reading the JWT.
- **Output:** unchanged on success.
- **Failure modes:** a non-admin whose membership count is non-zero at commit
  time gets the transaction aborted and the request refused `403`. Under
  `Serializable`, a concurrent bootstrap pair produces a serialization abort on
  one of them (Postgres `40001`); that must surface as a retryable `409`, never
  as a `500` and never as a silent success. Existing duplicate-slug handling
  (`400`) is unchanged. Retrying is safe in every case — nothing partial is left
  behind, because both the check and the writes are inside one transaction.

### Non-admin journey identity assertion

- **Input:** the access token obtained by the journey's non-admin login.
- **Output:** proceeds, or fails the run before touching any venue.
- **Failure modes:** if the decoded `permissions` claim contains `admin`, the
  test **fails immediately** with a message saying the identity is no longer a
  valid non-admin fixture. This is the criterion that stops the new test
  decaying into the decoration the current one is.

## Stack & dependencies

- **No new dependencies.** The guard is ~20 lines beside `requireVenueAccess`.
- **`@fastify/rate-limit`** — already in use on public routes
  (`rateLimit: { max, timeWindow }`). If the tenant permits open signup, the
  bootstrap route gets a per-identity limit; this is a config line, not a design
  change.
- **Prisma** — existing client, existing table, no migration.

## Decisions & alternatives

- **One guard on the existing route** over **a separate `POST /venues/bootstrap`** — two routes sharing one body schema drift apart, and it moves the rule out of the layer where every sibling authorization rule lives.
- **Re-check inside the create transaction** over **trusting the preHandler** — without it, two concurrent requests from one new identity both observe zero memberships and both succeed. The guard cannot enforce an invariant it reads outside the transaction that establishes it.
- **`Serializable` isolation on the bootstrap transaction** over **accepting the `READ COMMITTED` race** — the default lets a deliberate concurrent pair both commit. Serializable costs one new retryable failure mode on a path that runs at most once per account; the alternative silently tolerates a double-create. Flag for Decompose: if the added `409` handling is judged not worth it, record that as an accepted risk rather than dropping the isolation line unnoticed.
- **`HasAnyVenueMembership` returning a boolean** over **returning a count** — the caller needs one bit; a count would expose a number no rule consumes. Capping creation rate is the rate limiter's job, not the guard's.
- **Fail-closed on lookup error (propagate to 500)** over **treating an error as "no memberships"** — the convenient coercion turns a database outage into open venue minting.
- **Extend `venueService.create` with `isAdmin`** over **re-reading the JWT inside the service** — policy must not reach back into transport. The caller already knows.
- **Guard reads `sub` from the verified JWT only** over **accepting any request-supplied identifier** — this is the PRD's server-derived criterion, and it is satisfied by construction rather than by validation.

## Residual risk, stated plainly

The rule is "authenticated **and** holding no membership." If the Auth0 tenant
permits open self-signup, then in practice the first half is satisfiable by
anyone on the internet, and venue creation becomes effectively unauthenticated
— once per identity, but identities would be free. The rate limiter bounds the
blast radius; it does not change the character of it.

This cannot be settled from the repository. It is the one question that must be
answered before this ships, and the answer decides whether a rate limit is
belt-and-braces or the actual control.

Related and smaller: the state-based definition of "first time" means a user who
deletes their last venue re-enters the bootstrap case. That is a deliberate,
recorded consequence of the PRD's definition, not an oversight.

## Requirement traceability

| PRD criterion                                     | Where it lives                                                                |
| ------------------------------------------------- | ----------------------------------------------------------------------------- |
| Zero-membership user completes wizard, owns venue | `requireVenueCreateAccess` case 4 + existing owner seeding                    |
| Can then do venue-scoped writes                   | unchanged `requireVenueAccess` — the seeded membership already satisfies it   |
| User with ≥1 membership still refused             | `requireVenueCreateAccess` case 3                                             |
| Guest identity still refused                      | structural — guests use `/public/v1/*` HMAC tokens, never reach `requireAuth` |
| Determination is server-derived                   | `HasAnyVenueMembership` input contract                                        |
| E2E asserts it lacks `admin`                      | journey identity assertion                                                    |
| E2E deletes what it creates                       | existing journey cleanup block, unchanged                                     |
| Admin journey still passes                        | `requireVenueCreateAccess` case 2 is `requireAdmin`'s behaviour               |
| No other route weakened                           | only `POST /venues`' preHandler list changes                                  |

## ADRs

**One recommended, not yet written.** This adds a third case to ADR-020's
hybrid role/membership model, and it meets all three bars: hard to reverse
(once new users onboard through it, tightening breaks signup), surprising
without context (a reader finding one venue route that admits non-admins will
assume a mistake), and a real trade-off (narrow bootstrap vs. role grant vs.
separate endpoint, all three genuinely considered). Recommend it be written
during Decompose as an amendment to ADR-020 rather than a standalone ADR.

## Next

Next stage is **Decompose**.
