---
stage: operate
run: maintenance:browser-sentry-env-release
date: 2026-11-07
users-observed: 0
signal-source: "Sentry MCP search_errors, org mattbutlerengineering (region us.sentry.io), errors dataset, period 30d, fresh, read 2026-11-07: (1) project/environment/release/count()/max(timestamp), no query; (2) `platform:javascript !has:release`; (3) `platform:javascript environment:production` with count_unique(release) and count_unique(user), then grouped by url; (4) projectSlug hospitality `environment:development` grouped by title/url; (5) `has:release !environment:production`. `gh pr view 6035 --json state,mergedAt`; `gh issue view` on #6109, #6110, #8281, #8282, #6500, #8330; `gh run view 37515280385`; `git -C $W log origin/main -- packages/sentry/src`; reads of packages/sentry/src/{config,react}.ts, .github/workflows/deploy-static.yml and sentry-heartbeat.yml. No person used the change as a product: a tag fix has no users, and no record (Sentry resolution, issue, comment, filter or saved query) shows Matt filtering by environment or release since 2026-10-04. Sentry's count_unique(user) (hospitality 76, mattbutlerengineering 33) counts visitors whose errors were captured, not people who used the labelling, so it is not the population. The 30d window starts about 2026-10-08, so it holds no event from before the fix."
assumptions:
  - "autorun-brief.md has no `operate:` section, so there is no named minimum signal to report against. The retro measures the defect.md Expected outcome instead: production browser events carry `environment: production` and `release: <deployed SHA>`."
  - "The 163 `development` / `null` hospitality events are attributed to Playwright E2E runs against a local vite dev server because every one has url `http://localhost:3002/...` and a `ven_e2e_*` venue id in its title. The CI jobs that produced them were not identified."
  - "Release values were checked for presence and plausible 40-hex shape, not each matched to a deploy run. Only the release of the 2026-10-04 heartbeat events was matched to a deploy (release.md)."
  - "Whether `release` equals the deployed SHA for the current build rests on `cf199f1f1` (#6511) changing how `config.release` resolves after this run shipped; the check is the Sentry release strings, not a rendered-bundle read."
---

# Retro: browser Sentry events report the real environment and release

## Outcomes vs. intent

Intent (defect.md Expected): production browser events carry `environment: production` and `release: <deployed git SHA>`, while backend Sentry behaviour stays unchanged.

With `users-observed: 0`, no outcome below reads as used. Each records the state of Sentry data, which is a property of the deployed artifact.

### Production browser events carry `environment: production`

- What happened: query 3 found 443 production JavaScript events in 30 days (hospitality 379, mattbutlerengineering 64), all `environment: production`, the latest at 2026-11-07T19:04Z. Query 5 (`has:release !environment:production`) returned nothing. Before the fix every such event read `development` (defect.md: 58 events in 14 days). The merge SHA `fcd4be0a1` is still an ancestor of `origin/main`, and `environment: import.meta.env.MODE` is still in all four `apps/*/src/main.tsx`.
- Signal strength: **measured** for the label on events that arrive. **unobserved** for anyone relying on it: no filter, saved query or alert is on record.

### Production browser events carry the deployed release

- What happened: query 2 (`platform:javascript !has:release`) returned exactly one bucket, hospitality `development`, 163 events. So no production browser event in the window lacks a release. Query 3 counted 75 distinct releases on hospitality and 40 on mattbutlerengineering, so releases track deploys rather than sitting on one stale value. Before the fix the value was `null` on every browser event.
- Signal strength: **measured** (presence and per-deploy variation). **unobserved** for "someone used it to tie an error to a deploy": no Sentry suspect-commit or resolved-in-release activity was looked for, and none is on record.

### Backend behaviour unchanged

- What happened: this holds for the shipped diff (0-byte backend diff, release.md). It no longer describes today's backend, because `cf199f1f1` (#6511, 2026-10-13) gave services a real release. users-api events now carry 40-hex releases (e.g. `5cc72351…`, 137 events, last 2026-10-17). `null`-release backend events still appear (users-api 128, last 2026-10-13T18:05Z; reservations-api 13; agent-api 6), all dated before that change.
- Signal strength: **measured**.

### Did the defect recur?

- No, for the defect as stated. No production browser event lacks an environment or release (queries 2 and 5).
- A different thing that looks like it: 163 `development` / `null` events on project `hospitality` between 2026-11-04T17:27Z and 2026-11-06T03:20Z. All come from `http://localhost:3002/hospitality/...` with `ven_e2e_*` venues (query 4). That is the E2E suite running against `vite dev` with a DSN set, which is the `development` label doing its job (defect.md predicted "a local `vite dev` with a DSN reports `development`"). It is noise in the production project, not mislabelled production traffic. #8378 (`91cf94a96`, 2026-11-06, closes #8281 and #8282) now skips `Sentry.init` when `navigator.webdriver` is true. The last such event, 03:20Z on 2026-11-06, precedes that merge by about a day and the stream has since stopped, but the window cannot prove #8378 stopped it.
- Which of regression test, review finding or design constraint did the pipeline miss? None. The regression tests mock `Sentry.init` and pin the contract. The unmodelled case was a development-labelled event reaching the production project, which is a consequence of the chosen `MODE` mechanism, not an error in it. It becomes a seed below.

## Open debt

Issues and carry-forwards this run itself deferred. Count toward nothing.

- Review Minor 2 (live release proof): closed inside the run. Ship's heartbeat proof (release.md, 6 events, browser releases equal to the deployed SHA) settled it. No issue was filed.
- Review Minor 3 (caller `environment` beats `SENTRY_ENVIRONMENT`): "no action" by design, recorded in review.md only. Current state: unchanged in `packages/sentry/src/react.ts:62` (`options.environment ?? config.environment`). No issue.
- release.md open item "Backend `release: null`": state **resolved elsewhere**. #6500 (opened 2026-10-12, closed 2026-10-13, fixed by `cf199f1f1`) delivered it. The `docs/backlog.md` line "Give backend Sentry events a real release" (line 42) is still unclaimed and still says `release: null` (measured 2026-10-04).
- release.md open item "`deploy-static.yml` paths filter omits `packages/sentry/**`": state **resolved**. `packages/sentry/**` is now in both the push `paths:` list (line 18) and the dorny filters (lines 80 and 90). The backlog line (41) is not marked shipped.
- release.md open item "`verify-push-sha` residual worktree case": still on the backlog (line 144). No issue.
- release.md open item "Advisory visual baselines red on main (hospitality `dashboard`, rialto-web form controls)": prose only. Not re-measured here.
- release.md open item "Sentry inbound filters unmeasured": prose only. Nothing in this retro could read them either: the Sentry MCP has no inbound-filter tool.
- release.md open item "source-map upload is a hard build dependency on Sentry DNS/API": prose only, "not seeded". `apps/marketing/vite.config.ts:67` still has `errorHandler: (err) => { throw err; }` (from #6019, before this run), so a transient `us.sentry.io` miss still fails the whole static deploy. Not re-measured; no second occurrence was searched for.

## Run retrospective

- Keep:
  - Reading the SDK source before choosing the mechanism. `applyDefaultOptions` spreading `...optionsArg` last meant "own `release: undefined` overrides the default" was read, not guessed, and the fix (drop the key) followed from it.
  - Rejecting the smaller diff (deleting the `typeof process` guard) because it edits the file the backend shares. The backend-unchanged constraint held as a 0-byte diff, and was true again at Ship.
  - A RED step on assertions: Review swapped `origin/main`'s `react.ts` back in and reproduced `expected 'development' to be 'production'` and `expected true to be false`.
  - Ship's live proof was a Sentry search for the marked events, with release equal to the deployed SHA. It is what made "fixed" mean fixed.
- Change:
  - Review Minor 2 was right that unit tests mock `Sentry.init` and cannot show the SDK fallback, and the proof stayed a one-time Ship step. The daily heartbeat that round-trips each target (`.github/workflows/sentry-heartbeat.yml`, 13:23 UTC) matches on a marker and the `app` tag only (verification.md criterion 8). So the property this run fixed has no check that would catch its return.
  - The run decided environment names from "no preview or staging build sends events today" (defect.md assumption) but did not ask where `development` events could come from. The E2E suite is that source.
- Stop: nothing identified. Every artifact (defect, verification, review, release) produced a fact a later stage used.

## Environment

| Mistake | Evidence | Class | Proposed carrier |
|---|---|---|---|
| The package's React usage example (`packages/sentry/CLAUDE.md` § React Integration) would reproduce the defect in a new app (`dsn: process.env.SENTRY_DSN`, no `environment`) | `review.md` Minor 1 | judgement | `packages/sentry/CLAUDE.md` § React Integration, now the real call (`dsn: import.meta.env.VITE_SENTRY_DSN`, `environment: import.meta.env.MODE`). No checker reads the example. `pnpm regen --check` covers the `llms*.txt` files, not CLAUDE.md prose. |
| Release attribution and environment label were proved only by SDK source and a bundle grep, because unit tests mock `Sentry.init` | `review.md` Minor 2; `verification.md` criterion 9 PENDING | mechanical | `scripts/sentry-heartbeat.mjs` `eventMatchesTarget`, run by `.github/workflows/sentry-heartbeat.yml` (daily 13:23 UTC): also require `environment: production` and a non-empty `release` on browser targets. Today it reads neither (`grep environment\|release scripts/sentry-heartbeat.mjs` is empty). |
| No test could fail on the defect before the fix: the existing react tests set `process.env`, which exists in Node but not in a browser | `defect.md` § Reproduction item 4 | mechanical | `packages/sentry/src/react.test.ts` "in a browser bundle (no process.env values)" block, added by this run and run by the CI `Test (Node 22)` job. Nothing in CI builds a real browser bundle with a DSN and greps the emitted `initSentry` call. |

The check command for the first row's carrier does not exist: CLAUDE.md examples have no checker under any hook or CI job, which is why Review found the stale example by reading.

## Idea seeds

- Make the Sentry heartbeat assert `environment: production` and a non-empty `release` on the browser events it round-trips, so a regression of this fix fails a daily job instead of waiting for someone to read Sentry; measure with a deliberately wrong `environment` in a branch run (expected: the project goes red) (from: maintenance:browser-sentry-env-release)
- Stop E2E runs against `vite dev` from reporting to the production Sentry project: 163 `development` / `null` events from `http://localhost:3002` (hospitality, 2026-11-04 to 2026-11-06) sat in it until #8378; measure with `platform:javascript environment:development` over 14 days after a week without E2E-caused events (expected 0), and decide whether a dev build should hold a DSN at all (from: maintenance:browser-sentry-env-release)
- Mark the `docs/backlog.md` seeds "Give backend Sentry events a real release" and "Add `packages/sentry/**` to `deploy-static.yml`'s push `paths:` filter" as shipped (#6511, and the `deploy-static.yml` change now on main); both are done and still read as open, and the first still says `release: null` (from: maintenance:browser-sentry-env-release)
- Decide whether `sentryVitePlugin`'s `errorHandler: throw` should fail the whole static deploy on a transient `us.sentry.io` DNS miss (attempt 1 of run 37230635100 did); count Deploy Marketing/Hospitality/Rialto Web failures whose log names `us.sentry.io` over 90 days before choosing a retry or a non-blocking upload (from: maintenance:browser-sentry-env-release)
- Read each Sentry project's inbound filters and alert-rule environment conditions once with a `project:read` token and record them in the repo; this run could prove the label change was inert to alerts only for the six org-level rules and never read inbound filters (from: maintenance:browser-sentry-env-release)

## Run complete

Closed 2026-11-07. The defect was fixed on 2026-10-04 and has not recurred in production browser events; the dev-labelled E2E stream and the stale backlog lines are the seeds above, and they are the input to the next Idea-stage run.
