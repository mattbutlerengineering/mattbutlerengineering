---
stage: decompose
run: maintenance:otlp-localhost-default
date: 2026-09-03
assumptions:
  - "Two milestones rather than one. The decompose skill asks for milestones that are each independently demonstrable, but neither `architecture.md` nor the brief says where to cut them. The boundary taken is proof-then-gates: M1 ends when a test that fails on `main` passes, M2 ends when the repo's own gates agree. Six items across two milestones is deliberately the whole breakdown — this is one new file, one edited function, and one config line, and a milestone structure larger than that would be ceremony."
  - "The pre-fix production baseline is recorded in this file, under `## Pre-fix production baseline`, rather than in `verification.md`. `architecture.md` asks for it in `verification.md`, but that artifact does not exist until the Verify stage, which runs after Implement — and the whole point of the item is that the evidence expires when the fix merges. Recording it here makes it checkable at Implement time; Verify quotes it forward."
  - "Acceptance criteria are derived from `architecture.md`'s contracts and `defect.md` §6, because no upstream artifact carries an explicit acceptance-criteria list — a maintenance run has no `prd.md` whose success criteria would normally supply them."
surfaced:
  - "Whether the boot notice should exist at all is still unexpressed by any input. `architecture.md` surfaced this and it is not resolved here — decompose does not get to decide it. Item 4 is cut as its own item precisely so it can be dropped without touching items 2, 3, 5 or 6."
  - "Whether the three permanently-expiring unknowns are worth preserving is also unexpressed. Item 1 assumes yes, because the capture is cheap and the omission is irreversible; if the answer is no, item 1 can be struck and nothing else changes."
  - "Item 1 depends on Sentry credentials being available to whoever runs it. If they are not, the item cannot be completed and the evidence is lost at merge — that is a stop-and-surface, not something to check off on a partial result."
---

# Breakdown: model the third telemetry state

Progress lives in the checkboxes below — Implement checks items off as their
acceptance criteria are met.

## Milestone 1: the unconfigured mode exists, and a test proves the fix is real

Demonstrable at the boundary: a test that fails on `origin/main` and passes on
the branch, asserting the exact constructor shape that suppresses the SDK's env
fall-through.

- [x] **Capture the pre-fix production baseline** — record the Sentry evidence that this fix destroys.
  - Accept: a `## Pre-fix production baseline` section in this file records, per service, the event count and the first-seen and last-seen timestamps for `RESERVATIONS-API-7` and `AGENT-API-8`, plus the `users-api` negative result, each with the query that produced it. Timestamps and counts present verbatim — "checked, still firing" does not satisfy this.
  - Blocked by: —
  - **Ordered first, and blocks nothing that must wait for it — but it must complete before item 3 merges.** The fix deletes the population that would answer three of `architecture.md`'s four open unknowns. After the deploy this item is not late, it is impossible.

- [x] **`resolveTelemetryPlan` — the pure resolver** — new `packages/observability/src/otel-config.ts` exporting `TelemetryMode`, `TelemetryPlan`, and `resolveTelemetryPlan(env = process.env)`.
  - Accept: unit tests, no mocks, covering each rule `architecture.md` assigns it — `OTEL_SDK_DISABLED=" TRUE "` resolves `disabled` (trim + lowercase, matching `@opentelemetry/core`'s `getBooleanFromEnv`); no endpoint key set resolves `unconfigured` with `exportTraces` and `exportMetrics` both false; `OTEL_EXPORTER_OTLP_ENDPOINT` set resolves `exporting` with both true; `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` alone resolves `exporting` with `exportTraces` true and `exportMetrics` false; a whitespace-only value is not a value. A test asserts `reason` names an env **key** and contains no env **value**.
  - Blocked by: —

- [x] **Wire `initTelemetry` to the plan using the empty-collections shape** — edit `packages/observability/src/sdk.ts` to fill `spanProcessors` / `traceExporter` / `metricReaders` from the plan per `architecture.md`'s mode table.
  - Accept: a test added to the existing `packages/observability/src/sdk.test.ts` seam that **fails on `origin/main` for the right reason** and passes after the change: with no OTLP env set, `vi.mocked(NodeSDK).mock.calls[0]?.[0]` carries `spanProcessors: []` and `metricReaders: []`, and carries no `traceExporter` key. The `disabled` and `exporting` rows of the mode table each get their own test, including that `exporting` with no Langfuse processors **omits** `spanProcessors` so `OTEL_BSP_*` tuning keeps working.
  - Accept: the assertion is on those exact keys. An assertion of the form "no exporter was constructed" does **not** satisfy this item — `NodeSDK` is mocked, so no test at this seam can observe the env fall-through, and that weaker assertion passes against an implementation that still exports to `localhost:4318`.
  - Accept: the code carries a comment, in the house style of `packages/sentry/src/node.ts:62-85`, naming `@opentelemetry/sdk-node@0.221.0` and the lines the behaviour depends on (`sdk.js:202`, `:208`, `:217` for spans; `:132`, `:182-184` for metrics) and stating that `undefined` here would not fix the defect.
  - Blocked by: item 2

- [ ] **Boot notice** — one `console` line at init naming `plan.mode` and `plan.reason`.
  - Accept: a test asserts the line is emitted exactly once per init, contains the mode and an env key name, and contains no env value. `console` rather than `diag`, because `diag` is silent unless `OTEL_LOG_LEVEL` is set and would therefore say nothing in exactly the deployment that needs it.
  - Accept: deleting this item leaves items 2 and 3 passing unchanged — verify that before checking it off, since droppability is the reason it is a separate item.
  - Blocked by: item 2
  - **This item is independently droppable.** See the first `surfaced:` entry.

## Milestone 2: the repo's own gates agree

Demonstrable at the boundary: the same checks CI runs, run locally, green, with
output quoted rather than asserted.

- [ ] **`PLATFORM_VARS` entries for the two signal-specific endpoint keys** — add `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` and `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` to the set in `scripts/check-env-sync.js`, alongside `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_EXPORTER_OTLP_HEADERS` already at lines 18-19.
  - Accept: `node scripts/check-env-sync.js` exits 0 with the new `process.env` reads present in `packages/observability`, output quoted. Confirmed pre-condition: the check walks each service's transitive workspace closure, so a read inside `packages/observability` counts as a read by all three services.
  - Accept: the entries sit under the existing platform-injected rationale — these are platform-injected, never hand-configured, so they belong in `PLATFORM_VARS` and not in any `.env.example`.
  - Blocked by: item 2
  - **This is a red CI gate, not a tidy.** `pnpm repo-audit` runs this check in CI's Build job.

- [ ] **Zero-Touch Audit green, including generated artifacts** — run the gates the repo actually runs.
  - Accept: `pnpm lint`, `pnpm typecheck`, and `pnpm --dir packages/observability test` each exit 0, output quoted. `pnpm typecheck` is run explicitly because the pre-push hook does not typecheck and vitest does not typecheck.
  - Accept: `packages/observability/llms.txt` and `llms-full.txt` are regenerated and staged. Adding `otel-config.ts` changes the pack output, and stale llms artifacts fail CI's Integrity job. Build the CLI first (`pnpm build --filter @mbe/cli...`) — `mbe pack` imports `@mbe/agent-core` and fails silently without it.
  - Accept: no conflict markers; files staged by explicit path. The working tree carries another session's in-flight run, so `git add -A` would sweep it in.
  - Blocked by: items 3, 5

## Design gaps found

None. Two things decomposition checked that could have been gaps, and were not:

- **`instrumentations` in the new `unconfigured` mode.** `architecture.md`'s
  mode table gives `unconfigured` the full instrumentation set. Read against
  `origin/main`, `sdk.ts` already does `instrumentations: isDisabled ? [] : [...]`,
  so `unconfigured` inherits the full set with no change to that expression —
  and `FastifyOtelInstrumentation` stays constructed, which is what keeps
  `packages/sentry/src/node.ts`'s `skipOpenTelemetrySetup: true` premise true.
  No new decision is needed here.
- **Idempotency.** `initTelemetry` returns the cached `telemetrySdk` on a second
  call, which would defeat per-test env variation — but the existing
  `sdk.test.ts` seam already uses `vi.resetModules()`, so the constraint is
  satisfied by the seam the architecture already chose.

Explicitly **not** items, per `architecture.md` and the brief: the Langfuse
precedence bug (`spanProcessors` wins over `traceExporter` at `sdk.js:202` vs
`:208` — dormant, measured: no `LANGFUSE_` key on any of the three services;
it becomes real at M2), `infrastructure/pulumi/index.ts:62-64`, extending
`validateStartupConfig` to the OTLP variables (which would refuse every
production boot today), standing up a collector, and an ADR.

## Coverage check

Performed against `architecture.md` before finishing.

- **Components → items.** Telemetry plan resolver → item 2. Telemetry bootstrap
  (`sdk.ts`) → items 3 and 4. The OTLP-export contract is explicitly unchanged
  by the design and correctly has no item. `scripts/check-env-sync.js`, named in
  _Stack & dependencies_ as a gate this change trips → item 5.
- **Contracts → criteria.** Every rule listed under `resolveTelemetryPlan` has a
  named test in item 2. Every row of the mode table has a named test in item 3,
  including the `spanProcessors`-omitted case. The version-pinning comment
  requirement is a criterion, not a note. The "exporters keep being constructed
  with no arguments" forward-compatibility rule is enforced by item 3's mode
  table criteria, which never mention a URL.
- **`defect.md` §6** names the regression seam; item 3's first criterion is that
  seam, with the fails-on-`main` requirement made explicit.
- **`architecture.md`'s expiring-evidence request** → item 1.

## Pre-fix production baseline

Captured 2026-09-04T03:04Z, before any part of this fix merged. This is item 1
of Milestone 1. **Three of `architecture.md`'s four open unknowns are questions
about a population this fix deletes, so this section is the last chance to
record it.** Verify quotes this forward into `verification.md`.

Queries, both against org `mattbutlerengineering` via the Sentry MCP surface:

1. `search_issues(query="is:unresolved", period="30d", limit=50)` — for per-issue
   event counts and first/last-seen.
2. `search_events(dataset="errors", query="error.type:AggregateError",
fields=["timestamp","issue","project","message","server_name"],
sort="-timestamp", period="7d", limit=30)` — for the individual event
   timestamps below. The 7d window reaches past the earliest event, so this is
   the complete population, not a truncated tail.

### Per-issue counts and bounds

| Issue                | Project            | Events | First seen (UTC)       | Last seen (UTC)        |
| -------------------- | ------------------ | -----: | ---------------------- | ---------------------- |
| `RESERVATIONS-API-7` | `reservations-api` |      3 | `2026-09-02T23:19:32Z` | `2026-09-03T21:14:22Z` |
| `AGENT-API-8`        | `agent-api`        |      2 | `2026-09-02T23:19:32Z` | `2026-09-03T21:14:41Z` |
| `USERS-API-7`        | `users-api`        |      1 | `2026-09-03T21:14:20Z` | `2026-09-03T21:14:20Z` |

All three: `AggregateError`, culprit `internalConnectMultiple(node:net)`,
`level: error`, **users affected 0**.

### The complete event population — six events

| #   | Timestamp (UTC)        | Issue                | Service            |
| --- | ---------------------- | -------------------- | ------------------ |
| 1   | `2026-09-02T23:19:32Z` | `RESERVATIONS-API-7` | `reservations-api` |
| 2   | `2026-09-02T23:19:32Z` | `AGENT-API-8`        | `agent-api`        |
| 3   | `2026-09-03T00:33:37Z` | `RESERVATIONS-API-7` | `reservations-api` |
| 4   | `2026-09-03T21:14:20Z` | `USERS-API-7`        | `users-api`        |
| 5   | `2026-09-03T21:14:22Z` | `RESERVATIONS-API-7` | `reservations-api` |
| 6   | `2026-09-03T21:14:41Z` | `AGENT-API-8`        | `agent-api`        |

### What this baseline changes about the run's inputs

**`defect.md` §5 is falsified.** It recorded, as a measured negative, that
`users-api` "has produced no event of this shape" and called that unexplained.
`USERS-API-7` exists, first and only event `2026-09-03T21:14:20Z`. `users-api`
was not silent; it was later. §5 was true when written and is false now — the
negative was a snapshot of a slow population, read as a property of the service.
`architecture.md`'s fourth surfaced item ("why `users-api` produced no event of
this shape") is therefore answered: the premise was wrong. No design decision
rested on it.

**The events are not boot-correlated; they are correlated with each other.**
`defect.md` §4 recorded two first-events 151 ms apart from services that booted
39.5 minutes apart, and logged it as an observation with no theory. With six
events the shape is visible: they arrive in near-simultaneous bursts spanning
independent containers — `23:19:32Z` (two services, same second) and
`21:14:20Z`–`21:14:41Z` (all three, inside 21 seconds), with one lone event at
`00:33:37Z` between them. Three separately-deployed containers do not boot
inside the same second by coincidence, so whatever produces these is shared
across services rather than per-process. Recorded as an observation. The two
candidates it suggests — a deploy rolling all three at once, or a clock-aligned
export tick — are **not** investigated here and neither is needed by the fix.

**The cadence gap is now sharper, not resolved.** `exportIntervalMillis: 30_000`
implies ~120 metric export attempts per hour per service. From the first event
to this capture is ~27.75 h, so roughly 3,300 attempts per service and ~10,000
across the three. Six captured events. Whatever suppresses the other ~99.94% —
Sentry-side grouping and rate limiting being the obvious candidate — is
unexamined, and becomes unexaminable from production after this ships. This is
`architecture.md`'s third surfaced item, still open.

**Which of the two exporters produced the rejection remains undetermined** —
`architecture.md`'s second surfaced item, unchanged by this capture, and
permanently undeterminable from production after the deploy.

### Post-deploy refutation test

`architecture.md` records that this fix makes one thing _newly_ answerable: after
the deploy the services construct no localhost-pointed exporter in any mode, so
a further `AggregateError` / `internalConnectMultiple(node:net)` event on any of
these three issues would **refute** the root-cause hypothesis and point
elsewhere in the container. Re-run query 2 above at Verify and at Operate. Given
the burst pattern, absence over a few hours proves little — the gap between
burst B and burst C was 20.7 hours. Judge silence against that interval, not
against minutes.

## Notes

**2026-09-04 — item 1 was executed before Implement, by the orchestrator.** The
breakdown ordered it first because the evidence expires at merge; it was run
immediately on writing this file rather than waiting for the Implement stage to
pick it up. Nothing else in the breakdown was touched. Recorded because the
protocol expects Implement to own the checkboxes, and this one it did not.

**2026-09-04 — item 1 falsified an upstream measured claim.** `defect.md` §5
("`users-api` has produced no event of this shape — measured, not assumed") is
now false: `USERS-API-7` exists. See the baseline section above. `defect.md` is
left unedited — it was accurate when written, and rewriting a predecessor
artifact to match later evidence would erase the fact that the population was
still growing while the run was being designed. That fact is the lesson.

**2026-09-04 — the Decompose stage ran inline, not as a subagent.** The
dispatched agent terminated mid-run when the host slept (~29 h), having read all
inputs but written nothing. Re-dispatching would have re-run the same reads for
the same risk, so the stage was completed inline from the same three inputs.

**2026-09-03 — Implement ran `prettier --write` over this run directory,
including the protected baseline section.** `pnpm repo-audit`'s
`check:prettier` (`prettier --check .`) covers `docs/**`, and CI's Build chain
runs it on any PR carrying code — so leaving these artifacts unformatted would
red this branch's own gate and, per `.claude/rules/gotchas.md § CI`, poison
every later full Build. The pass changed exactly two things inside
`## Pre-fix production baseline`, both cosmetic: the two continuation lines of
query 2 lost their three-space indent (a lazy list continuation — rendering
unchanged), and `*newly*` became `_newly_` under the repo's emphasis style.
Every timestamp, event count, issue id and query parameter is byte-identical.
Recorded because Implement was told to leave that section byte-for-byte alone;
this is a mechanical formatter, not a re-derivation of item 1's evidence.
