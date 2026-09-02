---
stage: decompose
run: maintenance:backend-observability-blackout
date: 2026-09-01
---

# Breakdown: turn on the observability that already exists

Progress lives in the checkboxes below — Implement checks items off as their
acceptance criteria are met.

Ordering note that shaped the cut: **redaction lands before any exporter goes
live.** Item 1 is first not because it is easiest but because every item after
it ships data off the box, and an exporter turned on ahead of the policy would
send unredacted records that no later item can recall.

## Milestone 1: absence becomes loud, and errors reach Sentry

Demonstrable at the boundary: a deliberately thrown error appears in the
`reservations-api` Sentry project, and a deploy carrying an empty `SENTRY_DSN`
fails instead of shipping a service that silently reports nothing.

One variable travels the whole path here — declared, delivered, guarded,
required at boot, redacted, proven ingested. Milestones 2 and 3 then only add
variables to machinery this milestone has already proven on a real case.

- [x] **Redaction policy** — a pure function in `packages/observability` that
      strips credentials from any outbound signal: `authorization` and `cookie`
      headers, and token-shaped values.
  - Accept: unit tests cover an `Authorization: Bearer …` header, a `Cookie:`
    header, and a `sk_live_`-shaped value, and separately assert that
    `venueId`, `guestId` and the client `ip` survive untouched — the policy is
    "strip credentials, keep identifiers", so both halves need proving.
  - Blocked by: —
- [x] **Sentry `beforeSend` applies the redaction policy** — wire it in
      `packages/sentry/src/node.ts`.
  - Accept: a test builds an event carrying an auth header and asserts it is
    absent after `beforeSend`; grep confirms no exporter re-implements the rule
    locally.
  - Blocked by: Redaction policy
- [x] **Declare `SENTRY_DSN` in Pulumi** — add it to the service env builders in
      `infrastructure/pulumi/index.ts` via `secretEnv`, sourced from
      `config.getSecret`, so all three services receive it.
  - Accept: `infrastructure/pulumi/index.test.ts` asserts the key is present on
    `users-api`, `reservations-api` and `agent-api`.
  - Blocked by: —
- [x] **Deliver `SENTRY_DSN` through the yq bridge, failing closed on empty** —
      extend the existing patch block at `.github/workflows/deploy-services.yml`
      (the one already bridging `MANAGE_TOKEN_SECRET` and
      `UNSUBSCRIBE_TOKEN_SECRET` past `ignoreChanges: ["spec"]`), and add a
      guard that exits non-zero when any required value is empty.
  - Accept: the guard is a unit-tested pure function that rejects `""` and a
    whitespace-only value and accepts a well-formed DSN; a dry run with the
    secret unset fails the step rather than patching an empty value. If the
    guard's output is piped, its `run:` block opens with `set -o pipefail` —
    GitHub's default shell is `bash -e` only, so a piped gate is otherwise
    decorative.
  - Blocked by: Declare `SENTRY_DSN` in Pulumi
- [ ] **Require telemetry config at production boot** — extend
      `validateStartupConfig()` in `packages/service-bootstrap` so that with
      `NODE_ENV=production` a missing or empty `SENTRY_DSN` refuses the boot,
      per ADR-021's existing stance.
  - Accept: a test asserts the service refuses to start in production with the
    variable unset, and that `NODE_ENV=test` and development are unaffected so
    local runs and the existing suite keep working.
  - Blocked by: —
- [ ] **Repeatable round-trip check** — a script that throws deliberately
      against a deployed service and asserts the event is retrievable, reusable
      for all three legs rather than three bespoke manual checks.
  - Accept: run against production it exits 0 only when the event comes back
    from the Sentry API, and exits non-zero when pointed at a service with no
    DSN. This is the mechanism Verify will use; the prior run's backlog seed
    ("prove the Sentry round trip end to end once per app") is satisfied by it.
  - Blocked by: Sentry `beforeSend` applies the redaction policy; Deliver
    `SENTRY_DSN` through the yq bridge; Require telemetry config at production
    boot

## Milestone 2: traces and metrics reach Grafana

Demonstrable at the boundary: a real production request is queryable as a span
carrying its route, status and duration — the access-log leg, satisfied without
re-enabling request logging.

- [ ] **Provision Grafana Cloud** — obtain the OTLP gateway URL and the Basic
      auth header, and store both as GitHub secrets.
  - Accept: both secrets exist and are non-empty. Set them with
    `gh secret set NAME --body "…"` — without `--body` in a non-interactive
    shell the value silently becomes `""`, which is the exact failure this run
    exists to end. Resolves the `assumptions:` entry in `architecture.md`; if
    no account exists, that entry becomes a real blocker and Milestones 2 and 3
    stall here.
  - Blocked by: —
- [ ] **Declare and deliver the OTLP variables** — set `otelEndpoint` and
      `otelHeaders` in Pulumi config so the already-written conditional in
      `index.ts:44-47` stops yielding an empty array, and extend the same yq
      patch and the same fail-closed guard to cover them.
  - Accept: the deployed spec contains `OTEL_EXPORTER_OTLP_ENDPOINT` and
    `OTEL_EXPORTER_OTLP_HEADERS` (verified against the live spec, not the
    source); the guard rejects either being empty.
  - Blocked by: Provision Grafana Cloud; Deliver `SENTRY_DSN` through the yq
    bridge
- [ ] **Extend production boot validation to the OTLP variables** — same
      mechanism as the Sentry leg, two more required keys.
  - Accept: the same test shape as the Sentry variable, now covering both OTLP
    keys.
  - Blocked by: Require telemetry config at production boot; Declare and
    deliver the OTLP variables
- [ ] **Confirm spans arrive with the shape the design claims** — no code change
      expected; this verifies that `FastifyOtelInstrumentation` was already
      doing the work.
  - Accept: a production request to `/api/v1/tables` produces a span carrying
    `http.route`, status and duration, tagged with the `deploy.sha` resource
    attribute already set in `sdk.ts`; no span exists for `/health`, `/docs` or
    `/reference`, confirming `shouldIgnoreRequest` still filters them.
  - Blocked by: Declare and deliver the OTLP variables

## Milestone 3: logs reach Grafana, joined to their traces

Demonstrable at the boundary: a log line is queryable long after the deploy that
produced it, and pivots to its own trace.

- [ ] **Add the OTLP logs exporter** — add
      `@opentelemetry/exporter-logs-otlp-http` pinned to the `0.221.0` line
      already used by the trace and metric exporters, and register a
      `LoggerProvider` in `initTelemetry`. `PinoInstrumentation@0.67.0` is
      already installed and already bridges pino records into the OTel Logs API
      by default, so this supplies a missing destination, not missing plumbing.
  - Accept: `initTelemetry` returns an SDK carrying a log record processor; the
    existing observability suite still passes; `OTEL_SDK_DISABLED=true` still
    produces a fully inert SDK so tests and local development are unchanged.
  - Blocked by: Declare and deliver the OTLP variables
- [ ] **Confirm logs arrive redacted and correlated** — the join is the whole
      point of choosing this shape over a platform log destination.
  - Accept: a known production log line is retrievable, carries the same
    `trace_id` as its corresponding span from Milestone 2, and contains no
    `authorization` header.
  - Blocked by: Redaction policy; Add the OTLP logs exporter

## Design gaps found

- **Where redaction applies on the log path is unspecified.** `architecture.md`
  makes the redaction policy the single owner of what may leave the process and
  lists the log exporter among its collaborators, but does not say whether it
  attaches as pino's own `redact` option (at source, which also scrubs the
  stdout DigitalOcean shows) or as an OTel `LogRecordProcessor` (at export,
  leaving stdout untouched). Those differ in what a person reading
  `doctl apps logs` sees during an incident, so it is a real choice rather than
  an implementation detail. The acceptance criterion on "confirm logs arrive
  redacted" is deliberately written to hold either way, but the decision belongs
  to Architect and should be settled before that item is worked. Not designed
  around here.
- **Not a gap, recorded so nobody chases it:** the redaction policy's stated
  collaboration with the trace exporter is a no-op today.
  `@opentelemetry/instrumentation-http` does not capture request headers unless
  `headersToSpanAttributes` is configured, and it is not. There is nothing to
  strip on the span path, which is the safe direction; no work item is needed
  unless header capture is later switched on.
- **The browser Sentry client has no redaction owner.**
  `packages/sentry/src/react.ts` calls `Sentry.init` with no `beforeSend`, so
  events from the hospitality and marketing SPAs leave the browser unredacted.
  Wiring the same policy there is not a repeat of item 2: `@mbe/observability`
  pulls the Node OTel SDK, so importing it from the React entry would drag that
  SDK into the browser bundle — the policy would first have to move to a
  dependency-free module both entry points can import. `architecture.md` scopes
  the redaction component to the backend services and never claims the browser
  path, so this is a boundary the design did not draw rather than an item that
  was missed. Route to Architect before opening work on it.

## Notes

- **2026-09-01 — `@mbe/sentry` cannot import the redaction policy as written.**
  `architecture.md` makes the policy live in `packages/observability` and names
  the Sentry `beforeSend` among its collaborators, but `@mbe/sentry` does not
  depend on `@mbe/observability` — its dependencies are `@mbe/types`,
  `@sentry/node`, `@sentry/react` and `fastify-plugin`. The item "Sentry
  `beforeSend` applies the redaction policy" therefore also has to add that
  workspace dependency. There is no cycle (`@mbe/observability` does not import
  `@mbe/sentry`), so this is a missing edge rather than a design error. Watch
  one thing when adding it: `@mbe/sentry/react` is consumed by browser apps, and
  `@mbe/observability` pulls the Node OTel SDK. The two entry points have
  separate import graphs so bundlers should not follow it, but confirm the
  static bundle size does not move rather than assuming it.
- **2026-09-01 — secret-value patterns are duplicated, deliberately.**
  `redact.ts` restates the secret classes `scripts/secret-scan.mjs` already
  owns rather than importing them: that module is a plain `.mjs` under
  `scripts/`, outside this package's build context and absent from the service
  Docker images. Logged rather than fixed, per surgical scope — unifying them
  would mean promoting the scanner into a workspace package.

- **Verify owns the run's headline claim.** "A record survives an intervening
  deploy" was cut from the breakdown rather than carried as a work item,
  because Verify is never skippable in a maintenance run and that sentence is
  precisely the evidence `verification.md` must produce. Keeping it here would
  have let a checked box stand in for the evidence. Verify should emit a marker,
  deploy, and re-query both the log line and the span.
- Two deferrals from `architecture.md` — reconciling `ignoreChanges: ["spec"]`,
  and wiring Sentry into the OTel trace context so an error pivots to its trace
  — are deliberately absent from this breakdown and are carried to the retro as
  seeds.
- **2026-09-02 — the bundle-size concern in the note above is resolved by
  measurement, not assumption.** `packages/sentry/src/react.ts` imports exactly
  `@sentry/react`, `react` and `./config.js`; it never reaches `node.ts`, and
  the package's `exports` map gives `./react` and `./node` separate entry
  points. A bundler following `@mbe/sentry/react` therefore cannot reach
  `@mbe/observability`, so adding the workspace dependency cannot move the
  static bundle. Added as `"@mbe/observability": "workspace:^"`. The dependency
  graph was regenerated by hand (`pnpm graph && pnpm generate:dep-graph`)
  because the `package.json` edit went through Bash, which skips the PostToolUse
  hook that normally does it.
- **2026-09-02 — the repo already had a deploy-secret provisioning checker, and
  it mandates the shape this item deliberately breaks.**
  `scripts/check-deploy-secret-provisioning.mjs` (from #4064) scans
  `services/reservations/src/config/*.ts` for secrets a config module throws on
  in production and asserts each is wired into both deploy paths. Its
  `isSecretProvisioned` requires four things, one of which is
  `hasGuard = workflowSource.includes('if [ -n "${NAME}" ]')` — the very
  conditional this item replaces with a fail-closed pre-step. The two are not in
  conflict today, because that scanner's scope is the reservations config
  directory and `SENTRY_DSN` is validated in `packages/service-bootstrap`
  instead, so `node scripts/check-deploy-secret-provisioning.mjs` still passes
  (`all 2 required-in-production secret(s) provisioned`). But the conventions
  now disagree: the older one lets a deploy proceed silently without the secret
  and relies on the container crash-looping afterwards, while this one refuses
  the deploy up front. Mine is strictly stronger, and the reconciliation —
  teaching `isSecretProvisioned` to accept EITHER the `if [ -n ]` guard or a
  `require-deploy-secrets.mjs` entry — is a real change to a shared fitness
  function, not part of delivering one secret. Not done here. Carry it to the
  retro as a seed.
- **2026-09-02 — `pnpm exec vitest run` from the repo root globs
  `.agent-worktrees/`.** Two stale worktree copies of
  `check-deploy-secret-provisioning.test.mjs` fail collection there, and running
  the whole root suite reports 296 failed test files for the same reason. It is
  pre-existing pollution, unrelated to this run — the four real suites that read
  `deploy-services.yml` pass 752/752 when named explicitly — but it means a root
  `vitest run` cannot be read as a gate. Scope test commands to a package
  directory or to explicit file paths. Note this is a different directory from
  the `.claude/worktrees/` reaping that `scripts/reap-worktrees.mjs` already
  handles. Carry it to the retro as a seed.
