---
stage: prd
run: feature:first-venue-self-serve
date: 2026-08-22
ux: not-applicable
ux-reason: "No new screen, state, or copy — the onboarding wizard already exists and is unchanged; the work is a server-side authorization narrowing plus test coverage. Improving the wizard's 403 copy is explicitly out of scope below."
assumptions:
  - '"First time" is defined as a STATE — the user has no venue membership — not an event. Chosen by the user over "first authentication ever" and over tracking both. Grounded in repo evidence rather than preference: nothing in the tree records a first-login event, and the trap is already gated on a state (`computeReadiness(venue=null)` → `no-venue` → `DashboardLayout.tsx:236` redirects unconditionally). The consequence is accepted deliberately: a user who deletes their last venue re-enters the bootstrap case, which is why the guest-identity and rate criteria below exist.'
  - "The authorization approach is to narrow `POST /api/v1/venues` for the no-venue case, keeping `requireAdmin` on every other venue write. Chosen by the user over granting the admin role at signup, a separate self-serve endpoint, and a redirect-only fix. This PRD records it as a scope boundary, not a design: the predicate, the route shape, and the ownership seeding are Architect's to decide."
  - 'Where the non-admin coverage runs — the daily production journey, a pre-merge run, or both — is NOT settled. `idea.md`''s success sentence implies pre-merge ("before it reaches production, not the next afternoon"), while the interview descoped the pre-merge isolated variant. Surfaced as an open question rather than resolved by picking one; the success criteria below are deliberately written so either answer satisfies them.'
---

# PRD: A user with no venues can create their first one

## Problem statement

A person authenticates for the first time, has no venues, and is force-redirected
into the onboarding wizard. They complete five steps and press **Launch Venue**.
The request is refused: `POST /api/v1/venues` requires the `admin` permission,
they do not have it, and **no self-serve path to that role exists anywhere in the
product**. Someone with Auth0 tenant access must assign
`rol_52LJ9C2KyFI7vyDZ` by hand.

The redirect that funnels them in is correct and well-tested (#3889). The gate
they hit at the end is correct in general. The product is broken only in their
combination — and nothing catches it, because the daily venue journey
authenticates as an account that already holds `admin`, and has been green for
six consecutive days while this was broken for every new user.

## Solution

An authenticated user who holds **no venue membership at all** can complete the
onboarding wizard and finish owning a working venue, with no manual identity-provider
change by anyone. Every other venue write — creating a second venue, touching
someone else's, any venue mutation — stays exactly as gated as it is today.

And the guarantee is held in place by a test that authenticates as an identity
**proven not to hold `admin`**, so the day that identity silently acquires the
role, the test fails instead of quietly testing nothing.

## Actors

- **First-time operator** — an authenticated person with zero venue memberships. Today: force-redirected into a wizard they cannot finish.
- **Established operator** — has one or more venue memberships. Today: unaffected, and must stay unaffected.
- **Platform admin** — the repo owner. Today: the manual step, opening Auth0 to grant a role per user.
- **Guest identity** — a booking-widget JWT. Authenticated, holds no venue membership, and must **never** be able to create a venue. The bootstrap case must not hand this actor a venue-minting primitive.

## User stories

1. As a **first-time operator**, I want to finish the onboarding wizard I was sent into, so that I end up owning a working venue without asking anyone for a role.
2. As a **first-time operator**, I want the venue I create to be mine, so that I can immediately do venue-scoped work on it without a second permission request.
3. As an **established operator**, I want venue creation to stay privileged, so that the fix for new users does not widen what any logged-in account can do.
4. As a **platform admin**, I want to stop hand-editing Auth0 for every signup, so that onboarding works at a volume above zero.
5. As a **platform admin**, I want a test that fails when a non-admin can no longer onboard, so that this regression is caught by CI rather than by me hitting it personally.
6. As a **platform admin**, I want that test to assert its own identity is not an admin, so that a silently granted role cannot turn a passing test into a decoration.

## Success criteria

- [ ] An authenticated identity with **zero venue memberships** completes the onboarding wizard end to end and finishes owning a venue, with no manual Auth0 change at any point.
- [ ] That user can then perform venue-scoped writes on the venue they just created.
- [ ] An identity that **already holds at least one venue membership** and lacks `admin` is still refused when creating another venue (`403`).
- [ ] A **guest identity** with zero venue memberships is still refused (`403`) — zero memberships alone is not sufficient authorization.
- [ ] The "no venue membership" determination is made **server-side from persisted data**. A request that supplies a forged body field, header, or claim asserting it cannot flip the outcome. Verifiable by a test that sends one.
- [ ] An E2E case authenticates as a **non-admin** identity and **asserts the absence of the `admin` permission before proceeding**, failing the run if that identity ever acquires it.
- [ ] That E2E case deletes any venue it creates, on pass and on failure alike.
- [ ] The existing admin venue journey still passes unchanged.
- [ ] No existing route's `preHandler` chain is weakened other than the single first-venue case.

## Out of scope

- **A pre-merge isolated environment for the venue journey.** Descoped in the interview as a separate concern with no incident behind it. See Open questions — where the new coverage runs is still undecided, but building an ephemeral environment is not this run.
- **Improving the wizard's failure copy.** The submit path renders a bare `err.message` (`useOnboardingWizard.ts:288-299`) with no admin-specific handling. Worth fixing; a different run. Once the authz change lands, the common case stops producing this error at all.
- **Granting the `admin` role to anyone, at signup or otherwise.** Explicitly rejected: `admin` gates every venue route and the system-health surfaces, so granting it to make onboarding work would be the widest possible blast radius for the narrowest possible need.
- **Venue-group / multi-tenant self-serve.** Creating a venue inside someone else's group stays privileged.
- **Migrating off the DEVELOPMENT-labelled Auth0 tenant**, and any rate limiting or paywall on venue creation.

## Open questions

- **Where does the non-admin coverage run — daily production journey, pre-merge, or both?** `idea.md`'s success sentence says "before it reaches production, not the next afternoon"; the interview descoped the pre-merge isolated variant. These conflict and the conflict is unresolved. — **repo owner**
- **Does a non-admin test identity exist in the Auth0 tenant, and is it a SPA / Regular Web App client?** ROPC returns `401 access_denied` for M2M. This lives outside the repo, so nothing in the tree can answer it. — **repo owner**
- **What is the exact predicate for "no venue membership"** — no memberships, no owned venues, or no venue-group association? These differ for an account whose only venue was deleted. — **Architect**
- **Can a guest / booking-widget JWT be distinguished from an operator JWT at the route?** The guest criterion above is unimplementable if not. — **Architect**, with `packages/auth`
- **Should a bootstrap creation be rate-limited or capped?** Under the state-based definition, deleting your last venue returns you to the bootstrap case. — **Architect**
- **What does the user actually see on the 403 today?** Depends on how the API client unwraps `ProblemDetails`; not traced. Changes how bad the current experience is, not what to build. — **whoever picks up the copy work**

## Next

`ux: not-applicable`, so the next stage is **Architect**.
