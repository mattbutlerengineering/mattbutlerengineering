---
stage: operate
run: feature:sentry-silence-alert
date: 2026-11-07
users-observed: 0
signal-source: "gh pr view 5940 --json state,mergedAt,mergeCommit; gh run list --workflow sentry-heartbeat.yml --limit 100 --json event,conclusion,createdAt (42 runs, 2026-10-01..2026-11-07); gh run view <id> --log for the 4 post-release scheduled failures' verdict tables (37515280385, 42106077607) and gh issue view/list for #5941, #6106-#6110, #8330-#8332 (state, comments, close times); gh issue list --state all --search 'heartbeat' and --label ci-fix (no ci-fix issue against the heartbeat); git -C $W log origin/main -- .github/workflows/sentry-heartbeat.yml scripts/sentry-heartbeat*.mjs; gh pr view 8360. No person is a user of this tool: every issue and comment was written by github-actions, and no record shows Matt reading, closing or acting on one. Sentry MCP was not queried: the feature creates no Sentry alert rule or metric monitor (out of scope in autorun-brief.md), so find_alert_rules has nothing of this run to show."
assumptions:
  - "users-observed is 0. The workflow is the sample, not the population: 42 runs and 9 alert issues are agent output. The Owner counts only if a record shows his use, and none does (the issues were all auto-closed by the workflow, no human comment, no manual close)."
  - "release.md predates the `outcome:` field, so it is treated as Ship-complete; `gh pr view 5940` confirms MERGED at 2026-10-01T05:26:25Z as 6069e0804, matching release.md."
  - "autorun-brief.md names no minimum operate signal, only the success statement 'any Sentry project that stops ingesting events is flagged by an open GitHub issue within ~24 hours'. It is reported against below."
  - "A genuine blackout has not occurred since release, so the alert has never fired for the condition it was built for. The 9 alerts all came from the heartbeat's own defects or a pre-existing misrouting, and are reported as that."
  - "The 2026-10-06 all-`error` run is read as a transient Sentry API timeout: every lookup logged 'The operation was aborted due to timeout', and the next scheduled run was green with no code change to the script between them (git log shows none)."
---

# Retro: Sentry silence alert (daily heartbeat workflow)

## Outcomes vs. intent

Population: 0 people observed using it (see `signal-source`). The workflow has
run daily since release, so the outcomes below record the state it is in and
what it did, not use.

### Success statement: "any Sentry project that stops ingesting events is flagged by an open GitHub issue within ~24 hours"

- What happened: the workflow is live on `main` (merge `6069e0804`, last
  touched by #8360 and #8378 on 2026-11-05) and ran on its daily schedule
  every day from 2026-10-01 to 2026-11-07: 38 scheduled runs (34 success, 4
  failure) plus 4 manual dispatches (3 success, 1 failure). No real ingestion
  blackout has occurred in that window, so the path the feature exists for,
  a project going quiet and an issue opening, has never been exercised by a
  real blackout. What it did do is open 9 alert issues, none for a project
  that had stopped reporting: 1 for a true DSN misrouting, 5 for a Sentry API
  timeout, 3 for the heartbeat's own trigger breaking.
- Signal strength: unobserved for "flags a real blackout" (no blackout, no
  reader). The detection mechanism itself is measured: five separate failure
  shapes each opened the right issue and each auto-closed on the next green run.

### SC-3 / SC-7 / SC-8: executed on `main`, one de-duplicated issue per failing project, auto-close on green

- What happened: all three live halves have now run. The release dispatch
  (run `36819787202`) opened #5941 for `mattbutlerengineering`; the next two
  scheduled failures added a "Still failing" comment each (2026-10-01 19:00Z,
  2026-10-02 18:37Z) rather than a duplicate; the green run of 2026-10-03
  closed it at 04:33Z with "green again". Same pattern for #6106-#6110 (opened
  2026-10-06 18:59Z, closed 2026-10-07 19:27Z) and #8330-#8332 (opened
  2026-11-05 20:45Z, closed 2026-11-06 06:38Z). 9 of 9 issues opened are
  CLOSED; none open now. Longest time open: #5941, ~47 h.
- Signal strength: measured (run logs and issue timelines), for 3 episodes.
  It is not evidence of use: all actors are `github-actions`.

### The first real finding: marketing and rialto-web events landing in `hospitality`

- What happened: the first run reported `mattbutlerengineering` as
  `marketing: misrouted → hospitality; rialto-web: misrouted → hospitality`,
  exactly as Architect predicted. It was fixed outside this run by #5990
  (`deploy-static`: route marketing and rialto-web to their own project,
  2026-10-02), and the 2026-10-03 manual dispatch (04:31Z) and every
  scheduled run since has passed that project. Release's deferred M3
  decision therefore resolved as option (a), the real cure.
- Signal strength: measured (run `36819787202` verdict table, then
  green runs). That the finding was acted on is `anecdote`: one fix PR,
  nothing records whether the heartbeat issue prompted it or the brief's
  Architect correction did.

### Failure-free operation of the heartbeat itself

- What happened: 4 scheduled red days out of 38 (10.5%), of which 2 were
  the real misrouting (10-01, 10-02), and 2 were false alerts: 2026-10-06
  (all 5 projects `error`, "lookup failed: The operation was aborted due to
  timeout" on every Sentry lookup, 10 s apart; self-recovered next day) and
  2026-11-05 (the 3 backend targets `provoke-failed`; cause #8271 raised
  `HEALTH_RATE_LIMIT` to 600/min so the heartbeat's `/health` hammering never
  drew a 429; fixed by #8360 pointing the trigger at an unmatched path,
  closed by the 2026-11-06 dispatch). The `scheduled-workflow-health` arm
  never opened a `ci-fix` issue against the heartbeat (no such issue in
  `gh issue list --label ci-fix`): the misrouting was fixed after 2 red
  days, short of the 3-day threshold.
- Signal strength: measured (42 run conclusions).

### Intent that did not land: browser events report a real environment and release (SC-4 PARTIAL)

- What happened: Verify marked it PARTIAL (browser events said
  `environment: development`, no release). #6035 (2026-10-04) fixed it on
  `main` ("report real environment and release from browser bundles") and the
  follow-up record says live events now carry production and the deployed SHA.
  This run's heartbeat does not read those fields, so nothing here re-checks
  it.
- Signal strength: anecdote (a merged fix and its own ship record; not
  re-measured by this retro).

## Open debt

The run's own debt: Review deferrals recorded only as prose in `release.md`
and `review.md`, plus issues that cite them. No issue was filed for any of
them (checked: `gh issue list --state all --search "5940 OR sentry-silence-alert in:body"` returns only the unrelated #7038).

- **M3 (scheduled-workflow-health double alert), deferred from Review to Ship:**
  resolved by the DSN routing fix #5990 before the threshold; no `ci-fix`
  issue was filed. The design gap (the health arm cannot tell "reported
  finding" from "broken workflow") is still open: `scripts/scheduled-workflow-health.mjs`
  has `DEPLOY_WATCH_EXEMPT_FILES` but no exemption for the heartbeat, so any
  future 3-day red run would file a `ci-fix` + `ready` issue.
- **#5941** (the DSN misrouting finding): CLOSED 2026-10-03T04:33:24Z by the
  workflow on the first green run.
- **SC-4 PARTIAL** (browser environment/release): addressed by #6035, merged 2026-10-04.
- **m1** (consoleLogs ratchet exemption for CLI entrypoints), **m3** (`::stop-commands::` around
  page console text in the job log), **m4** (`platform: null` read as origin
  mismatch), **m6** (alert for a project removed from `TARGETS` never closes):
  deferred Review minors recorded only as prose in `review.md`; `git log origin/main --
scripts/sentry-heartbeat.mjs` shows only #8378, which does not touch them,
  so all four are still in the code.

## Run retrospective

- Keep: the verdict taxonomy (`confirmed`, `misrouted → X`, `not-found`,
  `provoke-failed`, `error`) and the per-project, marker-tagged issue. Each of
  the three live episodes told the reader the cause from the issue body
  alone, and the de-dup/comment/auto-close cycle worked in all 3. The
  brief's insistence on a deliberate "finding, not scope" for the first red run
  kept the run from silently fixing the DSN, and Architect's correction of the
  brief (misrouting, not blindness) was proven right by the first dispatch.
- Keep: dispatching once on `main` and recording the real outcome in
  `release.md` — it made the first alert and its issue evidence, not a promise.
- Change: the run proved ingestion round trips but its first 38 scheduled
  runs produced 9 false-or-pre-existing alerts and 0 real blackouts, so
  nothing yet shows the alert catches the case it was built for. A single
  fault-injection (a project pointed at a wrong DSN in a one-off dispatch
  input) is the only way to exercise that path on demand; the workflow
  deliberately has no inputs.
- Change: a timeout on the Sentry lookup was classified `error` and opened 5
  alerts for one API blip (2026-10-06). One retry of a timed-out lookup before
  an `error` verdict, or requiring two consecutive `error` days before
  opening, would have cut that to zero. Review's M1 covered 429s, not timeouts.
- Change: the heartbeat's backend trigger depends on an unrelated service's
  rate limit (the `/health` limiter). #8271 raised it and broke the heartbeat
  with no test, link or hook connecting them. #8360 moved the trigger to an
  unmatched path and added a test that targets avoid `/health` and `/ready`,
  but the dependency is on the global 100/min limiter, which can change the
  same way.
- Stop: nothing — no stage was skipped. Verify's PENDING-SHIP bucket
  (SC-3 and the live half of 5 criteria) was the right call given the criteria
  needed a merged workflow, and Ship closed all of it.

## Environment

Rows from `review.md` findings and `release.md` hiccups; `verification.md`
records Failures: None, and `breakdown.md` Notes records deviations (not
mistakes). Two post-release failures that the artifacts could not record are
included, labelled.

| Mistake                                                                                                                                            | Evidence                                      | Class      | Proposed carrier                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Concurrent, rate-limited Sentry lookups read as `error` (M1)                                                                                       | `review.md` §Major M1                         | mechanical | Fixed test-first (`8cde07102`) in `scripts/__tests__/sentry-heartbeat-runner.test.mjs`; it passes in the scripts suite. Finding: the 2026-10-06 timeout `error` shows the same class (transport failure as verdict) with no test for it — add the timeout case there.                                          |
| Browser envelope wait resolves on the SDK session envelope, so the error POST can be aborted (M2)                                                  | `review.md` §Major M2                         | judgement  | Found by the `reviewer` subagent; fixed in `aa5288cae`. No deterministic check exists for "waits on the right network event"; `sentry-heartbeat-browser.test.mjs` now pins the matcher.                                                                                                                        |
| `scheduled-workflow-health` would file a `ci-fix` + `ready` issue against a workflow whose red is a reported finding (M3)                          | `review.md` §Major M3; `release.md` §Deferred | mechanical | `scripts/scheduled-workflow-health.mjs` — a per-file exemption map beside `DEPLOY_WATCH_EXEMPT_FILES`; today it has none for the heartbeat, so the double-alert hazard stands.                                                                                                                                 |
| Token `project:read` scope unverifiable before merge (M4)                                                                                          | `review.md` §Major M4                         | judgement  | Resolved from the first dispatch's log. No pre-merge carrier exists (no local token); `release.md` pre-flight checklist is the carrier.                                                                                                                                                                        |
| `consoleLogs` ratchet counts CLI `console.log` (m1)                                                                                                | `review.md` §Minor m1                         | mechanical | The ratchet's own exclusion list (`.husky/pre-commit` and `.husky/pre-push` run the antipattern ratchet; `ci.yml` job `ai-antipattern-ratchet` exists). Left as a workaround.                                                                                                                                  |
| Page console text written raw to the job log (m3)                                                                                                  | `review.md` §Minor m3                         | mechanical | Unfixed. A unit test in `sentry-heartbeat-cli.test.mjs` asserting detail is wrapped in `::stop-commands::`.                                                                                                                                                                                                    |
| Push outlived the Bash tool's 120 s foreground limit and `verify-push-sha` fired early; `gh` local cleanup collided with another worktree's `main` | `release.md` §Release log items 2 and 5       | judgement  | Tooling hiccups of the Bash tool and `gh`, no repo carrier; no action.                                                                                                                                                                                                                                         |
| (post-release) Heartbeat trigger broke when #8271 raised `/health` limit to 600/min; 3 alerts, ~10 h red                                           | `gh pr view 8360` body; run `42106077607`     | mechanical | `.github/workflows/ci.yml` runs on the PR that changes the limiter, but nothing ties the limiter value to the heartbeat. A test in `scripts/__tests__/sentry-heartbeat-targets.test.mjs` that asserts the trigger path's limiter (read from the service's rate-limit config) is below the request count would. |
| (post-release) Sentry API timeout opened 5 false issues                                                                                            | `gh run view 37515280385`                     | mechanical | Same runner test file as the M1 row.                                                                                                                                                                                                                                                                           |

## Idea seeds

- Fault-inject the silence alert on demand: a one-off `workflow_dispatch` input (or a scratch branch) that points one project's heartbeat at a wrong DSN and confirms an issue opens within one run and closes on the next green one; measure that detect-and-close happens end to end, since in 38 scheduled runs no real blackout has exercised it (from: feature:sentry-silence-alert)
- Retry a timed-out Sentry lookup once and treat a single-day all-`error` run as a warning rather than 5 issues, then measure scheduled red days from API timeouts (1 of 38 so far, 2026-10-06) (from: feature:sentry-silence-alert)
- Add the heartbeat to `scheduled-workflow-health`'s exemption map (or have it treat a heartbeat-labelled issue as the reported finding), so a 3-day real blackout does not also file a `ci-fix` + `ready` issue that implement-queue could "fix" by silencing the check (from: feature:sentry-silence-alert)
- Decouple the heartbeat's backend 429 trigger from any service rate-limit value: either an on-demand capture path for the heartbeat or a test that reads the live limiter config, because #8271 silently broke it for ~10 h on 2026-11-05 (from: feature:sentry-silence-alert)
- Read who sees the alert: record whether Matt opens or closes any `sentry-heartbeat` issue by hand in the next 30 days (all 9 so far were closed by the workflow), and if none, decide whether an issue in the tracker is the right channel versus a push notification (from: feature:sentry-silence-alert)
- Clear the four unfiled Review minors of this run (m1 ratchet exemption for CLI entrypoints, m3 `::stop-commands::` on page console text, m4 `platform: null` read as mismatch, m6 alert for a removed project never closes) as one issue, and measure each by the unit test that would have failed first (from: feature:sentry-silence-alert)

## Run complete

Closed 2026-11-07. Merged 2026-10-01 (`6069e0804`); 38 scheduled runs since,
34 green; 0 people observed and 0 real blackouts exercised. Seeds above are
the input to the next Idea-stage run.
