---
stage: architect
run: maintenance:otlp-localhost-default
date: 2026-09-02
assumptions:
  - No `ux:` field is echoed here. The protocol's maintenance-run orientation table has no PRD or UX Design row at all, so there is no `prd.md` carrying a `ux-reason:` to echo; the brief independently records "User-facing surface: None". This is a reading of the protocol rather than a design choice, recorded so its absence is not read as an omission.
surfaced:
  - Whether the boot notice this design adds should exist at all is a preference the inputs never express. It is the one element not strictly required to stop the Sentry events, and it is included because "absence renders identically to health" is the exact class this neighbourhood has now produced three times. If it is unwanted, deleting it does not weaken the fix.
  - Which of the two exporters produced the rejection stays undetermined, and this design makes it permanently undeterminable from production once shipped — the fix removes the population that would answer it. See "What this design makes newly answerable, and newly unanswerable".
  - The failure cadence (roughly 120 export attempts per hour per service implied by `exportIntervalMillis: 30_000`, against 3 recorded Sentry events) is untouched by this design and becomes unobservable for the same reason.
  - Why `users-api` produced no event of this shape is untouched by this design and likewise becomes unobservable after the fix, because all three services go silent together.
  - Why both services' first events landed 151 ms apart despite booting 39.5 minutes apart is untouched by this design. Nothing in the contract below depends on an answer.
---

# Architecture: model the third telemetry state

## Approach

`initTelemetry` reads one environment variable, `OTEL_SDK_DISABLED`, and
branches two ways. Production sits in a third state — enabled but with nowhere
to send anything — and the design's whole job is to teach the function to name
that state and fill the SDK's slots correctly for it. The shape is a small pure
resolver in `@mbe/observability` that turns `process.env` into a **telemetry
plan** (`disabled` | `unconfigured` | `exporting`, plus which signals have a
destination), and an `initTelemetry` that does nothing but translate that plan
into `NodeSDK` constructor options. That mirrors `@mbe/sentry`'s existing
`resolveConfig(dsn) -> { …, enabled }` almost exactly, which is the strongest
argument for it: the same package family already answers "is this signal
configured?" this way, and one more signal answering it the same way is a
pattern being reused rather than invented.

The shape that lost is doing it at the deploy boundary instead — set
`OTEL_SDK_DISABLED=true` (or `OTEL_TRACES_EXPORTER=none`) on the live app spec
and change no code. It is smaller and it would work today. It loses on the
run's binding constraint: both variables are settings that must be **removed**
the day a collector exists, so the interim fix has to be found and undone by
whoever does M2, and if they miss it the collector is provisioned and silently
receives nothing. It also fixes exactly one environment; a code fix covers all
three services, every future environment, and local development, from one
place.

**The measured fact that makes this an Architect problem and not a one-line
edit.** The obvious implementation of the recommended shape does not work.
Setting `traceExporter: undefined` while leaving the SDK enabled does not
disable trace export — `NodeSDK.start()` falls through to
`getSpanProcessorsFromEnv()`, which treats an unset `OTEL_TRACES_EXPORTER` as
`otlp` and builds its own OTLP exporter, landing on the same
`http://localhost:4318`. Measured against the installed
`@opentelemetry/sdk-node@0.221.0`, `build/src/sdk.js:200-214` (the
`else { spanProcessors = getSpanProcessorsFromEnv(...) }` branch) and
`build/src/utils.js:119-140` (`OTEL_TRACES_EXPORTER is empty. Using default otlp
exporter.`). The metric path has the identical fall-through in the constructor:
`sdk.js:145-149` selects `getMetricReadersFromEnv()`, and `sdk.js:29-32`
defaults `OTEL_METRICS_EXPORTER` to `otlp`. So the naive fix would relocate the
localhost exporter from our code into the SDK's and change nothing observable.
The contract below is written around that.

## Components

### Telemetry plan resolver (new — `packages/observability/src/otel-config.ts`)

- **Responsibility:** the single answer to "what should this process do with
  telemetry, given its environment?" It owns four rules that are currently
  either absent or implicit: how `OTEL_SDK_DISABLED` is read, what counts as a
  configured endpoint, that OTel's signal-specific endpoint variables override
  the generic one, and that a whitespace-only value is not a value.
- **Collaborators:** `initTelemetry`, its only caller. Imports nothing — it
  takes a `NodeJS.ProcessEnv` and returns a plain record, so its tests need no
  mocks at all.
- **Deletion test:** if it vanished, `initTelemetry` would inline four env
  reads plus OTel's precedence rules, and every test of those rules would have
  to go through the `NodeSDK` mock to observe them. Complexity reappears across
  the caller and its tests. It survives.
- Deliberately **not** a port, an interface, or a strategy. One
  implementation, one caller, no seam introduced.

### Telemetry bootstrap (`packages/observability/src/sdk.ts`, existing)

- **Responsibility:** unchanged — translate the environment into a live
  `NodeSDK` before the HTTP stack is imported. It gains one job: fill the SDK's
  exporter slots from the plan instead of from a boolean, using the explicit
  shapes that actually suppress the SDK's env fall-through.
- **Collaborators:** the resolver above, `NodeSDK`, and
  `start-service-server.ts` (its only non-test caller, at line 23 — verified by
  `git grep -n initTelemetry origin/main`).
- **Invariant it must not break:** instrumentation ownership.
  `packages/sentry/src/node.ts` sets `skipOpenTelemetrySetup: true` and filters
  the `Fastify` integration out of Sentry's defaults, on the stated premise that
  `@mbe/observability` owns all OpenTelemetry setup — the arrangement commit
  `84c7f3230` added to stop `FST_ERR_DEC_ALREADY_PRESENT` killing all three
  services at boot. This design touches only the two exporter slots. The
  `instrumentations` array keeps its current value in every mode, so
  `FastifyOtelInstrumentation` remains constructed and registered in the new
  `unconfigured` mode and the premise stays true.

### What is deliberately **not** a component here

- **`infrastructure/pulumi/index.ts:62-64`** — the vanish-when-unconfigured
  `otelEnvs` shape. Out of scope by the brief's own rule ("if and only if the
  chosen fix depends on it"); this fix does not. Two measured reasons it is also
  not urgent: the app resource carries `ignoreChanges: ["spec"]`
  (`index.ts:271`), so Pulumi's env declaration does not reach the live spec at
  all — delivery is the `yq` bridge in `deploy-services.yml` — and the line
  already has its own backlog seed (`docs/backlog.md:75`), separate from this
  run's (`:81`). Folding it in would merge two seeds and change a declaration
  that production never reads.
- **`validateStartupConfig`** — see _Decisions_. Adding the OTLP variables to
  it today would refuse every production boot.

## Data model

No persistent entities. The model is the mode lattice and the environment keys
that decide it, chosen from the three questions `initTelemetry` must answer at
boot and nothing else:

| Access pattern (asked once, at boot)       | Decided by                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| "Should anything run at all?"              | `OTEL_SDK_DISABLED`                                                       |
| "Do spans have somewhere to go?"           | `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`, else `OTEL_EXPORTER_OTLP_ENDPOINT`  |
| "Do metric readings have somewhere to go?" | `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`, else `OTEL_EXPORTER_OTLP_ENDPOINT` |

```ts
export type TelemetryMode = "disabled" | "unconfigured" | "exporting";

export interface TelemetryPlan {
  readonly mode: TelemetryMode;
  readonly exportTraces: boolean;
  readonly exportMetrics: boolean;
  /** One log-safe line naming which KEY decided the mode. Never a value. */
  readonly reason: string;
}
```

`mode` is `exporting` when at least one signal has a destination; the two
booleans say which. They are separate fields rather than derived from `mode`
because OTel's own precedence permits a per-signal endpoint, so the two
answers genuinely can differ.

**Invariant ownership.** The plan owns "is this configured?" outright. No other
module may re-derive it — that duplication is how `@mbe/sentry`'s
`resolveConfig` earns its keep, and the same rule applies here.

**Consistency.** Resolved exactly once, at boot, before the HTTP stack is
imported. Nothing re-reads the environment afterwards and there is no runtime
reconfiguration path, so no consistency question arises. Changing telemetry
configuration is a redeploy, which is already true today.

## Interfaces & contracts

### `resolveTelemetryPlan(env: NodeJS.ProcessEnv = process.env): TelemetryPlan`

- **Input:** an environment record. Never `process.env` implicitly in tests —
  the parameter exists so the rules are testable without `vi.resetModules()`,
  matching `validateStartupConfig(env = process.env)`'s existing signature.
- **Output:** a `TelemetryPlan`. Total function; every input yields a plan.
- **Rules it owns, each matching the installed dependency rather than a guess:**
  - `disabled` when `OTEL_SDK_DISABLED`, trimmed and lowercased, equals
    `"true"`. This is a deliberate widening of today's `=== "true"` to match
    OTel's own `getBooleanFromEnv` (`@opentelemetry/core@2.10.0`,
    `build/src/platform/node/environment.js:55-73`, which does
    `raw?.trim().toLowerCase()` and accepts only `"true"`/`"false"`). Today
    `OTEL_SDK_DISABLED=TRUE` makes `NodeSDK._disabled` true while our own
    `isDisabled` stays false — the process is inert either way, but the two
    disagree, and after this change the boot notice would state a mode the SDK
    is not in.
  - A key counts as set only when it is present and not whitespace-only —
    matching `getStringFromEnv` in the same file (lines 38-44), so the
    resolver's verdict and the exporter's own reading can never disagree.
  - Signal-specific endpoint wins over the generic one, matching
    `otlp-node-http-env-configuration.js:62-75`
    (`getSpecificUrlFromEnv` / `getNonSpecificUrlFromEnv`).
- **Failure modes:** none. It performs no I/O, throws nothing, and does not
  validate that the endpoint is reachable or well-formed — a malformed URL is
  the exporter's problem, and OTel already logs and falls back on it.
  Deliberately **not** fail-fast: see _Decisions_.

### `initTelemetry(config: OtelConfig): NodeSDK` (signature unchanged)

- **Input:** unchanged. The only caller passes `{ serviceName }`.
- **Output:** a `NodeSDK` whose slots are filled per the plan:

| mode           | `spanProcessors`                                         | `traceExporter`           | `metricReaders`                                                                                             | `instrumentations` |
| -------------- | -------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------ |
| `disabled`     | `[]`                                                     | omitted                   | `[]`                                                                                                        | `[]`               |
| `unconfigured` | Langfuse processors, else `[]`                           | omitted                   | `[]`                                                                                                        | full set           |
| `exporting`    | Langfuse processors; key **omitted** when there are none | `new OTLPTraceExporter()` | `[new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter(), exportIntervalMillis: 30_000 })]` | full set           |

The empty arrays are the load-bearing part and are not cosmetic. `[]` is
truthy, so passing it takes `NodeSDK`'s **first** branch
(`if (this._configuration?.spanProcessors)`, `sdk.js:202`;
`if (configuration.metricReaders)`, `sdk.js:132`) and yields an empty
collection, which `start()` then declines to register
(`if (spanProcessors.length > 0)`, `sdk.js:217`; `readers.length > 0`,
`sdk.js:182-184`). Omitting the key instead takes the env-defaulting branch and
reconstructs the localhost exporter. **An implementation that writes
`undefined` here has not fixed the defect**, and the code must carry that as a
comment citing the line numbers, in the house style of
`packages/sentry/src/node.ts:62-85`.

In `exporting` mode with no Langfuse processors the `spanProcessors` key is
omitted on purpose, so `NodeSDK` builds the batch processor itself via
`createBatchSpanProcessorFromEnv` (`sdk.js:208-212`) and the `OTEL_BSP_*`
tuning variables keep working. That is today's behaviour, preserved.

- **The exporters keep being constructed with no arguments.** This is the
  forward-compatibility decision in one line: endpoint, headers, timeout,
  compression and the `/v1/traces` vs `/v1/metrics` path suffix stay owned by
  the OTel SDK's own env resolution, exactly as `sdk.ts`'s docstring already
  advertises and exactly as M2 assumes. The plan decides **whether** to
  construct, never **where** to point. Re-deriving a URL here would mean
  re-implementing OTel's precedence and path-appending rules
  (`appendResourcePathToUrl` vs `appendRootPathToUrlIfNeeded`) — a second
  implementation of a rule that would then drift from the first.
- **Failure modes:** in `unconfigured` and `disabled` modes there is no
  outbound telemetry connection, so there is nothing to fail. Instrumentation
  in `unconfigured` mode records into the API's no-op tracer, because no
  `TracerProvider` is registered; spans are non-recording and cost an
  allocation, not a network call.
- **Boot notice:** one line, unconditionally, naming `plan.mode` and
  `plan.reason` — which key was consulted, never its value, following
  `validateStartupConfig`'s `describeShape` discipline of never printing a
  configuration value. Written with `console` because this runs before Fastify
  and therefore before pino exists; `start-service-server.ts` already uses
  `console.error` at the same stage. Not `diag` from `@opentelemetry/api`,
  which is silent unless `OTEL_LOG_LEVEL` is set and would therefore say nothing
  in exactly the deployment that needs it.

### OTLP export → collector (unchanged, stated because it is the contract M2 inherits)

- **Input:** batched spans and metric readings over OTLP/HTTP, to the endpoint
  the SDK resolves from `OTEL_EXPORTER_OTLP_*`.
- **Output:** 2xx. Nothing in-process consumes the response.
- **Failure modes:** 10 s timeout per attempt, concurrency limit 30,
  compression `none` — measured, not assumed
  (`@opentelemetry/otlp-exporter-base@0.221.0`,
  `build/src/configuration/shared-configuration.js:41-47`). On timeout or
  non-2xx the batch is retried and then dropped. Request serving is never
  affected: export is asynchronous and bounded. Retry is safe — spans carry
  stable ids, so a redelivered batch is idempotent at the collector.
- **The failure this run removes is none of those.** It is the endpoint being
  _unset_, which resolves to `http://localhost:4318/<signal>`
  (`otlp-http-configuration.js:60`) and produces a connection refusal on every
  attempt. After this change that state constructs no exporter, so the contract
  above only ever applies to a real destination.

## Stack & dependencies

- **No new dependency.** The change is one new file of pure logic and an edit
  to one existing file, both inside `packages/observability`.
- **`@opentelemetry/sdk-node@0.221.0` behaviour is now depended on explicitly**
  — specifically its branch selection between caller-supplied and
  env-derived exporters. That dependency already existed implicitly; this design
  makes it load-bearing, so it must be pinned by a comment naming the version
  and the lines, and re-read on any bump. This is a large library reached
  through one call, not a type that spreads: `TelemetryPlan` contains no OTel
  types and appears in no other package's signatures.
- **`scripts/check-env-sync.js` is a gate this change trips.** It walks each
  service's transitive workspace closure, so `process.env.X` reads inside
  `packages/observability` count as reads by all three services and must appear
  in each `.env.example` or in `PLATFORM_VARS`. `OTEL_EXPORTER_OTLP_ENDPOINT`
  and `OTEL_EXPORTER_OTLP_HEADERS` are already in `PLATFORM_VARS` (lines 18-19);
  the two signal-specific keys are not. They belong in `PLATFORM_VARS` for the
  reason already written above it — platform-injected, never hand-configured.
  `pnpm repo-audit` runs this check in CI's Build job, so missing it is a red
  gate, not a silent drift.

## Decisions & alternatives

- **Fix in code** over setting `OTEL_SDK_DISABLED=true` on the app spec — the
  interim flag must be removed the day a collector exists, which is precisely
  the "silences the noise and has to be undone later" outcome the run forbids;
  it also disables `instrumentations`, removing the `FastifyOtelInstrumentation`
  that `packages/sentry` delegates Fastify OTel ownership to, and it fixes one
  environment rather than the code path all three share.
- **Explicit empty collections** over `traceExporter: undefined` /
  `metricReader: undefined` — measured: `undefined` takes `NodeSDK`'s
  env-defaulting branch and rebuilds the same localhost exporter, so the obvious
  fix is a no-op. This is the single most important line in the artifact.
- **Empty collections in `disabled` mode too**, rather than leaving that path on
  today's `undefined` — it currently works only because `_disabled` makes
  `start()` return early, while the constructor still builds a localhost OTLP
  metric exporter object it never uses. Making all three modes fill the same
  slots the same way removes a latent surprise and costs nothing.
- **`metricReaders` (plural)** over the existing `metricReader` — the empty case
  must use the plural key to hit the truthy branch, and mixing plural-when-empty
  with singular-when-populated would be incoherent. That it also stops
  `NodeSDK`'s `"The 'metricReader' option is deprecated"` warning (`sdk.js:143`)
  is a consequence, not the reason.
- **Match OTel's own env-reading semantics** (trim, lowercase, whitespace-is-unset)
  over today's `=== "true"` and a bare truthiness check — a resolver that
  disagrees with the SDK about what "set" means would report a mode the process
  is not in, which is the failure this run exists to stop, one level up.
- **Honour the signal-specific endpoint variables** over reading only
  `OTEL_EXPORTER_OTLP_ENDPOINT` — the narrower predicate would answer
  "unconfigured" for a legitimately configured deployment and silently export
  nothing. That is the same silent-absence class, inverted. Cost: two more env
  keys and a `PLATFORM_VARS` entry.
- **A boot notice, not a boot failure** — the prior run's stance was fail-closed
  on missing telemetry config, and M2's breakdown already carries "Extend
  production boot validation to the OTLP variables", blocked by "Declare and
  deliver the OTLP variables". That ordering is not decoration: adding OTLP to
  `validateStartupConfig` today, before any endpoint exists, would refuse every
  production boot on all three services. The fail-closed guard belongs where M2
  already put it — after delivery — and this run must not move it earlier.
- **Notice on stdout** over a readiness check — `ReadinessCheckResult` is
  `"ok" | "error"`, so "telemetry unconfigured" would either be `ok` (and say
  nothing) or `error` (and fail `/ready`, which DigitalOcean uses to decide
  whether to route traffic). There is no third value, and inventing one to carry
  a warning would widen a health contract three services depend on.
- **Leave `infrastructure/pulumi/index.ts:62-64` alone** — out of scope by the
  brief's rule, already its own backlog seed, and measured not to reach the live
  spec under `ignoreChanges: ["spec"]`.

## Pre-existing behaviour this design surfaces but does not change

**When `LANGFUSE_PUBLIC_KEY` is set, the OTLP trace exporter is silently
ignored.** `spanProcessors` is checked before `traceExporter` (`sdk.js:202` vs
`:208`), so a Langfuse-enabled process exports spans to Langfuse and nowhere
else, whatever `OTEL_EXPORTER_OTLP_ENDPOINT` says. This is true today and stays
true after this change. It is dormant in production — measured this stage, no
`LANGFUSE_`-prefixed key exists on any of the three services (key names only,
via `doctl apps spec get … | jq`, the same pattern as `defect.md` §2) — and it
only becomes a real problem at M2, when both a collector and Langfuse could be
configured at once. Flagged, not fixed: fixing it means constructing the batch
span processor by hand, which is M2's decision to make with a real endpoint to
test against.

That same precedence is also why Langfuse-enabled deployments never had this
defect: `spanProcessors: [langfuse]` already took the first branch and no
localhost exporter was ever built.

## What this design makes newly answerable, and newly unanswerable

**Newly answerable — one of the four open unknowns, partially.** The
attribution in `defect.md` §Root-cause step 3 is circumstantial: no
OpenTelemetry frame appears in the captured stack. After this change the
services construct no exporter pointed at localhost in any mode, so a
`connect ECONNREFUSED …:4318` event appearing after the deploy would _refute_
the hypothesis and point at something else in the container. Verify gets a
discriminating observation it does not have today. It is a refutation test, not
a confirmation: silence afterwards is consistent with the hypothesis without
proving it.

**Newly unanswerable — three of them, permanently, from production.** Which
exporter produced the rejection, why the cadence was 3 events rather than ~120
per hour, and why `users-api` was silent are all questions about a population
this fix deletes. After Ship there is no longer anything emitting to observe.
If those questions are worth keeping alive, **the evidence must be captured
before the deploy, not after** — per-service event counts and first/last-seen
timestamps on `RESERVATIONS-API-7` and `AGENT-API-8`, and the `users-api`
negative result, recorded in `verification.md` as the pre-state. Nothing in the
design depends on any of the three answers, and none of them changed a decision
above.

## Verification seam, and its honest limit

`packages/observability/src/sdk.test.ts` already mocks `NodeSDK` and asserts on
the constructor argument with `vi.resetModules()` and per-test `process.env`
restoration, which is the highest seam the codebase offers and needs no new
scaffolding. It can prove the argument and **not** the outcome: because
`NodeSDK` is mocked, no test in that file can observe the env fall-through that
makes `undefined` wrong. A test asserting "no exporter was constructed" would
pass against an implementation that still exports to localhost.

So the assertion must be on the shape that provably suppresses the fall-through
— `spanProcessors: []` and `metricReaders: []` — and the test must carry a
comment saying why `[]` and not `undefined`, citing the `sdk.js` lines. The pure
resolver carries the rest of the coverage with no mocks at all. A test against a
real `NodeSDK` would be the only way to observe the outcome in-process, and it
is rejected: `NodeSDK.start()` monkey-patches Node's HTTP stack globally, which
is not safe inside a shared vitest run.

## ADRs

None — no decision met the bar. The change is reversible in minutes (one new
file and one edited function in a single package), and the only genuinely
surprising element, the empty-collections requirement, is a fact about a
dependency that a code comment records better than an ADR would. The decision in
this neighbourhood that does clear the bar — reconciling `ignoreChanges: ["spec"]`
so configuration is declared and delivered in one place — is out of scope here
and was already reserved for the run that actually does it, in
`docs/fixes/backend-observability-blackout/architecture.md`.
