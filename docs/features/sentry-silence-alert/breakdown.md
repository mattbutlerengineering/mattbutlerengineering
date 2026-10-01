---
stage: decompose
run: feature:sentry-silence-alert
date: 2026-09-30
assumptions:
  - "Milestone cut and item sizing taken as drafted, with no live review of the cut (unattended autorun; the brief is silent on cut lines). Recommended default: vertical slices ordered by dependency, with the architecture's one unmeasured assumption spiked first."
  - "No tracker import or export. Per the brief, no GitHub issues are created for these items; the checkboxes below are the only state."
  - "The runner's orchestration is exposed as an injectable `runHeartbeat({ registry, trigger, lookup, now })` export so the misroute sweep and the error-vs-not-found split can be unit-tested with fakes. Only the argv/process wrapper is c8-ignored. This is an implementation seam inside the architecture's 'Heartbeat runner' component, not a design change."
  - "SC-3 (dispatched on main) and SC-10's post-release browser probe can only be satisfied after merge, so they are covered here by pre-merge proxies (a full local run, a diff check) and are completed at Ship. Implement does not wait on them."
  - "A local `SENTRY_AUTH_TOKEN` (read scope on the org) is assumed to be obtainable for the spike and the local smoke run. If it is not, the Sentry lookups in items 1 and 9 are done through the Sentry MCP `search_events` tool against the same project and marker; that substitution is recorded in Notes."
  - "Architecture findings 2 and 3 are filed as `docs/backlog.md` seeds (item 13), not GitHub issues; finding 1 is filed by the workflow's own first run as the `mattbutlerengineering` alert issue."
---

# Breakdown: Sentry silence alert

Progress lives in the checkboxes below — Implement checks items off as their
acceptance criteria are met.

Conventions for every item: TDD (failing test first); tests live in
`scripts/__tests__/*.test.mjs` and run from the worktree root with
`pnpm exec vitest run --config scripts/vitest.config.mjs <test file>`.
The new modules are `scripts/sentry-heartbeat-targets.mjs`,
`scripts/sentry-heartbeat.mjs`, `scripts/sentry-heartbeat-issues.mjs`.

## Milestone 0: The browser marker path is measured, not assumed

Demonstrable: a real deployed page, driven by headless Chromium, produced a
Sentry event whose tags carry the marker — or the run has been routed back to
Architect before anything is built on that assumption.

- [x] **1. Spike: confirm the marker reaches a browser event's `url` tag on a live page** — throwaway Playwright probe in the session scratchpad (not committed) runs the exact architecture sequence (launch without `bypassCSP`, `goto` → `load`, `history.replaceState` to `?mbe-heartbeat=<marker>`, `setTimeout` throw) against `https://mattbutlerengineering.com/` (marketing) and `https://mattbutlerengineering.com/hospitality/reservations/manage`.
  - Accept: (a) for each page, a Sentry events query for the marker (`GET https://sentry.io/api/0/projects/mattbutlerengineering/hospitality/events/?query=<marker>`, or the Sentry MCP equivalent) returns one event whose `url` tag contains `mbe-heartbeat=<marker>`, whose `app` tag is `marketing` / `hospitality`, and whose `platform` is `javascript`; (b) the hospitality page's final `page.url()` is still on `mattbutlerengineering.com` (no Auth0 redirect); (c) an envelope request to `o4510650299842560.ingest.us.sentry.io` was observed and no `securitypolicyviolation` fired. The marker, event IDs and observed tags are recorded in this file's Notes. **If (a) fails for the `url` tag** (marker present only in title/message): record it, keep building — matching and `isHeartbeatIssue` both key on title/message and still hold — but flag SC-9's tag wording for Architect in "Design gaps found". **If no event arrives at all, or (b)/(c) fail:** stop Implement and route back to Architect.
  - Blocked by: —

## Milestone 1: Pure decision core — every verdict is computable and tested

Demonstrable: given fake events and outcomes, the modules produce the
per-project verdicts, exit code, job summary and heartbeat classification.

- [x] **2. Target registry** — `scripts/sentry-heartbeat-targets.mjs` exports the frozen six-row `TARGETS` table from the architecture and a derived `IN_SCOPE_PROJECTS`.
  - Accept: `scripts/__tests__/sentry-heartbeat-targets.test.mjs` passes and asserts `IN_SCOPE_PROJECTS` deep-equals `["users-api","reservations-api","agent-api","hospitality","mattbutlerengineering"]` (SC-2), contains no `eat-sheet`, every browser row has an `app`, every backend row has none, and the table is frozen (mutation throws in strict mode).
  - Blocked by: 1 (the hospitality URL in the table is the one item 1 proved loads unauthenticated)

- [x] **3. Event matching and target outcome** — in `scripts/sentry-heartbeat.mjs`: `eventMatchesTarget(event, target, marker)` (backend: reuses `eventMatchesMarker`; browser: `url` tag or `title`/`message` contains the marker AND `app` tag equals the target's `app`) and `classifyTargetOutcome({ triggerResult, found, sweepHit, lookupError })` → `confirmed | misrouted | not-found | provoke-failed | error`.
  - Accept: `scripts/__tests__/sentry-heartbeat.test.mjs` passes with cases for: browser event with right marker but wrong `app` → no match; marker only in title → match; a lookup error → `error` (never `not-found`); miss in expected project + sweep hit → `misrouted` with `foundInProject`; trigger failure → `provoke-failed` (SC-5).
  - Blocked by: 2

- [x] **4. Project verdicts, aggregate exit, job summary** — `projectVerdicts(outcomes, registry)`, `aggregateExitCode(verdictsOrUndefined)`, `renderJobSummary(verdicts)`.
  - Accept: tests in `sentry-heartbeat.test.mjs` show: every in-scope project appears exactly once even when all its targets errored (SC-2); `mattbutlerengineering` fails if either marketing or rialto-web is not `confirmed`; exit 0 all-pass, 1 any-fail, 2 for `undefined` / non-array / malformed input (SC-6); the summary is a markdown table with one row per project and each target's outcome.
  - Blocked by: 3

- [x] **5. `isHeartbeatIssue`** — pure predicate, true when an issue's `title` or `metadata.value` contains `mbe-round-trip`.
  - Accept: tests cover the backend title shape (`HTTP 429: GET …/health?rt=mbe-round-trip-…`), the browser shape (`Error: mbe-round-trip-… sentry heartbeat`), the marker only in `metadata.value`, and a real-looking non-heartbeat issue → false; missing fields don't throw (SC-9).
  - Blocked by: —

## Milestone 2: Heartbeat runs end to end and writes verdicts

Demonstrable: one local command fires all six triggers against production and
writes `heartbeat-verdicts.json` plus a summary with a verdict per project.

- [x] **6. Refactor `sentry-round-trip.mjs` into injectable pieces** — extract and export `provokeCapturedError(target, marker, fetchImpl)` and `findMarkedEvent(org, project, marker, token, fetchImpl, matcher?)` (10 s `AbortSignal` timeout per request; non-2xx throws). The existing CLI `main()` keeps its behaviour by calling them.
  - Accept: `scripts/__tests__/sentry-round-trip.test.mjs` still passes unchanged, plus new tests with a fake `fetchImpl`: a 500 from Sentry throws (not `undefined`), an empty result returns `undefined`, a 429 within the request budget returns `{ triggered: true }`, no 429 in 150 requests returns `{ triggered: false, reason }` (SC-5).
  - Blocked by: —

- [x] **7. Browser trigger** — `triggerBrowserTarget(target, marker, { chromium })` in `scripts/sentry-heartbeat.mjs` implementing the item-1 sequence (30 s navigation timeout, 15 s envelope wait that does not fail the target, CSP violations and console errors captured as `detail`).
  - Accept: unit test with a fake `chromium`/`page` object asserts the launch options never set `bypassCSP`, the `evaluate` payload contains `replaceState` and the marker, a navigation timeout yields `{ triggered: false }`, and a missed envelope wait still yields `{ triggered: true }`. Plus SC-4 static check: `grep -nE "/envelope/|/store/|ingest\.(us\.)?sentry\.io/api|@sentry/" scripts/sentry-heartbeat*.mjs` prints nothing (the ingest host may appear only as a request-filter hostname string, with no path).
  - Blocked by: 1

- [x] **8. Runner orchestration** — exported `runHeartbeat({ registry, trigger, lookup, now, timeoutMs })`: one marker per target, all triggers concurrent, poll each expected project until found or timeout (default 180 s, reusing `shouldKeepPolling` / `nextPollDelayMs`), one misroute sweep over the other in-scope projects on a miss, returns target outcomes with `platform` and `app`/`server_name` evidence.
  - Accept: tests with fake `trigger`/`lookup` and a fake clock show: six distinct markers; a target found only in another project → `misrouted`; a lookup that throws → `error` and the sweep is not run for it; a browser match with `platform: "node"` is not `confirmed` (SC-4 origin evidence); the call resolves within the fake timeout.
  - Blocked by: 4, 6, 7

- [x] **9. Runner CLI and local smoke run** — argv wrapper (c8-ignored): `--out <file>` writes verdicts + appends `renderJobSummary` to `$GITHUB_STEP_SUMMARY` when set, always exits 0; `--exit-from <file>` exits with `aggregateExitCode` (missing/unparseable file → 2).
  - Accept: `node scripts/sentry-heartbeat.mjs --exit-from /nonexistent; echo $?` prints `2`; a tests-only case writes a fixture verdict file and asserts `--exit-from` returns 0/1. Smoke: with `SENTRY_AUTH_TOKEN` set, `node scripts/sentry-heartbeat.mjs --out "$SCRATCH/verdicts.json"` exits 0 and the file holds exactly five project verdicts (expected today: four pass, `mattbutlerengineering` fails with marketing/rialto-web `misrouted → hospitality`). The resulting summary is pasted into Notes as the pre-merge proxy for SC-3.
  - Blocked by: 8

## Milestone 3: Alerts open, update and close themselves

Demonstrable: a verdict file drives exactly the right issue actions.

- [x] **10. Issue reconciler** — `scripts/sentry-heartbeat-issues.mjs`: pure `decideIssueActions(verdicts, openAlertIssues, runUrl)` implementing the 4-row table, plus a thin `gh api` adapter that lists `GET /repos/{repo}/issues?labels=sentry&state=open&per_page=100`, matches the hidden `<!-- sentry-heartbeat project=<slug> -->` body marker, and applies actions independently.
  - Accept: `scripts/__tests__/sentry-heartbeat-issues.test.mjs` passes covering: fail+none → `open` with label `sentry` only (never `ready`), body naming the project, each failing target outcome (incl. `misrouted → hospitality`), the run URL and the hidden marker (SC-7); fail+open → `comment`, no `open` (SC-7); pass+open → `close` with a comment linking the run (SC-8); pass+none → `none` (SC-8); no body ever matches `sentry\.io/.*/issues/\d+` (so `decideSentryDedup` is never fooled); adapter with a failing list call takes no action and exits non-zero; one failed action does not stop the others. `pnpm exec vitest run --config scripts/vitest.config.mjs --coverage --coverage.include='scripts/sentry-heartbeat*.mjs' scripts/__tests__/sentry-heartbeat*.test.mjs` reports ≥ 80% lines on the three new modules (SC-11).
  - Blocked by: 4

## Milestone 4: Triage ignores heartbeats

Demonstrable: `/sentry-triage` skips heartbeat issues and says so.

- [x] **11. Triage filter** — `.claude/skills/sentry-triage/scripts/triage.mjs` drops issues where `isHeartbeatIssue` is true before the actionability step and reports them as `heartbeat=N` in the existing skip tally.
  - Accept: new `scripts/__tests__/sentry-triage-heartbeat.test.mjs` passes, showing a heartbeat-titled issue with count above threshold is not filed and is counted as `heartbeat=1`, and a non-heartbeat issue is unaffected; existing `sentry-triage-*.test.mjs` files still pass (SC-9).
  - Blocked by: 5

## Milestone 5: The workflow exists, is guarded, and is in its own coverage

Demonstrable: the workflow file is present, its shape is pinned by a test, and
the PR's CI runs every new test.

- [ ] **12. `sentry-heartbeat.yml` workflow + shape test** — `.github/workflows/sentry-heartbeat.yml` exactly as the architecture specifies (cron `23 13 * * *`, input-less `workflow_dispatch`, `permissions: { contents: read, issues: write }`, concurrency group, `timeout-minutes: 15`, pinned checkout SHA matching siblings, setup-workspace, `pnpm exec playwright install --with-deps chromium`, runner step, then two `if: always()` steps for issues and exit; `SENTRY_AUTH_TOKEN` and `GH_TOKEN: ${{ github.token }}` env).
  - Accept: `scripts/__tests__/sentry-heartbeat-workflow.test.mjs` passes, parsing the real YAML and asserting: both triggers present (SC-1); every `run:` block begins with `set -o pipefail` and none assigns `status=` (SC-12); the issues and exit steps carry `if: always()` and the exit step is last (SC-6); every `uses:` is pinned to a 40-char SHA; no `paths:` filter. `pnpm check:workflow-paths-coverage` and `pnpm exec vitest run --config scripts/vitest.config.mjs scripts/__tests__/scheduled-workflow-health.test.mjs scripts/__tests__/workflow-deps.test.mjs` still pass.
  - Blocked by: 9, 10

- [ ] **13. Scope fence, findings seeds, and gate run** — confirm no visitor-facing or service change, file architecture findings 2 and 3 as `docs/backlog.md` seeds, run the full scripts suite and local gates.
  - Accept: `git diff --name-only origin/main...HEAD -- apps services packages infrastructure` prints nothing (SC-10: zero artifact/route changes); `docs/backlog.md` gains two seeds (browser `environment: development` / `release: null`; `deploy-static.yml` `paths:` omits `packages/sentry/**`) each with `(from: feature:sentry-silence-alert)`; `pnpm --dir scripts test` passes in full; `pnpm lint` and `pnpm typecheck` pass. After the PR opens, its `CI Gate` log shows the five new/edited test files executing (SC-12).
  - Blocked by: 11, 12

## SC coverage

| SC  | Items                                                                     |
| --- | ------------------------------------------------------------------------- |
| 1   | 12                                                                        |
| 2   | 2, 4, 9                                                                   |
| 3   | 9 (pre-merge proxy); completed at Ship by a `workflow_dispatch` on `main` |
| 4   | 1, 7, 8                                                                   |
| 5   | 3, 6, 8                                                                   |
| 6   | 4, 9, 12                                                                  |
| 7   | 10                                                                        |
| 8   | 10                                                                        |
| 9   | 1, 5, 11                                                                  |
| 10  | 1, 7, 13; post-release real-browser probe of each static site at Ship     |
| 11  | 2–5, 10 (coverage gate in 10)                                             |
| 12  | 12, 13                                                                    |

Every architecture component appears: registry (2), decision module (3, 4,
5), backend trigger (6), browser trigger (7), runner (8, 9), issue reconciler
(10), triage filter (11), workflow (12).

## Design gaps found

1. **Double alerting via `scheduled-workflow-health` (non-blocking, for
   Architect).** `scripts/scheduled-workflow-health.mjs` auto-discovers every
   workflow with a `schedule:` trigger and files its own failure issue after
   `DEFAULT_THRESHOLD = 3` consecutive red runs. The heartbeat is designed to
   go red while any project is failing, and the first run is _expected_ to
   fail (`mattbutlerengineering` misrouted). From day 3 the Operator would get
   a second, generic "scheduled workflow failing" issue alongside the
   per-project `sentry` alert. The architecture does not address this
   interaction. Options for Architect: accept the duplicate; exempt
   `sentry-heartbeat.yml` from that health check; or have the health check
   skip workflows whose failure already produces its own issue. Not designed
   around here; Implement proceeds, since no item depends on the answer.
2. Conditional: if item 1 shows the marker reaches title/message but not the
   `url` tag, SC-9's "distinguishing tag" wording needs Architect's call
   (accept title-based identification, or adopt the `beforeSend` fallback,
   which needs `packages/sentry/**` added to `deploy-static.yml` `paths:`).

## Notes

### 2026-10-01 — Item 1 spike result (measured)

Probe: throwaway Playwright script in the session scratchpad (not committed),
`@playwright/test` 1.63.0 from the worktree, `chromium.launch()` with no
`bypassCSP`, `goto(url, {waitUntil:"load"})`, one `page.evaluate` doing
`history.replaceState` to `?mbe-heartbeat=<marker>` then
`setTimeout(() => { throw new Error("<marker> sentry heartbeat") })`.
Run at 2026-10-01T04:11:30Z from Matt's workstation.

| page                                           | marker                                         | final `page.url()`                                                                                               | envelope to ingest host                                                     | CSP violations |
| ---------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------- |
| marketing `/`                                  | `mbe-round-trip-20261001T041130897Z-spikemark` | `https://mattbutlerengineering.com/?mbe-heartbeat=…spikemark`                                                    | 1 POST `…/api/4511413547040768/envelope/` (sentry.javascript.react 10.75.0) | none           |
| hospitality `/hospitality/reservations/manage` | `mbe-round-trip-20261001T041130897Z-spikehosp` | `https://mattbutlerengineering.com/hospitality/reservations/manage?mbe-heartbeat=…spikehosp` (no Auth0 redirect) | 1 POST, response **200** (second probe run)                                 | 1, see below   |

Sentry lookup: no local `SENTRY_AUTH_TOKEN`, so done via the Sentry MCP
`search_events` tool (org `mattbutlerengineering`, region `https://us.sentry.io`,
project `hospitality`, dataset `errors`, query
`mbe-round-trip-20261001T041130897Z`, 24h). It returned exactly two events:

- `Error: mbe-round-trip-20261001T041130897Z-spikemark sentry heartbeat` —
  `app: marketing`, `platform: javascript`, `environment: development`,
  `tags[url]: https://mattbutlerengineering.com/`, `http.query: ""`, 2026-10-01T04:11:31Z.
- `Error: mbe-round-trip-20261001T041130897Z-spikehosp sentry heartbeat` —
  `app: hospitality`, `platform: javascript`, `environment: development`,
  `tags[url]: https://mattbutlerengineering.com/hospitality/reservations/manage`,
  `http.query: ""`, 2026-10-01T04:11:34Z.
- Both grouped into ONE Sentry issue: `HOSPITALITY-B` (issue.id 7765128186).
  The MCP output did not expose per-event IDs.

Verdict against the accept criteria:

- (a) Event arrives with marker, right `app`, `platform: javascript`: **yes**.
  Marker in `url` tag: **NO** — `tags[url]` and `http.url` are the path with no
  query string, and `http.query` is empty. The marker reached the title and
  message only. Per the item's rule: recorded, building continues (matching and
  `isHeartbeatIssue` key on title/message), and SC-9's tag wording is flagged to
  Architect (Design gap 2 is now live, not conditional).
- (b) No Auth0 redirect: **yes**.
- (c) Envelope observed: **yes** on both pages (200 on hospitality). A
  `securitypolicyviolation` DID fire on the hospitality page, but it is
  pre-existing and unrelated to the probe: `script-src` blocked `eval` from
  `/hospitality/assets/json-render-vendor-Czrj1zkF.js` line 1 at ~400 ms after
  navigation, and it fires identically on a plain page load with no
  `evaluate`/throw at all (control run). The live `script-src` is
  `'nonce-…' 'self' https://js.stripe.com`. It does not touch `connect-src`
  or the ingest origin, and the heartbeat envelope still got a 200. Judged
  NOT a stop condition (the condition guards the heartbeat path being blocked
  by CSP); **flagged for Review** as a live app defect worth a seed. The only
  other console error was `static.cloudflareinsights.com` refused — the known
  LAN DNS sinkhole, not prod.

Consequence for later items: the browser matcher must not require the `url`
tag; the title/message path is the one that works today. Also, browser
heartbeats group into one Sentry issue (stable grouping by stack), so its
event count will exceed triage's threshold within days — item 11's filter is
load-bearing.

### 2026-10-01 — Deviations logged during items 3–8

- **Browser navigation failure → `provoke-failed`, not `error`.** The
  architecture's trigger contract says a browser navigation error/timeout is
  `error`; item 3's accept says "trigger failure → `provoke-failed`", and
  item 7 says a navigation timeout yields `{ triggered: false }`. Implemented
  the breakdown's rule: any non-firing trigger (including a thrown one) is
  `provoke-failed`, with the reason in `detail`. Both are project failures;
  only the label differs.
- **Origin check tolerates an absent `platform`.** A browser match whose
  event reports a platform other than `javascript` becomes `error` with the
  mismatch in `detail` (item 8's SC-4 case). An event with no `platform`
  field is not rejected on that alone, because the shape of the project
  events list response was not measured here (MCP reads Discover, not that
  endpoint); the marker + `app` tag already pin the event to the bundle.
  Verify should confirm the field is present on a real run.
- **New tests sit in new files** (`sentry-round-trip-io`,
  `sentry-heartbeat-browser`, `sentry-heartbeat-runner`) so
  `sentry-round-trip.test.mjs` stays byte-for-byte unchanged, as item 6 asks.
- **Markers include the target id** (`mbe-round-trip-<stamp>-<nonce>-<target>`),
  so a stray event in Sentry names its own target.

### 2026-10-01 — Item 9 smoke run (substituted lookup, measured)

No local `SENTRY_AUTH_TOKEN`, so the literal accept ("with the token set, the
CLI writes five verdicts") could not be run. What was run instead:

- `node scripts/sentry-heartbeat.mjs --exit-from /nonexistent; echo $?` → `2`.
- `node scripts/sentry-heartbeat.mjs --out <scratch>/verdicts.json` with no
  token → prints `::error::SENTRY_AUTH_TOKEN is not set; no heartbeat verdicts
were written.`, exits `0`, writes no file (so `--exit-from` fails closed with 2).
- **Real triggers, real production, lookup substituted.** A scratch script
  imported the committed `runHeartbeat`, `provokeCapturedError` and
  `triggerBrowserTarget`, fired all six targets against production with a
  no-op lookup, and the markers were then looked up with the Sentry MCP
  `search_events` tool (org `mattbutlerengineering`, region us, dataset
  `errors`, free-text marker query).

**Run 1 (04:19:32Z, marker stem `mbe-round-trip-20261001T041932683Z-dlmhwj`).**
Backend triggers fired: users-api 429 after 19 requests, reservations-api
after 21, agent-api after 16. All three events arrived in their own project
(`platform: node`, `server_name` = project, `tags[url]` carries the marker).
The three browser triggers reported `triggered: true, envelopeSeen: true` —
and **none of the three browser events ever reached Sentry**.

**Defect found and fixed (in item 9's commit).** `triggerBrowserTarget`
waited only for the envelope _request_ to start, then closed the browser,
aborting the POST in flight. The spike had waited 2 s more, which hid it. Now
it waits for the envelope _response_ (`page.waitForResponse`, ingest host
only) before closing, and records `envelopeStatus`; a new unit test pins the
response-then-close order. While there, CSP refusals are now captured via a
`securitypolicyviolation` listener (`addInitScript`): the hospitality
`eval` violation from item 1 did NOT appear among console errors, so the
console-only capture missed it.

**Run 2 (04:20:32Z, browser targets only, stem
`mbe-round-trip-20261001T042032347Z-lzm92r`).** All three reported
`envelopeStatus: 200`, and all three events arrived — `hospitality`
(`app:hospitality`), `marketing` (`app:marketing`) and `rialto-web`
(`app:rialto-web`), every one `platform: javascript`, every one in the
**`hospitality`** project. The marketing/rialto-web events took about a
minute longer than hospitality's to appear in search (ingest/index lag,
inside the 180 s poll window).

Verdicts, reconstructed by hand from those MCP results and rendered by the
committed `projectVerdicts` + `renderJobSummary` (pre-merge proxy for SC-3;
`aggregateExitCode` = 1):

| Project               | Verdict | Targets                                                                 |
| --------------------- | ------- | ----------------------------------------------------------------------- |
| users-api             | PASS    | users-api: confirmed                                                    |
| reservations-api      | PASS    | reservations-api: confirmed                                             |
| agent-api             | PASS    | agent-api: confirmed                                                    |
| hospitality           | PASS    | hospitality: confirmed                                                  |
| mattbutlerengineering | FAIL    | marketing: misrouted → hospitality; rialto-web: misrouted → hospitality |

Not exercised locally: `findMarkedEvent` against the real REST events
endpoint (needs the token). Verify/Ship's dispatched run is its first real
execution; it should confirm that the list response carries `title`/`tags`
/`platform` as the matcher assumes.

### 2026-10-01 — Item 10 coverage (SC-11)

`pnpm exec vitest run --config scripts/vitest.config.mjs --coverage
--coverage.include='scripts/sentry-heartbeat*.mjs' --coverage.reporter=text
scripts/__tests__/sentry-heartbeat*.test.mjs` → 64 tests pass;
`sentry-heartbeat-issues.mjs` 100% lines, `sentry-heartbeat.mjs` 88.88%
lines, all files 92.07%. `sentry-heartbeat-targets.mjs` does not appear in
v8's table (frozen data, no reported statements); its 6 tests pass. The
issues adapter also fails closed when the open-`sentry` list returns a full
100-row page (possible truncation → an unseen alert would be re-filed).

### Open item for Review (not designed around)

- Design gap 1 (double alerting through `scheduled-workflow-health` after 3
  consecutive red runs) is left open per orchestrator instruction; no code
  added for it.
