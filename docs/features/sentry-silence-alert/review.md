---
stage: review
run: feature:sentry-silence-alert
date: 2026-09-30
assumptions:
  - "Majors that need a policy decision from Matt (M3, M4) are recorded as deferred with a stated trigger and owner rather than fixed in-stage. The brief only blocks merge on an unfixed critical, and the skill's 'majors fixed or explicitly deferred by the user' cannot be satisfied unattended, so they are surfaced to the orchestrator."
  - "Item 1 (first-execution risk) was adjudicated against Sentry's published API docs plus the endpoint's own source (getsentry/sentry `src/sentry/issues/endpoints/project_events.py`, `SimpleEventSerializer`, `Event.search_message`, `middleware/ratelimit.py`). The real endpoint has still never been called with the repo token, so this is source-verified, not measured."
---

# Review: Sentry silence alert

## Scope

`git diff origin/main...HEAD` on `feat/sentry-silence-alert` (draft PR #5940),
from `7b12c801d` through `4d4c28e68` (16 commits, 23 files). Code examined:

- `scripts/sentry-heartbeat.mjs`, `sentry-heartbeat-issues.mjs`,
  `sentry-heartbeat-targets.mjs`, `sentry-triage-heartbeat.mjs`
- the `sentry-round-trip.mjs` refactor
- the `triage.mjs` wiring
- `.github/workflows/sentry-heartbeat.yml`
- the nine new or changed test files

Also cross-read: the run artifacts, `scripts/check-ai-antipatterns.mjs`,
`scripts/scheduled-workflow-health.mjs`, `sentry-triage.yml` and its last CI
log, and the upstream Sentry source listed in `assumptions`.

The repo `reviewer` subagent reviewed the same diff against PRD SC-1 to SC-12.
Its verdict was **PASS, 7/10**. It raised two issues, M1 and M2 below, and
both are now fixed. The other specialist reviewers do not apply: there are no
migrations, no Playwright specs under `apps/*/e2e`, no rialto changes, no
Stripe changes and no generated artifacts.

Fix commits added this stage: `8cde07102` and `aa5288cae`.

## Findings

### Adjudication 1 — First-execution risk of `findMarkedEvent`: no shape mismatch found

The lookup asks `GET https://sentry.io/api/0/projects/{org}/{project}/events/?query=<marker>` with `Authorization: Bearer`. Each part was checked against Sentry's documentation and source.

- **Base URL and auth: verified working.** Same base URL and Bearer header as `triage.mjs`. Sentry Triage run `36761399515` (2026-09-30) used the same `SENTRY_AUTH_TOKEN` secret, listed all 6 projects and read their issues.
- **`query` parameter: undocumented, but implemented.** The public docs list only `statsPeriod`, `start`, `end`, `cursor`, `full` and `sample`. `ProjectEventsEndpoint.get` does read `query`, and turns it into `positionCaseInsensitive(message, query) != 0`, a case-insensitive substring match on the Snuba `message` column. That column is `Event.search_message`. It holds the logentry plus every metadata string value (exception `type` and `value`) plus the culprit. So the marker is matched in:
  - the browser `Error: <marker> sentry heartbeat` exception value;
  - the backend `HTTP 429: GET …?rt=<marker>` message.
- **Response shape: matches what the matcher reads.** `SimpleEventSerializer` returns:
  - `id`, the event id;
  - `title` and `message`;
  - `platform`;
  - `tags` as `[{key, value}]` with the `sentry:` prefix stripped.

  This is exactly what `eventMatchesTarget`, `eventMatchesMarker` and `originMismatch` read.

- **Pagination.** Results come 100 per page. A unique marker matches about one event, so a single page is enough.
- **Scope: the residual risk.** Docs list `project:read`. Triage only proves `event:read` and `org:read`. See M4.

There is no confirmed mismatch, so this is **not a critical finding**. The undocumented `query` parameter is minor m7.

### Major M1: concurrent, rate-limited Sentry lookups read as `error` and open false alerts

- **Scenario.** The events endpoint declares `RateLimitConfig`:
  - GET 60/min per IP, user and org;
  - concurrency 1 per user and IP, and 2 per org.

  `runHeartbeat` polls all six targets concurrently. The three backend triggers finish at about the same moment and then poll after the same 1 s backoff. Any single Sentry 429 made `pollExpectedProject` return `lookupError` at once. The target then becomes `error`, the project fails, the workflow goes red, and a `sentry` alert issue is opened for a healthy project. Whether the concurrency limit is enforced depends on Sentry's `ENFORCE_CONCURRENT_RATE_LIMITS` setting. The fixed window is always enforced.

- **Standard.** None.
- **Decision.** Fixed in `8cde07102`, test-first:
  - `findMarkedEvent` marks a 429 `retryable`;
  - the poll keeps going through it, and reports `error` only if the window closes while the last lookup was still failing;
  - the CLI wraps `lookup` in `serializeCalls`, so at most one events request is in flight.

  The new tests failed before the change. A mutation check confirmed it: removing the serialisation turns the `serializeCalls` test red.

### Major M2: the browser envelope wait resolves on the SDK's session envelope, so the error POST can be aborted

- **Scenario.** This was found by the `reviewer` subagent and re-verified here against `@sentry/core@10.75.0` `client.js` lines 605-631:
  - `_updateSessionFromEvent` sends the session update before `sendEvent`;
  - `packages/sentry/src/react.ts`'s `integrations: []` keeps the default integrations, so session tracking is on.

  `waitForResponse(isIngestTraffic)` therefore usually resolved on the session response. The `finally` then closed the browser while the error envelope could still be in flight. That is the same abort Implement measured and set out to fix (breakdown item 9). The result is an intermittent `not-found`, a red run, and a false alert.

- **Standard.** None.
- **Decision.** Fixed in `aa5288cae`, test-first. The wait now matches only the ingest response whose request body contains this run's marker. If the body is ever not inspectable, the wait degrades to its 15 s timeout, which gives the POST time to finish.

### Major M3: `scheduled-workflow-health` will file a `ci-fix` + `ready` issue against the heartbeat itself after three red days

- **Scenario.**
  1. Architect predicts that `mattbutlerengineering` reports `misrouted → hospitality` from day 1. That means every scheduled run concludes `failure`, by design (SC-6).
  2. `scripts/scheduled-workflow-health.mjs` (`DEFAULT_THRESHOLD = 3`, labels `["ci-fix", "ready"]`) then files "Sentry Heartbeat failing" on about day 3 and hands it to implement-queue.
  3. An agent asked to make that workflow green has an easy wrong fix: change the marketing and rialto-web `project` in `sentry-heartbeat-targets.mjs` to `hospitality`. That silences the exact finding this run exists to surface.
  4. Separately, the alert is doubled: one `sentry` issue from the heartbeat itself, plus one `ci-fix` issue.
- **Standard.** None.
- **Decision.** **Deferred, needs Matt's decision before the third scheduled run** (about 3 days after merge). There are two options:
  - (a) fix the DSN misrouting in `deploy-static.yml` first, which is the real cure and is already out of scope here as a filed finding;
  - (b) teach `scheduled-workflow-health` to skip workflows whose red is a reported finding. This changes fleet-wide detector policy, so it is not done in-stage.

  This does not block merge, because the brief stops only on an unfixed critical. Ship should record the deadline in `release.md`.

### Major M4: the token's `project:read` scope is unverified, so the first dispatch could open 5 false alerts

- **Scenario.** `ProjectEventsEndpoint` uses the default `ProjectPermission`, which requires `project:read`. Triage's success only proves `org:read` and `event:read`. If the secret lacks `project:read`:
  1. every lookup gets 403;
  2. every target becomes `error`;
  3. 5 alert issues open on Ship's single dispatch.

  The run would still be correctly red and the issue bodies would say `error`, but the issues would be false.

- **Standard.** None.
- **Decision.** **Deferred to Ship as a pre-flight check.** It cannot be measured locally because no token is available. Ship reads the dispatched run's log. If every target is `error` with `Sentry API returned 403`, Ship closes the 5 issues as a scope problem, records it in `release.md`, and asks Matt to add the scope. It must not be read as five blackouts.

### Minor m1: ratchet workaround (commit `4822ca103`) is legitimate, not gate-gaming

- **Scenario.** `consoleLogs` is described as "console.log() calls in production (non-test) source files". It exists to catch stray debug logging.
  - The heartbeat CLI's lines are its product output: the job log is SC-5's audit trail. Routing them through one documented `process.stdout.write` helper does not change behaviour and does not hide a debug leftover.
  - The fixture path change from `/api/v1/…` to `/v1/…` does not weaken the test, which only asserts marker inclusion.
  - The `reviewer` reached the same judgment.

  The only decay is that the counter cannot tell CLI output from debug logs.

- **Standard.** None.
- **Decision.** Deferred. No action in this run; exempting CLI entrypoints is a ratchet change for another run.

### Minor m2: SC-9 deviation, marker in title/message rather than a tag

- **Scenario.** On browser events the marker is in the title and message only, because the `url` tag drops the query string (measured). PRD SC-9 says "distinguishing tag". The intent is still met:
  - every heartbeat is identifiable by `mbe-round-trip` in the issue `title` and `metadata.value` (backend and browser alike);
  - `isHeartbeatIssue` drops those issues before actionability, and the drop is unit-tested and counted as `heartbeat=N`.

  The residual risk is that a real error grouped into a heartbeat issue would be hidden. This is unlikely, since the stack trace comes from Playwright-evaluated code.

- **Standard.** None.
- **Decision.** Accepted as PASS-WITH-DEVIATION. Wording only.

### Minor m3: page console text is written raw to the job log, where `::` workflow commands are interpreted

- **Scenario.** `triggerBrowserTarget`'s `detail` holds console errors and CSP text from the live page, and the CLI logs it to stdout. A console message starting with `::error::` or `::add-mask::` would be interpreted by the runner. The content comes from this repo's own deployed sites and their third-party scripts. Workflow commands cannot reach secrets or `GITHUB_ENV`, since `set-env` was removed. The risk is low.
- **Standard.** None.
- **Decision.** Deferred. The fix is to wrap the detail output in `::stop-commands::<token>`.

### Minor m4: `originMismatch` treats `platform: null` as a mismatch

- **Scenario.** A browser match whose serialized `platform` is `null`, rather than absent, would become `error`. `SimpleEventSerializer` always emits `platform`, and every measured browser heartbeat was `javascript`, so this has not been seen.
- **Standard.** None.
- **Decision.** Deferred.

### Minor m5: Implement's two deviations are sound

- **Navigation failure becomes `provoke-failed`.** When the site is down the run cannot prove ingestion, so failing is correct. The outcome is kept distinct in the issue body ("the trigger never fired").
- **Platform check skipped when `platform` is absent.** The marker plus the `app` tag already pin the event to the bundle, and the serializer always returns `platform` anyway.
- **Standard.** None.
- **Decision.** Accepted.

### Minor m6: an alert for a project removed from the registry is never closed

- **Scenario.** `decideIssueActions` only acts on projects that are in today's verdicts. An open alert for a project that is later dropped from `TARGETS` stays open forever.
- **Standard.** None.
- **Decision.** Deferred. Today the registry is frozen and covers all 5 projects.

### Minor m7: `findMarkedEvent` relies on an undocumented `query` parameter

- **Scenario.** `query` is absent from the public API docs. If Sentry dropped it, the endpoint would return the newest 100 events unfiltered. A heartbeat that was not among them would read `not-found`, which is the fail-closed direction.
- **Standard.** None.
- **Decision.** Deferred. Ship's first real log confirms it works.

## Passes with no findings

**Security, issue reconciler (item 5): clean.**

- **Permissions.** The workflow token is `contents: read` and `issues: write`.
- **Which issues it can touch.** It lists only open `sentry` issues through the REST list, then acts only on issues whose body carries the exact hidden marker `<!-- sentry-heartbeat project=<slug> -->`. It cannot close or comment on triage issues or human issues. Outside contributors cannot apply labels.
- **Issue bodies.** These are built only from registry target ids, project slugs and the fixed outcome enum. No Sentry-provided or page-provided string reaches an issue body or title.
- **Shell safety.** `gh` runs through `execFileSync` with an argv array (no shell) and raw `-f` fields, not `-F`, so there is no `@file` expansion.
- **Failure handling.** A failed list takes no action, and 100 or more open issues makes it fail closed.

**Security, rest of the diff.** No secrets are in code. There is no direct DSN, envelope or store post, since the ingest host is only a response filter. No new route or endpoint was added (SC-10).

**Design.** The code matches `architecture.md`'s contracts:

- target registry;
- outcome enum;
- fail-closed exit codes 0/1/2;
- `if: always()` on the issue step and the exit step;
- `set -o pipefail` in every `run:` block, and no `status` variable.

## Verdict

**Ready to ship. No critical finding remains.** M1 and M2 were fixed in-stage, test-first, and the gates are green:

- `pnpm --dir scripts test`: 246 files, 4747 tests passed;
- `pnpm lint`: pass;
- `pnpm typecheck`: pass;
- AI-antipattern ratchet: within baseline.

The `reviewer` subagent gave PASS 7/10 on the pre-fix head. Its two issues are the two fixes.

Ship must carry two deferred majors:

- **M4.** Read the first dispatch's log. An all-`error`/403 run is a token-scope problem, not five blackouts.
- **M3.** Matt decides misrouting fix vs detector exemption before the third scheduled red run, about 3 days after merge.

Minors m1 and m3 to m7 are deferred with reasons above. m2 is accepted.
