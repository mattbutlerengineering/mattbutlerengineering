---
stage: capture
run: maintenance:backend-observability-blackout
date: 2026-09-01
re-entry: architect
---

# Condition: the hospitality APIs emit almost nothing, and keep none of what they emit

## Condition

Asked a plain operational question — "what did the hospitality APIs do over the
last month?" — and it is unanswerable. Not slow to answer, not partially
answerable: there is no data.

Three independent gaps compose into one blackout, and closing any one of them
alone still leaves the question unanswered:

1. **Errors are not reported.** All three services call `initSentry`, but no
   `SENTRY_DSN` is set in the DigitalOcean app spec, so the call returns early
   and the Fastify plugin no-ops. The three backend Sentry projects have
   received zero events, ever.
2. **Logs do not survive a deploy.** DigitalOcean serves run logs for the
   ACTIVE deployment only. Every deploy resets the window to zero, and the app
   deployed ~30 times last month. No log forwarding is configured.
3. **Successful requests leave no record at all.** `disableRequestLogging: true`
   means only errors, SSE lifecycle events, and Prisma slow-query lines are
   written. There is no latency, throughput, or route-usage signal in the
   window that does exist.

**Target state that ends this run:** the question above can be answered for a
month-old date. Concretely — a deliberately thrown error in each service is
proven ingested by its Sentry project; a successful request leaves a durable
record; and that record survives an intervening deploy.

## Reproduction / Evidence

All measured 2026-09-01 against production (app
`5dbdcf45-4053-4518-a97b-f1e2b3122a61`, `mattbutlerengineering-api`).

**Log window is 21 hours, not 30 days.**

| component        | window available                      | lines |
| ---------------- | ------------------------------------- | ----- |
| reservations-api | 2026-09-01T06:28Z → 2026-09-02T03:25Z | 167   |
| users-api        | 2026-09-01T06:27Z → 2026-09-01T13:35Z | 11    |
| agent-api        | 2026-09-01T06:27Z → 2026-09-01T22:40Z | 16    |

`doctl apps logs <app> <component> --type=run --deployment <id>` returns
**HTTP 400** for every superseded deployment tested (`7fea1a79`, `b6eb6980`,
`9d4b5adf`). The ACTIVE deployment dates from 2026-09-01T06:20Z;
`list-deployments` shows ~30 deployments in the trailing month, so the window
was destroyed roughly thirty times.

**Sentry backend projects are empty.** Projects `reservations-api`,
`users-api`, and `agent-api` return no issues at 30d or 90d. Across the whole
organisation there are 8 unresolved issues in 90 days and every one originates
in a browser (`hospitality`, `mattbutlerengineering`). Notably three of them —
`HOSPITALITY-4/5/6`, 25 events — are the _frontend_ reporting 403s from
`/api/v1/tables` and `/api/v1/reservations`. The API's own misbehaviour is
visible only through the browser's eyes; the API side logged nothing
attributable.

**The DSN is absent, not malformed.** Dumping every env key in the deployed app
spec yields 14 keys and no `SENTRY_DSN`:

```
API_BASE_URL AUTH_AUDIENCE AUTH_AUTHORITY CORS_ORIGIN DATABASE_URL
DEFAULT_MODEL DEPLOY_AUTHOR DEPLOY_PR_NUMBER DEPLOY_SHA MANAGE_TOKEN_SECRET
NODE_ENV PORT SERVICE_NAME UNSUBSCRIBE_TOKEN_SECRET
```

`grep -rn "SENTRY_DSN" .github/workflows/ infrastructure/` returns only
`VITE_SENTRY_DSN` — the frontend variable fixed by an earlier run. The backend
variable appears nowhere in the repository.

**Successful requests are unlogged by construction.** `disableRequestLogging:
true` at `packages/service-bootstrap/src/create-service-app.ts:112`. Supporting
signal: `services/users/src` contains zero `log.*` call sites of its own, which
is why users-api produced 11 lines in 21 hours — bootstrap banners plus Prisma
slow-query lines, nothing else.

## Root-cause hypothesis

**Confirmed mechanism, for the Sentry leg.** `initSentry` resolves config from
`process.env.SENTRY_DSN` and returns early when it is absent
(`packages/sentry/src/node.ts:49-52`). The caller exists and runs —
`packages/service-bootstrap/src/start-service-server.ts:25` — so this is not a
missing-caller bug. The variable was simply never supplied to the deployment.
This is verified, not hypothesised.

**Hypothesis for why it survived five months.** The condition is silent by
construction: an unwired DSN and a genuinely quiet service produce byte-identical
evidence — an empty Sentry project. There is no failing state to notice.

**Hypothesis for the onset date.** `@mbe/sentry` was created 2026-04-02
(`52bff8323`) and the bootstrap that registers it moved to
`@mbe/service-bootstrap` on 2026-06-09 (`650f19058`, which also introduced
`disableRequestLogging: true`). Best estimate is that backend error reporting
has never worked in production, i.e. roughly five months. The exact date wants
confirming against deploy history before it is quoted anywhere load-bearing.

## Blast radius

- **Who:** every operator of this system — which is to say, one person, but
  every incident. No end user is directly harmed; the harm is diagnostic
  capability.
- **What:** 100% of server-side runtime errors across `reservations-api`,
  `users-api`, and `agent-api` are unreported. 100% of successful requests are
  unlogged. ~97% of log-days are unretained (21 hours out of a 30-day window).
- **Since when:** roughly 2026-04-02 for the Sentry leg (~5 months);
  2026-06-09 for `disableRequestLogging` (~3 months); retention has presumably
  always been deploy-scoped.
- **How badly:** no production incident is attributable to this, and that is
  precisely the problem — by construction there is no evidence either way. The
  403 storm in `HOSPITALITY-4/5/6` is the live illustration: it is happening in
  these APIs right now, and everything known about it comes from the browser.
- **Precedent:** `docs/fixes/sentry-dsn-static-builds` fixed exactly this shape
  on the frontend, where it had run 4.5 months. The backend instance is one
  month older and still open.

## Ruled out

- **Not a missing caller.** `initSentry` is invoked at
  `start-service-server.ts:25`. The "shipped but never exercised" pattern does
  apply, but the unexercised thing is the configuration, not the code path.
- **Not CSP, and not a frontend problem.** This is server-side `@sentry/node`
  posting outbound from DigitalOcean. The CSP work that explains the static-site
  outages has no bearing here.
- **Not a `doctl` or auth failure.** The tool authenticates and returns current
  logs correctly; historical deployments answer HTTP 400, which is DigitalOcean
  declining to serve them, not a local problem.
- **The recurring 400s are not a defect — do not chase them.** Twelve
  `body must have required property 'name'` and twelve
  `querystring must have required property 'venueId'` in the window come from
  `scripts/check-api-surface-invariants.mjs`, which sends deliberately malformed
  requests to assert rate-limit headers appear on 400/401 responses (#4492,
  #4505). Working as designed. They are, ironically, the single most reliable
  signal currently in the logs.
- **`docs/fixes/sentry-dsn-static-builds/defect.md:144` is wrong and should not
  be trusted as evidence.** It states: _"Not affected: hospitality (reports
  correctly), and all backend services (`@mbe/sentry/node`, a separate
  `SENTRY_DSN` path)."_ It named the right mechanism and never checked whether
  that path was populated. It is not. Correcting that line is in scope.

## Notes

- **Adjacent bug found while investigating, deliberately not in scope.** The app
  spec sets `CORS_ORIGIN` (singular) on all three services; the code reads
  `process.env.CORS_ORIGINS` (plural) at
  `packages/service-bootstrap/src/create-service-app.ts:141`. The configured
  value is silently ignored and the hardcoded `defaultOrigins` list is used
  instead. Harmless today only by luck — the defaults happen to include the
  production origin. Same class as this run (configuration that ships and never
  takes effect), unrelated symptom. Seed it rather than fold it in.
- **Design questions the architect stage owns.** Which sink the DigitalOcean log
  forwarder targets (Papertrail / Datadog / Logtail / custom OpenSearch — they
  differ in cost, retention, and query story); whether request logging returns as
  full Fastify request logs or a single `onResponse` summary line; and what is
  redacted before any of it leaves the box. The last one is the reason this run
  re-enters at architect rather than implement: authorization headers and guest
  PII are in scope of anything that ships logs to a third party.
- **Verify is not skippable here, and needs care.** The regression test for a
  condition whose symptom is silence cannot be "no errors appear". It has to be
  positive: throw deliberately, assert the envelope is ingested. A backlog seed
  from the previous run already asks for exactly this
  (_"Prove the Sentry round trip end to end once per app"_) and it applies to
  these three services too.
