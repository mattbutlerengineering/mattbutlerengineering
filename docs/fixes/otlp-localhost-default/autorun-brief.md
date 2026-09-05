---
kind: autorun-brief
run: maintenance:otlp-localhost-default
date: 2026-09-03
---

# Autorun brief: OTLP exporters default to localhost:4318 in production

Not an artifact — this file never counts toward orientation or active-run
discovery. It is the single source of interview answers for every stage.

## Origin

Backlog seed, claimed by this run (from `maintenance:backend-observability-blackout`):

> Stop the OTLP exporters defaulting to `localhost:4318` in production —
> `packages/observability/src/sdk.ts:76-83` constructs `new OTLPTraceExporter()`
> and `new OTLPMetricExporter()` with no arguments, so both fall back to the OTel
> default `http://localhost:4318` while `OTEL_EXPORTER_OTLP_ENDPOINT` is absent
> and `OTEL_SDK_DISABLED` is unset, and the `PeriodicExportingMetricReader`
> retries every 30s against nothing.

This defect was found _by_ the observability run, four hours after that run
restored error reporting — it was invisible until Sentry started working.

## Run scale and slug

Maintenance run. Slug `otlp-localhost-default`; artifacts under
`docs/fixes/otlp-localhost-default/`. Entry stage is `capture` (`defect.md`).

## What is broken — observed vs expected

**Observed.** Every backend service boots, constructs both OTLP exporters
pointed at the OTel default `http://localhost:4318`, and there is no collector
there. The trace exporter and the 30-second metric reader both fail. The
failures surface in Sentry as unhandled promise rejections.

**Expected.** With no collector configured, telemetry export should be off —
not attempted-and-failing. A service with nowhere to send traces should not
emit a production error every time it tries.

## Reproduction evidence

Measured, not inferred. Sentry issue `RESERVATIONS-API-7`
(`https://mattbutlerengineering.sentry.io/issues/RESERVATIONS-API-7`),
`environment: production`, `server_name: reservations-api`:

```
AggregateError
  at internalConnectMultiple (node:net:1128:18)
During handling of the above exception, another exception occurred:
Error: connect ECONNREFUSED ::1:4318
During handling of the above exception, another exception occurred:
Error: connect ECONNREFUSED 127.0.0.1:4318

extra.unhandledPromiseRejection: true
tags: environment=production, handled=yes, level=error
context.app.app_start_time: 2026-09-02T23:18:35.973Z
runtime: node v22.12.0 · os: Alpine Linux 3.19.4
```

- First event `2026-09-02T23:19:32.349Z` — **56.4 s after `app_start_time`**.
- Last event `2026-09-03T00:33:37.831Z` — **75 minutes after the same boot**,
  so it is not a start-up-only race.
- `AGENT-API-8` is the identical shape on `agent-api` (first seen same window).
- Users impacted: 0 on both.

Honest limit on the frequency claim: Sentry reports **2 occurrences** on
`RESERVATIONS-API-7`, not one every 30 s. The 30-second cadence is read from
`exportIntervalMillis: 30_000` in the source, not from event counts — the gap
between "the exporter retries every 30 s" and "Sentry recorded 2 events" is
unexplained and is itself worth a Verify question (grouping? sampling? only
some failures reject unhandled?). Do not assert a rate the data does not show.

## Root-cause hypothesis — labelled a hypothesis

`packages/observability/src/sdk.ts` (`initTelemetry`, the only construction
site; called once from `packages/service-bootstrap/src/start-service-server.ts:23`):

```ts
traceExporter: isDisabled ? undefined : new OTLPTraceExporter(),
metricReader: isDisabled
  ? undefined
  : new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
      exportIntervalMillis: 30_000,
    }),
```

`isDisabled` is `process.env.OTEL_SDK_DISABLED === "true"`. The hypothesis is
that in production neither `OTEL_SDK_DISABLED` nor `OTEL_EXPORTER_OTLP_ENDPOINT`
is set, so `isDisabled` is false, both exporters are constructed with no
argument, and the OTel SDK applies its documented default endpoint
`http://localhost:4318`. **There is a third state the code does not model:**
enabled-and-configured, enabled-but-unconfigured, and disabled — only the first
and third behave sensibly.

Related and probably the same fix's neighbour: `infrastructure/pulumi/index.ts:62-64`
emits the endpoint variable only when configured —
`...(otelEndpoint ? [extraEnv("OTEL_EXPORTER_OTLP_ENDPOINT", otelEndpoint)] : [])`
— the vanish-when-unconfigured shape that is byte-for-byte how `SENTRY_DSN` went
missing from the app spec for five months. Already its own backlog seed.

## Blast radius

- All three backend services (`users-api`, `reservations-api`, `agent-api`)
  boot through the same `startServiceServer` path, so all three are affected.
  Two are confirmed in Sentry (`RESERVATIONS-API-7`, `AGENT-API-8`); a
  `USERS-API` sibling was not observed in the sampled window and should be
  checked rather than assumed.
- User-visible impact: none known. No request fails because of this; the
  rejection is in the telemetry path. Users impacted: 0.
- Real cost is signal pollution: production error events for a non-problem,
  in a Sentry project that has been reporting for barely a day, at the exact
  moment its signal is being learned. Firing right now.
- Since when: unknown before 2026-09-02, because error reporting itself was
  dead until the blackout fix landed. Do not claim a start date.

## Already ruled out — do not re-walk

- **Not a missing `SENTRY_DSN`.** That was `maintenance:backend-observability-blackout`,
  now closed; these events exist _because_ that fix landed.
- **Not the LAN DNS sinkhole.** The refusals are to `::1` / `127.0.0.1` from
  inside an Alpine container in production, not from this laptop.
- **Not Langfuse.** `LangfuseSpanProcessor` is added only when
  `LANGFUSE_PUBLIC_KEY` is set and is a separate span processor; the failing
  connection is the OTLP exporter's own.
- **Not a code path unique to one service.** `initTelemetry` has exactly one
  caller.

## Scope

**In scope.** The construction of the two OTLP exporters in
`packages/observability/src/sdk.ts` and whatever configuration contract that
implies; the Pulumi env-var shape at `infrastructure/pulumi/index.ts:62-64`
if and only if the chosen fix depends on it; a regression test that fails on
the current behaviour.

**Out of scope.** Standing up a real collector or a Grafana Cloud account —
that is the deliberately-deferred M2/M3 follow-up to
`backend-observability-blackout`, whose `architecture.md` was left unedited as
its input. This run must not foreclose it: whatever fix lands here has to make
the enabled-and-configured path work the day a collector exists.
Also out: the `/public/**` ingress gap, the `CORS_ORIGIN`/`CORS_ORIGINS`
mismatch, and the browser-side `beforeSend` redaction asymmetry — all separate
backlog seeds.

## Constraints already decided

- TDD: a failing test first, at the highest seam the codebase offers.
- Zero-Touch Audit before commit; stage by explicit path; `pnpm typecheck`
  before push (nothing else gates it — the pre-push hook does not typecheck).
- Surgical scope; match the surrounding style.
- No secrets in the diff. Do not read service `.env` files for production
  credentials; if the live DigitalOcean app spec must be consulted, check for
  the presence of specific non-secret keys, never dump the spec.

## Tracker

**No tracker interaction.** The breakdown's checkboxes are the only state; no
issues are created, imported, or closed by this run.

## User-facing surface

None. Backend telemetry configuration only, so the PRD/UX conditional does not
apply — a maintenance run's `defect.md` replaces the idea/PRD chain anyway, and
`re-entry:` decides whether `architecture.md` + `breakdown.md` follow.

## Release authorization

**Authorized: merge on green, deploy via CI.** Review gate (`reviewer`, plus
any specialist `reviewersForDiff` returns) plus `CI Gate` success, then
`gh pr merge <N> --auto --squash --delete-branch`. Deploys happen only through
GitHub Actions on merge — no manual `doctl` or `wrangler`. A rialto npm publish
is not authorized and is not implicated. Unfixed critical review findings block
the merge unconditionally; stop and surface instead.

## Note for the capture stage

`re-entry:` is genuinely open and is capture's call under its own rule
(scoped-fix → implement, design-touching → architect). The facts that bear on
it: there are at least three candidate fixes — construct the exporters only
when an endpoint is configured; set `OTEL_SDK_DISABLED=true` in the app spec as
an interim; or make the Pulumi shape fail loudly instead of vanishing — and
they differ in what happens the day a collector appears. That reads
design-touching, but the rule is capture's to apply, not the brief's.
