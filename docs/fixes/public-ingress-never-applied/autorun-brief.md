# Autorun brief — public-ingress-never-applied

Collected once, 2026-08-24. Source for every stage interview in this run.
Run scale: **maintenance** (`docs/fixes/public-ingress-never-applied/`).

## User-answered decisions

| Question              | Answer                                                                                                                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Release authorization | **Prepare and stop, deliver a preview.** Write `release.md` with exact steps plus a real `pulumi preview` so the diff is readable before anything touches prod. No merge, no deploy, no apply. |
| Re-entry depth        | **`re-entry: architect`** — design-touching; alternatives exist and must be weighed in `architecture.md` before code.                                                                          |
| Scope                 | **SUPERSEDED — see the revision below.** Originally "restore `/public` only", decided under a one-gate model that turned out to be wrong.                                                      |
| Tracker mirror        | **None.** Breakdown checkboxes are the only state.                                                                                                                                             |

### Revision — 2026-08-24, after the architect stage found a second gate

Both revisions were answered by the user directly; neither is an assumption.

| Question        | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Scope (revised) | **Both gates.** `/public/v1/**` is unreachable for two independent reasons and fixing either alone changes nothing observable. In scope: (a) the DigitalOcean half — narrow `ignoreChanges` enough that ingress is managed again, plus the `/public` ingress rule; (b) the Cloudflare edge half — the worker's origin-proxy branch must forward `/public` the way it already forwards `/api`. Full DO spec reconciliation stays OUT of scope (backlog seed already appended; issue #3277 already tracks it). |
| Preview carrier | **One merge authorized, narrowly.** A read-only, `workflow_dispatch`-only CI workflow that runs `pulumi preview` may be merged, because GitHub only accepts `workflow_dispatch` for files already on the default branch. It must not run `pulumi up` or deploy anything. This is the ONLY merge this run may make — the run's own Pulumi and edge-worker changes still stop unmerged under prepare-and-stop.                                                                                                 |

**Consequence for Decompose:** the two halves are separable work, but the run's
exit criteria are only met when both ship. A milestone boundary that ships the
DO half alone is a milestone at which nothing a user can observe has changed —
if you cut there, say so explicitly at the boundary.

## What is broken (sufferer's view)

The entire public, unauthenticated surface of the reservations service is
unreachable in production. Every path under `/public/v1/**` returns 404:
the booking widget (venue lookup, availability, holds, reservations),
waitlist, guest recognition, guest risk, deposit payment-intents, and the
token-based guest self-service routes (manage / confirm / unsubscribe).

A guest hitting the booking widget gets nothing. `apps/hospitality`'s
`src/hooks/useVenuePolicy.ts` swallows the failure (`catch { return null; }`),
so it degrades silently rather than erroring — no user-visible alarm, no
server-side error, nothing in Sentry.

## Reproduction evidence (measured 2026-08-24, production)

```
GET https://api.mattbutlerengineering.com/public/v1/venues/x        -> 404
GET https://api.mattbutlerengineering.com/public/v1/guests/unsubscribe -> 404
```

Body is Fastify's default route-miss, NOT an edge 404:

```json
{ "message": "Route GET:/public/v1/venues/x not found", "error": "Not Found", "statusCode": 404 }
```

Sibling authenticated route, same host, for contrast:

```
GET /api/v1/venues -> 401, with x-ratelimit-limit: 100
```

## Root cause (confirmed, three independent ways)

`infrastructure/pulumi/index.ts:245` sets `ignoreChanges: ["spec"]` on the
`digitalocean.App` resource. Pulumi therefore ignores the **entire** app
spec — ingress rules included — so no ingress change in `index.ts` can ever
reach production.

The in-repo comment explains the original intent:

> DO adds default fields (features, scope, instance_count on jobs) that
> aren't in our spec, causing a diff on every run. Each diff triggers a
> full deployment (~30min). Ignore changes until we reconcile the spec.

That reconciliation never happened.

Confirmations:

1. **PR #4511** ("fix(infra): route /public/v1 to reservations instead of
   404ing") merged at `2026-08-24T05:27:33Z` as commit `2c984392`. It adds a
   correct `{ match: { path: { prefix: "/public" } }, component: { name:
"reservations-api", preservePathPrefix: true } }` rule between `/api` and
   the `/` catch-all.
2. **`pulumi-up` run 32693610715** on that commit reported job-level
   `Deploy Infrastructure: success`, and its `up` phase ended:
   `Resources: ~ 1 updated, 15 unchanged`. The single update was an unrelated
   `auth0:index:Client mattbutlerengineering-hospitality [diff: -sso]`.
   `digitalocean:index:App mattbutlerengineering-api-app` was **unchanged**.
3. **The live DO spec has zero occurrences of the string `public`:**
   `doctl apps spec get 5dbdcf45-4053-4518-a97b-f1e2b3122a61 --format yaml | grep -c public` -> `0`.
   Its ingress rules are, in order: `/api/v1/users`->users-api,
   `/api/gen`->agent-api, `/v1/sessions`->agent-api, `/v1/orchestrate`->agent-api,
   `/v1/webhooks`->agent-api, `/api`->reservations-api, `/`->users-api.

So `/public/*` falls through the `/` catch-all to **users-api**, which has no
such routes and answers Fastify's default 404. users-api and reservations-api
produce byte-identical 404 bodies, which is why the 404 alone does not reveal
which component served it.

## Why this was invisible

- Routes have existed and been correct since `ea99cad4b` (2026-05-16) and are
  registered unconditionally in `services/reservations/src/app.ts:182-203`
  (prefix `/public/v1/venues`, plus unprefixed `publicUnsubscribeRoutes`
  whose own literal is `/public/v1/guests/unsubscribe`). Unit tests pass.
- `pulumi-up` reports success because nothing failed — it simply had nothing
  to do.
- `infrastructure/pulumi/ingress-coverage.test.ts` (added by #4511) asserts
  that every registered prefix has a matching ingress rule **in source**.
  Source rules never ship, so the test passes against a 100% dead surface.
  It is vacuous with respect to production and must be fixed by this run.

## Blast radius

- Public booking widget and every `/public/v1/venues/**` route.
- Guest self-service: manage, confirm, unsubscribe.
- Known callers in shipped bundles: `apps/hospitality` (venue policy,
  guest-risk, guests/recognize, waitlist, deposits/payment-intent,
  reservations/manage), `apps/gen`, and
  `packages/api-client/src/public-venue.ts|venues.ts|reservations.ts`.
- No authenticated `/api/v1/**` surface is affected.
- Second-order: ANY spec change made through Pulumi since `ignoreChanges`
  was introduced is also inert — env vars, instance sizes, component config.
  Scope for this run is `/public` only, but the architecture stage must state
  this explicitly because it bounds what the fix can claim.

## Solution shape (a hunch, not a design)

Narrow `ignoreChanges` from the whole `spec` to only the DO-injected fields
that caused the original diff noise, so ingress is managed again. Confirmed
present in the live spec: top-level `features`, `scope` on env entries, and
`instance_count` / `instance_size_slug` on jobs and services.

Alternatives the architecture stage must weigh and record:
narrowing by property path; reconciling the spec fully (out of scope here);
managing ingress by a different mechanism; doing nothing and routing `/public`
at the edge worker instead.

Unverified: Pulumi's `ignoreChanges` wildcard path syntax for nested arrays
(e.g. `spec.services[*].instanceCount`) has NOT been validated against this
provider version. Treat it as an open question, not a known-good.

## Success criteria

1. A `pulumi preview` exists whose diff shows the `/public` ingress rule being
   added to `digitalocean:index:App`, and that diff has been read and recorded.
2. The preview reveals no unintended spec changes beyond ingress and the
   knowingly-ignored DO defaults — or, if it does, they are enumerated in
   `release.md` as the reason the apply is held.
3. `ingress-coverage.test.ts` is no longer vacuous: it must fail if a
   registered prefix has no rule that can actually reach production.
4. `release.md` records the exact steps to apply, and nothing is applied.

## Biggest unknowns / how this dies

- The spec has been unmanaged for months; the real diff may be large and
  scary. That is precisely why release authorization is prepare-and-stop.
- `ignoreChanges` path syntax may not support the wildcards the fix needs.
- A `pulumi preview` requires the R2 state backend and provider credentials;
  if CI is the only place those exist, the preview must run there.
- The DO+Pulumi dual-deploy race (`deploy-services.yml` doctl vs `pulumi-up`)
  means any apply must not overlap a services deploy.

## Current state at brief time

- `main` carries #4511's rule in source; production does not have it.
- A `deploy-services` run (32777109557, `workflow_dispatch` on `c5f72555`)
  is IN PROGRESS, shipping #4482's 46-package dependency bump. It is a
  `doctl apps create-deployment`, which redeploys images and does NOT change
  the app spec — so it will not fix `/public`.
