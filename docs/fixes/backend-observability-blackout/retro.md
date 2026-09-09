---
stage: operate
run: maintenance:backend-observability-blackout
date: 2026-09-03
---

# Retro: backend observability blackout

Written 3h20m after the release deploy went ACTIVE. That is short for a retro,
and the outcome signal below is labelled accordingly — but it is not zero,
because this run's success criterion is the one thing that reports on itself.

## Outcomes vs. intent

`defect.md`'s target state, verbatim: "a deliberately thrown error in each
service is proven ingested by its Sentry project; a successful request leaves a
durable record; and that record survives an intervening deploy."

### A deliberately thrown error in each service reaches its Sentry project

- **What happened:** met at Verify with synthetic traffic, and now met by
  traffic nobody staged. Three organic issues landed in the 3h20m after
  release, none of them carrying a marker: `RESERVATIONS-API-8`
  (`HTTP 503: GET /ready`), `USERS-API-1` (same shape, other service), and
  `RESERVATIONS-API-7` (`AggregateError`, unhandled rejection).
- **Signal strength: measured.** The synthetic round trips proved the pipe
  existed; these prove it carries real traffic. For five months this same
  production behaviour produced nothing at all.

### A successful request leaves a durable record

- **What happened:** still false. This is `verification.md`'s single FAIL (T2),
  descoped to Milestone 2/3 and gated on a Grafana Cloud account. A successful
  request in production is still unrecorded once the DigitalOcean log window
  rolls, which every deploy destroys.
- **Signal strength: measured** — measured as not met, and shipped that way
  deliberately.

### That record survives an intervening deploy

- **What happened:** met, and re-demonstrated by the release itself.
  `USERS-API-6` now spans four events across three container generations
  (`app_start_time` 22:38, 23:18, 00:32). `doctl apps logs` 400s on the
  superseded deployment that produced the first of them; Sentry still returns
  it by ID.
- **Signal strength: measured.**

### The outcome nobody wrote a criterion for

Restoring reporting immediately surfaced two production defects that had been
invisible, which is a better argument for the run than any criterion it set
itself.

**1. `/ready` returns 503 on healthy, long-running containers.**
`RESERVATIONS-API-8` fired at 01:47:55 on a container whose `app_start_time` is
00:32:42 — 75 minutes after boot, so not a start-up race. `USERS-API-1` is the
same shape on a different service. Neither is explained yet.

**2. Every service has been failing OTLP export against a collector that does
not exist.** `RESERVATIONS-API-7`'s cause chain is
`connect ECONNREFUSED ::1:4318` then `connect ECONNREFUSED 127.0.0.1:4318`,
arriving as an unhandled promise rejection ~45-60s after each boot. Traced to
`packages/observability/src/sdk.ts:76-83`: `new OTLPTraceExporter()` and
`new OTLPMetricExporter()` are constructed with **no arguments**, so they fall
back to the OTel default `http://localhost:4318`, and the
`PeriodicExportingMetricReader` retries every 30 000 ms. `OTEL_SDK_DISABLED` is
unset in production and `OTEL_EXPORTER_OTLP_ENDPOINT` is absent, because
`infrastructure/pulumi/index.ts:62-64` emits that variable only when
configured.

That second one is the sharpest result of the whole run. It is the _same defect
shape_ as the blackout being fixed — a vanish-when-unconfigured env var, a
component that fails silently, an absence rendering as success — running
concurrently, one file away, and it took restoring error reporting to see it.
It was seeded during this stage as a _future_ risk to M2, on the reasoning that
the traces work would land on that line. Production answered within the hour:
it is not a future risk, it is happening now.

### A premise that did not survive checking

`defect.md` says backend Sentry reported zero events since ~2026-04-02.
Sentry's own metadata disagrees: `USERS-API-1` has **First Seen
2026-05-19T23:00:12Z**, mid-blackout. The event itself is past the 90-day query
window (a `period: 90d` search on that issue returns only the 2026-09-03 one),
so why it got through cannot be recovered now.

This changes nothing about the fix or its verification — the DSN's absence from
the app spec was measured directly, not inferred from the event count, and the
round trips are independent of it. But the brief's headline number was asserted
rather than measured, and that is the third instance in this run of a claim that
named the right mechanism without checking whether the path was populated.
Do not cite "zero events since April" as evidence.

## Run retrospective

- **Keep: making Verify prove the negative, not just the positive.** The guard
  CLI was exercised in all four states (unset / empty / whitespace / valid) and
  the round trip was run per service against the deployed app. Every criterion
  that turned out to matter later was one that had quoted output behind it.
- **Keep: Review as a real pass rather than a formality.** It found two majors
  the full test suite, lint, and typecheck were all green on — the parsed
  `cookies` map and the `paths:` gap. Neither was detectable from a diff read
  alone; both needed reading the installed dependency and the workflow trigger.
- **Keep: shipping with a FAIL on the board.** T2 is red in `verification.md`,
  named in `release.md`'s pre-flight, and named again here. Nothing had to be
  softened for the run to close.
- **Change: the brief's factual claims need the same evidence bar as
  Verify's.** Both corrections this run produced (`sentry-dsn-static-builds`'s
  "all backend services not affected", and this run's own "zero events since
  April") were confident sentences in a Capture-stage artifact that nobody was
  required to check. Capture has no evidence discipline; Verify has all of it.
- **Change: fix the deploy trigger before trusting a merge.** #4927 merged green
  and shipped nothing, and that went unnoticed until Review. The gap between
  "CI is green" and "the change is running" had no check in it at all.
- **Stop: treating a passing `check-*.mjs` as coverage of its own domain.**
  Two of this run's findings sat inside the declared scope of a green checker —
  `check-workflow-paths-coverage.mjs` cannot model transitive deps, and
  `check-deploy-secret-provisioning.mjs` misses `SENTRY_DSN` for two
  independent reasons. Both report success while blind.

## Idea seeds

Seeded to `docs/backlog.md` this stage (nine entries, all tagged
`from: maintenance:backend-observability-blackout`):

- Run `scripts/sentry-round-trip.mjs`'s `main()` from CI, where
  `SENTRY_AUTH_TOKEN` exists — it has still never executed.
- Teach `check-deploy-secret-provisioning.mjs` to see `SENTRY_DSN` (two
  independent reasons, both measured false against the live workflow).
- Give `packages/sentry/src/react.ts` the `beforeSend` redaction the Node path
  got.
- Replace the vanish-when-unconfigured env shape at
  `infrastructure/pulumi/index.ts:62-64` — **promoted by production to a live
  defect during this stage; see Outcomes.**
- Give `/public/**` a production ingress rule.
- Convert all five `yq` secret upserts to `strenv()`.
- Make `validateStartupConfig` collect every failure before throwing.
- Close the class `check-workflow-paths-coverage.mjs` structurally cannot see.
- Open the M2/M3 follow-up run once Grafana Cloud exists.

Added after the outcome check above:

- Stop the OTLP exporters defaulting to `localhost:4318` in production.
- Explain the `/ready` 503s on long-running containers.
- Give Capture's factual claims an evidence bar.

## Run complete

Closed 2026-09-03. Milestone 1 shipped and is demonstrably working; Milestones
2 and 3 are the follow-up run, whose acceptance criterion is already written as
this run's one recorded FAIL.

The run set out to make absence stop rendering as success. Three hours after
the fix, production answered by surfacing two defects it had been hiding —
one of which is the same failure shape as the bug being fixed, in a
neighbouring file, still live. That is the outcome, and the follow-up.
