---
stage: capture
run: maintenance:otlp-localhost-default
date: 2026-09-02
re-entry: architect
assumptions:
  - The skill offers a defect brief or a condition brief and the autorun brief never names which; I wrote a defect brief, because the run is driven by live production error events (something is broken now) rather than by a degradation metric such as build time or versions behind.
  - The capture skill's step 2 requires claiming the originating backlog seed in place, and I did not do it, because this autorun stage was instructed that creating this file is its only permitted write; I assumed that write restriction takes precedence over the skill's claim step rather than the reverse, since an unclaimed seed is recoverable and an unsanctioned write into another session's dirty working tree is not.
surfaced:
  - Since when this has been happening is unmeasured and unmeasurable from here — backend error reporting itself was dead until 2026-09-02, so the absence of events before that date is evidence about Sentry, not about the exporters. No start date is claimed.
  - The failure cadence is unexplained. The source sets an export interval of 30 000 ms, implying roughly 120 export attempts per hour per service, and Sentry has recorded 3 events in total across both affected services. What suppresses the rest — Sentry grouping, event sampling, or only some export failures surfacing as unhandled rejections — is unmeasured.
  - Why `users-api` has produced no event of this shape is unmeasured. It boots through the identical `startServiceServer` path and carries the identical (absent) OTEL configuration, and a 30-day Sentry search of the `users-api` project for `AggregateError` returned nothing. The asymmetry is measured; its cause is not.
  - Which of the two exporters produces the rejection — the trace exporter, the 30-second metric reader, or both — is undetermined. Every frame in the captured stack is `node:net`/`node:internal`; no OpenTelemetry frame appears, so the event cannot be attributed to one exporter from the evidence available.
  - The originating backlog seed (the OTLP line in `docs/backlog.md`) is still unclaimed. Per the protocol its line needs the claim marker for this run appended; this stage was not permitted to write it.
  - That same backlog seed asserts the rejection fires "~45-60s after each boot". That is measured false for one of the two observed events (see Reproduction), so a downstream stage should not carry the seed timing claim forward.
---

# Defect: OTLP exporters default to localhost:4318 in production

## Defect

**Observed.** Every backend service boots, constructs an `OTLPTraceExporter`
and an `OTLPMetricExporter` with no arguments, and both fall back to the
OpenTelemetry default endpoint `http://localhost:4318`. Nothing is listening
there. The resulting connection failures surface in production Sentry as
unhandled promise rejections — `AggregateError` wrapping
`connect ECONNREFUSED ::1:4318` and `connect ECONNREFUSED 127.0.0.1:4318`.

**Expected.** With no collector configured, telemetry export should be off,
not attempted-and-failing. A service with nowhere to send traces should not
emit a production error event every time it tries.

The code models two states — enabled and disabled — and production is in a
third it does not model: enabled but unconfigured.

## Reproduction / Evidence

Everything below was run or fetched during this capture stage. Timestamps in
Sentry evidence are UTC; the local date of this stage is 2026-09-02 (PDT), so
part of the evidence window carries a 2026-09-03 UTC date.

### 1. The construction site, read from `origin/main`

`git show origin/main:packages/observability/src/sdk.ts`, lines 76-82 — the
brief's line reference is accurate against `origin/main` (`e448d4a36`):

```ts
    traceExporter: isDisabled ? undefined : new OTLPTraceExporter(),
    metricReader: isDisabled
      ? undefined
      : new PeriodicExportingMetricReader({
          exporter: new OTLPMetricExporter(),
          exportIntervalMillis: 30_000,
        }),
```

`isDisabled` is `process.env.OTEL_SDK_DISABLED === "true"` (line 57).

`git grep -n "new OTLPTraceExporter\|new OTLPMetricExporter\|PeriodicExportingMetricReader" origin/main`
returns construction sites in exactly one file — `packages/observability/src/sdk.ts`
— plus its own test double. There is no second exporter anywhere in the repo.

`initTelemetry` has exactly one non-test caller,
`packages/service-bootstrap/src/start-service-server.ts:23`, which all three
services enter from their `src/index.ts`.

### 2. Neither environment variable is set in production — measured live

```
$ doctl apps spec get 5dbdcf45-4053-4518-a97b-f1e2b3122a61 --format json \
    | jq -r '.services[] | "\(.name): OTEL keys present -> \([.envs[]?.key
              | select(startswith("OTEL_"))] | if length==0 then "NONE" else join(",") end)"'
users-api: OTEL keys present -> NONE
reservations-api: OTEL keys present -> NONE
agent-api: OTEL keys present -> NONE
```

Only key _names_ were extracted; the spec was not dumped. No `OTEL_`-prefixed
key of any kind exists on any of the three services. So
`OTEL_EXPORTER_OTLP_ENDPOINT` is absent **and** `OTEL_SDK_DISABLED` is absent,
which are precisely the two preconditions the hypothesis below needs. This
independently reproduces the finding recorded at
`docs/fixes/backend-observability-blackout/verification.md:78`.

### 3. The OTel default endpoint, read from the installed dependency

Not quoted from documentation. `@opentelemetry/otlp-exporter-base@0.221.0`
(matching the installed `exporter-trace-otlp-http` and
`exporter-metrics-otlp-http`, both 0.221.0),
`build/src/configuration/otlp-http-configuration.js:60`:

```js
        url: 'http://localhost:4318/' + signalResourcePath,
```

### 4. The live Sentry events

`RESERVATIONS-API-7` — fetched this stage, `environment: production`,
`server_name: reservations-api`, `handled: yes`,
`extra.unhandledPromiseRejection: true`, `runtime: node v22.12.0`,
`os: Alpine Linux 3.19.4`:

```
AggregateError
  at internalConnectMultiple (node:net:1128:18)
During handling of the above exception, another exception occurred:
Error: connect ECONNREFUSED ::1:4318
During handling of the above exception, another exception occurred:
Error: connect ECONNREFUSED 127.0.0.1:4318
```

|                  | `RESERVATIONS-API-7`                         | `AGENT-API-8`            |
| ---------------- | -------------------------------------------- | ------------------------ |
| Occurrences      | 2                                            | 1                        |
| Users impacted   | 0                                            | 0                        |
| `app_start_time` | 2026-09-02T23:18:35.973Z                     | 2026-09-02T22:39:05.789Z |
| First event      | 2026-09-02T23:19:32.349Z                     | 2026-09-02T23:19:32.500Z |
| Delay from boot  | **56.4 s**                                   | **40 min 26.7 s**        |
| Last event       | 2026-09-03T00:33:37.831Z (75 min after boot) | same single event        |

Two things in that table are worth carrying forward and neither is explained:

- **The seed's timing claim does not hold.** `AGENT-API-8` fired 40 minutes
  after its container booted, so "~45-60 s after each boot" (the backlog seed's
  wording) describes one event out of three. `RESERVATIONS-API-7`'s last event
  is 75 minutes after the same boot, so this is not a start-up-only race on
  either service.
- **The two services' first events are 151 ms apart** (23:19:32.349Z and
  23:19:32.500Z) despite their containers having booted 39.5 minutes apart.
  Something at that instant hit both. This is an observation, not a theory.

### 5. `users-api` has produced no event of this shape — measured, not assumed

The brief asked for this to be checked rather than assumed. A Sentry issue
search over the `users-api` project, 30-day window, for `AggregateError`
returned no issues. A separate org-wide `is:unresolved` sweep over 7 days
returned 17 issues; the only two with culprit `internalConnectMultiple(node:net)`
are `RESERVATIONS-API-7` and `AGENT-API-8`. The `users-api` issues present in
that window (`USERS-API-4`, `-5`, `-6`) are unrelated shapes.

So: two of three services confirmed affected, the third measured silent with no
explanation. `users-api` boots through the same single caller and carries the
same absent configuration, so silence is surprising rather than reassuring.

### 6. What a regression test can hold onto

`packages/observability/src/sdk.test.ts` already mocks `NodeSDK` and asserts
against the constructor argument (`vi.mocked(NodeSDK).mock.calls[0]?.[0]`), with
`vi.resetModules()` and per-test `process.env` restoration. That is the highest
seam the codebase offers and it is already established — a test that sets
neither `OTEL_EXPORTER_OTLP_ENDPOINT` nor `OTEL_SDK_DISABLED` and asserts on
`traceExporter`/`metricReader` fits the existing file without new scaffolding.
Verify is not skippable in a maintenance run, and this is where its evidence
should land.

## Root-cause hypothesis

**Labelled a hypothesis, and it stays one.** Two of its links are now measured
facts and the third is inference:

1. _Measured._ No `OTEL_`-prefixed environment variable exists on any of the
   three production services (§2), so `isDisabled` is `false` and no endpoint is
   configured.
2. _Measured._ With no endpoint configured, the installed
   `@opentelemetry/otlp-exporter-base@0.221.0` resolves the exporter URL to
   `http://localhost:4318/<signal>` (§3).
3. _Inferred._ Therefore the connection refusals to `::1:4318` and
   `127.0.0.1:4318` observed in production (§4) are these exporters. Nothing in
   the captured stack names OpenTelemetry — every frame is `node:net` — so the
   attribution rests on the port number and the absence of any other component
   in this repo that would dial 4318. That is strong circumstantial evidence,
   not a demonstrated causal chain, and it has not been reproduced by making the
   failure appear and disappear on demand.

Confirming or refuting step 3 — and answering which of the two exporters is
responsible — is work for Architect and Verify, not something to assume here.

## Blast radius

- **Services.** All three backend services (`users-api`, `reservations-api`,
  `agent-api`) boot through the one `startServiceServer` -> `initTelemetry`
  path, so all three run the same unconfigured exporters. Two are confirmed
  emitting (`RESERVATIONS-API-7`, `AGENT-API-8`); `users-api` is measured
  silent and unexplained (§5).
- **Users.** None. Users impacted is 0 on both issues, and no request path
  fails — the rejection is entirely in the telemetry path.
- **Actual cost.** Signal pollution. Production `level: error` events for a
  non-problem, in a Sentry project that has been reporting for about a day,
  at exactly the moment its baseline is being learned. This is live right now.
- **Since when.** Unknown, and deliberately not claimed. Error reporting was
  itself dead until the `backend-observability-blackout` fix landed on
  2026-09-02, so nothing before that date can be read as evidence either way.

Review and Ship scale to this: a config/contract change in one package, no user
impact, no data at risk.

## Ruled out

- **Not the missing `SENTRY_DSN`.** That was `maintenance:backend-observability-blackout`,
  now complete. These events exist _because_ that fix landed.
- **Not the LAN DNS sinkhole.** The refusals are to `::1` and `127.0.0.1` from
  inside an Alpine container in production (`server_name: reservations-api`,
  `os: Alpine Linux 3.19.4`), not from a laptop behind the sinkholing resolver.
- **Not Langfuse.** `LangfuseSpanProcessor` is added only when
  `LANGFUSE_PUBLIC_KEY` is set (`sdk.ts:69`) and is a span processor, not an
  OTLP exporter; the failing connection is the exporter's own.
- **Not a path unique to one service.** `initTelemetry` has exactly one
  non-test caller, verified by `git grep` on `origin/main` (§1).
- **Not the Fastify decorator crash.** `USERS-API-4` / `RESERVATIONS-API-5` /
  `AGENT-API-6` (`FastifyError: The decorator 'opentelemetry' has already been
added!`, 12 events each, `level: fatal`) is a _different_ defect in the same
  neighbourhood and it is already fixed: `84c7f3230` ("fix(sentry): disable
  tracing so Sentry stops double-decorating Fastify", merged
  2026-09-02T22:18:25Z) added `skipOpenTelemetrySetup: true` and the Fastify
  integration filter to `packages/sentry/src/node.ts`. Its last event is
  21:50:47Z, before that fix deployed. Do not re-open it — but see Notes for
  the coupling it leaves behind.

## Notes

**Why `re-entry: architect`.** The skill's rule is that a scoped fix with no
design decisions re-enters at Implement and anything design-touching re-enters
at Architect. This is design-touching: the three candidate fixes named in the
brief are not three implementations of one decision, they are three different
answers to "what is this package's telemetry configuration contract" — teach
`initTelemetry` a third state and construct exporters only when an endpoint is
present; set `OTEL_SDK_DISABLED=true` in the app spec as an interim; or make
`infrastructure/pulumi/index.ts:62-64` fail loudly instead of vanishing. They
differ in what happens the day a collector appears, and the brief imposes a
forward-compatibility constraint ("whatever fix lands here has to make the
enabled-and-configured path work the day a collector exists") that is a
constraint on a contract, not on an implementation. The contract is also
cross-package — one function, one caller, three deployed services. Under the
rule that is Architect, so no work items appear in this file; the
`architecture.md` + `breakdown.md` chain owns them.

**Coupling Architect must not miss.** `packages/sentry/src/node.ts` deliberately
sets `skipOpenTelemetrySetup: true` and strips the Fastify integration,
delegating all OpenTelemetry setup to `initTelemetry`. That delegation was added
to stop a `level: fatal` boot crash on all three services (see Ruled out). Any
redesign of `initTelemetry`'s exporter construction is therefore also touching
the arrangement that keeps `@sentry/node` from double-registering Fastify OTel
instrumentation. The comment block at `packages/sentry/src/node.ts:61-84`
records the measurements behind that arrangement and should be read before the
design is drafted.

**Scope boundary to preserve.** Standing up a real collector (Grafana Cloud,
Milestones 2/3 of `backend-observability-blackout`) is explicitly out of scope,
and `docs/fixes/backend-observability-blackout/architecture.md` was left
unedited as that run's input. This run must not foreclose it. Also out of
scope and already separate backlog seeds: the `/public/**` ingress gap, the
`CORS_ORIGIN`/`CORS_ORIGINS` mismatch, and the browser-side `beforeSend`
redaction asymmetry.

**Origin.** Backlog seed from `maintenance:backend-observability-blackout`
(`docs/backlog.md`, the OTLP line). The seed is **not yet claimed** — this
stage was permitted only to create this file. Appending
`(claimed: maintenance:otlp-localhost-default)` to that line is outstanding.

**Tracker.** No tracker interaction. No issue is created, imported, or closed
by this run.
