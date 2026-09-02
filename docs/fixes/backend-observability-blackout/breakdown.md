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
- [x] **Declare `SENTRY_DSN` in Pulumi** — declare it in
      `infrastructure/pulumi/index.ts` via `secretEnv`, sourced from
      `config.getSecret`, so all three services receive one. Per the resolved
      design gap below, each service gets its OWN DSN: a `sentryDsnByService`
      record keyed by service name, read in `apiService` rather than in
      `sharedEnvs`, so the value differs per service while the key does not.
  - Accept: `infrastructure/pulumi/index.test.ts` asserts the key is present and
    typed `SECRET` on `users-api`, `reservations-api` and `agent-api` — including
    when that service's config key is unset, since an env var that vanishes when
    unconfigured is the shape that hid this blackout — and separately asserts the
    three services receive three _distinct_ values, not one shared one.
  - Blocked by: —
- [x] **Deliver `SENTRY_DSN` through the yq bridge, failing closed on empty** —
      extend the existing patch block at `.github/workflows/deploy-services.yml`
      (the one already bridging `MANAGE_TOKEN_SECRET` and
      `UNSUBSCRIBE_TOKEN_SECRET` past `ignoreChanges: ["spec"]`), and add a
      guard that exits non-zero when any required value is empty. Three secrets,
      not one — `SENTRY_DSN_USERS_API`, `SENTRY_DSN_RESERVATIONS_API`,
      `SENTRY_DSN_AGENT_API` — each upserted into its own service's `SENTRY_DSN`
      by its own `yq` call. Deliberately three calls rather than one loop: a
      loop over a shared value is exactly the design that was rejected.
  - Accept: the guard is a unit-tested pure function that rejects `""` and a
    whitespace-only value and accepts a well-formed DSN; a dry run with the
    secret unset fails the step rather than patching an empty value. If the
    guard's output is piped, its `run:` block opens with `set -o pipefail` —
    GitHub's default shell is `bash -e` only, so a piped gate is otherwise
    decorative.
  - Blocked by: Declare `SENTRY_DSN` in Pulumi
- [x] **Require telemetry config at production boot** — extend
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
- **RESOLVED 2026-09-02 — three per-service DSNs.** Decided by Matt when the
  question was put; items 3 and 4 were reworked to match and are green. The
  original gap, kept for the reasoning:
- **One shared `SENTRY_DSN`, but the Sentry org already has three per-service
  projects.** `architecture.md` and every item here assume a single `SENTRY_DSN`
  delivered to all three services, distinguished after the fact by the
  `serverName` tag `initSentry` already sets. The org disagrees: it contains
  projects `users-api`, `reservations-api` and `agent-api` (alongside
  `hospitality`, `mattbutlerengineering` and `eat-sheet`), created at some point
  and never wired to anything — which is a strong signal that per-service
  projects were the intent. The two options are not equivalent downstream: one
  DSN gives a single issue stream that has to be filtered by tag, three DSNs
  give per-service issue lists, alert rules and quotas, at the cost of three
  secrets, three env vars and a round-trip check that has to iterate. This is a
  design decision, not an implementation detail, so it is recorded rather than
  taken. Items 2-5 hold either way (they concern the presence of a DSN, not how
  many exist); item 6 is the first that has to know the answer. Route to
  Architect before working it.
  - **2026-09-02 update — all three projects already have a DSN.** `find_dsns`
    against the org returns a `Default` key for `users-api`, `reservations-api`
    and `agent-api`, on the same ingest host with three distinct project ids.
    (Values are not recorded here; they are credentials and this file is
    committed.) So the three-project option costs no provisioning at all — the
    keys exist and are ready to paste into three GitHub secrets. That removes
    the main argument for the single-DSN design, and the recommendation is now
    three per-service DSNs: per-service issue streams, alert rules and quotas,
    matching how a triage actually starts ("reservations is erroring"), and no
    shared quota where one noisy service can crowd out another's events. The
    cost is three secrets to rotate instead of one, and a round-trip check that
    iterates — `require-deploy-secrets.mjs` already accepts multiple names, so
    that part is free.
    - **Rework if three is chosen:** item 3 moves `secretEnv("SENTRY_DSN", ...)`
      out of `sharedEnvs` into each service's `extraEnvs` with its own config
      key; item 4's guard step names three secrets instead of one, and the
      unconditional `for SVC` upsert becomes three per-service upserts. Both are
      small and localised — roughly the size of the original items — but they
      are real, so the decision is worth making before any of this merges.

## Notes

- **2026-09-02 — the repo's existing "required secret is provisioned" guard is
  structurally blind to item 5's `SENTRY_DSN` requirement, for two independent
  reasons.** `scripts/check-deploy-secret-provisioning.mjs` exists to catch
  precisely this class (a secret a config module throws on in production but
  which no deploy path delivers — #4064). It passes today, reporting "all 2
  required-in-production secret(s) provisioned", and that 2 does not include
  `SENTRY_DSN`. Measured, both causes verified separately: (1) its CLI hardcodes
  `configDir` to `services/reservations/src/config`, so
  `packages/service-bootstrap/src/validate-startup-config.ts` — where item 5's
  throw lives, and the one file that governs _every_ service's boot — is never
  read; (2) even when handed that file directly,
  `findProductionThrowSecretNames()` returns empty for it, because the detector
  keys on `process.env.X` inside a production guard and `validateStartupConfig`
  reads a destructured `env.SENTRY_DSN` instead. Fixing (1) alone would not help.
  This is the run's own thesis turned on the tooling: a green check whose scan
  surface excludes the requirement is indistinguishable from a green check that
  verified it. Not fixed here — out of item 4's scope and it is a change to a
  shared repo-audit gate, so it goes to the retro as a seed rather than riding
  along in this branch. The seed is now sharper than the one recorded on
  2026-09-01 (which supposed only that `isSecretProvisioned`'s `if [ -n ]` shape
  needed relaxing): the shape is the lesser half, the scan surface and the
  detector are the real gap.

- **2026-09-02 — item 4's yq upserts could not be executed locally; `yq` is not
  installed on this machine.** What was verified instead: `actionlint` exits 0;
  a real YAML parse of the workflow confirms the deploy job's step order, that
  the guard step's `env` carries exactly the three DSN secrets, that the inject
  step carries all three, and that no stale shared `SENTRY_DSN` key survives in
  either. What was NOT verified is the runtime behaviour of the three `yq`
  expressions themselves. The mitigation is that their expression shape is
  byte-identical to the three bridges directly above them in the same step,
  which deploy to production today — only the service name and the value operand
  differ. Worth an actual execution at Verify, where a deploy runs for real.

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
- **2026-09-02 — requiring the DSN at boot reclassified six existing tests.**
  `validateStartupConfig` runs at the top of `createServiceApp`, before the
  fail-closed auth gate, so every test that simulates production started
  throwing on the DSN first: four in
  `packages/service-bootstrap/src/create-service-app.test.ts`, one in
  `services/reservations/src/app-redis-production.test.ts`, and one in
  `services/users/src/routes/users.test.ts` that asserts the auth gate's own
  message and no longer reached it. Each now supplies a DSN, which is the
  truthful simulation rather than a workaround — production does require one,
  and `app-redis-production.test.ts` already supplied `MANAGE_TOKEN_SECRET` for
  exactly this reason. `delete process.env.SENTRY_DSN` was added to
  `create-service-app.test.ts`'s `beforeEach` alongside the existing deletes so
  an ambient DSN in a developer's shell can never make one of these pass.
  Verified after: service-bootstrap 167/167, reservations 1331/1331, users
  138/138, agent 362/362, all four typechecks clean.
- **2026-09-02 — item 6 is built but deliberately left unchecked.**
  `scripts/sentry-round-trip.mjs` and its 16 unit tests exist and are lint- and
  test-clean, and the design gap it depended on (how to provoke a captured error
  on a deployed service) is now resolved in `architecture.md`. Its acceptance
  criterion is a live one, and neither half can be honestly claimed yet. The
  exits-0 half needs a deployed service that actually has a DSN, which is the
  outstanding blocker. The exits-non-zero half is technically checkable right
  now — production has no DSN, so the check should time out — but running it
  means firing ~150 requests at the production API specifically to trip the rate
  limiter. That is outward-facing and deliberately degrading, so it is held for
  a human rather than done unattended by a loop, and it also needs
  `SENTRY_AUTH_TOKEN`, which is a repo secret with no local equivalent. What was
  verified locally: the pure core (marker uniqueness, both tag matchers, exit
  mapping, backoff), the usage path exiting 2, and a transport failure exiting 2
  rather than crashing.
- **2026-09-02 — `--project` is a parameter, so the open one-vs-three DSN
  question does not block item 6's shape.** One shared project means passing the
  same `--project` three times; three per-service projects mean passing a
  different one each time. The decision still has to be made before Verify can
  say what "the round trip passes" means, but it no longer gates the code.
- **2026-09-02 — hit the `cmd | tail` exit-code trap while checking this
  script.** `node scripts/sentry-round-trip.mjs 2>&1 | tail -2; echo $?`
  reported 0 for a path that exits 2, because `$?` is `tail`'s status. It is
  already recorded in the repo's gotchas for `git push`, and it reads as
  convincing there too — the usage text printed exactly as expected. Check exit
  codes with the pipe removed.
