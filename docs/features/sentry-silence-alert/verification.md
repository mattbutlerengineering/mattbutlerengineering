---
stage: verify
run: feature:sentry-silence-alert
date: 2026-10-01
assumptions:
  - "Criteria that can only be met after merge (SC-3, the live halves of SC-2/5/6/7/9, SC-10's post-release browser probe) are recorded as PENDING-SHIP, not PASS and not FAIL. Ship's dispatched run on main completes them. Recommended default from the breakdown's SC coverage table; the brief is silent."
  - "SC-9 is judged against what was built: the marker sits in the event title and message, not in a `url` tag (measured in breakdown item 1). The triage filter keys on issue `title` / `metadata.value`. Recorded as PASS-WITH-DEVIATION, with the wording gap left for Review."
  - "SC-12 CI evidence comes from run 36815619431 on head 4822ca103. The current head 45a1808cc differs from it only in breakdown.md (one docs file, 22 insertions), and its CI was still running at verify time. The earlier run's test log is taken as valid for the code."
  - "Sentry evidence was gathered through the Sentry MCP `search_events` tool (org mattbutlerengineering, region https://us.sentry.io, errors dataset, 24h). There is no local SENTRY_AUTH_TOKEN. It is the same data source the breakdown Notes used, re-queried today, and it is not the REST endpoint the runner calls."
---

# Verification: Sentry silence alert

## Summary

Of 12 PRD criteria, nothing failed:

- **Fully PASS (3):** SC-1, SC-11, SC-12.
- **Logic PASS, live half PENDING-SHIP (5):** SC-2, SC-5, SC-6, SC-7, SC-8 (SC-8's live half is deferred to Operate).
- **Diff PASS, post-release probe PENDING-SHIP (1):** SC-10.
- **PASS-WITH-DEVIATION (1):** SC-9. The marker is in the title and message, not a tag.
- **PARTIAL (1):** SC-4. The grep passes, but browser events report `environment: development` and no release.
- **PENDING-SHIP (1):** SC-3.

Verdict: the pre-merge work meets the criteria. The workflow has never run
on GitHub. `findMarkedEvent` has never called the real Sentry REST events
endpoint (it was only exercised with fakes and an MCP substitute), so the
system is not yet proven end to end. Ship's dispatch on `main` is where that
happens.

Commands were run 2026-10-01 in worktree `.claude/worktrees/sentry-silence-alert`
at HEAD `45a1808cc` (matches `origin/feat/sentry-silence-alert`), against
`origin/main` `03bf18161`.

## Criteria & evidence

### SC-1: Triggers and cadence

- Check: read `.github/workflows/sentry-heartbeat.yml`. The workflow-shape test passes (see SC-12).
- Evidence:
  ```
  on:
    schedule:
      # 13:23 UTC daily: off the hour, 37 minutes before sentry-triage.yml.
      - cron: "23 13 * * *"
    workflow_dispatch:
  ```
- Result: PASS

### SC-2: Coverage (explicit verdict for exactly five projects, no eat-sheet)

- Check: the registry and verdict unit tests. The runner with no token, to confirm it fails closed. The pre-merge proxy in breakdown Notes (item 9).
- Evidence:
  ```
  ✓ scripts/__tests__/sentry-heartbeat-targets.test.mjs (6 tests)
  ✓ scripts/__tests__/sentry-heartbeat.test.mjs (26 tests)
  $ env -u SENTRY_AUTH_TOKEN node scripts/sentry-heartbeat.mjs --out <scratch>/verify-v.json; echo $?
  ::error::SENTRY_AUTH_TOKEN is not set; no heartbeat verdicts were written.
  0
  ls: <scratch>/verify-v.json: No such file or directory
  ```
  The proxy table from breakdown Notes (hand-assembled from MCP lookups and rendered by the committed `projectVerdicts` + `renderJobSummary`) has one row each for users-api, reservations-api, agent-api, hospitality and mattbutlerengineering.
- Result: PASS for the logic. **PENDING-SHIP** for "the run log or job summary of a real run", because no real run exists yet.

### SC-3: Executed for real on main

- Check: none possible before merge. The workflow file does not exist on `main`.
- Evidence: `git diff --name-only origin/main...HEAD` lists `.github/workflows/sentry-heartbeat.yml` as a new file on this branch.
- Result: **PENDING-SHIP**. Ship must dispatch it once on `main` and record the run ID and per-project outcomes in `release.md`. Expected result: four PASS, plus `mattbutlerengineering` FAIL with marketing and rialto-web `misrouted → hospitality`.

### SC-4: In-artifact origin

- Check 1 (static): the PRD's grep for direct ingest paths across the heartbeat scripts and workflow.
- Evidence:
  ```
  $ grep -nE "/envelope/|/store/|ingest\.(us\.)?sentry\.io/api|@sentry/" scripts/sentry-heartbeat*.mjs scripts/sentry-triage-heartbeat.mjs .github/workflows/sentry-heartbeat.yml; echo "grep_exit=$?"
  grep_exit=1
  ```
  The ingest host appears only as a hostname used to filter requests (`scripts/sentry-heartbeat.mjs:173 SENTRY_INGEST_HOST = "o4510650299842560.ingest.us.sentry.io"`, used by `isIngestTraffic` with `waitForResponse`). It has no path and nothing posts to it.
- Check 2 (origin evidence): re-queried today through Sentry MCP `search_events`, query `mbe-round-trip-20261001T04`, 24h.
- Evidence (8 events, abridged to the relevant fields):
  ```
  Error: mbe-round-trip-…042032347Z-lzm92r-rialto-web sentry heartbeat  project=hospitality platform=javascript environment=development app=rialto-web
  Error: mbe-round-trip-…042032347Z-lzm92r-hospitality sentry heartbeat project=hospitality platform=javascript environment=development app=hospitality
  Error: mbe-round-trip-…042032347Z-lzm92r-marketing sentry heartbeat   project=hospitality platform=javascript environment=development app=marketing
  HTTP 429: GET /api/v1/reservations/health?rt=mbe-round-trip-…-reservations-api  project=reservations-api platform=node environment=production server_name=reservations-api
  HTTP 429: GET /api/gen/health?rt=mbe-round-trip-…-agent-api                     project=agent-api        platform=node environment=production server_name=agent-api
  HTTP 429: GET /api/v1/users/health?rt=mbe-round-trip-…-users-api                project=users-api        platform=node environment=production server_name=users-api
  (+2 item-1 spike events, app=hospitality / app=marketing, environment=development)
  ```
  The `release` field was requested and came back empty for every event.
- Result: static check **PASS**. Origin evidence **PARTIAL**. Backend events carry `environment: production` and the service's own `server_name`. Browser events come from the bundle's own SDK (`platform: javascript`, the right `app` tag, envelope from `sentry.javascript.react` per the spike), but they report `environment: development` and no release. The PRD asked for "the deployed release/environment". This is a pre-existing bundle configuration defect, already seeded in `docs/backlog.md`. The heartbeat does not cause it, but it means the criterion's wording cannot be met as written today.

### SC-5: Ingestion asserted through the API

- Check: unit tests for the outcome classification and the I/O seam.
- Evidence:
  ```
  ✓ scripts/__tests__/sentry-heartbeat.test.mjs (26 tests)        # classifyTargetOutcome: error≠not-found, misrouted, provoke-failed
  ✓ scripts/__tests__/sentry-heartbeat-runner.test.mjs (7 tests)  # lookup throws → error; timeout bounded
  ✓ scripts/__tests__/sentry-round-trip-io.test.mjs (6 tests)     # 500 from Sentry throws; empty → undefined
  ✓ scripts/__tests__/sentry-round-trip.test.mjs (16 tests)       # unchanged
  ```
- Result: decision logic **PASS**. **PENDING-SHIP** for "the real run's log showing the marker lookup". `findMarkedEvent` has never been run against `GET /api/0/projects/{org}/{project}/events/`. No local token exists, and every lookup so far went through MCP's Discover. The assumption that the list response carries `title`, `tags` and `platform` is unmeasured. The matcher tolerates a missing `platform` (breakdown Notes deviation). The first dispatched run is the first real execution.

### SC-6: Red on failure

- Check: unit tests for `aggregateExitCode`, the CLI fail-closed path, and the workflow step order.
- Evidence:
  ```
  $ node scripts/sentry-heartbeat.mjs --exit-from /nonexistent; echo "exit_from_missing=$?"
  exit_from_missing=2
  ✓ scripts/__tests__/sentry-heartbeat-cli.test.mjs (6 tests)
  ✓ scripts/__tests__/sentry-heartbeat-workflow.test.mjs (9 tests)   # issues + exit steps `if: always()`, exit step last
  ```
  Workflow: the last step is `Fail on any failing project` (`if: always()`, `node scripts/sentry-heartbeat.mjs --exit-from heartbeat-verdicts.json`).
- Result: logic **PASS**. **PENDING-SHIP** for whether the SC-3 run's conclusion matches its verdicts.

### SC-7: One de-duplicated issue per failing project

- Check: reconciler unit tests. Live state of `sentry` issues.
- Evidence:
  ```
  ✓ scripts/__tests__/sentry-heartbeat-issues.test.mjs (11 tests)
  $ gh issue list --label sentry --state all --limit 30   # newest:
  5535 CLOSED 2026-09-20T17:16:13Z fix(agent-api): FastifyError: The decorator 'opentelemetry' has already been added!
  … (no open sentry issues; none is a heartbeat alert)
  ```
- Result: logic **PASS**. **PENDING-SHIP** for the live check, which needs a failing run first. The SC-3 run is expected to open exactly one issue, for `mattbutlerengineering`.

### SC-8: Auto-close on green

- Check: reconciler unit tests (pass+open → close with run link; pass+none → none).
- Evidence: `✓ scripts/__tests__/sentry-heartbeat-issues.test.mjs (11 tests)` (as above).
- Result: logic **PASS**. The live fail-then-pass sequence is deferred to Operate, as the PRD allows.

### SC-9: Heartbeats tagged and excluded from triage

- Check: the triage filter tests and the `triage.mjs` diff. The live search for any triage issue that references a heartbeat.
- Evidence:
  ```
  ✓ scripts/__tests__/sentry-triage-heartbeat.test.mjs (5 tests)
  ✓ scripts/__tests__/sentry-triage-query.test.mjs (4 tests)
  triage.mjs: const classified = classifyTriageIssues(allIssues, {...});   # drops isHeartbeatIssue first, tallies heartbeat=N
  $ gh issue list --label sentry --state all --limit 100 --search "mbe-round-trip OR HOSPITALITY-B OR heartbeat"
  (no output)
  ```
- Result: **PASS-WITH-DEVIATION**. The identifier is the `mbe-round-trip` marker in the event title and message (backend: also the `url` tag). It is not a separate tag on browser events, because the marker does not survive into the `url` tag (`tags[url]` has no query string, per the item-1 spike). Exclusion works on issue `title` / `metadata.value`, and the tests show it. Review should decide whether the "distinguishing tag" wording is met (breakdown Design gap 2). The post-SC-3 check is **PENDING-SHIP**.
- Risk found here: the spike and smoke runs already created the Sentry issue `HOSPITALITY-B` (5 browser heartbeat events). The filter exists only on this branch, so `sentry-triage.yml` on `main` does not filter it yet. If that issue reaches triage's event threshold before merge, a heartbeat triage issue could be filed. None exists as of this check.

### SC-10: Invisible to visitors, no backdoor

- Check: scope fence diff.
- Evidence:
  ```
  $ git diff --name-only origin/main...HEAD -- apps services packages infrastructure; echo "fence_exit=$?"
  fence_exit=0
  ```
  It printed no paths. The full change set is `.claude/skills/sentry-triage/scripts/triage.mjs`, `.github/workflows/sentry-heartbeat.yml`, `docs/**`, and `scripts/**` (5 modules, 10 test files).
- Result: diff half **PASS** (no route, handler, or site change). The real-browser probe of each deployed site after release is **PENDING-SHIP**. Note for that probe: the hospitality page already has a `script-src` `eval` CSP violation (from `json-render-vendor`) that also fires on a plain page load (breakdown Notes, item 1). The probe must not count it as new.

### SC-11: Tested decision logic, ≥80% lines

- Check: re-ran the heartbeat, round-trip and triage suites, plus `workflow-deps` and `scheduled-workflow-health`, with coverage.
- Evidence:
  ```
  $ pnpm exec vitest run --config scripts/vitest.config.mjs --coverage --coverage.include='scripts/sentry-heartbeat*.mjs' --coverage.include='scripts/sentry-triage-heartbeat.mjs' --coverage.reporter=text <suites>
   Test Files  15 passed (15)
        Tests  232 passed (232)
  File               | % Stmts | % Branch | % Funcs | % Lines
  All files          |   92.03 |    92.14 |   87.09 |   92.48
   ...eat-issues.mjs |   97.72 |    96.29 |     100 |     100
   ...-heartbeat.mjs |   89.13 |    90.09 |   81.81 |   88.69
  ```
- Result: **PASS**. Two caveats. `sentry-heartbeat-targets.mjs` (frozen data) and `sentry-triage-heartbeat.mjs` did not appear in v8's text table even though they were included, so their line percentages are unreported here. Their own suites (6 and 5 tests) pass.

### SC-12: Inside its own guard coverage

- Check: CI test-job log for the PR. `ci.yml` filters. `pipefail` and `status` greps. Paths-coverage check. Full scripts suite.
- Evidence:
  ```
  $ gh run view 36815619431 --json headSha,conclusion,event,jobs
  {"conclusion":"success","event":"pull_request","headSha":"4822ca103…","jobs":[{"name":"Test (Node 22)","conclusion":"success"},{"name":"CI Gate","conclusion":"success"}]}
  Test (Node 22) log:
   ✓ scripts/__tests__/sentry-heartbeat-browser.test.mjs (8 tests)
   ✓ scripts/__tests__/sentry-heartbeat-cli.test.mjs (6 tests)
   ✓ scripts/__tests__/sentry-heartbeat-issues.test.mjs (11 tests)
   ✓ scripts/__tests__/sentry-heartbeat-runner.test.mjs (7 tests)
   ✓ scripts/__tests__/sentry-heartbeat-targets.test.mjs (6 tests)
   ✓ scripts/__tests__/sentry-heartbeat-workflow.test.mjs (9 tests)
   ✓ scripts/__tests__/sentry-heartbeat.test.mjs (26 tests)
   ✓ scripts/__tests__/sentry-round-trip-io.test.mjs (6 tests)
   ✓ scripts/__tests__/sentry-round-trip.test.mjs (16 tests)
   ✓ scripts/__tests__/sentry-triage-heartbeat.test.mjs (5 tests)
  ci.yml: pull_request has no paths filter (push paths-ignore: *.png, .gitignore, LICENSE only)
  sentry-heartbeat.yml: no paths filter; all 4 run: blocks start `set -o pipefail` (lines 43, 50, 56, 63)
  $ grep -nE "\bstatus=" .github/workflows/sentry-heartbeat.yml; echo $?  → 1 (no match)
  $ pnpm check:workflow-paths-coverage → PASS: workflow paths-filter coverage
  $ pnpm --dir scripts test → Test Files 246 passed (246) / Tests 4742 passed (4742)
  ```
  `gh pr checks 5940` on the current head `45a1808cc` (a docs-only delta from `4822ca103`): CI was still running at verify time (Typecheck, Lint, Architecture Audit and others pending). Every completed check passed or was skipped.
- Result: **PASS**, based on the `4822ca103` run. Ship should confirm `CI Gate` on the final head.

### Breakdown acceptance criteria not already covered above

- Item 13: `pnpm lint` / `pnpm typecheck` were not re-run here. Implement's run (52/52) and the pending CI jobs on the current head cover them. The two `docs/backlog.md` seeds are in the diff (`docs/backlog.md` is listed as changed).
- Item 1 / item 9: the live sends are already recorded in breakdown Notes. Today's MCP re-query confirms all 6 smoke-run events plus 2 spike events (SC-4 evidence above).

## Failures

None.

## Not verified

- **SC-3 and every live/real-run clause** (SC-2 real summary, SC-5 real lookup log, SC-6 real conclusion, SC-7 live issue state, SC-9 post-run triage check, SC-10 post-release browser probe). These need a merged workflow dispatched on `main`. Ship owns this.
- **`findMarkedEvent` against the real Sentry REST events endpoint.** It has never run: there is no local token and lookups were substituted with MCP. If the list response lacks `title`/`tags`/`platform` in the shape the matcher expects, the first real run will report `not-found` for projects that are actually healthy. Treat an all-`not-found` first run as a matcher problem, not a blackout.
- **`HOSPITALITY-B` vs. triage on `main` before merge.** Not mitigated. Watch it if the merge is delayed.
- **Design gap 1** (double alerting through `scheduled-workflow-health` after 3 consecutive red runs) is not addressed. Left open for Review.
- Coverage percentages for `sentry-heartbeat-targets.mjs` and `sentry-triage-heartbeat.mjs` were not reported by v8 (see SC-11).
