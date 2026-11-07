---
stage: operate
run: maintenance:static-sentry-dsn-routing
date: 2026-11-07
users-observed: 0
signal-source: "gh run list --workflow sentry-heartbeat.yml --limit 100 (42 runs, 5 failures) and gh run view <id> --log for the 3 post-release failures; gh issue view 5941 (comments, closedAt) and gh issue list --search 'Sentry heartbeat failing' --state all; curl of the live entry chunk of /, /rialto/ and /hospitality/ on mattbutlerengineering.com, grepped for the ingest DSN, 2026-11-07; Sentry MCP (org mattbutlerengineering, region us.sentry.io): search_issues on projects mattbutlerengineering and hospitality, get_issue_details MATTBUTLERENGINEERING-G; git -C $W log origin/main -- deploy-static.yml, its env-shape test, sentry-heartbeat*.mjs; gh pr view 6019. No analytics, support inbox or feedback channel exists for an internal CI routing change"
assumptions:
  - "Population is 0. The shipped thing is a CI/build routing change with no user-facing surface (autorun-brief.md § Scope). The only humans in the Sentry data are anonymous site visitors whose errors the fix now routes; they did not use the fix, so they are not counted. The Owner counts only if a record shows his use: #5941's three comments are all by github-actions, and nothing records Matt opening the mattbutlerengineering project."
  - "autorun-brief.md has no `operate:` section, so there is no named minimum signal to report against. The run's own proof (heartbeat PASS, bundle DSNs, #5941 self-close) is the intent checked below."
  - "Hospitality-project check: search_issues on `hospitality` for tag app:marketing / app:rialto-web returned no issues. That is the natural-language-to-query layer's translation, not an event-level count; labelled measured for 'no such issue', not for 'no such event'."
  - "The task framed sentry-dsn-static-builds as a later defect. Its retro is dated 2026-08-17, before this run (2026-10-02), so the relation runs the other way: that run introduced the shared DSN this run had to split."
---

# Retro: marketing and rialto-web report to their own Sentry project

## Did the defect recur?

No, not the misroute. `release.md` records `Status: SHIPPED 2026-10-03`, PR #5990 squash `2de5105b6`. The run is 35 days past release.

- Live bundles, fetched 2026-11-07: `/` (`index-BrgEKu_L.js`) and `/rialto/` (`index-Qan3ElKE.js`) both carry key `3eb05100…` / project `4511154257526784`. `/hospitality/` (`index-DF9_C-tG.js`) carries `7faccca5…` / `4511413547040768`. Routing is unchanged since release.
- `sentry-heartbeat.yml`: 42 runs, 37 success, 5 failure. Three failures predate the fix (10-01 dispatch, 10-01 and 10-02 scheduled, all `misrouted → hospitality`). Since release (2026-10-03T05Z): 38 runs, 2 failures, neither a misroute:
  - 2026-10-06 (run `37515280385`): all five rows `error`, so the check itself could not complete. Issues #6109 and #6110 (mattbutlerengineering among them) opened and closed 10-07.
  - 2026-11-05 (run `42106077607`): `mattbutlerengineering` and `hospitality` PASS; the three backend rows `provoke-failed` (#8330 to #8332, closed 11-06). Commit `2fc91c5aa` (#8360, 11-05) changed how the backend 429 is provoked; I did not confirm it is the cause of the 11-06 recovery.
- Latest run `2026-11-07T18:07Z`: success.

So no regression test, review finding or design constraint was missed for the routing itself. Something adjacent was missed, covered under Run retrospective.

### Relation to `maintenance:sentry-dsn-static-builds`

That retro (2026-08-17) is the run before this one, not after. It wired one shared `VITE_SENTRY_DSN` into all three builds and judged it fine because the DSN was "same org/project as hospitality's". No heartbeat registry existed then, so nothing stated which project each app should report to. That is why the misroute lasted until `feature:sentry-silence-alert` added the heartbeat and #5941 fired. This run is the cost of that unstated expectation, not a repeat of the missing-DSN defect.

## Outcomes vs. intent

Population 0, so no outcome has a user-side signal. Each records state. Targets are from `defect.md` § Defect (Expected) and § Work items.

### marketing and rialto-web report to `mattbutlerengineering`; hospitality keeps `hospitality`

- What happened: the live chunks carry the intended keys (above). Sentry MCP `search_issues` on `mattbutlerengineering` returns 3 issues. `MATTBUTLERENGINEERING-E` is the heartbeat's own marker event (62 events, first seen 29 days ago, last seen 3 hours before the query), carrying marketing and rialto-web round-trip titles. `-F` (a dynamic-import fetch failure on `/status`, 27 days ago) and `-G` (a ServiceWorker registration `AbortError`, tagged `app: marketing`, `environment: production`, 2026-11-05) are events from visitors' browsers, one user each (the user id is an IP address). Both arrived in the right project. Searching `hospitality` for `app:marketing` or `app:rialto-web` found none. No person is known to have read these issues.
- Signal strength: measured (deployed artifact, heartbeat, issue list); the use of it is unobserved

### The heartbeat is green for the `mattbutlerengineering` row and #5941 closes itself

- What happened: #5941 closed `2026-10-03T04:33:24Z`, by github-actions with its own comment, before the 10-04 08:00Z third-red deadline. The 10-06 `mattbutlerengineering` issue (#6110) closed 10-07 and no misroute issue was found in the `gh issue list` search; I did not list every open issue.
- Signal strength: measured

### The env-shape test pins value-level routing and the missing-secret guard

- What happened: `scripts/__tests__/deploy-static-sentry-env.test.mjs` is still on main, extended by #6019 (turbo env and per-app upload-secret blocks) and migrated to `scripts/lib/workflow.mjs` in #6478. `deploy-static.yml` today still has `VITE_SENTRY_DSN_MBE` and the literal `SENTRY_PROJECT: mattbutlerengineering` on both apps (lines 188-190, 322-324), and a `require-deploy-secrets.mjs` step ahead of each build. `scripts/package.json` runs the suite through turbo `test`, so CI exercises it. Whether it has failed a PR since is not known; I did not query CI history for it.
- Signal strength: unobserved

### Source maps for the two apps upload to `mattbutlerengineering` (defect.md Expected, second clause)

- What happened: **this run did not deliver it.** Ship's log step 6 recorded the upload "not confirmed", with no plugin lines in the build output. The next run found why: turbo 2 strict env stripped `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT` before vite ran, so `sentryVitePlugin` disabled itself and nothing had ever uploaded (`docs/fixes/static-sourcemaps-confirm/defect.md`, PR #6019, merged 2026-10-04T05:09Z). The project literal this run pinned was correct but inert. After #6019, `release.md` of that run records upload lines for all three apps and a post-deploy chunk guard.
- Signal strength: measured (the miss)

## Open debt

Issues this run itself filed: none. `gh issue list --state all --search "5990 OR static-sentry-dsn-routing"` returns nothing, and no issue body cites this run's `review.md` or `verification.md`.

Review deferrals recorded as prose only, with current state:

- Review Minor 3, source-map upload to the new project unverified. Resolved by `maintenance:static-sourcemaps-confirm` (#6019). Its real-frame symbolication check was still PENDING at that run's release; not re-checked here.
- Review Minor 2, the `check-workflow-paths-coverage.mjs` ALLOWLIST header says "each has a docs/backlog.md seed" but the new entry cites `defect.md`. Deferred with reasoning, never filed. I did not re-read the header.
- `release.md` post-release box "Source-map uploads … not proven": same item as Minor 3.

Counts toward nothing.

## Run retrospective

- Keep: Verify ran the new test against `origin/main`'s workflow in a detached worktree. 4 of 10 failed there and 10 of 10 passed on the branch, so the regression proof did not depend on stashing. Failure messages named the app and the wrong value.
- Keep: the Ship order (secret, merge, dispatch deploy, deploy green, heartbeat) held, and the heartbeat self-closed #5941 instead of someone closing it. Ship also caught that merging a `.github/**`-only change triggers no deploy, from the push `paths:` filter, before waiting on a deploy that would never fire.
- Keep: the `require-deploy-secrets` guard. Capture measured that an absent secret would build an SDK that reports nothing, and chose to fail closed.
- Change: Review answered "does sentryVitePlugin pick up the new project?" with "Yes", from reading `vite.config.ts` and the workflow env. It never asked whether the build tool passes that env through; turbo's strict env mode did not. The deploy log then showed no plugin lines, and Ship recorded that as "quiet" rather than "disabled". A check that was silent on both outcomes should have been read as unproven, and the stage should have said so in review rather than a "Yes". The missed constraint was a design constraint (turbo env allowlist), found a day later by a defect-first run with a probe.
- Change: Capture scoped source maps as "the exact value unmeasured" and treated them as a literal swap. The mechanism in between was never probed, the same shape as the "read the config, not the seed text" lesson in the earlier DSN run. Either measure the upload (an invalid token or a probe, as #6019 did) or move it out of scope with a named run.
- Stop: nothing worth stopping. The run was small, on a hard deadline, and met it (release 2026-10-03, deadline 10-04 07:00Z).

## Environment

One row per recorded mistake. Sources: `verification.md` § Failures ("None in this change"), `review.md` § Findings (three minors), `defect.md` § Notes and Implement log.

| Mistake                                                                                                                                                         | Evidence                                                              | Class      | Proposed carrier                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source maps assumed to upload to the new project; none uploaded because turbo stripped `SENTRY_*`                                                               | `review.md` Adjudicated question 2; `release.md` log step 6; PR #6019 | mechanical | Already added by #6019: `scripts/verify-sentry-sourcemaps.mjs` in `deploy-static.yml` between each build and its deploy (lines 200, 274, 334), the `turbo.json` assertions in `scripts/__tests__/deploy-static-sentry-env.test.mjs`, and `require-deploy-secrets.mjs` for the upload secrets. These run in the deploy and in the `Test (rest)` shard through turbo `test` |
| Merging `.github/**`-only changes triggers no deploy; the fix would not reach production on merge                                                               | `defect.md` § Notes ("Merging alone will not deploy the fix")         | mechanical | `docs/backlog.md` seed "Make a change to a deploy workflow deploy itself" (unclaimed). No CI job or hook checks that a merged workflow change was deployed; the run relied on Ship dispatching by hand                                                                                                                                                                    |
| Merge-before-secret ordering hazard: after merge and before `VITE_SENTRY_DSN_MBE` exists, every `deploy-static` run fails marketing and rialto-web at the guard | `review.md` Minor 1                                                   | judgement  | No machine carrier. Held only by Ship's step order in `autorun-brief.md` and `release.md`. A `pr-checks` or release-time `gh secret list` presence check does not exist today                                                                                                                                                                                             |
| ALLOWLIST entry cites a run artifact instead of a backlog seed, contradicting the header                                                                        | `review.md` Minor 2; `verification.md` §4b                            | mechanical | `scripts/check-workflow-paths-coverage.mjs` and its `scripts/__tests__/check-workflow-paths-coverage.test.mjs` real-tree case (runs in CI via turbo `test`); change the header wording or have the test assert the citation form                                                                                                                                          |
| Pre-merge CI was red from an external `pnpm audit` advisory (basic-ftp), blocking Build before the artifact-sync, size-budget and Integrity checks ran          | `verification.md` § PR #5990 CI                                       | mechanical | `.github/workflows/ci.yml` Build job step order puts `pnpm audit` ahead of the three later checks, so one advisory hides them; no finding of this run's own                                                                                                                                                                                                               |
| First commit hit `check-adr` `ERR_MODULE_NOT_FOUND` in a fresh worktree                                                                                         | `defect.md` Implement log, Item 4 environment note                    | mechanical | `.husky/pre-commit` already uses the standalone `check-adr.ts` entry (comment cites `scripts/__tests__/precommit-check-adr.test.mjs`), so this is now fixed on main                                                                                                                                                                                                       |

`docs/standards.json` does not exist in this repo, so no row cites it.

## Idea seeds

- Prove one real stack frame symbolicates for each static app: throw a marked error from a production build and confirm `MATTBUTLERENGINEERING-*` shows a source-mapped frame, not a minified one, since #6019 proves upload and debug IDs but its own release.md left real-frame symbolication PENDING (from: maintenance:static-sentry-dsn-routing)
- Make a release-time precondition that a Ship step creates a secret before merge machine-checkable: a `CI Gate` or deploy-side presence check for secrets a new workflow guard names, so `review.md` Minor 1's merge-before-secret hazard stops depending on step order in a brief (from: maintenance:static-sentry-dsn-routing)
- Measure whether anyone reads the `mattbutlerengineering` Sentry project: its only non-heartbeat issues (`-F`, `-G`) are visitor errors with 1 user each and no assignee or comment; record issue views or a triage action per month so "routed correctly" can become "triaged" (from: maintenance:static-sentry-dsn-routing)
- Keep the heartbeat's `error` verdict from reading as a routing failure: 10-06 reported `error` on all five projects (check could not complete, #6109/#6110 opened and self-closed), the same shape as an outage; separate "check infra failed" from "project silent or misrouted" in the issue title (from: maintenance:static-sentry-dsn-routing)

## Run complete

Closed 2026-11-07, 35 days after release. Seeds above are the input to the next Idea-stage run; the existing backlog seeds "Make a change to a deploy workflow deploy itself" and "Confirm source maps upload and produce readable stack traces" are claimed or carried elsewhere and are not duplicated here.
