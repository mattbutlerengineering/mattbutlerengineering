---
stage: review
run: maintenance:otlp-localhost-default
date: 2026-09-03
assumptions:
  - "Reviewed the run's own diff (origin/main..HEAD), not the whole repo — the pre-existing dirty files in the shared main checkout belong to other sessions and are out of scope."
  - "Severity ranking treats 'still exports to localhost:4318 in the mode this run exists to fix' as critical, because it defeats the run's single stated purpose even though it is not a regression."
surfaced:
  - "Whether OTLP log export should ever be turned ON when an endpoint IS configured. This run keeps it off in every mode; nobody has decided the alternative, so it is not silently changed here."
  - "Whether defect.md should be edited to add the logs exporter as a third candidate. Left unedited — it was accurate to what was known when written, and the correction lives here and in verification.md."
  - "Whether the Sentry AggregateError issues can be closed by this fix. Not asserted either way — see 'What this review does not establish'."
---

# Review: OTLP exporters defaulting to localhost:4318

## Scope

The diff this run produced: `origin/main..HEAD`, seven commits on
`fix/otlp-localhost-default`.

- `packages/observability/src/otel-config.ts` (new) — `resolveTelemetryPlan`
- `packages/observability/src/sdk.ts` — `initTelemetry` wiring + boot notice
- `packages/observability/src/sdk.test.ts` — mode table, boot notice, logs signal
- `scripts/check-env-sync.js` — two pre-registered `PLATFORM_VARS` entries
- `llms.txt`, `llms-full.txt`, `packages/observability/llms*.txt` — generated
- `docs/fixes/otlp-localhost-default/*` — run artifacts

Reviewed by an independent `reviewer` subagent given an adversarial prompt and
an explicit already-accepted list, then every finding re-verified first-hand
before being recorded here. The subagent's verdict was FLAG, 5/10.

## Findings

### Critical: the logs signal still exported to `http://localhost:4318/v1/logs`

The fix closed two of _three_ OTLP signals. `NodeSDK` exports logs by the same
env fall-through as traces and metrics, and nothing in `defect.md`,
`architecture.md`, `breakdown.md`, or `verification.md` ever considered it —
all four documents reason about exactly two exporters.

- Scenario: a service boots in production with no OTLP endpoint set —
  `mode=unconfigured`, the exact state this run exists to fix. Spans and
  metrics are correctly inert. But `initTelemetry` never set
  `logRecordProcessors`, so the constructor never set `_loggerProviderConfig`
  (`sdk.js:121-125`); `start()` therefore called `configureLoggerProviderFromEnv`
  (`sdk.js:231`), which reads an unset `OTEL_LOGS_EXPORTER` as `"otlp"`
  (`sdk.js:262-264`) and builds an exporter at `http://localhost:4318/v1/logs`.
  `PinoInstrumentation` leaves `disableLogSending` at its `false` default, so
  every Fastify log line feeds it, and `BatchLogRecordProcessor` defaults
  `scheduledDelayMillis` to 1000 — roughly one connection attempt per second
  under traffic. Result: `connect ECONNREFUSED 127.0.0.1:4318`, the same stack
  recorded in `defect.md`.
- Verified first-hand, not accepted on report. Against the real, unmocked SDK:

  ```
  AS SHIPPED                     -> endpoints: http://localhost:4318/v1/logs
  WITH logRecordProcessors: []   -> endpoints: NONE
  ```

- Decision: **fixed** — `547238ef8`. `logRecordProcessors: []` added alongside
  its two siblings, using the same truthy-empty-collection mechanism
  (`sdk.js:121` takes the caller branch, so `start()` skips the env path).
  Three tests added covering unconfigured, disabled, and endpoint-set.
  Log export stays off in every mode: turning it on is a separate decision
  nobody has made, and making it silently here would be an unasked-for change.

**This finding corrects the run's root-cause attribution.** `defect.md` records
that the stack could not be attributed to the trace or the metric exporter, and
enumerates only those two. A third, more active exporter existed the whole
time, and it fits the evidence _better_ than either: the "unexplained cadence"
puzzle (3 events against ~120 predicted 30-second metric ticks) and the
seed's "~45-60s after each boot" timing that `defect.md` measured false are both
consistent with a traffic-driven 1-second exporter and not with a 30-second
tick. The earlier documents are left unedited — they were accurate to what was
known when written, and overwriting them would erase the lesson.

### Major: root `llms.txt` / `llms-full.txt` regeneration was uncommitted

- Scenario: CI checks out the branch, `pnpm regen --check` regenerates the root
  artifacts from the committed tree, finds the `otel-config.ts` block missing,
  and fails "Verify generated artifacts are in sync" → `build` red → `CI Gate`
  red → `gh pr merge --auto` waits forever with nothing obviously wrong in the
  diff. The known llms-drift class in `.claude/rules/gotchas.md`.
- Verified first-hand: the uncommitted delta was exactly this PR's
  `otel-config.ts` entry — caused by this run, not inherited dirt.
- Decision: **fixed** — `190a9646c`. CLI built first, `pnpm regen` run, both
  root files staged by explicit path. `pnpm regen --check` now reports
  "All generated artifacts are up to date" and the worktree is clean.

## Passes with no findings

- **Correctness (traces and metrics)** — clean. Every branch of
  `resolveTelemetryPlan` was exercised against the real SDK across all five env
  combinations, including the asymmetric traces-only and metrics-only cases. No
  combination constructs a localhost trace or metric exporter.
  `omitSpanProcessors` can only be true when a real `traceExporter` is present,
  so the `sdk.js:213` fall-through is unreachable without a destination.
  `isSet`/`isDisabled` mirror `@opentelemetry/core`'s own `getStringFromEnv`/
  `getBooleanFromEnv`, so the plan cannot disagree with the exporter's reading.
- **Design** — clean. `metricReader` → `metricReaders` is behaviourally
  identical minus a deprecation warning. Widening `OTEL_SDK_DISABLED` to
  trim/lowercase _closes_ a pre-existing disagreement with NodeSDK's own
  `_disabled`. `instrumentations` is byte-identical to `origin/main` in every
  non-disabled mode, so `@mbe/sentry`'s `skipOpenTelemetrySetup: true` premise
  holds and `FST_ERR_DEC_ALREADY_PRESENT` cannot return. The sole non-test
  caller, `packages/service-bootstrap/src/start-service-server.ts`, is
  unaffected.
- **Security** — clean. No secrets. The boot notice's `reason` interpolates only
  module-level key-name constants, never `env[key]`, and a sentinel-value test
  enforces that no configuration value can be printed.
- **Test quality** — the assertions are genuinely constraining, which was worth
  checking given the mocked seam. Reverting to `traceExporter: undefined` fails
  _both_ relevant assertions: vitest's `toHaveProperty` is path-existence, so
  `{traceExporter: undefined}` still fails `.not.toHaveProperty`, and
  `spanProcessors` would be `undefined` rather than `[]`.

## What this review does not establish

1. **That the Sentry issues will stop.** The pre-fix baseline is 6 events across
   3 services, arriving in bursts 20.7 hours apart. Nothing is deployed yet.
   Post-deploy silence must be judged against that inter-burst gap, not minutes.
2. **That logs were the actual culprit.** It is now the best-fitting candidate
   on cadence, but all three exporters are closed by the same change, so the
   run cannot separate them after the fact. Recorded as a hypothesis.
3. **`pnpm audit`** did not run (npm's audit endpoint timed out three times).
   The diff changes no `package.json` or lockfile, so its result cannot differ
   from `main`'s. CI is the gate of record.

## Verdict

**Ready to ship.** Both findings are fixed in-branch rather than deferred; no
unfixed critical remains, so the brief's merge authorization is not blocked.
Local gates after the fixes: 124/124 tests in `@mbe/observability` (8 files),
`tsc --noEmit` clean, `eslint src/` clean, `pnpm regen --check` up to date,
worktree clean.

The review earned its keep: the run's central artifact set was internally
consistent and completely convincing about two exporters, and would have
shipped a third one untouched.
