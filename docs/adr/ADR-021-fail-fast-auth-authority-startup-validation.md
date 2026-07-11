---
id: ADR-021
title: Fail-Fast Startup Validation of AUTH_AUTHORITY
status: active
date: 2026-07-11
---

# ADR-021: Fail-Fast Startup Validation of AUTH_AUTHORITY

## Context

Every backend service (`services/reservations`, `services/users`,
`services/agent`) derives its Auth0 JWKS URL from the `AUTH_AUTHORITY` env var.
PR #3263 (`registerReadinessRoutes owns auth0Url`) centralized that derivation
in `registerReadinessRoutes` (`packages/service-bootstrap`), which builds
`${AUTH_AUTHORITY}/.well-known/jwks.json` and probes it in the `/ready` `auth`
sub-check.

The derivation deliberately did **not** validate the value. A malformed
`AUTH_AUTHORITY` (e.g. a missing scheme, or a typo like `dev-tenant.us.auth0.com`
without `https://`) produced a broken JWKS URL: the service still booted and
served traffic, and only the `/ready` probe reported 503. This
"degrade-on-malformed" behavior was pinned by a test in
`readiness-routes.test.ts` (`degrades rather than crashing at boot when
AUTH_AUTHORITY is malformed`), with a comment noting that validating inside the
readiness plugin would reject `fastify.register` and `exit(1)` all three
services at once.

Split out of #3238 / PR #3263, issue #3266 framed the open question as a genuine
judgment call between two options:

- **Fail fast at boot** — a typo'd env var is caught immediately during a deploy
  instead of silently serving traffic behind a red readiness probe. The cost:
  one bad value takes down reservations, users, and agent together, and
  DigitalOcean health checks crash-loop the app until it is fixed.
- **Degrade** (the then-current behavior) — services boot and serve; `/ready`
  reports 503, the load balancer pulls the instance, but the failure is quieter
  and can persist unnoticed.

## Decision

**Fail fast at boot.** On a malformed `AUTH_AUTHORITY`, a service must refuse to
start rather than boot-and-degrade.

The decisive factor is this repo's history: production has previously, and
accidentally, pointed at a **dev** Auth0 tenant. A loud boot failure during a
deploy is safer than a quiet misconfiguration that serves real traffic behind a
red readiness probe. We explicitly accept the blast radius — one bad value takes
down all three services and DO health checks crash-loop until it is fixed — as
the intended, legible consequence of a bad env var.

### Implementation

- Validation lives in a **shared startup config-validation step**,
  `validateStartupConfig()` in
  `packages/service-bootstrap/src/validate-startup-config.ts` — **not** inside
  the readiness-route plugin. It is called once, first thing, inside
  `createServiceApp()`, which every service's `buildApp()` funnels through, so
  the check runs during boot for all three services from **one place, one
  schema**.
- When `AUTH_AUTHORITY` is present, it must parse via `new URL()`, use an
  `http`/`https` scheme with a host, and yield a well-formed JWKS URL. A failure
  throws; `start-service-server.ts` already wraps `buildApp()` in
  `catch { console.error(err); process.exit(1) }`, so the exit is legible.
- The error names the offending variable (`AUTH_AUTHORITY`) and its value
  **shape** — length and whether a scheme is present — but **never** the raw
  value, so a potentially sensitive configuration string is not written to logs.
- Absence of `AUTH_AUTHORITY` is intentionally **not** a fail-fast condition
  here; that remains governed by the existing fail-closed auth gate in
  `createServiceApp()` (warn in dev/test, throw in production).
- The `AUTH_AUTHORITY` → JWKS-URL contract now has a single owner:
  `buildJwksUrl()` in the same module. Both boot-time validation and the
  readiness probe's derivation call it, so the value validated at boot is
  byte-identical to the URL probed at runtime.
- The `degrades rather than crashing at boot` test was replaced by its inverse:
  boot **throws** (fail-fast) on a malformed `AUTH_AUTHORITY` and boots normally
  on a valid one.

## Consequences

### Benefits

- A misconfigured `AUTH_AUTHORITY` fails the deploy immediately and visibly,
  instead of serving traffic pointed at the wrong (or a broken) identity
  provider — directly guarding against the prod-pointing-at-dev-tenant class of
  incident.
- One shared validation step and one JWKS-URL builder: no per-service drift, and
  the readiness probe can no longer silently mask a bad authority.

### Trade-offs

- A single malformed value takes down reservations, users, and agent together,
  and DO health checks crash-loop the app until the value is fixed. This is the
  accepted, intended blast radius of a bad env var — the whole point of failing
  loudly at deploy time.
- Boot now performs URL validation before serving traffic (negligible cost).

## Alternatives Considered

### Degrade on malformed (boot-and-serve, `/ready` reports 503)

**Rejected.** The failure is quiet: the instance boots, the load balancer pulls
it on the red readiness probe, but a partial or intermittent misconfiguration
can persist unnoticed and, worse, a value that happens to point at the wrong
valid tenant would pass the JWKS probe and serve traffic against the wrong IdP.
Given the prod-pointing-at-dev-tenant history, a quiet degrade is the more
dangerous default.

### Validate inside `registerReadinessRoutes`

**Rejected.** Throwing inside the readiness plugin couples a config-correctness
concern to a runtime health probe, and rejecting `fastify.register` there is an
implicit, hard-to-find boot failure. A dedicated, explicitly-invoked startup
step is clearer and is the correct home for "one place, one schema."

## See Also

- **ADR-003**: Auth Architecture — the OIDC/JWKS foundation `AUTH_AUTHORITY`
  configures.
- **ADR-009**: Health Check Patterns — the readiness/liveness split whose `auth`
  sub-check consumes the derived JWKS URL.
- **ADR-010**: Service Authentication.
- **Issue #3266**: the recorded fail-fast-vs-degrade decision this ADR captures.
- **PR #3263 / Issue #3238**: centralized `auth0Url` derivation in
  `registerReadinessRoutes`, the change that surfaced this question.
