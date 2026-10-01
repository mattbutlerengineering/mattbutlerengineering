---
stage: prd
run: feature:sentry-silence-alert
date: 2026-09-30
ux: not-applicable
ux-reason: "Ops-only scheduled workflow and GitHub issues; any in-app heartbeat trigger must be invisible to site visitors, so there is no screen or flow to design."
assumptions:
  - "SC-3 counts a dispatched run on main as satisfied whatever each project's verdict is (pass or fail), as long as every in-scope project gets an explicit verdict. The brief says the first run 'may legitimately open an issue', and the idea marks a blind project as a finding, not a defect of this run."
  - "Heartbeat granularity is one round trip per Sentry project, as the brief states. The mattbutlerengineering project serves two apps (marketing and rialto-web). Whether each app needs its own heartbeat inside that project is parked as an Open question, not a requirement."
  - "When an issue auto-closes, it gets a comment linking the green run that closed it. The brief says 'auto-close' and does not specify a closing note. A link to the evidence is the repo's existing convention for automation-closed issues."
---

# PRD: Sentry silence alert

## Problem statement

When a Sentry project goes quiet, its operator cannot tell a healthy app from a
broken reporting path. "No errors happened" and "no errors can be reported" look
the same: an empty Sentry project next to an all-green CI board. Two blackouts
have already run for months because of this:

- `sentry-dsn-static-builds`: about 4.5 months.
- `backend-observability-blackout`: about 5 months.

Both were found by accident during unrelated runs.

The same ambiguity exists right now. The `mattbutlerengineering` project
(marketing and rialto-web) has had zero errors in 90 days, as measured on
2026-09-30. A round-trip checker for the backend, `scripts/sentry-round-trip.mjs`,
already exists, but nothing has ever run it.

## Solution

Once a day, plus on manual dispatch, an automated heartbeat proves that each
in-scope Sentry project still ingests events. The heartbeat makes each
project's deployed artifact raise a tagged event from inside itself, then
confirms through the Sentry API that the event arrived.

If a project's heartbeat does not come back:

- the run goes red;
- exactly one GitHub issue for that project is opened, or updated if already open.

When that project's heartbeat later succeeds, its issue closes automatically.

The result is that silence becomes interpretable. A quiet project with a green
heartbeat is healthy. A blind project gets an open issue within about a day.

## Actors

- **Operator (Matt)**: the sole owner of every deployed surface. Reads the alert
  issues and decides on fixes.
- **Heartbeat workflow**: the scheduled GitHub Actions job. It triggers
  in-artifact events, checks that they were ingested, and manages the alert
  issues.
- **Sentry triage loop** (`sentry-triage.yml` / `/sentry-triage`): the existing
  automation that turns real production errors into GitHub issues. It must not
  mistake heartbeat events for real errors.
- **Site visitor**: an anonymous user of marketing, rialto-web, or hospitality.
  The heartbeat must never be visible to them.

## User stories

1. As the **Operator**, I want a GitHub issue opened for any Sentry project that
   stops ingesting events, so that a reporting blackout surfaces within a day
   instead of months.
2. As the **Operator**, I want each failing project to have exactly one open
   issue that is updated on later failures, so that a multi-day outage is one
   thread, not a pile of duplicates.
3. As the **Operator**, I want a project's alert issue to close itself on the
   next successful heartbeat, so that open `sentry` issues always reflect
   current state.
4. As the **Operator**, I want to dispatch the heartbeat on demand, so that I can
   confirm a fix immediately instead of waiting for the next daily run.
5. As the **Heartbeat workflow**, I need each heartbeat event to start inside the
   deployed artifact, so that a pass proves the real reporting path works. A
   direct post to the DSN would only prove the DSN is valid.
6. As the **Sentry triage loop**, I need heartbeat events to be identifiable and
   excluded, so that I never file an issue about a synthetic heartbeat.
7. As a **Site visitor**, I see no change to any page, and nothing I can do
   triggers a heartbeat.

## Success criteria

- [ ] **SC-1: Triggers and cadence.** A workflow under `.github/workflows/` has
      both a daily `schedule:` cron and `workflow_dispatch:`.
      Check: read the workflow file. A daily cadence means a project's ingestion
      failure is detected within about 24 hours.
- [ ] **SC-2: Coverage.** Each run produces an explicit per-project verdict
      (pass or fail) for exactly these Sentry projects: `users-api`,
      `reservations-api`, `agent-api`, `hospitality`, `mattbutlerengineering`.
      `eat-sheet` is not one of them.
      Check: the run log or job summary of a real run.
- [ ] **SC-3: Executed for real on main.** The workflow has been dispatched at
      least once on `main` and finished with a verdict for all five projects.
      The run ID and per-project outcomes are recorded in `release.md`.
      Check: `gh run list --workflow <file> --branch main` plus `gh run view <id>`.
- [ ] **SC-4: In-artifact origin.** For every project, the heartbeat event is
      raised by the deployed artifact itself. No heartbeat code sends events
      straight to a Sentry DSN, envelope, or store endpoint.
      Check: grep the heartbeat scripts and workflow for direct ingest URLs
      (`/envelope/`, `/store/`, a DSN host). Also, a passing project's event in
      Sentry shows the deployed release/environment, not a script SDK.
- [ ] **SC-5: Ingestion asserted through the API.** A project passes only when a
      Sentry API query finds that run's unique heartbeat marker in that
      project's events. A timeout or a missing event means fail.
      Check: unit tests for the pass/fail decision, plus the real run's log
      showing the marker lookup for each project.
- [ ] **SC-6: Red on failure.** If any project fails, the workflow run concludes
      `failure`. If all pass, it concludes `success`.
      Check: unit test of the aggregate-exit decision, plus the conclusion of the
      SC-3 run matching its per-project verdicts.
- [ ] **SC-7: One de-duplicated issue per failing project.** A failing project
      that has no open alert issue gets exactly one new issue, labeled `sentry`,
      that names the project and links the run. A failing project that already
      has an open alert issue gets a comment on that issue and no new issue.
      Check: unit tests for the open/update decision. Live: after any failing
      run, `gh issue list --label sentry --state open` shows at most one alert
      issue per project.
- [ ] **SC-8: Auto-close on green.** A passing project with an open alert issue
      gets that issue closed, with a comment linking the green run. A passing
      project with no open issue causes no issue activity.
      Check: unit tests for the close decision. Live, if a fail-then-pass
      sequence happens during Operate.
- [ ] **SC-9: Heartbeats are tagged and excluded from triage.** Every heartbeat
      event carries a distinguishing tag. The Sentry triage loop's query or
      filter excludes events with that tag.
      Check: a unit test in `scripts/__tests__/` showing a heartbeat-tagged issue
      is filtered out. After the SC-3 run, no `sentry`-labeled triage issue
      references a heartbeat event.
- [ ] **SC-10: Invisible to visitors, no backdoor.** No user-visible content,
      route, or UI changes on marketing, rialto-web, or hospitality. No new
      unauthenticated HTTP endpoint is added to any service or site.
      Check: review the diff for new routes/handlers. A real-browser probe of
      each deployed static site after release shows no CSP violation and no
      new console error.
- [ ] **SC-11: Tested decision logic.** The decision logic is pure functions in
      `scripts/*.mjs`: per-project verdict, aggregate exit, and issue
      open/update/close. It is covered by `scripts/__tests__/*.test.mjs`, which
      pass and reach at least 80% line coverage on the new modules.
      Check: `pnpm vitest run scripts/__tests__/<new tests>` with coverage.
- [ ] **SC-12: Inside its own guard coverage.** The new scripts' tests run in
      `CI Gate` on a PR that touches them. Any `paths:` filter on the workflow
      (or on CI) includes the new scripts. Every `run:` block whose exit code
      matters starts with `set -o pipefail`, and no shell variable is named
      `status`.
      Check: the CI log of the run's PR shows the new tests executing, plus a
      grep of the workflow file.

## Out of scope

- **Fixing whatever the first heartbeat finds broken.** For example, if
  `mattbutlerengineering` is blind, that gets filed as its own issue or seed
  and is not fixed in this run.
- **The `eat-sheet` Sentry project**, which belongs to a separate product and repo.
- **A raw "zero events for N days" threshold alert.** Rejected by the Operator
  because it would false-alarm forever on a quiet, healthy static site.
- **Email, push, or chat notifications.** The GitHub issue is the alert.
- **Sentry-native alert rules or monitors.**
- **Performance, usage, or traffic telemetry.**
- **Changing what the services' Sentry plugins capture.** For example, the 5xx /
  NOTABLE_4XX capture set stays as it is.

## Open questions

- **Static-bundle trigger.** How can a deployed static bundle (marketing,
  rialto-web, hospitality) raise a tagged event on demand, under the live edge
  CSP, without a debug endpoint, backdoor, or anything a visitor could trigger
  or see (SC-10)? Architect must answer this. The backend precedent already
  rejected a debug endpoint.
- **Heartbeats per app within a shared project.** The `mattbutlerengineering`
  project serves both marketing and rialto-web. Should each app get its own
  heartbeat, so one app going blind is not hidden by the other still reporting?
  The Operator decides. Architect should surface the cost of each option.
- **Rate-limit side effects.** The backend path spends a deliberate 429 against
  each service's global limiter every day. Architect should confirm that
  limiter is keyed per client, so the heartbeat cannot throttle real users.
  Operate can check it against live traffic.
- **Shared Sentry projects for backend services.** `sentry-round-trip.mjs` notes
  that it is unresolved whether the three services report to their
  per-service projects. The 2026-09-30 measurement shows events landing in all
  three per-service projects. Architect should confirm the mapping each
  heartbeat targets.
