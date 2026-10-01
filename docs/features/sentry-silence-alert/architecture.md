---
stage: architect
run: feature:sentry-silence-alert
date: 2026-09-30
ux: skipped — Ops-only scheduled workflow and GitHub issues; any in-app heartbeat trigger must be invisible to site visitors, so there is no screen or flow to design.
assumptions:
  - "Per-app heartbeats inside a shared project (PRD open question; brief silent). Recommended default taken: one heartbeat TARGET per deployed artifact (6 targets), and a PROJECT passes only when every target that expects it passes. The cost is one extra page load (seconds) per run. The alternative, one heartbeat per project, would let a still-reporting app hide a blind one, which is the failure this run exists to remove."
  - "Expected project per target follows the PRD literally: marketing and rialto-web expect `mattbutlerengineering`. Measured below, both currently report to `hospitality`. So the first real run is expected to fail `mattbutlerengineering` as `misrouted`. That is a finding to file, not a defect of this run (brief: don't widen scope)."
  - "The browser heartbeat's distinguishing tag is Sentry's auto-derived `url` tag (from `event.request.url`), which carries the marker because the probe sets `?mbe-heartbeat=<marker>` with `history.replaceState` before throwing. Not measured live. Implement must confirm on the first deployed-page probe. If `url` is not tagged for browser events, matching still works through the event message (SC-5 holds), but SC-9 needs revisiting."
  - "Sentry-issue clutter is accepted. Each backend heartbeat produces a 1-event Sentry issue, because the plugin's message includes the query string and so is unique per marker. Those issues are never actionable at triage (threshold 5) and are also filtered by title. Resolving them automatically would need `event:write` on SENTRY_AUTH_TOKEN, whose scopes are unverified. Left out."
  - "Alert issues are de-duplicated by a hidden body marker found through the REST issues list (`labels=sentry&state=open`), not through Search. Memory records that `gh` search lags by hours, which would cause a duplicate on the next day's run."
---

# Architecture: Sentry silence alert

## Approach

This is a daily GitHub Actions workflow with one entrypoint script. The script
reads a fixed **target registry**: one entry per deployed artifact, each naming
the Sentry project it is expected to report to.

For each target, the script makes the deployed artifact itself raise an event
that carries a unique per-run marker:

- **Backend services:** the existing deliberate-429 path in
  `scripts/sentry-round-trip.mjs`.
- **Static sites:** headless Chromium loads the live page, then
  `page.evaluate` throws an uncaught error _inside that page_. The bundle's own
  Sentry SDK captures it and sends it under the live CSP.

The script then polls the Sentry events API for the marker and turns the
results into pure, unit-tested verdicts. A second step reconciles those
verdicts against open GitHub issues (open, comment or close), and a last step
fails the run if any project failed.

**The shape that lost** was one bespoke trigger per bundle: a secret-keyed URL
parameter or an HMAC'd hook compiled into each app. It needs new code in three
bundles, a secret shipped to (or checked by) client-side code, and a code path
visitors can reach. The chosen shape adds zero bytes to any deployed artifact.
It still exercises the bundle's real init, DSN, transport and CSP path,
because the event is captured by the client that `initSentry` built, not by
one the probe creates.

### Measured facts this design rests on (2026-09-30)

**1. Backend project mapping is per service.**

- `deploy-services.yml` injects `SENTRY_DSN_USERS_API`, `SENTRY_DSN_RESERVATIONS_API`
  and `SENTRY_DSN_AGENT_API` into the matching components.
- In Sentry (errors, 90 days), every `HTTP 429` event's `server_name` equals
  its project: `agent-api` ×33, `users-api` ×26+, `reservations-api` ×23.

So the mapping is `users-api`→`users-api`, `reservations-api`→`reservations-api`,
`agent-api`→`agent-api`. This answers the round-trip script's open question.

**2. All three static bundles share one DSN, and it points at `hospitality`.**

- `deploy-static.yml` builds marketing, hospitality and rialto-web with the
  same `secrets.VITE_SENTRY_DSN`.
- In Sentry, the `hospitality` project holds events tagged `app:hospitality`
  (36) and `app:marketing` (4, last seen 2026-09-24). No artifact targets
  `mattbutlerengineering`.

So the idea's "0 events in `mattbutlerengineering`" is a routing fact, not
evidence of a blind bundle. Marketing _does_ report, just into `hospitality`.

**3. Browser events carry `environment: development` and `release: null`.**

`packages/sentry/src/config.ts` reads `process.env`, which is undefined in the
browser. SC-4's "shows the deployed release/environment" check therefore
cannot pass for browser targets as written. This design uses the event's
`platform` together with the `app` tag as the origin evidence instead (see
_Interfaces_). The env/release defect is filed, not fixed (out of scope).

**4. The 429 throttles only the heartbeat's own client.**

- Health routes carry a route-level limit of `max: 10 / 1 minute`
  (`health-routes.ts:234`), which replaces the global 100/min for that route
  (gotchas § Fastify).
- The key is `request.ip`, and `trustProxy` is unset.
- Each service runs `instanceCount: 1` with an in-memory store, and live
  headers show `x-ratelimit-limit: 10`.

To measure the keying, I sent the same path directly from my IP and through
the apex edge worker:

- Direct requests kept one decrementing bucket: 9 → 8 → 7, then 6 with
  `reset: 24`.
- Requests through the apex got fresh buckets each time: 9 with `reset: 60`,
  twice.

So in production the key distinguishes source IPs. A heartbeat burst exhausts
only the runner IP's bucket on that one health route, for at most 60 seconds.
Other monitors (`production-feedback.yml`, `post-deploy-check.yml`) run on
other runners and IPs and are unaffected.

**5. Captured 4xx messages include the query string.**

Sentry `url` tags hold full `request.url`, query string included. So the
backend marker in `?rt=` reaches both the `url` tag and the issue title.

**6. The live CSP allows the ingest origin.**

`infrastructure/worker/csp.js`'s `connect-src` includes `SENTRY_INGEST_ORIGIN`
(`o4510650299842560.ingest.us.sentry.io`).

**7. The SDK's default integrations are on.**

`initSentry` passes `integrations: []`, which `getIntegrationsToSetup`
(`@sentry/core` 10.70) _appends_ to the defaults rather than replacing them.
So `GlobalHandlers` and `BrowserApiErrors` are active, and an uncaught error
in the page is captured.

## Components

### Target registry (`scripts/sentry-heartbeat-targets.mjs`)

- Responsibility: the single, declarative statement of what is checked and
  where each target's events are expected to land. These are frozen data,
  not code.

  | id                 | kind    | how it is reached                                                                                                                                     | expected project        | `app` tag     |
  | ------------------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------------- |
  | `users-api`        | backend | `https://api.mattbutlerengineering.com/api/v1/users/health`                                                                                           | `users-api`             | —             |
  | `reservations-api` | backend | `…/api/v1/reservations/health`                                                                                                                        | `reservations-api`      | —             |
  | `agent-api`        | backend | `…/api/gen/health`                                                                                                                                    | `agent-api`             | —             |
  | `hospitality`      | browser | `https://mattbutlerengineering.com/hospitality/reservations/manage` (public, unauthenticated, no Auth0 redirect; Implement confirms with a live load) | `hospitality`           | `hospitality` |
  | `marketing`        | browser | `https://mattbutlerengineering.com/`                                                                                                                  | `mattbutlerengineering` | `marketing`   |
  | `rialto-web`       | browser | `https://mattbutlerengineering.com/rialto/`                                                                                                           | `mattbutlerengineering` | `rialto-web`  |

  `IN_SCOPE_PROJECTS` is derived from this table, giving exactly the 5
  projects in SC-2. `eat-sheet` is absent by construction.

- Collaborators: the heartbeat runner (reads it); the misroute sweep (uses the
  project list).

### Heartbeat decision module (`scripts/sentry-heartbeat.mjs`, pure exports)

- Responsibility: every decision in the run, and nothing that touches the
  network. It decides:
  - whether a Sentry event matches a target (marker plus, for browser, the
    `app` tag);
  - a target's outcome;
  - each project's verdict;
  - the aggregate exit code;
  - the job-summary table;
  - whether a Sentry issue is a heartbeat, which the triage filter uses.
- Collaborators: imports `buildRoundTripMarker`, `eventMatchesMarker`,
  `shouldKeepPolling` and `nextPollDelayMs` from `sentry-round-trip.mjs`, so
  they are reused, not copied. Its consumers are the runner, the issue
  reconciler and `triage.mjs`.
- Deletion test: without it, each of those three callers would re-derive
  "what counts as a heartbeat / a pass". It survives.

### Backend trigger (existing `scripts/sentry-round-trip.mjs`, refactored)

- Responsibility: provoke a captured 429 inside one deployed service.
- Change: extract an injectable `provokeCapturedError` and
  `findMarkedEvent(org, project, marker, token, fetchImpl)`, so the runner
  calls them with no `process.exit`. The CLI `main()` keeps working, since
  Verify can still run it by hand.

### Browser trigger (new, inside the runner, using `@playwright/test`'s `chromium`, already a root devDependency)

- Responsibility: make one deployed bundle capture a marked error.
- Sequence:
  1. Launch Chromium **without** `bypassCSP`, so the envelope POST faces the
     live CSP.
  2. Load the target URL and wait for `load`.
  3. Run one `page.evaluate`, which:
     - calls `history.replaceState` to append `?mbe-heartbeat=<marker>`
       (this puts the marker into the `url` tag; no navigation, no router
       event);
     - calls `setTimeout(() => { throw new Error("<marker> sentry heartbeat") })`.
  4. Wait for the envelope request to the ingest origin to complete
     (`page.waitForRequest` filtered to the ingest host, with a 15 s
     timeout).
  5. Record any `securitypolicyviolation` or console errors as diagnostics.
- Why this proves the bundle: the throw is caught by handlers that only
  `Sentry.init` installs. If `initSentry` returned early (an empty DSN, the
  `enabled: false` incident), nothing captures it and the target fails. The
  DSN, transport and `app` tag all come from the deployed bundle.
- Why it was chosen over calling the client through `window.__SENTRY__[ver].defaultCurrentScope.getClient()`:
  that path does also reach the bundle's real client (measured in
  `@sentry/core` 10.70 `carrier.js`). It loses because it couples the check
  to SDK internals that change between versions. An uncaught throw relies
  only on the documented default integration.
- Collaborators: the decision module, for marker matching after polling.

### Heartbeat runner (`scripts/sentry-heartbeat.mjs` CLI entrypoint, c8-ignored like the round-trip CLI)

- Responsibility: orchestration only:
  1. Build a marker per target.
  2. Fire all six triggers concurrently, then poll each target's expected
     project until it is found or `--timeout-ms` (default 180 s) runs out.
  3. On a miss, run **one misroute sweep**: query the other in-scope
     projects for the marker.
  4. Write `heartbeat-verdicts.json` and the job summary.
  5. Exit 0 always. The verdict file, not the exit code, carries the result,
     so the issue step always has input.
- Collaborators: the target registry, both triggers, the Sentry events API,
  and the decision module.

### Issue reconciler (`scripts/sentry-heartbeat-issues.mjs`)

- Responsibility: turn project verdicts plus currently-open alert issues into
  open, comment or close actions. A pure `decideIssueActions(verdicts, openAlertIssues, runUrl)`
  is wrapped by a thin `gh api` adapter.
- Collaborators: the GitHub REST API (`GH_TOKEN = github.token`).

### Triage filter (edit to `.claude/skills/sentry-triage/scripts/triage.mjs`)

- Responsibility: drop any Sentry issue for which `isHeartbeatIssue(issue)`
  is true before the actionability step. Count dropped issues as
  `heartbeat=N` in the existing skip tally, so the filter is visible rather
  than silent.

### Workflow (`.github/workflows/sentry-heartbeat.yml`)

- Responsibility: cadence, secrets and the red/green conclusion.
- Shape:
  - Triggers:
    - `schedule: cron "23 13 * * *"`: daily, off the hour, and 37 minutes
      before `sentry-triage.yml`'s 14:00.
    - `workflow_dispatch`, which has no inputs.
  - `permissions: { contents: read, issues: write }`.
  - `concurrency: { group: sentry-heartbeat, cancel-in-progress: false }`.
  - One job, `timeout-minutes: 15`, with these steps:
    1. checkout (pinned SHA, as in its siblings);
    2. `./.github/actions/setup-workspace`;
    3. `pnpm exec playwright install --with-deps chromium`;
    4. `node scripts/sentry-heartbeat.mjs --out heartbeat-verdicts.json`;
    5. `if: always()`: `node scripts/sentry-heartbeat-issues.mjs heartbeat-verdicts.json`;
    6. `if: always()`: `node scripts/sentry-heartbeat.mjs --exit-from heartbeat-verdicts.json`.
       A missing or unparseable file maps to exit 2.
  - Every `run:` starts with `set -o pipefail`, and no variable is named
    `status`.
  - No `paths:` filter. The schedule cannot drift out of its own trigger, and
    the scripts' tests run in `CI Gate` through `scripts/vitest.config.mjs`
    (`include: scripts/__tests__/**/*.test.mjs`, coverage uploaded by
    `ci.yml`).

## Data model

All of it is transient, per run. Nothing is persisted except GitHub issues.

```js
// target (registry row, frozen)
{ id, kind: "backend" | "browser", project, url, app? }

// target outcome
{ targetId, project, marker,
  outcome: "confirmed" | "misrouted" | "not-found" | "provoke-failed" | "error",
  foundInProject?, eventId?, platform?, detail }

// project verdict: pass only if every target expecting it is "confirmed"
{ project, pass: boolean, targets: [targetOutcome] }

// alert issue: identified by a hidden marker line in its body
"<!-- sentry-heartbeat project=<slug> -->"
```

These are the access patterns, and they are all the model serves:

- Find this run's marker in one project's recent events (poll).
- Find it in any other in-scope project (one-shot sweep).
- List open `sentry`-labeled issues and find the one per project
  (`GET /repos/{repo}/issues?labels=sentry&state=open&per_page=100`, then
  filter by body marker locally).

**Consistency:** the run's verdicts are authoritative only for that run. An
issue reflects "last run's verdict for this project". There are no
cross-run invariants beyond at most one open alert issue per project, and the
reconciler owns that.

## Interfaces & contracts

### Target trigger (backend and browser)

- Input: target and marker.
- Output: `{ triggered: true }`, or `{ triggered: false, reason }`.
- Failure modes:
  - Backend: no 429 within 150 requests → `provoke-failed`.
  - Browser: navigation error or timeout (30 s) → `error`; envelope request
    not observed within 15 s → still poll (the request listener can miss
    it), and the poll decides.
  - Retrying is safe: a fresh marker per attempt. The runner does not retry
    automatically, because the next day's run is the retry.

### Marker lookup (`findMarkedEvent`)

- Input: org, project, marker, token. The request is
  `GET https://sentry.io/api/0/projects/{org}/{project}/events/?query=<marker>`.
  This is the same host and auth that `triage.mjs` already uses successfully
  with `SENTRY_AUTH_TOKEN`.
- Output: the first event where `eventMatchesMarker` holds, else `undefined`:
  - Backend: a `requestId` or `url` tag holds the marker (existing logic).
  - Browser: the `url` tag or the event `title`/`message` contains the
    marker, **and** the `app` tag equals the target's `app`.
- Failure modes: a non-2xx response throws, and the target becomes `error`,
  never `not-found`. "Couldn't ask" and "asked, nothing there" stay distinct.
  Each request has a 10 s timeout (AbortSignal). The poll uses capped
  exponential backoff (existing `nextPollDelayMs`).

### Origin evidence (SC-4)

Recorded per confirmed target:

- the event `platform`: `javascript` for browser targets, `node` for backend
  targets;
- the `app` or `server_name` tag.

A browser target whose matched event has platform `node` would mean a script
SDK sent it. That is impossible by construction, but asserting it is
cheap. No heartbeat code contains `/envelope/`, `/store/` or a DSN. The only
Sentry host the scripts call is the REST API, and SC-4's grep checks this.

### `projectVerdicts(outcomes, registry)` → `[ProjectVerdict]`

Every in-scope project appears exactly once, even if its targets errored.
This guarantees SC-2's explicit per-project verdict.

### `aggregateExitCode(verdicts)` → `0 | 1 | 2`

- 0: all projects pass.
- 1: any project fails.
- 2: the verdict file is missing or malformed.

Unknown input maps to non-zero, the same fail-closed rule as
`roundTripExitCode`.

### `decideIssueActions(verdicts, openAlertIssues, runUrl)` → `[{project, action: "open"|"comment"|"close"|"none", body?}]`

| verdict | open alert issue? | action                                        |
| ------- | ----------------- | --------------------------------------------- |
| fail    | no                | `open`                                        |
| fail    | yes               | `comment`                                     |
| pass    | yes               | `close`, with a comment linking the green run |
| pass    | no                | `none`                                        |

- The open body contains: the project; each failing target and its outcome
  (including `misrouted → <project>`); the run URL; and the hidden marker.
- The body must **not** contain any `sentry.io/.../issues/<id>/` link.
  `decideSentryDedup` scans `label:sentry` issue bodies for Sentry issue IDs,
  and a heartbeat alert must never suppress a real triage filing.
- New issues get the label `sentry` only, which already exists. They never
  get `ready`, because an alert is for the Operator, not for implement-queue
  (`adr0032-one-way-mirror`: no work order without a breakdown row).
- Failure modes:
  - If the issues list fails, the adapter takes no action and exits non-zero,
    so the step is red. It never opens a duplicate because it "saw none".
  - Each action is attempted independently. One failure is logged and does
    not stop the others.

### `isHeartbeatIssue(sentryIssue)` → boolean

True when `title` (or `metadata.value`) contains `mbe-round-trip`. This holds
for both kinds:

- backend: `HTTP 429: GET …/health?rt=mbe-round-trip-…`;
- browser: `Error: mbe-round-trip-… sentry heartbeat`.

This is an issue-level rule, because triage reads issues, not events. It
avoids relying on Sentry's issue-search semantics for negated tag queries.

### Heartbeat tag (SC-9)

- Backend events: `requestId` and `url` tags = `mbe-round-trip-…` (existing).
- Browser events: `url` tag contains `mbe-heartbeat=mbe-round-trip-…`
  (assumption 3).

## Stack & dependencies

- **Node 22 `.mjs` plus vitest in `scripts/__tests__/`**: the repo's
  convention for workflow logic. Tests run in `CI Gate`.
- **`@playwright/test` (`chromium`), already a root devDependency**: no new
  dependency. Its interface cost is one `launch`/`goto`/`evaluate` sequence,
  inside the runner only.
- **Sentry REST API with `SENTRY_AUTH_TOKEN`** (existing secret, mapped to
  `SENTRY_AUTH_TOKEN` env): no Sentry SDK in the scripts. This keeps SC-4
  trivially greppable.
- **GitHub REST through `github.token`**: issues only, no PRs. So the
  `GITHUB_TOKEN` anti-recursion trap doesn't apply.

## Decisions & alternatives

- **Playwright `evaluate` throw in the live page** over a secret-keyed or
  HMAC'd URL trigger compiled into each bundle. The trigger loses: it changes
  three bundles, needs a secret in or checked by client code, and adds a
  visitor-reachable code path. The browser DSN is public, so the abuse
  surface (anyone spamming Sentry quota) already exists. The chosen design
  adds none.
- **Uncaught throw** over calling the client through `window.__SENTRY__`. The
  carrier path is SDK-internal and version-coupled. Both prove the bundle's
  init.
- **No bundle change at all** over a `beforeSend` that tags `heartbeat=true`
  and fingerprints heartbeats. The `beforeSend` would give a cleaner tag and
  one stable Sentry issue. It loses because it needs a three-site redeploy
  before the first heartbeat can pass, and `packages/sentry/**` is **not** in
  `deploy-static.yml`'s `paths:`, so it would not even deploy on merge. That
  is the shipped-never-run trap again. If assumption 3 fails, this is the
  fallback.
- **Reuse the deliberate 429 on the route-level 10/min health bucket** over
  any other captured path:
  - The 404 handler shares the global 100/min bucket, so it costs more
    requests.
  - Public reservation routes are real-user surfaces.
  - `/ready` is excluded from capture.
  - Keying per source IP is measured (fact 4).
- **Marker kept in the URL query string** (unique Sentry issue per backend
  run) over a constant URL that would group heartbeats with real 429s on the
  same path. A constant URL loses the `url` carrier, the only one observed
  live (the `requestId` header's survival through ingress is unmeasured).
  It would also make that group exceed triage's threshold.
- **Per-target heartbeats, with expected project per target** over per-project.
  This turns "0 events" into `misrouted → hospitality`, the actual state
  today.
- **De-dupe by hidden body marker through REST list** over a new label or a
  Search query. A new label is more config. Search lags by hours (memory),
  and a lagging search causes a duplicate.
- **Verdicts written to a file, exit computed in a final `always()` step**
  over failing the runner directly. If the runner exited non-zero, issue
  reconciliation would have to be wired around a failed step. The file
  makes "red on failure" and "issues updated on failure" independent
  (SC-6, SC-7).
- **Title-based triage filter** over the issue-search query
  `!requestId:mbe-round-trip-*`. Negated-wildcard semantics and filtered
  stats on the issues endpoint are unmeasured. A pure title predicate is
  unit-testable.

## ADRs

None. No decision met the ADR bar. Each one is reversible by editing one
script or the workflow.

## Findings to file (not fixed here)

1. Marketing and rialto-web report to `hospitality` through a shared
   `VITE_SENTRY_DSN`. `mattbutlerengineering` receives nothing by
   construction. The first run should open this as the
   `mattbutlerengineering` alert.
2. Browser events report `environment: development` and `release: null` in
   production (`packages/sentry/src/config.ts` reads `process.env` in the
   browser).
3. `deploy-static.yml`'s `paths:` omits `packages/sentry/**`, so a change to
   the browser Sentry package does not redeploy the sites. This is the same
   class as the `packages/api-client` seed.

## PRD traceability

| SC   | Component                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------- |
| 1    | Workflow triggers                                                                                             |
| 2    | Target registry + `projectVerdicts`                                                                           |
| 3    | Workflow `workflow_dispatch`, dispatched at Ship                                                              |
| 4    | Both triggers originate in the artifact; origin evidence; no ingest URLs                                      |
| 5    | `findMarkedEvent` + `eventMatchesMarker` + target outcome                                                     |
| 6    | `aggregateExitCode` + final workflow step                                                                     |
| 7, 8 | `decideIssueActions` + adapter                                                                                |
| 9    | Heartbeat tag + `isHeartbeatIssue` in `triage.mjs`                                                            |
| 10   | Zero artifact changes; Playwright-only trigger; Ship-time browser probe                                       |
| 11   | Pure exports in `sentry-heartbeat*.mjs` + `scripts/__tests__/`                                                |
| 12   | `scripts/vitest.config.mjs` include + workflow test asserting `set -o pipefail`, no `status`, cron + dispatch |
