---
stage: architect
run: maintenance:backend-observability-blackout
date: 2026-09-01
assumptions:
  - A Grafana Cloud account exists (or will be created) and can issue an OTLP
    gateway URL plus a Basic auth header. The endpoint was chosen from the
    evaluation and the code's own docstring; the account itself was never
    confirmed in-session. If it does not exist, the logs and spans legs stall
    at provisioning and only the Sentry leg can land.
---

# Architecture: turn on the observability that already exists

## Approach

Almost nothing here is a build. `packages/observability/src/sdk.ts` already
constructs OTLP trace, metric and pino-log instrumentation aimed at a Grafana
Cloud gateway; `packages/sentry/src/node.ts` already registers a Fastify error
plugin; `infrastructure/pulumi/index.ts` already assembles the env vars both
need. Every one of those paths is conditional on configuration that production
has never been given, so each degrades to a silent no-op. The design is
therefore a _configuration_ design, and its center of gravity is not "how do we
export telemetry" but **"how do we make the absence of configuration loud"** —
because absence rendering identically to health is the actual defect, and it has
now recurred three times in this repo (backend Sentry DSN, frontend
`VITE_SENTRY_DSN`, OTLP endpoint).

The shape that lost: adding a DigitalOcean platform log destination
(Logtail/Papertrail/Datadog/OpenSearch — Grafana Loki is not offered) as the
retention mechanism. It captures raw stdout including crashes the app cannot
report on, which the chosen shape cannot. It loses because it introduces a
second vendor to hold half the picture, and because its lines arrive stripped of
the `trace_id` that `PinoInstrumentation` already stamps on every record — so
the operator gains logs but loses the join that makes them answer questions.
The chosen shape keeps one vendor, one credential, and one correlation key,
and pays for it with a narrow crash-capture gap recorded under _Decisions_.

## Components

### Telemetry bootstrap (`packages/observability`, `@mbe/sentry/node`)

- Responsibility: translate process environment into live exporters before the
  HTTP stack is imported. Owns the ordering constraint that makes OTel
  instrumentation work at all.
- Collaborators: `start-service-server.ts` (its only caller), the redaction
  policy below, the OTLP gateway and Sentry ingest.
- Change: gains a `LoggerProvider` and an OTLP logs exporter. Nothing else moves
  — `PinoInstrumentation` already bridges pino records into the OTel Logs API by
  default (`disableLogSending` defaults to false, verified against the installed
  0.67.0), so the log leg is a missing _destination_, not missing plumbing.

### Redaction policy (new, in `packages/observability`)

- Responsibility: the single decision about what may leave the process. One
  place, so that adding a fourth signal later cannot quietly ship a credential.
- Collaborators: the trace exporter (via `HttpInstrumentation`'s header
  capture), the log exporter, the Sentry `beforeSend`.
- Deletion test: if it vanished, every exporter would re-derive its own answer
  and they would drift. It survives.

### Config declaration (`infrastructure/pulumi/index.ts`)

- Responsibility: state, in source, which env vars each service requires. The
  `otelEnvs`/`secretEnv` builders already do this; they gain `SENTRY_DSN`.
- Collaborators: config delivery below.
- Note: this component's declaration is **not** what reaches production today —
  see _Decisions_.

### Config delivery (`.github/workflows/deploy-services.yml`)

- Responsibility: get declared values into the live app spec despite
  `ignoreChanges: ["spec"]`, and **fail the deploy when a required value is
  empty**. That assertion is the component's real reason to exist; without it
  this is just a `yq` invocation.
- Collaborators: GitHub secrets, `doctl apps update`.

### Startup config validation (`packages/service-bootstrap`, existing)

- Responsibility: refuse to serve traffic on a malformed startup config
  (ADR-021). Gains telemetry config to its required set when
  `NODE_ENV=production`.
- Collaborators: every service's boot path.

## Data model

No persistent entities. The model is the **signal set and the key that joins
it**, chosen from the questions the run must be able to answer:

| Access pattern                                           | Signal         | Query key            |
| -------------------------------------------------------- | -------------- | -------------------- |
| "What happened to this one request?"                     | span           | `trace_id`           |
| "What errored last month, grouped?"                      | Sentry issue   | project + date       |
| "What was p95 on `/api/v1/tables` last Tuesday?"         | span attrs     | `http.route`, time   |
| "What did reservations-api log around 03:00 on the 4th?" | log record     | `service.name`, time |
| "Which deploy introduced this?"                          | resource attrs | `deploy.sha`         |

`trace_id` is the correlation key and it already exists in all three places the
SDK controls: natively on spans, stamped into pino records by
`PinoInstrumentation`, and carried on log records through the same bridge.
`deploy.sha`, `deploy.pr_number` and `deploy.author` are already set as resource
attributes in `sdk.ts` and need no work.

**Consistency, per interaction.** Every export in this design is
fire-and-forget and eventually consistent — seconds of lag are acceptable and
batch loss under pressure is acceptable. Exactly one requirement is strong:
_telemetry failure must never affect request serving_. That is the invariant the
contracts below are written to protect, and it is owned by the telemetry
bootstrap, not by callers.

## Interfaces & contracts

### OTLP export → Grafana Cloud gateway

- Input: batched spans, metric readings, and log records over OTLP/HTTP.
  Configured by `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_EXPORTER_OTLP_HEADERS`.
- Output: 2xx from the gateway. Nothing in-process consumes the response.
- Failure modes: on timeout (OTLP/HTTP default 10s) or non-2xx, the exporter
  retries with backoff and then **drops the batch**. Request serving is
  unaffected — the batch processors are asynchronous and bounded, so a dead
  collector costs memory up to the queue limit and then costs data, never
  latency. Retry is safe: spans and log records carry stable ids, so a
  redelivered batch is idempotent at the vendor.
- The failure that matters is not the gateway being down; it is the endpoint
  being **unset**, which today silently retargets `http://localhost:4318` and
  discards everything. That case is moved out of this contract and into startup
  validation, below.

### Sentry envelope → ingest

- Input: an exception plus request tags, from the existing Fastify error plugin.
- Output: fire-and-forget envelope POST.
- Failure modes: dropped silently on network failure; must never surface to the
  request. Unchanged from today except that a DSN now exists.
- Not in scope: Sentry does not join the OTel trace. `initSentry` sets
  `skipOpenTelemetrySetup: true` and `tracesSampleRate: 0`, so an error in
  Sentry will **not** carry a `trace_id` that pivots to Tempo. Correlation is
  by service and timestamp only. Recorded under _Decisions_.

### Deploy config delivery → live app spec

- Input: `SENTRY_DSN`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`
  from GitHub secrets.
- Output: a patched spec applied by `doctl apps update`.
- Failure modes: **fails the deploy loudly when any required value is empty.**
  This is the contract's whole point. An absent GitHub secret expands to an
  empty string, `yq` writes it, DO accepts it, and the service boots into
  exactly the silent no-op this run exists to end — and `gh secret set` without
  `--body` is a known way to produce an empty secret in this repo. Not asserting
  here is how the class recurs. Retry is safe: the patch is idempotent.

### Startup config validation → boot

- Input: `process.env`, at `validateStartupConfig()` time.
- Output: proceeds, or exits non-zero before listening.
- Failure modes: when `NODE_ENV=production` and a telemetry variable is missing
  or empty, the process **refuses to start** rather than serving traffic blind.
  This follows ADR-021's existing stance verbatim — its own comment says a bad
  deploy should "crash loudly instead of serving traffic behind a red readiness
  probe". Outside production the variables stay optional and the SDK's no-op
  path is the intended behaviour, so local development and tests are unaffected.

## Stack & dependencies

- **Grafana Cloud (Tempo / Loki / Mimir)** — already the target named in
  `sdk.ts`'s docstring and ranked #3 in the Feb 2026 evaluation as the
  vendor-neutral choice that "pairs well with Sentry". Chosen by prior work; this
  run supplies its credentials.
- **Sentry** — evaluation's #1 for error tracking; `@mbe/sentry` and three
  backend projects already exist. Supplying a DSN is the entire change.
- **`@opentelemetry/exporter-logs-otlp-http`** (new, pin to the `0.221.0` line
  already used by the trace and metric exporters) — the only new dependency.
  Its cost is one call inside `initTelemetry`; its types do not appear in any
  other signature, so it is a large-library-behind-three-calls dependency, not a
  spreading one.
- **No new vendor for logs**, and no DigitalOcean log destination. Explicitly
  rejected above.

## Decisions & alternatives

- **OTLP logs to Grafana** over a DigitalOcean platform log destination — Loki
  is not an offered destination, so the platform route would have meant a second
  vendor holding trace-less lines. Cost accepted: output pino never produced
  (OOM kill, a fatal before SDK init, an unflushed buffer at exit) is not
  captured. DigitalOcean's own 21-hour live log view remains the tool for that
  narrow case.
- **Spans as the request record** over re-enabling `disableRequestLogging` —
  `FastifyOtelInstrumentation` already emits a span per request with route,
  status and duration, and already filters `/health`, `/docs` and `/reference`
  via `shouldIgnoreRequest`. Turning on export makes it real with no code change
  and yields latency percentiles a log line never could. Re-enabling pino
  request logging would record every request twice, in two systems that can
  disagree.
- **Extending the `yq` bridge** over removing `ignoreChanges: ["spec"]` — the
  bridge is established precedent at `deploy-services.yml:176-188` and is the
  low-risk path. Cost accepted, and stated plainly: configuration is declared in
  Pulumi and delivered by a workflow, so the two can drift, and this run adds a
  third and fourth variable to that drift surface. Reconciling the spec is the
  correct end state — the code comment says "until we reconcile the spec" — but
  it makes every Pulumi run trigger a ~30-minute deployment and is a larger
  change than this run's subject. Carry it to the retro as a seed.
- **Credentials stripped, identifiers kept** over dropping query strings and IP
  — `venueId` and `guestId` are internal cuids rather than personal data, and
  they are most of the debugging value being recovered. Cost accepted: a future
  query parameter carrying an email or a name would ship until noticed, which is
  why the policy lives in one component that can be tightened in one place.
- **No Sentry↔Tempo trace linking** in this run — wiring Sentry's span processor
  into the existing `NodeSDK` would let an error pivot to its trace, which is
  genuinely valuable. It loses on scope: the target state is answering "what
  happened last month", which service-plus-timestamp correlation already
  satisfies, and the change touches the SDK's initialization order, which is the
  most fragile part of the bootstrap. Carry it to the retro as a seed.
- **Fail closed on missing telemetry config in production** over warn-and-continue
  — a warning is what the system already effectively does, three times over, and
  nobody read it. The cost is real and should be named: a telemetry misconfiguration
  can now prevent a deploy from serving. That is the intended trade, because a
  service running blind has repeatedly proven more expensive than a service that
  refuses to start.

## ADRs

None. The vendor choices were already made and recorded in
`docs/evaluations/2026-02-26-observability-monitoring.md`, and the remaining
decisions are reversible in an afternoon. The one candidate that clears the bar
for hard-to-reverse is reconciling `ignoreChanges: ["spec"]`, and that is
deliberately out of scope here — it earns its own ADR when it is actually done,
not as a promise made by a run that is not doing it.
