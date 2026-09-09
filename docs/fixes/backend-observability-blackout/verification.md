---
stage: verify
run: maintenance:backend-observability-blackout
date: 2026-09-02
---

# Verification: turn on the observability that already exists

## Summary

**13 criteria checked: 11 PASS, 1 PARTIAL, 1 FAIL (declared out of scope).**

The blackout is over for the leg this run scoped. A deliberately provoked error
now reaches Sentry from **all three** backend services, each in its own project,
and the record **survives a deploy that destroys the DigitalOcean log window** —
demonstrated on the same clock, against the same production app, in this pass.

The one FAIL is Milestone 1's declared boundary, not a defect: "a successful
request leaves a durable record" is the access-log leg, descoped on 2026-09-02
to a follow-up run gated on a Grafana Cloud account. It is recorded as a failure
against the brief's target state rather than quietly dropped, because the brief
promised it and this run does not deliver it.

The one PARTIAL is `scripts/sentry-round-trip.mjs`: its decision logic is
unit-tested and its behaviour was reproduced three times by hand against
production, but the script's own `main()` has still never executed. See
[Not verified](#not-verified) — this is the run's own "shipped but never
exercised" shape, and it is being reported, not softened.

## Criteria & evidence

### T1 (brief, target state) — a deliberately thrown error in each service is proven ingested by its Sentry project

- Check: provoked the captured status (HTTP 429, one of the plugin's
  `NOTABLE_4XX`) against each service's public path, carrying a unique marker on
  both the `x-request-id` header and a `?rt=` query param, then queried each
  Sentry project through the authenticated MCP.
- Evidence:

  ```
  users-api          19 requests -> 429   marker mbe-round-trip-20260902T224126Z-dde78359
  reservations-api   19 requests -> 429   marker mbe-round-trip-20260902T230451771Z-uphka68c
  agent-api          19 requests -> 429   marker mbe-round-trip-20260902T230504191Z-s23wiajc

  USERS-API-6         d5c183211e23434fa6d93f7a2eccace1  server_name: users-api
  RESERVATIONS-API-6  cb4ec6470c924093a8228042f5e954ab  server_name: reservations-api
  AGENT-API-7         291acc86667d42219eb2f933306abcd8  server_name: agent-api

  tags on RESERVATIONS-API-6:
    environment: production
    level:       warning
    method:      GET
    requestId:   mbe-round-trip-20260902T230451771Z-uphka68c
    server_name: reservations-api
    url:         /api/v1/reservations/health?rt=mbe-round-trip-20260902T230451771Z-uphka68c
  ```

  Three markers, three projects, three distinct `server_name` values. The
  per-service-DSN decision is proven live by that separation alone: one shared
  DSN would have put all three events in one project.

  The `requestId` tag equalling the marker also proves the header is adopted end
  to end — `createRequestIdMiddleware` -> `setSentryContext` -> the outbound
  event — so the marker rides twice, independently, exactly as designed.

- Result: **PASS**

### T2 (brief, target state) — a successful request leaves a durable record

- Check: read the two mechanisms that would have to produce one, and the live
  app spec that would have to carry the exporter.
- Evidence:

  ```
  packages/service-bootstrap/src/create-service-app.ts:112:    disableRequestLogging: true,
  packages/sentry/src/node.ts:134:    const NOTABLE_4XX = new Set([409, 422, 429]);

  live app spec env keys, per service (no OTEL_EXPORTER_OTLP_ENDPOINT anywhere):
    users-api         11 keys: AUTH_AUTHORITY AUTH_AUDIENCE DATABASE_URL API_BASE_URL CORS_ORIGIN PORT NODE_ENV DEPLOY_SHA DEPLOY_PR_NUMBER DEPLOY_AUTHOR SENTRY_DSN
    reservations-api  13 keys: ... MANAGE_TOKEN_SECRET UNSUBSCRIBE_TOKEN_SECRET SENTRY_DSN
    agent-api         12 keys: ... DEFAULT_MODEL ... SENTRY_DSN
  ```

  A 200 is still written nowhere: request logging is off, and Sentry captures
  only 5xx plus `{409, 422, 429}`. No OTLP exporter is configured in production.

- Result: **FAIL** — and deliberately so. This is Milestone 2/3, descoped on
  2026-09-02 when Grafana Cloud turned out to be unprovisioned. Recorded as a
  failure against the brief's stated target state because the brief promised it;
  it routes to the follow-up run, not back to Implement.

### T3 (brief, target state) — that record survives an intervening deploy

- Check: captured the three events on deployment `467d9927`, then dispatched a
  real deploy through CI (`gh workflow run deploy-services.yml --ref main`, run
  `33693498999`, success), waited for the new deployment to reach ACTIVE, and
  re-fetched every event by ID afterwards. Then provoked a fresh 429 to confirm
  the containers had genuinely been replaced.
- Evidence:

  ```
  deployments:
    0b178839-43e3-4122-bfed-cc1f9f7ac28e    ACTIVE        2026-09-02 23:13:07 UTC
    467d9927-b442-451e-b3f3-6eb8d6056237    SUPERSEDED    2026-09-02 22:32:49 UTC

  container generation changed (same issue, USERS-API-6, two events):
    pre-deploy  event d5c183211e23434fa6d93f7a2eccace1  app_start_time 2026-09-02T22:38:56.228Z
    post-deploy event fea239732e2143d39b2f8bc9208d4c48  app_start_time 2026-09-02T23:18:38.582Z

  the DigitalOcean log window for the deployment that captured them is GONE:
    $ doctl apps logs <app> users-api --type=run --deployment 467d9927-...
    Error: ... 400 ... cannot get running logs from deployment
    467d9927-b442-451e-b3f3-6eb8d6056237 in phase final_cleanup

  the new deployment's window, minutes old:
    $ doctl apps logs <app> users-api --type=run --deployment 0b178839-... | wc -l
    8

  all three pre-deploy events still retrievable by ID after the deploy:
    d5c183211e23434fa6d93f7a2eccace1  USERS-API-6         OK
    cb4ec6470c924093a8228042f5e954ab  RESERVATIONS-API-6  OK
    291acc86667d42219eb2f933306abcd8  AGENT-API-7         OK
  ```

  This is the criterion the whole run turns on, and the two halves were measured
  against the same deploy: DigitalOcean answered HTTP 400 for the very window
  the events were born in, while the events themselves came back intact.

- Result: **PASS** (for the record that exists today — the Sentry event; the
  access-log record is T2's FAIL above)

### A1 (M1) — Redaction policy strips credentials and keeps identifiers

- Check: `pnpm --dir packages/observability exec vitest run src/redact.test.ts --reporter=verbose`
- Evidence:

  ```
  ✓ redactSignal > removes an authorization header
  ✓ redactSignal > removes a cookie header
  ✓ redactSignal > matches credential header names case-insensitively
  ✓ redactSignal > masks a token-shaped value wherever it appears
  ✓ redactSignal > keeps the identifiers the policy exists to preserve
  ✓ redactSignal > walks nested objects and arrays
  ✓ redactSignal > passes non-object values through untouched
  ✓ redactSignal > does not mutate its input
  Test Files  1 passed (1)      Tests  8 passed (8)
  ```

  Both halves of the criterion are covered: strip (`authorization`, `cookie`,
  token-shaped values) and keep (`venueId`, `guestId`, client `ip`).

- Result: **PASS**

### A2 (M1) — Sentry `beforeSend` applies the policy, and no exporter re-implements it

- Check: package suite plus a repo-wide grep for a second implementation.
- Evidence:

  ```
  ✓ initSentry (node) > redacts credentials from events before they leave the process
  packages/sentry: Test Files 3 passed (3)   Tests 58 passed (58)

  $ grep -rn "beforeSend" --include='*.ts' packages services apps | grep -v node_modules | grep -v '\.test\.'
  packages/sentry/src/node.ts:74:    beforeSend: (event) => redactSignal(event) as Sentry.ErrorEvent,

  $ grep -rn "redactSignal" ... | grep -v '\.test\.'
  packages/observability/src/redact.ts    (the owner)
  packages/observability/src/index.ts:4:  export { redactSignal, REDACTED } from "./redact.js";
  packages/sentry/src/node.ts:5:          import { redactSignal } from "@mbe/observability";
  packages/sentry/src/node.ts:74:         beforeSend: (event) => redactSignal(event) ...
  ```

  Exactly one `beforeSend` in the repo and exactly one redaction owner.

- Result: **PASS** (see finding 3 — the _browser_ client has no `beforeSend` at
  all, which is a different gap, not a second implementation)

### A3 (M1) — Pulumi declares `SENTRY_DSN` as SECRET on all three services, even unconfigured, with distinct values

- Check: `pnpm --dir infrastructure/pulumi exec vitest run index.test.ts`, then
  the deployed spec.
- Evidence:

  ```
  ✓ all services declare SENTRY_DSN as SECRET even when unconfigured
  ✓ gives each service its own DSN rather than one shared value
  Test Files  1 passed (1)      Tests  80 passed (80)

  infrastructure/pulumi/index.ts:
    49  const sentryDsnByService: Record<string, pulumi.Input<string>> = {
    50    "users-api": config.getSecret("sentryDsnUsersApi") ?? "",
    51    "reservations-api": config.getSecret("sentryDsnReservationsApi") ?? "",
    52    "agent-api": config.getSecret("sentryDsnAgentApi") ?? "",
    133       secretEnv("SENTRY_DSN", sentryDsnByService[args.name] ?? ""),

  live spec (doctl apps spec get), one block per API service:
    line 141  key: SENTRY_DSN  type: SECRET   -> users-api
    line 200  key: SENTRY_DSN  type: SECRET   -> reservations-api
    line 254  key: SENTRY_DSN  type: SECRET   -> agent-api
  ```

  The test deliberately leaves `sentryDsnAgentApi` unset so the declaration is
  proven to survive an unset config — the vanish-when-unconfigured shape is what
  hid this blackout for five months.

  The brief's headline evidence is now false, which is the point: it recorded
  "14 keys and no `SENTRY_DSN`". Every API service carries it.

- Result: **PASS**

### A4 (M1) — Delivered through the yq bridge, failing closed on empty

- Check: unit tests over the pure guard **and** the workflow text, the guard's
  CLI exercised on all four input shapes, and the real production deploy log.
- Evidence:

  ```
  ✓ classifyRequiredSecret > accepts a well-formed DSN / rejects empty /
    rejects whitespace-only / rejects unset, distinguishing it from empty
  ✓ checkRequiredSecrets > fails when any one required name is empty
  ✓ deploy-services.yml wiring > runs the guard before patching the app spec
  ✓ deploy-services.yml wiring > opens the guard's run block with pipefail
  ✓ deploy-services.yml wiring > routes each secret to its own service, never one value to all three
  Test Files  2 passed (2)      Tests  31 passed (31)

  guard CLI, exercised directly:
    A unset      ::error::VERIFY_PROBE_DSN is not defined in the step's env block. Refusing to deploy.   exit=1
    B empty      ::error::VERIFY_PROBE_DSN is defined but empty ...                                       exit=1
    C whitespace ::error::VERIFY_PROBE_DSN is defined but contains only whitespace ...                    exit=1
    D valid      All 1 required deploy secret(s) present: VERIFY_PROBE_DSN                                exit=0

  the guard actually ran in the production deploy (run 33689785649):
    Require deploy secrets  node scripts/require-deploy-secrets.mjs SENTRY_DSN_USERS_API SENTRY_DSN_RESERVATIONS_API SENTRY_DSN_AGENT_API
    Require deploy secrets  All 3 required deploy secret(s) present: SENTRY_DSN_USERS_API, SENTRY_DSN_RESERVATIONS_API, SENTRY_DSN_AGENT_API
    Inject deploy metadata  ... [{"key":"SENTRY_DSN","value":"${SENTRY_DSN_USERS_API}","type":"SECRET"}]
    Inject deploy metadata  ... [{"key":"SENTRY_DSN","value":"${SENTRY_DSN_RESERVATIONS_API}","type":"SECRET"}]
    Inject deploy metadata  ... [{"key":"SENTRY_DSN","value":"${SENTRY_DSN_AGENT_API}","type":"SECRET"}]

  the guard's own run block:
    run: |
      set -euo pipefail
  ```

  The step is not decorative: it executed in a real deploy, and its three
  failure modes were reproduced by running it.

- Result: **PASS**

### A5 (M1) — Production boot refuses a missing or empty `SENTRY_DSN`

- Check: `pnpm --dir packages/service-bootstrap exec vitest run src/validate-startup-config.test.ts --reporter=verbose`
- Evidence:

  ```
  ✓ SENTRY_DSN > refuses to boot in production when SENTRY_DSN is unset
  ✓ SENTRY_DSN > refuses to boot in production when SENTRY_DSN is empty
  ✓ SENTRY_DSN > refuses to boot in production when SENTRY_DSN is whitespace only
  ✓ SENTRY_DSN > boots in production once SENTRY_DSN is present
  ✓ SENTRY_DSN > never names the DSN value in the error, only that it is missing
  ✓ SENTRY_DSN > leaves development and test alone so local runs need no DSN
  Test Files  1 passed (1)      Tests  19 passed (19)
  ```

  The positive half is also proven live: production booted, twice, with the DSN
  present (`app_start_time` 22:38:56Z and 23:18:38Z).

- Result: **PASS** (the live _negative_ is not exercisable — see
  [Not verified](#not-verified))

### A6 (M1) — Round-trip check, the mechanism

- Check: `pnpm exec vitest run scripts/__tests__/sentry-round-trip.test.mjs --reporter=verbose`
- Evidence:

  ```
  ✓ roundTripExitCode > exits 0 only when the event actually came back
  ✓ roundTripExitCode > exits non-zero when nothing came back — the no-DSN case
  ✓ roundTripExitCode > exits non-zero when the check itself failed
  ✓ roundTripExitCode > treats an unrecognised outcome as failure, never as success
  ✓ eventMatchesMarker > matches on the requestId tag the Sentry plugin sets
  ✓ eventMatchesMarker > matches on the url tag as an independent second marker
  ✓ eventMatchesMarker > does not match another run's event
  ✓ eventMatchesMarker > does not match a real incident that happens to be in the window
  ✓ buildRoundTripMarker > is unique per run so a stale event can never satisfy a later check
  ✓ buildRoundTripMarker > is safe to put in a URL and an HTTP header
  ```

- Result: **PASS**

### A7 (M1) — Round-trip check, the live assertion

- Check: the _behaviour_ the script encodes was reproduced by hand three times
  (T1 above), because the script's `main()` needs `SENTRY_AUTH_TOKEN`, which is
  a repository secret with no local equivalent and must not be extracted.
- Evidence:

  ```
  positive leg, reproduced 3/3:  provoke 429 -> event carrying the marker
                                 retrievable from the matching Sentry project
  negative leg (no DSN -> non-zero): NOT exercised as a script run.
  script main(): NEVER EXECUTED.
  ```

- Result: **PARTIAL** — the assertion holds, the automation of it does not yet.
  Routed to the follow-up run: run `sentry-round-trip.mjs` from CI, where
  `SENTRY_AUTH_TOKEN` exists.

### A8 (brief, in scope, no work item) — correct the false claim in the prior run's brief

- Check: the brief said _"Correcting that line is in scope."_ At the start of
  this Verify pass the line was **unchanged** — the run had shipped without it.
  Corrected during this pass and re-read.
- Evidence:

  ```
  before  docs/fixes/sentry-dsn-static-builds/defect.md:144
    - **Not affected:** hospitality (reports correctly), and all backend services
      (`@mbe/sentry/node`, a separate `SENTRY_DSN` path).

  after
    - **Not affected:** hospitality (reports correctly).
    - **CORRECTION (2026-09-02, by `maintenance:backend-observability-blackout`).**
      ... It named the right mechanism and never checked whether that path was
      populated. It was not. ... Do not cite the original line as evidence.
  ```

- Result: **PASS** (found FAILING at Verify, fixed in this pass — see finding 6
  for why it was missed)

## Failures

1. **T2 — a successful request leaves no durable record.** Not a regression and
   not a surprise: Milestone 2/3 were descoped on 2026-09-02 when Grafana Cloud
   turned out not to exist. Routes to the follow-up run, whose breakdown is
   already written in `breakdown.md` under _Deferred to a follow-up run_. It is
   recorded here as a failure — not as "out of scope" — because the brief's
   target state promised it, and the run closes without it.

Nothing routes back to Implement.

## Findings

These are real and were confirmed in this pass. None blocks Review.

1. **The merge that fixed the blackout triggered no deploy.**
   `.github/workflows/deploy-services.yml`'s `paths:` filter lists
   `services/*`, `packages/types`, `packages/auth`, `packages/agent-core`,
   `packages/observability` — and omits `packages/sentry` and
   `packages/service-bootstrap`, both of which now carry production-critical
   boot behaviour. #4927 merged and nothing deployed; recovery was a manual
   `gh workflow run`. This is the run's own thesis recurring one layer up: a
   fix that lands and silently never ships.

2. **The provisioning audit is structurally blind to the secret this run is
   about.** `node scripts/check-deploy-secret-provisioning.mjs` reports
   `PASS: all 2 required-in-production secret(s) provisioned` — two, not three.
   Two independent reasons, either sufficient: (a) `findRequiredProductionSecrets`
   scans only `services/reservations/src/config`, and `SENTRY_DSN` is required by
   `packages/service-bootstrap/src/validate-startup-config.ts`; (b) even in
   scope, `isSecretProvisioned` demands `hasGuard` — the literal
   `if [ -n "${NAME}" ]` skip-on-empty pattern — so it would report the
   _stricter_ fail-closed design as unprovisioned. A checker that cannot see the
   failure it was built for is the same shape as the failure.

3. **The browser Sentry client has no redaction owner.**
   `packages/sentry/src/react.ts` has no `beforeSend`, so frontend events leave
   unredacted while backend events are filtered. Already an open design gap
   routed to Architect; restated here because this pass confirmed it live.

4. **The OTLP env vars still use the shape this run rejected.**
   `infrastructure/pulumi/index.ts:62-64` builds them as
   `otelEndpoint ? [extraEnv(...)] : []` — the key vanishes when unconfigured,
   exactly the pattern that hid `SENTRY_DSN` for five months. No
   `OTEL_EXPORTER_OTLP_ENDPOINT` appears on any live service. Fix the shape
   before Milestone 2 turns the exporter on, or the follow-up run inherits this
   run's bug.

5. **`/public/**` has no ingress rule in production.** Found during Implement:
   `/public/v1/venues/<slug>/holds` answers Fastify's default "Route not found",
   and the deployed spec has no `/public` prefix (Pulumi's
   `ignoreChanges: ["spec"]` means it was never pushed). A 404 is not in
   `NOTABLE_4XX`, so even a healthy Sentry would not flag it. Wants its own
   maintenance run.

6. **A8 was in the brief's scope and in no work item.** Decompose produced no
   checkbox for "correct the false line in the prior brief", so Implement had
   nothing to check off and the run would have closed with the false claim
   standing. The gap was caught only because Verify builds its criteria list
   from `defect.md` as well as `breakdown.md`.

## Not verified

- **`scripts/sentry-round-trip.mjs` `main()` has never run.** Both legs of A7's
  criterion are stated as script exit codes; neither exit code has been
  observed. `SENTRY_AUTH_TOKEN` is a repository secret with no local equivalent,
  and extracting a production credential to a workstation is prohibited, so the
  assertion was made by hand through the authenticated Sentry MCP instead. The
  behaviour is proven; the automation is not. Run it from CI.
- **The live negative for A5 (production boot refusing an absent DSN).** Proving
  it against production would mean deliberately deploying a service with the DSN
  removed and watching the container exit — a self-inflicted outage to confirm
  behaviour three unit tests already pin. Not attempted, deliberately.
- **The live negative for A4 (the deploy guard failing a real deploy).** Same
  reason: it would require unsetting a production secret. The guard's CLI was
  exercised directly on all four input shapes instead (A4), which covers the
  same code path without touching the real secrets.
- **Redaction against a real credential in flight.** No probe request carried an
  `Authorization` or `Cookie` header, so the live events show no header
  stripping — nothing was there to strip. Redaction is proven by unit test and
  by there being exactly one `beforeSend` on the path; it is not proven by a
  production observation.
- **Whether the ~30 deploys/month log-window destruction is fully mitigated.**
  It is not, and is not claimed to be: T2/T3 close the gap for _error_ records
  only. Successful-request records remain deploy-scoped until Milestone 2/3
  ship.
