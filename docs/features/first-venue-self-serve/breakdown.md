---
stage: decompose
run: feature:first-venue-self-serve
date: 2026-08-22
assumptions:
  - "No live interview for step 4 'Review the cut' — milestone boundaries and item sizing were decided by this stage. Three milestones, ten items; rationale under *How this was cut*."
  - "No tracker export. The user did not ask for one, and the repo's autonomous `/implement-queue` claims any open `ready` issue — publishing these would race this run's own Implement stage into duplicate, conflicting PRs. The checkboxes below are the state (ADR-0026)."
  - "The rate limit (M3.1) is included rather than deferred, even though `architecture.md` makes it conditional on whether the Auth0 tenant permits open self-signup — a question that cannot be answered from this repository. Building it is the conservative branch: harmless if signup is closed, load-bearing if it is open. Deferring it would mean shipping the permissive branch of an unanswered security question."
  - "M3.2's E2E item is written to be honest about a dependency it cannot satisfy: no non-admin Auth0 identity is known to exist. The criterion therefore requires the spec to FAIL LOUDLY when credentials are absent in the environment that is supposed to have them, and to be referenced by a coverage check — never to skip silently, which is the exact shape of the `shipped ≠ run` trap this repo has hit four times."
---

# Breakdown: first-venue bootstrap

Progress lives in the checkboxes below — Implement checks items off as their
acceptance criteria are met.

Scope check: one new guard, one injected lookup, one route preHandler swap, one
in-transaction invariant, one rate limit, one E2E case, one ADR amendment. Eleven
items, three milestones. No migration.

## How this was cut

Milestone boundaries follow what is demonstrable:

- **M1** ends with the rule existing as a tested unit — including its
  fail-closed behaviour — with nothing wired to it yet. It is first because
  every later item depends on the contract it fixes, and because it is the only
  work that can be fully proven without a database.
- **M2** ends with the actual capability: an integration test drives a real
  request through the real route and a non-admin with no memberships gets a
  venue. This is the milestone that closes the incident.
- **M3** ends with the guarantee watched rather than merely true — rate-limited,
  covered by a journey that asserts its own identity, and recorded in the ADR
  that this change amends.

TDD throughout, per the repo mandate: every item's criterion names the failing
test that must exist and fail before the implementation is written.

## Milestone 1: The rule exists, in isolation, and fails closed

- [ ] **`HasAnyVenueMembership` contract** — declare the policy-owned lookup type beside `VenueMembershipLookup` in `packages/auth/src/fastify/authz.ts`.
  - Accept: the type is exported, takes `userSub: string`, returns `Promise<boolean>`, and carries a doc comment stating that a rejection must never be coerced to `false`. `pnpm --dir packages/auth typecheck` passes.
  - Blocked by: —
- [ ] **`requireVenueCreateAccess` — admit an admin without querying** — first branch of the guard factory.
  - Accept: a failing test exists first asserting an admin JWT is admitted **and the injected lookup is never called** (spy asserts zero calls), then passes. Covers PRD _"admin journey still passes"_.
  - Blocked by: `HasAnyVenueMembership` contract
- [ ] **`requireVenueCreateAccess` — admit zero-membership, refuse the rest** — remaining branches.
  - Accept: failing-first tests for all four decision-order cases — no `request.user` → 401; lookup `false` → admitted; lookup `true` → 403; and the 403 body is an ADR-002 `ProblemDetails`. Covers PRD _"≥1 membership still refused"_.
  - Blocked by: `requireVenueCreateAccess` — admit an admin without querying
- [ ] **Fail-closed on lookup rejection** — the branch that must never be convenient.
  - Accept: a failing-first test asserts that when the lookup rejects, the guard **does not admit and does not reply 403** — the rejection propagates. Explicitly asserts the caller is not admitted, so a future refactor that swallows the error breaks this test.
  - Blocked by: `requireVenueCreateAccess` — admit zero-membership, refuse the rest
- [ ] **`sub` is read only from the verified JWT** — the PRD's server-derived criterion.
  - Accept: a failing-first test sends a request whose body, query, and headers all assert a _different_ `sub`, and proves the lookup is called with the JWT's `sub` and the outcome is unchanged. Covers PRD _"determination is server-derived"_.
  - Blocked by: `requireVenueCreateAccess` — admit zero-membership, refuse the rest

## Milestone 2: A non-admin with no venues can create one

- [ ] **Membership-existence lookup + Fastify decoration** — the service-side implementation, registered beside `venueMembershipLookup`.
  - Accept: a failing-first test proves it returns `false` for a `sub` with no rows and `true` for one with a row, using the existing `@@index([userSub])`. No schema change appears in `git diff`.
  - Blocked by: `HasAnyVenueMembership` contract
- [ ] **Swap the route's preHandler** — `POST /api/v1/venues` uses `requireVenueCreateAccess`; every other venue route is untouched.
  - Accept: a failing-first integration test drives a real request as a non-admin with no memberships and gets `201`, and as a non-admin _with_ a membership gets `403`. A grep assertion (or the diff itself) shows no other route's `preHandler` list changed. Covers PRD _"no other route weakened"_.
  - Blocked by: Membership-existence lookup + Fastify decoration; `sub` is read only from the verified JWT
- [ ] **In-transaction invariant with `Serializable` isolation** — the authority, inside the transaction that already exists at `venue.ts:404-413`.
  - Accept: a failing-first test proves a non-admin whose membership appears between guard and commit is refused. The transaction declares `isolationLevel: "Serializable"`, and a serialization abort surfaces as a retryable `409` — never `500`, never silent success. The venue and its owner membership still commit together on the happy path.
  - Blocked by: Swap the route's preHandler

## Milestone 3: The guarantee is watched, not just true

- [ ] **Rate-limit the bootstrap path** — per-identity cap on venue creation, following the existing `rateLimit: { max, timeWindow }` route-option pattern.
  - Accept: a failing-first test proves the configured limit refuses the N+1th creation attempt from one identity. The chosen numbers appear in the route options, not in a helper. See the M3.1 assumption for why this is not deferred.
  - Blocked by: Swap the route's preHandler
- [ ] **Non-admin journey case that asserts its own identity** — extends the existing journey, reusing its cleanup block unchanged.
  - Accept: the spec decodes its access token and **fails the run** if `permissions` contains `admin`, before touching any venue. It is referenced by a coverage check in the same shape as `apps/rialto-web/e2e/workflow-coverage.test.ts`, so it cannot exist un-run. When the required credentials are absent it fails with an explicit message naming them — it never skips silently. Covers PRD _"E2E asserts it lacks admin"_ and _"deletes what it creates"_.
  - Blocked by: In-transaction invariant with `Serializable` isolation
- [ ] **Amend ADR-020** — record the third case in the hybrid role/membership model.
  - Accept: the ADR states the bootstrap rule, why a role grant and a separate endpoint were rejected, and the open-signup residual risk verbatim from `architecture.md`. `pnpm check-adr` passes.
  - Blocked by: In-transaction invariant with `Serializable` isolation

## Design gaps found

None. Every component in `architecture.md` appears above, and every PRD success
criterion is named by at least one acceptance criterion.

One dependency is **outside** the design rather than a gap in it: no non-admin
Auth0 identity is known to exist, and the tenant's self-signup policy is
unanswered. M3.1 builds the conservative branch so the second question cannot
silently ship its permissive answer; M3.2 is written so the first cannot
silently ship as a skipped test.

## Notes

<!-- Deviations discovered during Implement get logged here, dated. -->
