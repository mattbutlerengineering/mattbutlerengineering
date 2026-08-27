---
stage: idea
run: feature:first-venue-self-serve
date: 2026-08-22
---

# Idea: A first-time user can create their own first venue

## Problem

> "Creating a venue failed because I was not an admin. I want E2E to catch
> this issue."

A person signs up, authenticates for the first time, and is immediately
redirected into the venue-onboarding wizard because they have no venues. They
answer five steps' worth of questions — name, timezone, currency, operating
hours, reservation defaults — press **Launch Venue**, and the request is
rejected. `POST /api/v1/venues` is guarded by `requireAdmin`, they do not have
the admin role, and there is no way for them to get it.

The product walked them into a room and locked the door behind them.

Two distinct failures are stacked here, and it is worth keeping them apart:

1. **The capability gap.** A first-time authenticated user cannot create a
   venue, and no self-serve path to the admin role exists anywhere in the
   codebase. The role is assigned by hand in Auth0. So the product has no
   working self-serve onboarding — not a slow one, not an awkward one, none.
2. **The blindness.** Nothing catches this. The daily venue journey does the
   full create-and-delete against production and has been green for six
   consecutive days, because it authenticates as an account that already holds
   the admin role. A test that only ever runs as an admin cannot see a wall
   that only non-admins hit.

The second failure is why the first one was found by a person rather than by
CI.

## Who has it

**Every genuinely new user of the hospitality app.** Not "new users" as a
market segment — the literal first authenticated session of any account that
doesn't already have a venue. That includes the repo owner, which is how this
surfaced: he hit it himself.

**How they cope today:** they cannot. There is no workaround available to the
user. Someone with Auth0 tenant access must open the dashboard and assign the
`admin` role (`rol_52LJ9C2KyFI7vyDZ`) to that user by hand, after which the
wizard works. A product whose first-run experience requires the vendor to edit
an identity provider is not self-serve at any volume above zero.

Note the shape of the trap: the redirect that forces a zero-venue account to
`/onboarding` (#3889) is itself correct and well-tested. It is only wrong in
combination with a gate the redirect knows nothing about.

## Why now

The owner hit it personally. That is the trigger, and it is worth stating
plainly rather than dressing up as a strategic realization — the failure has
presumably been latent since `requireAdmin` was introduced (#3069 / #3101,
scoping venues and Admin to the owning user) and nobody noticed, because
everyone who ever exercised the flow already had the role.

Two aggravating factors make the timing real rather than incidental:

- **The safety net runs after the fact, and only as an admin.** The venue
  journey runs daily at 14:00 UTC against production. Even when it fails,
  that is up to 24 hours after a merge — and it cannot fail for this cause at
  all, because of the role it authenticates with.
- **PRs auto-merge on green CI.** The gap between "CI is green" and "a new
  user can actually onboard" is not covered by anything.

## Evidence

Documented, in-repo, not anecdote:

- **The owner's own failed venue creation.** First-hand, and the direct
  trigger for this run. Anecdote in the strict sense — one person, no counter
  — but the mechanism it points at is verified below, which is what makes it
  more than a story.
- **`POST /venues` is admin-gated.** `services/reservations/src/routes/venues.ts:534`
  declares `preHandler: [requireAuth, requireAdmin]`. `requireAdmin`
  (`packages/auth/src/fastify/authz.ts:28`) rejects with
  `403 "Admin role required"` when the JWT lacks the `admin` permission.
- **No self-serve route to the admin role exists.** A search across
  `services/`, `packages/auth/`, `scripts/` and `.github/workflows/` for
  role-assignment or admin-granting logic returns nothing that a user could
  trigger. The role is manual Auth0 configuration (turned on 2026-08-13; RBAC
  was not previously enabled at all).
- **Zero-venue accounts are force-redirected into the wizard.** `#3889`, with
  a dedicated E2E test asserting the redirect happens without a chrome flash.
  The funnel into the dead end is deliberate and guarded; the dead end is not.
- **The existing journey is structurally blind to it.**
  `apps/hospitality/e2e/journeys/venue-journey.spec.ts` walks the real wizard
  against production and deletes the venue afterwards, but authenticates via
  `E2E_AUTH_EMAIL` — an account holding the admin role. Six consecutive green
  runs (2026-08-17 → 2026-08-22) while the flow was broken for new users is
  the evidence that green means less here than it appears to.
- **The failure is not loud when it happens.** The wizard's submit path
  (`useOnboardingWizard.ts:288-299`) sets the error banner to a bare
  `err.message`. There is no admin-specific handling, so whatever the user
  sees on the fifth step is generic API-failure copy, not an explanation.

**Not yet evidence, and deliberately not claimed:** how many real people have
hit this. The app's user base is small enough that the honest answer may be
"one, the owner."

## Solution hunch

A hunch, not a design — the shape is deliberately left for PRD and Architect.

The gate is probably right in general and wrong in exactly one case: **the
first venue of an account that has none.** Creating a _second_ venue, or
creating one inside somebody else's venue group, is a legitimately
privileged action. Creating your own first one is the act of becoming a
customer.

So the likely shape is a **bootstrap path**: an authenticated user with no
venue membership can create exactly one venue and becomes its owner/admin as
a consequence, after which the normal `requireAdmin` / `requireVenueAccess`
rules apply unchanged. The `POST /venues` handler already seeds the creator as
a member, so the ownership half of that may largely exist.

The obvious alternative — drop `requireAdmin` from `POST /venues` — is almost
certainly wrong and worth naming so it gets rejected explicitly rather than
drifted into: it would let any authenticated identity, including
booking-widget guest JWTs, mint venues without limit.

**On the test half:** the coverage gap is not fixed by writing a new test from
scratch. The existing journey already does the hard parts (real auth, real
wizard, real create, cleanup that survives failure). What it lacks is a second
identity without the admin role. The unit of work is closer to "a
non-admin account and a second journey case" than to "an E2E test for venue
setup" — the framing this run started from.

The pre-merge/isolated-environment question raised during the interview was
explicitly **descoped**: it is a separate concern, and the role gap is the one
with an incident behind it.

## Success in one sentence

A brand-new authenticated user with no venues can complete the onboarding
wizard and end up with a working venue they own — and if that ever stops being
true, a test fails before it reaches production, not the next afternoon.

## Unknowns & risks

- **The chosen fix is an authorization change, which is the highest-blast-radius
  kind.** `#3069` and `#3101` added this gate deliberately. Anything that
  loosens it risks re-opening what those closed. The bootstrap case must be
  provably narrow — _no venue membership at all_, not merely _not an admin_ —
  and that narrowness is the whole safety argument.
- **"First time" needs a precise definition, and the obvious ones differ.**
  No venue memberships? No venues owned? Never authenticated before? An
  account whose only venue was deleted looks identical to a brand-new one at
  the database level. Getting this wrong either re-locks real users out or
  hands a venue-minting primitive to anyone who deletes their last venue.
- **The E2E fix needs a second Auth0 identity, and the tenant is unusual.**
  Production runs against a DEVELOPMENT-labelled Auth0 tenant, and the ROPC
  grant requires a SPA or Regular Web App client (M2M returns
  `401 access_denied`). A non-admin test account is more configuration than it
  sounds, and it lives outside the repo — so nothing in the tree records
  whether it is set up correctly.
- **A non-admin journey case that runs against production will create real
  venues as a non-admin.** Cleanup already survives failure and a sweep
  exists, but `#4155` is the precedent for cleanup itself breaking: a
  foreign-key violation stranded a synthetic venue in the production database
  that the sweep could not clear either. A new path through the same teardown
  deserves suspicion.
- **The likeliest way this dies quietly:** the authz change ships, the journey
  goes green, and nobody notices that the new case authenticates with an
  account that has _silently acquired_ the admin role — through a tenant edit,
  a default-role setting, or becoming a venue owner. The test would keep
  passing while testing nothing, exactly as the current one does. Whatever
  form the fix takes, the non-admin-ness of the test identity has to be
  asserted, not assumed.
- **Unknown: what the user actually sees today.** The error banner renders a
  raw `err.message`; whether that surfaces "Admin role required" or something
  generic depends on how the API client unwraps `ProblemDetails`. Not traced
  in this stage, and it changes how bad the current experience is.
