---
stage: idea
run: feature:sentry-silence-alert
date: 2026-09-30
origin:
  - "docs/backlog.md: Alert when a Sentry project receives zero events for N days (from: maintenance:sentry-dsn-static-builds)"
  - "docs/backlog.md: Prove the Sentry round trip end to end once per app (from: maintenance:sentry-dsn-static-builds)"
  - "docs/backlog.md: Run `scripts/sentry-round-trip.mjs`'s `main()` from CI (from: maintenance:backend-observability-blackout)"
in-flight-check: "ran 2026-09-30 (gh pr list, open PRs #5937 #5935 #5881 #5879 #5848 #5845) — nothing matches; none touch Sentry or heartbeats"
assumptions: []
---

# Idea: Sentry silence alert

## Problem

"When a Sentry project goes quiet I can't tell whether the app is healthy or
whether reporting is broken. Silence looks exactly like health, so blackouts
run for months." — Matt

Sharpened: no signal in this repo distinguishes "no errors happened" from "no
errors can be reported." Both render as an empty Sentry project and an
all-green CI board.

## Who has it

Matt, the sole operator of every deployed surface (users-api,
reservations-api, agent-api, hospitality, marketing, rialto-web).

How he copes today: he doesn't, except by accident. Both prior blackouts were
found incidentally while doing other runs, not by any alert.

## Why now

- **The condition is live today.** As of 2026-09-30, the
  `mattbutlerengineering` Sentry project (marketing and rialto-web) has
  received zero errors in 90 days. From silence alone, nobody can tell whether
  that is health or a third blackout. See Evidence.
- **The checker exists but has never run.** `scripts/sentry-round-trip.mjs`
  was built by `maintenance:backend-observability-blackout` to tell "no errors
  yet" apart from "reporting is dead." Its helpers are unit-tested, but no
  workflow invokes its entrypoint. That is the shipped-never-run pattern,
  recorded 4 times in memory.

## Evidence

Measured by the orchestrator on 2026-09-30 via the Sentry MCP (errors
dataset, 90-day window):

| Sentry project                                 | errors (90d) | last event                     |
| ---------------------------------------------- | ------------ | ------------------------------ |
| users-api                                      | 323          | 2026-09-26                     |
| reservations-api                               | 169          | 2026-09-30                     |
| agent-api                                      | 59           | 2026-09-22                     |
| hospitality                                    | 40           | 2026-09-30                     |
| mattbutlerengineering (marketing + rialto-web) | **0**        | none in 90d                    |
| eat-sheet                                      | 0            | separate product, out of scope |

Prior incidents, both found by accident:

- `docs/fixes/sentry-dsn-static-builds/`: marketing and rialto-web shipped the
  Sentry SDK with `enabled: false` for about 4.5 months.
- `docs/fixes/backend-observability-blackout/`: the backend services had no
  `SENTRY_DSN` for about 5 months.

Both runs' backlog seeds (this run's origin) name the same gap: "can report"
was verified and "does report" was not.

`scripts/sentry-round-trip.mjs` exists. It triggers a deliberate 429 from
inside the deployed service, then polls Sentry for a unique marker.
Per the orchestrator's `git grep` on 2026-09-30, no workflow invokes it.

A zero-event project here is not yet proof of a blackout. It is the exact
reading this run exists to make interpretable.

Outside corroboration (`last30days`) was not offered or run. This is an
unattended autorun, and the evidence above is first-party and measured.

## Solution hunch

A daily scheduled GitHub Actions workflow (plus `workflow_dispatch`) runs one
heartbeat round-trip per Sentry project:

- The event originates inside the deployed artifact, not posted straight to
  the DSN. A direct DSN post proves only that the DSN is valid.
- The workflow then asserts through the Sentry API that the event was
  ingested.

It reuses `sentry-round-trip.mjs` for the backend services and needs a browser
equivalent for the static-site projects.

On failure, the workflow goes red and opens or updates one de-duplicated
GitHub issue per failing project (label `sentry`). That issue closes
automatically on the next green heartbeat for that project.

Decided by Matt, and rejected: a raw "zero events for N days" threshold. On a
quiet, healthy static site it would raise false alarms forever.

## Success in one sentence

Any Sentry project that stops ingesting events is flagged by an open GitHub
issue within about 24 hours.

## Unknowns & risks

- **Static-bundle trigger.** It is unknown how to make a deployed static bundle
  (marketing, rialto-web, hospitality) raise a tagged error on demand without
  shipping a debug endpoint or backdoor. The backend precedent rejected a debug
  endpoint. Any trigger must also work under the live edge CSP and stay
  invisible to visitors. Architect must answer this.
- **First heartbeat may fail immediately.** The 0-event
  `mattbutlerengineering` project may be blind right now. That would be a
  finding, not a defect of this run: file it, don't widen scope to fix it.
- **Synthetic-event pollution.** Heartbeat events could clutter Sentry or make
  `sentry-triage.yml` file issues about heartbeats. They must be tagged and
  filtered.
- **Rate-limit spend.** The backend path spends a deliberate 429 against prod's
  global rate limiter every day.
- **Shipped-never-run, again.** The workflow and its scripts must sit inside
  their own trigger and guard coverage. The backlog shows repeated "script not
  in paths filter" defects, and the run is not done until the workflow has
  actually executed once on `main`.
