---
stage: capture
run: maintenance:public-ingress-never-applied
date: 2026-08-24
re-entry: architect
assumptions:
  - "The backlog seed for full spec reconciliation was NOT appended to `docs/backlog.md`. The capture skill names this stage as the producer for a consciously deferred defect, and the user's scope decision explicitly defers it — but this stage was scoped read-only on every file but `defect.md`, so the seed text is recorded in Notes as an outstanding action for whichever stage next opens the run's branch."
  - "No backlog seed was claimed as this run's origin: `docs/backlog.md` (51 lines, read 2026-08-24) contains no seed matching ingress, `/public`, `ignoreChanges`, or spec reconciliation. Origin is the direct report captured in `autorun-brief.md`."
---

# Defect: Pulumi ignores the entire DO app spec, so the `/public` ingress rule never reached production

Origin: direct report, `docs/fixes/public-ingress-never-applied/autorun-brief.md`
(2026-08-24). No tracker mirror — breakdown checkboxes are the only state.

All evidence below was re-measured in this session on 2026-08-24 against live
production and against `origin/main` at `e6491b000`. The local checkout was
stale at `0f34b4848` (2026-08-23); every source citation uses `git show
origin/main:<path>`, not the working tree.

## Defect

**Expected:** the public, unauthenticated surface of `services/reservations` is
reachable in production — the booking widget (venue lookup, availability, holds,
reservations, guest recognition, guest risk, waitlist, deposit payment-intents)
and the token-based guest self-service routes (manage, confirm, cancel, modify,
unsubscribe), all registered under `/public/v1/**`.

**Observed:** every path under `/public/v1/**` returns 404 in production. The
whole surface is unreachable and has been since it shipped.

The failure is silent in both directions. Server-side there is no error: a route
miss is a normal 404. Client-side `apps/hospitality`'s
`src/hooks/useVenuePolicy.ts:37-39` swallows it —

```ts
      } catch {
        return null;
      }
```

— so a guest hitting the booking widget gets a degraded page rather than an
error, and nothing reaches Sentry.

## Reproduction / Evidence

**1. Production returns 404 on the public surface** (re-run 2026-08-24):

```
$ curl -s -w "HTTP %{http_code}" https://api.mattbutlerengineering.com/public/v1/venues/x
HTTP 404
{"message":"Route GET:/public/v1/venues/x not found","error":"Not Found","statusCode":404}

$ curl -s -w "HTTP %{http_code}" https://api.mattbutlerengineering.com/public/v1/guests/unsubscribe
HTTP 404
{"message":"Route GET:/public/v1/guests/unsubscribe not found","error":"Not Found","statusCode":404}
```

That body is Fastify's default route-miss, not an edge 404 — the request reached
an origin service, which had no such route.

**2. A sibling authenticated route on the same host answers normally**, so the
host, TLS, and edge path are all fine:

```
$ curl -s -D- https://api.mattbutlerengineering.com/api/v1/venues
HTTP 401
x-ratelimit-limit: 100
{"type":"about:blank","title":"Unauthorized","status":401,"detail":"Missing or invalid authorization header"}
```

**3. The live DO app spec has no `/public` rule at all** (re-run 2026-08-24):

```
$ doctl apps spec get 5dbdcf45-4053-4518-a97b-f1e2b3122a61 --format yaml | grep -c public
0
```

Its ingress rules, in order: `/api/v1/users`→users-api, `/api/gen`→agent-api,
`/v1/sessions`→agent-api, `/v1/orchestrate`→agent-api, `/v1/webhooks`→agent-api,
`/api`→reservations-api, `/`→users-api. So `/public/*` falls through the `/`
catch-all to **users-api**, which has no such routes.

**4. The routes exist and are registered unconditionally** —
`services/reservations/src/app.ts:181-203` on `origin/main` registers eight
prefixed `/public/v1/venues` route groups plus the unprefixed
`publicUnsubscribeRoutes`, `manageReservationRoutes`, `confirmAttendanceRoutes`,
`cancelReservationRoutes`, and `modifyReservationRoutes`. Unit tests pass. The
code is correct; it is simply not addressable.

**5. The correct rule is in source and has been since PR #4511.**
`git log -1 2c984392` → `fix(infra): route /public/v1 to reservations instead of
404ing (#4511)`, `2026-08-23 22:27:33 -0700` (= `2026-08-24T05:27:33Z`).
`infrastructure/pulumi/index.ts:191-194` on `origin/main` carries
`{ match: { path: { prefix: "/public" } }, component: { name:
"reservations-api", preservePathPrefix: true } }`, correctly ordered between
`/api` and the `/` catch-all.

**6. The Pulumi run on that commit succeeded and changed nothing.**
`gh run view 32693610715` → `conclusion: success`, `headSha
2c984392da08a1e03f853d77de7952a3de7b2f6f`, job `Deploy Infrastructure: success`,
created `2026-08-24T05:27:36Z`. Its `up` phase ended `Resources: ~ 1 updated, 15
unchanged` — the single update being an unrelated `auth0:index:Client
mattbutlerengineering-hospitality [diff: -sso]`.
`digitalocean:index:App mattbutlerengineering-api-app` was **unchanged**.

This is the reproduction the regression test must close over: source rule present,
Pulumi green, production spec without it.

## Root cause (confirmed, not a hypothesis)

`infrastructure/pulumi/index.ts:245` on `origin/main`:

```ts
  {
    customTimeouts: { create: "15m", update: "15m" },
    // DO adds default fields (features, scope, instance_count on jobs) that
    // aren't in our spec, causing a diff on every run. Each diff triggers a
    // full deployment (~30min). Ignore changes until we reconcile the spec.
    ignoreChanges: ["spec"],
  }
```

`ignoreChanges: ["spec"]` tells Pulumi to ignore the **entire** app spec —
ingress rules included. No ingress change written in `index.ts` can ever reach
production. The comment states the intent (suppress DO-injected default-field
noise); the reconciliation it defers never happened.

Evidence 3, 5, and 6 above are three independent confirmations: the rule is in
source, Pulumi ran green on the commit that added it, and the live spec does not
have it. Nothing here is inferred.

The DO-injected fields the comment blames are all present in the live spec:
top-level `features: [buildpack-stack=ubuntu-22]`, 39 `scope:` keys, 6
`instance_count`, 6 `instance_size_slug`. That is the noise any narrowing has to
absorb — but **what to narrow to is not established**; see Notes.

## Blast radius

**Dead in production since the routes shipped** (`ea99cad4b`, 2026-05-16):

- The entire public booking widget — every `/public/v1/venues/**` route:
  venue lookup, availability, holds, reservations, guest recognition, guest
  risk, waitlist, deposit payment-intents.
- Guest self-service: manage, confirm, cancel, modify, unsubscribe.

**Confirmed callers on `origin/main`** (`git grep -l "/public/v1"`):
`apps/hospitality` (`src/hooks/useVenuePolicy.ts`, booking-widget components,
`src/pages/ManageReservationPage.tsx`), `packages/api-client`
(`src/public-venue.ts`, `src/venues.ts`, `src/reservations.ts`), and
`packages/notifications/src/resend-adapter.ts:120`, which builds
`${manageBaseUrl}/public/v1/guests/unsubscribe?token=…` into outgoing guest
email.

**Correction — that last caller is latent, not live.** An earlier draft of this
brief claimed every unsubscribe link already delivered to a guest points at a 404. Measured against the live spec, that is not supported: the deployed
reservations component has neither `RESEND_API_KEY` nor `MANAGE_BASE_URL`
(`doctl apps spec get … | grep -E 'RESEND|MANAGE_BASE_URL'` returns nothing;
only `UNSUBSCRIBE_TOKEN_SECRET` is set), and the adapter no-ops on send when
`resend` is null. No guest email is being sent, so no unsubscribe link has ever
been delivered. This becomes a live defect the moment Resend is configured —
which is a reason to fix ingress before enabling email, not evidence of
present harm.

**Not affected:** no authenticated `/api/v1/**` route. The 401 in evidence 2
is the control.

**Second-order (bounds what this fix may claim):** _any_ spec change made
through Pulumi since `ignoreChanges: ["spec"]` was introduced is equally inert —
env vars, instance sizes, component config, not just ingress. This run's scope
is `/public` only, so the run must not claim the spec is managed again in
general. The architecture stage has to state this boundary explicitly.

## Ruled out

- **An edge 404.** The body is Fastify's default route-miss shape, not the edge
  worker's. The request reached a DO component.
- **Missing or misregistered routes.** They are registered unconditionally at
  `app.ts:181-203` and covered by passing unit tests (evidence 4).
- **A failed or skipped Pulumi deploy.** Run 32693610715 is job-level
  `success` and its `up` phase ran to completion (evidence 6). It reports
  success _because_ nothing failed — it had nothing to do.
- **The in-progress `deploy-services` run fixing it.** Run 32777109557
  (`workflow_dispatch` on `c5f72555`, shipping #4482's 46-package dependency
  bump) is a `doctl apps create-deployment`: it redeploys images and does not
  change the app spec. It is unrelated to this defect and out of its scope.
- **Reading the 404 to identify the serving component.** users-api and
  reservations-api emit byte-identical 404 bodies, so the response alone cannot
  distinguish them. The live spec (evidence 3) is what proves users-api served
  it.

## Notes

**CORRECTION — there are TWO gates in series, and this brief measured only one.**
Found at the architect stage, verified independently 2026-08-24. All reproduction
evidence above was taken against `api.mattbutlerengineering.com`. **No live browser
caller uses that host.** `.github/workflows/deploy-static.yml:179` builds the
hospitality bundle with `VITE_API_URL: https://mattbutlerengineering.com`, and the
Cloudflare edge worker's origin-proxy branch matches only `/api/`
(`infrastructure/worker/edge-router.js:143`):

```
$ curl https://mattbutlerengineering.com/public/v1/venues/x
HTTP 200  ct=text/html  size=7130      <- the marketing site; never reaches DigitalOcean

$ curl https://mattbutlerengineering.com/api/v1/venues
HTTP 401  ct=application/json          <- control: /api/* does proxy
```

So `/public/v1/**` is unreachable for two independent reasons: the edge worker
never forwards it, AND the DO ingress has no rule for it. **Fixing `ignoreChanges`
and the DO ingress alone changes nothing a user can observe** — the request still
dies at the edge. Exit criteria 1-4 below were written against the DO gate only and
are satisfiable by a fix that leaves the booking widget just as dead; treat them as
necessary, not sufficient. The breakdown must cover both gates or consciously drop
the edge half with that consequence stated.

**`apps/gen` is not a caller — correction to the brief.** The autorun brief
lists `apps/gen` among known callers in shipped bundles. Measured on
`origin/main`, no file under `apps/gen/src/**` references `/public/v1` or any
public-route helper; it depends on `@mbe/api-client` but imports only
`ApiClient`, `ApiClientError`, and `streamNDJSON`, and its own surface is
`/api/gen` and `/v1/*`. The only `apps/gen` grep hits for "public" are
`web/public/analytics.js` paths inside ACMM report fixtures. Dropped from the
blast radius above.

**`ingress-coverage.test.ts` is vacuous and this run must fix it.**
`infrastructure/pulumi/ingress-coverage.test.ts` (added by #4511) reads route
prefixes out of the real service source and asserts each has a matching ingress
rule **in `index.ts`**. Because source ingress rules never ship, it passes
against a 100%-dead production surface. It is a green test over a broken system
— the worst shape a gate can take.

**Exit criteria carried from the brief** (prose, not work items — the breakdown
lives in `breakdown.md` per `re-entry: architect`):

1. A real `pulumi preview` exists whose diff shows the `/public` ingress rule
   being added to `digitalocean:index:App`, and that diff has been read and
   recorded.
2. The preview shows no unintended spec changes beyond ingress and the
   knowingly-ignored DO defaults — or any that appear are enumerated in
   `release.md` as the reason the apply is held.
3. `ingress-coverage.test.ts` is no longer vacuous: it must fail when a
   registered prefix has no rule that can actually reach production.
4. `release.md` records the exact apply steps, and nothing is applied.

**Scope, as decided by the user:** restore `/public` only — narrow
`ignoreChanges` just enough that ingress is managed again. **Full spec
reconciliation is explicitly out of scope for this run.**

**Outstanding action (see frontmatter `assumptions`):** append to
`docs/backlog.md`, once a stage may write outside this file —

```markdown
- Reconcile the DigitalOcean app spec with `infrastructure/pulumi/index.ts` and remove the residual `ignoreChanges` narrowing — every spec field still ignored (env vars, instance sizes, component config) is silently unmanaged, exactly as ingress was (from: maintenance:public-ingress-never-applied)
```

**Open questions the architect stage must resolve** (recorded as unknowns, not
as a design):

- Alternatives to weigh and record: narrowing `ignoreChanges` by property path;
  full spec reconciliation (out of scope here); managing ingress by a different
  mechanism; leaving Pulumi alone and routing `/public` at the edge worker.
- **Unverified:** Pulumi's `ignoreChanges` path syntax for nested arrays (e.g.
  `spec.services[*].instanceCount`) has not been validated against this provider
  version. Treat as an open question, not a known-good. The proposed narrowing
  depends on it.
- A `pulumi preview` needs the R2 state backend and provider credentials. If CI
  is the only place those exist, the preview must run there.
- The DO + Pulumi dual-deploy race (`deploy-services.yml` doctl vs `pulumi-up`)
  means any eventual apply must not overlap a services deploy. Release
  authorization for this run is **prepare-and-stop**: write `release.md` plus a
  real preview, and apply nothing.

**Risk to the run:** the spec has been unmanaged for months, so the real preview
diff may be large. That is the stated reason the run stops at preview.
