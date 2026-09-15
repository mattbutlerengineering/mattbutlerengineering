---
stage: operate
run: maintenance:otlp-localhost-default
date: 2026-09-09
assumptions:
  - "4 d 19 h of production (fix ACTIVE 2026-09-05T05:14:23Z, this stage's last query 2026-09-10T00:38Z), ten container swaps and a measured refutation are treated as 'real usage' for the skill's let-it-breathe rule. No user was available to say whether to wait longer; the run's own criterion (silence judged against the 20.7 h pre-fix inter-burst gap, now cleared 5.6×) and the stricter swap-boundary reading both hold, so the retro was written rather than deferred."
  - "The three Sentry issues (`RESERVATIONS-API-7`, `AGENT-API-8`, `USERS-API-7`) were left `unresolved`. The brief authorizes no tracker interaction, Ship did not treat Sentry state as an exception to that, and neither does this stage. Resolving them is seeded for a human instead of done."
  - "Outcome criteria are `defect.md`'s Expected paragraph, the actual cost it names (signal pollution), and the brief's forward-compatibility constraint. A maintenance run has no `prd.md` success list, so these stand in for one."
  - "The deploy-boundary alignment Ship handed over 'as evidence, interpretation belongs to Operate' is interpreted here. The interpretation — a normally-swallowed export failure escaping at the container swap, two candidate triggers that cannot be separated — is mine, is labelled pattern rather than measured, and cannot be tested against production because the fix deleted the population."
  - "Two candidate seeds sit next to existing backlog lines: the M2/M3 Grafana Cloud run (from `backend-observability-blackout`) and 'make prepare-and-stop runs reconcilable' (from `visual-tolerance-threshold`). Neither was duplicated or rewritten — the protocol forbids rewriting. Narrower seeds were appended instead: a no-account collector smoke for `exporting` mode, and the Ship completion predicate underneath the reconciliation problem. Whether they are distinct enough to keep is a human's call."
  - "Merge authorization for the docs-only PR that carries this file and `release.md` is taken from the brief (merge on green via `--auto`); nothing was re-confirmed."
surfaced:
  - "Re-measured, not only quoted. `search_events(dataset=errors, query=error.type:AggregateError, period=7d)` and `search_issues(query=AggregateError)` at 2026-09-10T00:38Z, both read-only: 8 events in the 7-day window (the 2026-09-03T00:33Z event has rolled out of it since Ship's query), newest still `2026-09-05T05:14:40Z`; per-issue 5 / 4 / 2 = 11 all-time, all three `unresolved`, unchanged. Zero new events in the 13 minutes since Ship measured, and zero since the fix went ACTIVE."
  - "`pnpm audit --audit-level=high` never ran locally at any stage of this run — Implement, Verify and Review each hit the same `ERR_SOCKET_TIMEOUT` on npm's audit endpoint and each diagnosed it independently. CI ran it. Not seeded: the diff changed no manifest, so the local run could not have differed from `main`'s."
  - "The `exporting` path is still unverified against any real endpoint, and the Langfuse-precedence bug `architecture.md` flagged is still dormant and unfixed. Both seeded."
  - "Which of the three OTLP exporters produced the production events is permanently unresolvable; so is whether the swap-time trigger was the outgoing container's shutdown flush, the incoming container's first export, or both. Stated as a limit, not carried forward as a question."
---

# Retro: OTLP exporters defaulting to localhost:4318

Written 4 d 19 h after the fix went ACTIVE in production, on the same day the
Ship record was completed. The release itself is six days old; the record of
it is hours old. Both facts shape this retro.

## Outcomes vs. intent

`defect.md`'s Expected, verbatim: "With no collector configured, telemetry
export should be off, not attempted-and-failing. A service with nowhere to send
traces should not emit a production error event every time it tries." The cost
it named was signal pollution in a Sentry project one day old. The brief added
one constraint: whatever lands "has to make the enabled-and-configured path
work the day a collector exists."

### Telemetry export is off when no collector is configured

- **What happened:** met, on all three services, for three signals rather than
  the two the run set out to close. The boot notice
  `[telemetry] mode=unconfigured — no OTLP destination — …all unset` is the
  first line of every service's current run log (2026-09-09T21:32–33Z,
  deployment `e9e2c38b`, whose commit contains the squash `f9ee20a05`).
  Review's probe against the real, unmocked `@opentelemetry/sdk-node@0.221.0`
  reads `endpoints: NONE` in this mode once `logRecordProcessors: []` joined
  its two siblings.
- **Signal strength: measured** for the mode (production log) and for the
  in-process outcome (real-SDK probe). What production shows is the mode, not
  the absence of an exporter; the absence rests on the probe plus the vendor's
  own source (`sdk.js:121-125`, `:202`, `:132`), which is the honest chain.

### No production error event for a non-problem

- **What happened:** zero `AggregateError` events from any process running
  the fix. The last three (`2026-09-05T05:14:30–40Z`) carry `app_start_time`
  `2026-09-04T22:05Z` — the pre-fix containers being torn down 7–17 s after
  the fixed deployment `be2ca73a` went ACTIVE at `05:14:23Z`. Re-measured
  here at `2026-09-10T00:38Z`: newest event unchanged, 115 h 23 min of
  silence, 5.6× the pre-fix inter-burst gap. Ten post-fix container swaps,
  none produced an event; six of six pre-fix swaps had.
- **Signal strength: measured.** It is a refutation test that passed, not an
  attribution: continued events would have disproved the root-cause
  hypothesis, and their absence across ten of the exact boundary that fired
  every time before is consistent with it. It does not say which exporter it
  was, and nothing now can.

### The signal pollution stops

- **What happened:** half met. Nothing new has arrived, so the stream is
  clean. But `RESERVATIONS-API-7`, `AGENT-API-8` and `USERS-API-7` still sit
  `unresolved` at 5 / 4 / 2 events on the issues board, and Sentry only arms
  regression detection on a resolved issue — so the one alert that would
  catch this defect reopening (a fourth signal, an SDK bump moving a default)
  is not armed. No stage was authorized to change Sentry state.
- **Signal strength: measured** (0 new events; 3 unresolved issues). The
  unmet half is a decision nobody was allowed to make, not a defect.

### The enabled-and-configured path works the day a collector exists

- **What happened:** unverified, and unchanged since the merge. `exporting`
  mode is checked structurally only — the exporters are constructed with no
  arguments so OTel keeps owning endpoint resolution
  (`expect(OTLPTraceExporter).toHaveBeenCalledWith()`). No process in this
  repo has ever exported to a real collector. The Langfuse-precedence bug
  `architecture.md` flagged (`spanProcessors` wins over `traceExporter`, so a
  Langfuse-enabled process ignores the OTLP endpoint) is dormant, measured so
  by key-name scan, and will become real the day both are configured.
- **Signal strength: none.** Structural evidence only. The forward-compatible
  shape was the reason a code fix beat `OTEL_SDK_DISABLED=true` on the app
  spec, and that reason has not yet been tested.

### Users unaffected, service healthy

- **What happened:** users impacted 0 before and after; the DB-backed
  `/api/v1/users/health` answered `200 / status: ok` at `2026-09-10T00:24Z`;
  three consecutive 21/21 deployments; neither rollback trigger fired.
- **Signal strength: measured.**

### What is now known about the mechanism, and what is not

The run carried three hypotheses about _why_ the events looked the way they
did, and the last one arrived after the fix had deleted the evidence.

1. `defect.md` / `architecture.md`: the 30-second metric tick — ~120 attempts
   per hour per service, which never fit 3 (later 11) recorded events and was
   logged as an "unexplained cadence".
2. `review.md`: the logs exporter, traffic-driven at a 1 s batch delay — a
   better fit for "few events, not tick-aligned", and the reason the
   attribution was retracted.
3. `release.md`: every one of the 11 events lies within 20 s of a DigitalOcean
   deployment going ACTIVE (offsets −12 s to +17 s across six swaps); 6/6
   pre-fix swaps fired, 0/10 post-fix swaps did.

**Now known (measured):** the events are swap-coupled. Under either exporter
hypothesis, thousands of steady-state export attempts per service produced
nothing while roughly two per swap surfaced. So a refused connection is
swallowed in steady state — as OTel's exporters are written to do, logging via
`diag` and resolving — and something at the swap let one escape as an
unhandled rejection. This also dissolves three puzzles earlier artifacts
carried as open: the 40-minute and 75-minute "not a start-up race" delays and
the 151 ms two-service coincidence were never about a process's own boot; they
were the _next_ deployment's swap.

**Consistent with, not separable (pattern):** two triggers. The final burst is
unambiguously the outgoing containers (their `app_start_time` predates the
swap by seven hours) — a shutdown flush, `NodeSDK.shutdown()` on SIGTERM. The
very first event, though, came from a `reservations-api` process 56 s old,
14 s after its own deployment went ACTIVE — an incoming container's first
export after ingress cut-over — while the `agent-api` event 151 ms later came
from a 40-minute-old process, an outgoing one. Both triggers may be real, in
the same swap.

**Unattributable, permanently:** which exporter; which trigger; why exactly
those failures escaped. The population is gone. What survives is the
forward-looking part: at a swap, the outgoing container's final flush is its
last chance to deliver to a real collector, and if that flush is racing its
kill, M2 loses the last batch of every deploy. That is seeded.

## Run retrospective

- **Keep: capturing the expiring evidence before the merge, out of protocol
  order.** Breakdown item 1 was run by the orchestrator the moment the file
  was written, because the fix would delete the population. It falsified
  `defect.md` §5 (`users-api` was not silent, it was later), and the
  timestamps it preserved are what made the swap-boundary analysis possible
  at Ship, six days on.
- **Keep: Review as an adversarial re-read of the vendor, not of the diff.**
  Four artifacts reasoned about two exporters and were internally consistent
  and completely convincing. Review asked the real SDK "which endpoints exist
  now" and found a third. Fixing in-branch (`547238ef8`) with an appended
  amendment to `verification.md`, leaving every predecessor unedited, kept
  the lesson visible instead of erasing it.
- **Keep: reading the installed dependency instead of quoting docs.** The
  fact that carried the design — `traceExporter: undefined` takes the env
  fall-through and rebuilds the same localhost exporter — came from
  `sdk.js` line numbers, and the same discipline caught `check-env-sync.js`'s
  blindness (item 5's CI premise was false) and the logs signal.
- **Keep: the boot notice.** It was the one element no input asked for, and
  it was the only production evidence the fix was live: DigitalOcean's log
  holds only the current deployment, and Sentry silence cannot distinguish
  "fixed" from "not yet deployed". It earned its keep on first use.
- **Keep: completing Ship's record from real results rather than
  re-performing it,** and completing a dead stage inline from the same inputs
  (Decompose's subagent died on host sleep; re-dispatching would have re-run
  the same reads for the same risk).
- **Change: enumerate the dependency's defaults for every slot the caller
  leaves unset, at Architect, when the fix is "stop the SDK doing X by
  default".** The two-exporter framing came from the backlog seed and was
  copied through `defect.md`, `architecture.md`, `breakdown.md` and
  `verification.md` unchallenged; every downstream check verified the two
  things it was handed. The criteria list verified itself.
- **Change: Ship must not end at a draft.** The draft was written with CI in
  flight, steps 7–9 reading "see Outcome". The planned `--auto` never ran; a
  human merged 24 h 32 min after `CI Gate` went green; and the record said
  nothing for six days until a Ship stage was re-dispatched to complete it —
  the identical gap `visual-tolerance-threshold` had. The protocol's
  "`release.md` exists" predicate declared Ship complete the moment the draft
  existed.
- **Change: judge post-deploy silence against the deployment timeline, not
  only the clock.** The 20.7 h inter-burst criterion the draft set would have
  been satisfied by a far weaker observation; the decisive evidence came from
  listing DigitalOcean deployments next to Sentry timestamps, which no
  artifact had asked for.
- **Stop: asserting rates read from source constants.** The seed said "~45–60 s
  after each boot"; `defect.md` warned "do not assert a rate the data does
  not show" and then `architecture.md` and `breakdown.md` computed ~120/h and
  ~10,000 attempts from `exportIntervalMillis`. The data never showed either,
  and the true shape was per-swap. A rate the data does not show is not a
  fact to build puzzles on.
- **Stop: diagnosing the same environmental failure at every stage.** The
  `pnpm audit` socket timeout was investigated three times (Implement item 6,
  Verify, Review) to the same conclusion. Record it once, cite it after.

## Idea seeds

Appended to `docs/backlog.md` in this form, full grounding there:

- Resolve the three Sentry issues so regression detection arms — the stream
  is clean but the board is not, and only a resolved issue can regress.
- Pin `unconfigured` and `disabled` to "zero OTLP endpoints of any signal"
  against the real SDK, per-process, so a fourth signal or an SDK bump goes
  red instead of reopening the defect — the third-exporter class.
- Make `check-env-sync.js` see env reads made through a helper — it is green
  before and after this change, and the `OTEL_SDK_DISABLED` `.env.example`
  entries are now unguarded.
- Exercise `exporting` mode once against a throwaway collector, no account
  needed, before the Grafana Cloud run claims it — and trip the dormant
  Langfuse-precedence bug while it is cheap.
- Stop `deploy-services.yml` creating two DigitalOcean deployments for one
  merge — two runs 55 s apart each ran `create-deployment` for the same
  commit.
- Find out what OTel export does at a container swap before a real collector
  depends on it — 11/11 events swap-aligned; if the outgoing flush races the
  kill, M2 loses the last batch of every deploy.
- Give Ship a completion predicate stronger than "`release.md` exists" — the
  predicate underneath the prepare-and-stop reconciliation seed.
- When a fix is "stop the dependency doing X by default", have Architect
  enumerate every default the dependency applies to unset inputs, from the
  installed source, before criteria are derived.

## Run complete

Closed 2026-09-09. The defect is fixed in production on measured evidence; the
attribution is a passed refutation, not a proof, and stays that way. Seeds
above are the input to the next runs — the first one is a human's click in
Sentry.
