---
stage: verify
run: maintenance:otlp-localhost-default
date: 2026-09-03
assumptions:
  - "Criteria are taken from `breakdown.md`'s six acceptance criteria plus the defect's own acceptance floor. A maintenance run has no `prd.md`, so there is no success-criteria list upstream of the breakdown to reconcile against."
  - "Dates in frontmatter are local (PDT); every timestamp in the body is UTC and marked as such, because the Sentry evidence is only comparable in UTC."
surfaced:
  - 'The regression cannot be verified end to end in process. The test seam mocks `NodeSDK`, so it proves what we hand the SDK and not what the SDK then does with it. The gap is closed by reading the installed dependency''s source, not by a test. See "What this verification does not establish".'
  - "Whether the fix actually stops the production events is unverifiable until after deploy, and the post-deploy observation is a refutation test only: continued events would disprove the root-cause hypothesis, but silence is consistent with it without proving it."
  - "`pnpm audit --audit-level=high` could not be run — three consecutive socket timeouts to the npm security-audit endpoint. Not caused by this branch, which changes no dependency manifest, but it is a gate that did not execute here."
---

# Verification: model the third telemetry state

## How the regression was demonstrated

The centerpiece of a maintenance run's verification is the regression test, and
the load-bearing property is that it **fails on `origin/main` for the right
reason**. That was observed directly rather than argued.

At the moment of the red run, `packages/observability/src/sdk.ts` was
byte-identical to `origin/main` — the tests had been written, the
implementation had not (`git status` showed only `sdk.test.ts` modified).
Running the suite in that state:

```
 Test Files  1 failed (1)
      Tests  8 failed | 17 passed (25)
```

The failures are the defect, stated as assertions:

```
FAIL  src/sdk.test.ts > ... > exporting > exports traces only when only the traces endpoint is set
AssertionError: expected undefined to deeply equal []
- Expected:  []
+ Received:  undefined
 ❯ src/sdk.test.ts:334:36

FAIL  src/sdk.test.ts > ... > exporting > exports metrics only when only the metrics endpoint is set
AssertionError: expected { resource: {}, …(3) } to not have property "traceExporter"
- Expected:  undefined
+ Received:  Mock {}
 ❯ src/sdk.test.ts:342:26
```

`metricReaders` was `undefined` because `main` passes the deprecated singular
`metricReader`; `traceExporter` was a constructed mock because `main` builds one
unconditionally whenever the SDK is not disabled. After the implementation
landed, the same file:

```
 ✓ src/sdk.test.ts (25 tests) 15ms
 Test Files  1 passed (1)
      Tests  25 passed (25)
```

## Criteria

### Item 1 — Pre-fix production baseline — PASS

Recorded in `breakdown.md` under `## Pre-fix production baseline`. Re-read
immediately before this artifact was written and **unchanged**: still exactly
six events, same timestamps.

| Issue                | Project            | Events | First seen (UTC)       | Last seen (UTC)        |
| -------------------- | ------------------ | -----: | ---------------------- | ---------------------- |
| `RESERVATIONS-API-7` | `reservations-api` |      3 | `2026-09-02T23:19:32Z` | `2026-09-03T21:14:22Z` |
| `AGENT-API-8`        | `agent-api`        |      2 | `2026-09-02T23:19:32Z` | `2026-09-03T21:14:41Z` |
| `USERS-API-7`        | `users-api`        |      1 | `2026-09-03T21:14:20Z` | `2026-09-03T21:14:20Z` |

This is the pre-state. Three of `architecture.md`'s four open unknowns are
questions about this population, and the deploy removes it.

**It also corrected the run's own inputs.** `defect.md` §5 recorded, as a
measured negative, that `users-api` had produced no event of this shape.
`USERS-API-7` exists. The service was not silent, it was later — a snapshot of
a slow population read as a property of the service.

### Item 2 — `resolveTelemetryPlan` — PASS

`packages/observability/src/otel-config.test.ts`, 16 tests, no mocks. Covers
each rule the resolver owns: `OTEL_SDK_DISABLED=" TRUE "` resolving `disabled`
(trim + lowercase, matching `@opentelemetry/core`'s `getBooleanFromEnv`); no
endpoint key resolving `unconfigured` with both export flags false; the generic
key resolving `exporting` with both true; the signal-specific key alone
resolving `exporting` with the flags split; whitespace-only treated as unset;
and `reason` naming a key, never a value.

```
 Tests  16 passed (16)
```

### Item 3 — the empty-collections shape — PASS

Twelve tests across the three mode-table rows. Red-then-green evidence above.

The assertions are on `spanProcessors: []` and `metricReaders: []`
specifically, which is the criterion the breakdown insisted on. The test file
carries a block comment saying why, and the weaker "no exporter was
constructed" assertion is present but explicitly labelled secondary evidence in
the test body — it passes against a still-broken implementation.

```
 Tests  12 passed | 18 skipped (30)   (run with -t "NodeSDK constructor shape")
```

### Item 4 — boot notice — PASS, including the droppability criterion

Five tests: emitted exactly once, names the mode, names the deciding key, does
**not** contain a sentinel endpoint value, emitted for `disabled` too, and not
re-emitted on the second `initTelemetry` call.

Droppability was verified by actually removing the line and re-running the
earlier items, which is what the criterion asked for:

```
--- notice line present? ---   0
--- items 2+3 tests with notice removed ---
      Tests  16 passed (16)                    # otel-config.test.ts
      Tests  12 passed | 18 skipped (30)       # sdk.test.ts mode table
--- restored, full suite ---
      Tests  30 passed (30)
```

Independent evidence that the notice works outside its own test: it appears
unbidden in `sdk.idempotency.test.ts`'s output, which does not stub `console`:

```
[telemetry] mode=unconfigured — no OTLP destination — OTEL_EXPORTER_OTLP_ENDPOINT, OTEL_EXPORTER_OTLP_TRACES_ENDPOINT and OTEL_EXPORTER_OTLP_METRICS_ENDPOINT are all unset
```

One deviation from `architecture.md`: it specified `console`; the repo's eslint
config permits only `warn`/`error`/`info`, so the notice uses `console.info`.

### Item 5 — `PLATFORM_VARS` — PASS, on a premise that turned out false

```
PASS: All env vars are documented in .env.example files.
```

**The gate was already green before the change.** `architecture.md` and the
breakdown both stated CI's Build job would go red without these entries. It
would not: `check-env-sync.js` matches only a literal `process.env.NAME`
(`:57`, `:64`) and skips test files (`:44`, `:50`), while `resolveTelemetryPlan`
indexes an `env` parameter with named constants. The entries were added anyway
and marked pre-registered. Full reasoning in `breakdown.md`'s Notes.

Second-order consequence, recorded there and repeated here because it outlives
this run: the change removed the last literal `process.env.OTEL_*` read from
non-test source (`sdk.ts:76` on `main`), so the `OTEL_SDK_DISABLED` entries in
the three `services/*/.env.example` files are now unguarded by that check.

### Item 6 — gates — PASS, with one gate unrun

| Gate                                       | Result                                                                                                          |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                           | 48/48 tasks successful, exit 0                                                                                  |
| `pnpm lint`                                | 48/48 tasks successful, **0 errors** (125 warnings, all pre-existing hospitality React-19 `forwardRef` notices) |
| `pnpm --dir packages/observability test`   | 8 files, **121 tests**, all passing                                                                             |
| `prettier --check` over every changed file | `All matched files use Prettier code style!`                                                                    |
| `pnpm repo-audit` structural checks        | all PASS                                                                                                        |
| dependency-cruiser                         | `no dependency violations found (2361 modules, 5491 dependencies cruised)`                                      |
| `pnpm regen --check` (pre-push)            | `All generated artifacts are up to date.`                                                                       |
| `pnpm audit --audit-level=high`            | **DID NOT RUN** — see below                                                                                     |

`pnpm audit` failed three consecutive times with `ERR_SOCKET_TIMEOUT` posting to
`registry.npmjs.org/-/npm/v1/security/audits`. Diagnosed rather than assumed:
that host resolves identically via the local resolver and `dig @1.1.1.1`, and
`curl https://registry.npmjs.org/` returns `200` — so it is neither the LAN DNS
sinkhole nor an outage, just that one endpoint. The branch changes no
`package.json` and no `pnpm-lock.yaml`, so its audit result cannot differ from
`main`'s. CI is the gate of record.

## What this verification does not establish

Stated plainly, because the shape of this defect is that absence looks like
health.

1. **No test here observes the actual export behaviour.** `NodeSDK` is mocked,
   so every assertion is about the constructor argument. The claim that
   `spanProcessors: []` suppresses the SDK's env fall-through while `undefined`
   does not is established by **reading the installed dependency**
   (`@opentelemetry/sdk-node@0.221.0`: `sdk.js:202`, `:208`, `:213`, `:217`,
   `:132`, `:147`, `:182-184`; `utils.js:133`), not by executing it. A real
   `NodeSDK` test was rejected in design because `start()` monkey-patches Node's
   HTTP stack globally, which is unsafe inside a shared vitest run. **This is
   the single largest gap in this verification** and it is a deliberate one.
2. **Production is unverified until deploy.** The events fire in bursts across
   independent services, and the observed gap between bursts was 20.7 hours.
   Absence over a few hours after deploy proves nothing; judge against that
   interval.
3. **The post-deploy check is a refutation test, not a confirmation.** A further
   `AggregateError` / `internalConnectMultiple(node:net)` event on these three
   issues would refute the root-cause hypothesis and point elsewhere in the
   container. Silence is merely consistent with the hypothesis.
4. **Nothing here tests the `exporting` path against a real collector**, because
   none exists yet. The forward-compatibility claim — that the exporters are
   constructed with no arguments so OTel keeps owning endpoint resolution — is
   verified structurally (`expect(OTLPTraceExporter).toHaveBeenCalledWith()`)
   and not against a live endpoint.

## Verdict

**Pass.** All six breakdown items met their acceptance criteria, the regression
was demonstrated red-on-`main` and green-after, and the full local gate set is
clean apart from one network-blocked audit that this diff cannot influence.

Two findings are carried forward rather than buried: item 5's stated CI premise
was false, and `check-env-sync.js` is blind to indirect env reads — the pattern
this run just introduced.

Next stage is Review.
