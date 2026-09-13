---
stage: operate
run: feature:hospitality-service-ux
date: 2026-09-12
assumptions:
  - "Let it breathe. The Operate skill's step 3 warns that a retro written an hour after shipping reflects hopes, not outcomes, and offers to return later. The autorun brief has no Operate section and no user was available to ask, so the skill's own framing was applied rather than the deferral: this is written 29 hours after the merge, and every outcome carries an explicit signal-strength label so the reader can see which conclusions that window supports. It does not support 'nobody will ever use this'; it supports 'nobody has been observed using it', which is what is written."
  - "Retro depth. The protocol scales feature-run artifacts to feature size, so outcomes are graded at the level of the PRD's criterion clusters and `idea.md`'s success-in-one-sentence rather than restating all 42 criteria. `verification.md` remains the per-criterion record and is not duplicated here."
  - "Signal vocabulary. The template's `anecdote | pattern | measured` is used as written. Where a channel is structurally incapable of answering a question — not weakly answering it — the outcome is labelled `unobservable` and the reason is named, rather than being recorded as a weak signal. Inventing a fourth label was the alternative to silently mislabelling blindness as evidence."
  - "Sentry state untouched. Operate had no authorization to resolve, ignore, or assign Sentry issues, and the brief explicitly forbids re-filing `HOSPITALITY-7`. All eight hospitality issues are left exactly as found; `HOSPITALITY-8` is read and explained below, not triaged."
  - "Merge mechanism for this PR. The brief authorizes merge-on-green. A `CLEAN` PR refuses `--auto` in this repo (recorded gotcha, and the same substitution Ship logged), so `gh pr merge <N> --squash --delete-branch` was used directly once `CI Gate` was green."
  - "Seed deduplication. Seeds were appended to `docs/backlog.md` per the protocol's producer rule (append well-formed entries, never rewrite existing lines). Where an existing seed already covers a finding — `docs/backlog.md` line 89, the hospitality dashboard's missing authenticated production smoke check, from `feature:hospitality-animations` — it is cross-referenced in prose below instead of being re-filed, because a duplicate is not a well-formed entry."
---

# Retro: hospitality service UX — the service night on the Timeline

**It shipped, it deployed, and it is live — and in the 29 hours since the merge
there is no evidence that any human other than the pipeline has used it.** The
ten `[Audit]` issues that look like post-ship feedback are this run's own
deferred review findings, filed by this run 37 minutes _before_ its own merge
commit landed. Independent post-ship feedback on this feature: **zero items,
from zero people, through zero channels.**

That is not a failure of the feature. It is the predictable outcome of shipping
a feature whose entire surface sits behind an Auth0 gate this environment has no
credentials for, instrumented by an error-only SDK, on a product with one
prospective user who is also its author. What this retro can honestly add is
which of those three facts is fixable, and by whom.

## What this retro could and could not see

Method first, so the conclusions below can be checked rather than believed.

| Channel                        | What it can answer                        | What it actually said                                                                                                                                       |
| ------------------------------ | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub issues / PRs            | did anyone report anything                | Three issues created repo-wide after the merge; none about this feature, two auto-filed. Zero human reviews or comments on any of the eleven filed findings |
| Sentry (`hospitality` project) | did anything throw                        | One new event since the merge, tagged `app: marketing`, from a datacenter. Nothing tagged `app: hospitality` since 41 hours _before_ the release            |
| `metrics/production-health/*`  | is the Worker serving                     | `hospitality-site` `200 healthy` on every sample through `2026-09-12T20:21:43Z`                                                                             |
| Deployed bundles (fetched)     | is the shipped code the code that is live | Yes — this run's own strings are in today's chunks (below)                                                                                                  |
| `deploy-static.yml` job state  | did the deploy actually land              | `Deploy Hospitality: success`, `Rollback Failed Deploys: skipped` on run `34648764153`                                                                      |
| The live dashboard             | does it work for a host                   | **Unobservable.** Behind Auth0, no credentials, and authenticating was explicitly out of bounds                                                             |
| Usage telemetry                | did anyone open it                        | **Unobservable.** Sentry is error-only by configuration; the Cloudflare Web Analytics beacon needs an account token this environment does not have          |

Three things the environment can fake, all checked for and none of them in play:

- **A `200` is not a deploy.** The deploy was confirmed at job level, not by the
  health endpoint — `gh run view 34648764153 --json jobs` returns
  `Deploy Hospitality success` and `Rollback Failed Deploys skipped`.
- **CSP refusals are client-side only** — no 4xx, no server log, no Sentry event.
  Nothing below claims a page "works" on the strength of a status code; the live
  claims are made by fetching the JavaScript and reading it.
- **The LAN resolver sinkholes analytics hosts.** No third-party outage is
  asserted anywhere in this retro, so no `dig @1.1.1.1` cross-check was needed;
  the one live-site claim that matters (`/public/v1/venues/x` returns
  `200 text/html`) was taken from the apex, which is not sinkholed.

## The ten `[Audit]` issues are this run's own homework

This is the load-bearing classification, and it is unambiguous.

Eleven issues — **#5270 through #5280** — were created by `mattbutlerengineering`
on 2026-09-11 between **20:41:47Z** and **20:42:13Z**, a 26-second burst. Every
one of them carries `audit` + `ready`, six also carry `ux`, and **every body
opens with the same sentence**: "Deferred from the Review stage of the
`feature:hospitality-service-ux` run (`docs/features/hospitality-service-ux/review.md`,
major/minor #N)".

The merge commit `e0816489007c45db91ca3c22ba9ce281432cbac7` has committer date
**2026-09-11T21:19:01Z**. The issues predate the merge by **37 minutes**. None
of them can be post-ship feedback, because none of them was filed after the ship.

| Issue | Created (UTC) | Origin                | Maps to (`review.md`)                                                 | State today                                 |
| ----- | ------------- | --------------------- | --------------------------------------------------------------------- | ------------------------------------------- |
| #5270 | 20:41:47      | **filed by this run** | major #1 — `occupiedCaption` tells the Host to turn an occupied table | open, 0 comments                            |
| #5271 | 20:41:49      | **filed by this run** | major #2 — phone viewport drops focus to `<body>`                     | open, 0 comments                            |
| #5272 | 20:41:50      | **filed by this run** | major #3 — WalkInDialog dismissal, all three paths                    | open, 0 comments                            |
| #5273 | 20:41:57      | **filed by this run** | major #4 — CommandPalette mock mirrors nothing (specialist)           | open, 0 comments                            |
| #5274 | 20:41:58      | **filed by this run** | major #5 — `timeline.spec.ts` bare `getByRole("alert")`               | open, 0 comments                            |
| #5275 | 20:41:59      | **filed by this run** | major #6 — E2E mock re-dates the day, not the clock                   | open, 0 comments                            |
| #5276 | 20:42:07      | **filed by this run** | minor #1 — Briefing segment labels                                    | open, 0 comments                            |
| #5277 | 20:42:09      | **filed by this run** | minor #2 — `aria-controls` points at an absent id                     | open, 0 comments                            |
| #5278 | 20:42:10      | **filed by this run** | minor #3 — six E2E mocks send the retired pre-ADR-008 envelope        | open, 0 comments                            |
| #5279 | 20:42:11      | **filed by this run** | the `e2e-selector-drift-reviewer`'s five minors, bundled              | open, 0 comments                            |
| #5280 | 20:42:13      | **filed by this run** | the `rialto-prop-drift-detector`'s two minors, bundled                | **closed 2026-09-13T01:18:41Z** by PR #5316 |

**The split is 11 / 0.** Eleven filed by this run at its own Ship step; zero
arising independently. The brief named ten (#5270–#5279); the eleventh, **#5280**,
belongs to the same burst and the same convention and is counted here. **#5281**
(`test(agent): pin the SSE catch-up page size…`, created 20:42:20Z by the same
account) is _not_ this run's — it concerns `services/agent` and PR #5268, and it
only explains why the numbering runs contiguously past #5280.

What has changed since: **one** of the eleven is fixed. PR **#5316**
(`fix(rialto): CommandPalette rankCommandMatch matches its JSDoc contract`,
merged 2026-09-13T01:18:40Z) closed **#5280**. The other ten are open with zero
comments — nobody has looked at them.

And the counter-check, which is the part that matters: **every** issue created
repo-wide after `e08164890` landed, with its author:

```
5287  2026-09-11T22:16:21Z  github-actions[bot]      closed  🚨 CRITICAL: Broken Main at commit fe04834dc…
5296  2026-09-12T05:13:50Z  mattbutlerengineering    open    [Meta] isolation:"worktree" agents can be handed a base with no common g…
5302  2026-09-12T12:42:26Z  github-actions[bot]      open    [nightly-compliance 2026-09-12] Drift detected
```

Two are automation. The third is about worktree tooling. **No human filed
anything about this feature.** An agent that had read the `[Audit]` queue by
label instead of by body would have reported ten pieces of user feedback that do
not exist.

## Outcomes vs. intent

### `idea.md` — "a host running Thursday dinner on a tablet … is anticipated, recognised, never dead-ended, recovered gracefully, and spoken to like a person"

- **What happened:** The _verifiable half_ of that sentence held. `verification.md`
  grades the PRD's 42 committed criteria **37 PASS / 5 PARTIAL / 0 FAIL**, the
  audit harness's reproductions stopped reproducing, and the shipped code is
  demonstrably live. The _subject_ of the sentence — the host — has not appeared.
  No host has run a service on this, on a tablet or anything else, in the 29
  hours since it shipped. The sentence's own escape clause ("with the
  authenticated dashboard's lack of production evidence recorded, not hidden")
  is the clause that governs the outcome.
- **Signal strength:** `measured` for the harness half; `unobservable` for the host.

### Did a human other than the pipeline use this feature?

- **What happened:** **No — on the evidence available, and three of the four
  channels that could have disproved it are structurally blind.**

  The last event in the Sentry `hospitality` project tagged `app: hospitality`
  is `HOSPITALITY-7` (`GET /api/v1/users/me failed: 401`) at
  **2026-09-10T04:19:10Z** — Chrome on Mac OS X, at
  `https://mattbutlerengineering.com/hospitality/profile`. That is human-shaped,
  and it is **41 hours before the release**: evidence a person used the _old_
  dashboard, not this feature. (Per the brief it is the known token-expiry race
  the app already handles; it is not re-filed and not treated as a regression.)

  Exactly one new event has entered the project since the merge:
  `HOSPITALITY-8`, 2026-09-12T19:22:07Z —
  `TypeError: Failed to fetch dynamically imported module: …/NotFoundPage-Cw3bsluQ.js`,
  tags `app: marketing`, `browser: Chrome 148.0.0`, `os: Windows >=10`,
  `culture.timezone: UTC`, `user.geo: US, Boardman, United States`,
  url `https://mattbutlerengineering.com/public/v1/venues/x`. Boardman plus a UTC
  locale plus a Windows/Chrome-148 fingerprint is a datacenter crawler, not a
  host. It is on the _marketing_ app, not this one, and it is a symptom of a
  different run's live defect: that apex path still answers `200 text/html` with
  the marketing SPA rather than reaching the API.

  All eight issues in the project read `Users: 0`.

  The reason this is a "no" and not a "we don't know" in the GitHub channel is
  that the channel is not blind there: zero human reviews, zero comments, zero
  reports. The reason it stops short of certainty is the other three channels:

  - **Sentry cannot answer it at all.** `packages/sentry/src/react.ts` inits with
    `integrations: []`, no `tracesSampleRate`, and both replay sample rates at 0.
    That captures handled errors and nothing else — no pageview, no session, no
    user. Silence from Sentry is equally consistent with "nobody opened it" and
    "everybody opened it and nothing broke".
  - **Cloudflare Web Analytics is on the page and unreadable here.** The beacon
    ships; reading it needs an account token this environment does not have. The
    in-flight `maintenance:rialto-web-usage-instrumentation` run is blocked on
    exactly that token.
  - **The dashboard is behind Auth0 and there are no credentials.** Attempting to
    authenticate was out of bounds and was not attempted. Everything past the
    login gate — every criterion in clusters A and B, which is the feature — is
    unobservable from here by construction.
  - **GitHub authorship cannot separate Matt-the-human from an agent operating
    under his account.** Even the human-looking activity is not proof of a human.

- **Signal strength:** `measured` (absence, across every channel that can report)
  - `unobservable` (the dashboard itself).

### The deploy landed and the shipped code is what is live

- **What happened:** `deploy-static.yml` run `34648764153` on `e08164890`:
  `Deploy Hospitality success`, `Deploy Marketing success`,
  `Deploy Rialto Web success`, `Post-Deploy Verification success`,
  `Rollback Failed Deploys skipped`. Beyond the job state, the deployed chunks
  were fetched and read. Today's `TimelinePage-BjWywLEO.js` (45,771 bytes,
  reachable from `https://mattbutlerengineering.com/hospitality/`) contains this
  run's own copy: `Quiet so far`, `Walk-ins go straight to a table`,
  `Back to today`, `Change status` — and `turn it or move the party`, which is
  the exact `occupiedCaption` defect filed as #5270, confirmed live rather than
  inferred. `BriefingPage-B3qT7aIL.js` contains `Tonight's Service` (criterion
  A10.4). Caveat, stated because it is true: eight later `deploy-static` runs
  have superseded the precise artifact this run shipped — the current main bundle
  is `index-C3Y7j-8B.js`, not `release.md`'s `index-WcYMgWlZ.js` — so what is
  proven live is the run's _code_, not its _build_.
- **Signal strength:** `measured`.

### Clusters A and B — the Timeline, the walk-in, the error voice

- **What happened:** Green in the harness, invisible in production. 37 of 42
  criteria PASS with committed evidence; the five PARTIALs (A6.2, A7.1, A9.1,
  B1.1, NF5) are each a recorded limit, not a defect, and `verification.md`
  argues each one. Not one of them has been exercised by a person. The two
  known user-facing defects this run knowingly shipped — #5270 (`occupiedCaption`
  misinstructs the Host) and #5271 (phone viewport drops focus to `<body>` after
  seat/walk-in) — are both still live in the deployed chunk today, 29 hours on,
  because nobody has picked up either issue.
- **Signal strength:** `measured` in the harness; `unobservable` in production.

### Cluster C — the guest-facing booking path

- **What happened:** Still not verifiable end to end, for the same reason it was
  not verifiable at Verify. `GET https://api.mattbutlerengineering.com/api/v1/venues/by-slug/the-oak-table`
  returns `404` with body
  `{"type":"about:blank","title":"Not Found","status":404,"detail":"Venue not found"}`,
  so the happy path has no venue to walk. Separately, the apex `/public` route
  answers `200 text/html` (the marketing SPA) instead of reaching the API — the
  defect `maintenance:public-ingress-never-applied` exists for, and the direct
  cause of this feature's only post-ship Sentry event.
- **Signal strength:** `measured`.

### The run's routed audit findings kept landing after ship

- **What happened:** Of the 23 findings this run routed out of the UX audit as
  `[Audit]` issues (#4970–#4992), **9 are now closed** — and two of those closed
  _after_ the merge, by work this run did not do: #4976 (booking widget rendered
  slot times in the guest's browser timezone) closed 2026-09-12T21:10:27Z by PR
  #5311, and #4977 (hold expiry wipes what the guest typed) closed
  2026-09-13T01:25:34Z by PR #5317. The routing decision — pushing findings
  outside the run's scope into the shared queue rather than absorbing or dropping
  them — is the part of this run that is still producing value with the run over.
  Fourteen remain open.
- **Signal strength:** `pattern` (nine closures across eight days, two of them
  post-ship).

### The run's one genuine production consequence was self-inflicted and internal

- **What happened:** This run introduced a load-sensitive focus race in its own
  test suite. `apps/hospitality/src/pages/WaitlistPage.test.tsx`'s spec
  "seat success … and focuses the next card" is absent at `e08164890^` and
  present at `e08164890` (verified by `git show`). It reddened `main` **41
  minutes** after the merge. The auto-filer opened **#5287** naming
  `fe04834dcb1ad16eb303458caada749accc63f01` as the culprit — that is PR #5286,
  the docs-only release record, which touches nothing under
  `apps/hospitality/src` and cannot reach that test. The real fix, PR **#5288**
  (`17d8793d8`, merged 22:53:00Z, one file changed), wrapped the focus assertions
  so they synchronize on focus rather than on the live-region text that
  `useFocusAfter` moves focus a commit after. Total main-red window: ~37 minutes.
- **Signal strength:** `measured`.

### The externality: this run inflated the shared `ready` queue for a week

- **What happened:** `.claude/improvement-loop/log.md` shows three separate loop
  runs (2026-09-06, 09-09, 09-10) each re-deriving by hand that this run's
  exported tracker issues distorted their own sensors — "Queue depth (43) stayed
  red, still dominated by the 2026-09-04 `hospitality-service-ux` UX-audit batch
  (~19 issues, #4974–#4992) … The five sequential `[Feature] hospitality-service-ux
[11–16/16]` issues (#5031–#5036) are explicitly excluded from `/implement-queue`
  pickup by their own 'Execution note' — they inflate the raw `ready` count
  without being real queue pressure." Two of the three runs also had to record
  #4974 as the oldest open `ready` issue in their staleness row. Exporting a
  breakdown to the tracker is correct per ADR-0026; nobody told the sensors.
- **Signal strength:** `pattern` (three independent rediscoveries in five days).

## Run retrospective

**Keep**

- **Routing findings out of scope instead of absorbing or dropping them.** The
  UX audit found 48 raw issues, 30 unique; the run implemented its cluster and
  filed the other 23 with enough context for a stranger to act. Nine are closed,
  two of them by other people's PRs after this run ended. That is the single
  highest-yield decision in the run, and it is the only part of it still
  producing value.
- **Verify refusing to accept "StrictMode-only" as an explanation.** Verification
  re-ran the Escape-path focus probe against a real `vite build` + `vite preview`
  and got `"afterEscape": { "tag": "BODY", "isBody": true }`, turning a
  comfortable dismissal into major #3 and issue #5272. A run that had trusted the
  convenient hypothesis would have shipped the same bug with a clean conscience.
- **Naming the unobservable instead of manufacturing evidence.** `verification.md`
  § Not verified opens "Production evidence for the authenticated dashboard —
  none exists, and none was manufactured." That sentence is the reason this retro
  could be written honestly at all; had Verify claimed production evidence,
  Operate would have had to either repeat the claim or call its own pipeline a
  liar.
- **Filing deferred review findings at all.** Eleven findings that could have
  evaporated with the run are in a tracker, and one is already fixed.

**Change**

- **Mark self-filed findings as self-filed.** All eleven carry the same `audit` +
  `ready` labels and `[Audit] …` title shape as findings routed from the UX audit
  and as anything a future sweep files. The _only_ thing separating "we deferred
  this" from "a user reported this" is the first line of the body. This retro's
  whole opening section exists because that distinction had to be reconstructed
  by hand, and the reconstruction was only decisive because of a timestamp
  comparison — 20:41:47Z against a 21:19:01Z merge — that nothing in the tooling
  makes.
- **Decide the observability _before_ building behind the gate, not after.** The
  brief and the PRD both recorded "no production evidence for the dashboard" as a
  known risk at the start, and that record did exactly nothing: the run proceeded,
  shipped, and arrived at Operate with the risk realized and no options left.
  `docs/backlog.md` line 89 already carries this exact seed from
  `feature:hospitality-animations`, filed days earlier and still unclaimed —
  which means this is now the _second_ consecutive Auth0-gated feature to close
  blind for a reason that was written down before either of them started.
- **Tell the sensors when a run exports work items.** Three loop runs paid for
  this run's tracker mirror.
- **Commit artifacts at stage boundaries.** Same shape as
  `feature:venue-onboarding-floor-plan`'s seed: this run's artifacts spent most
  of their life in a worktree, and the run's own five-day idle gap
  (2026-09-05 → 09-09, visible in the PR's commit dates) is a window in which a
  lost checkout would have erased the state entirely.

**Stop**

- **Stop treating "all gates green" as the finish line for a gated surface.** 42
  criteria, 37 PASS, a green `CI Gate`, a successful deploy, and a `200` from the
  health check produced _zero_ bits of information about whether the feature
  works for a host — and the two defects the run knowingly shipped are still live
  because the only thing that could have surfaced them is a person using it.
- **Stop grading a PARTIAL as resolved because the reason is good.** All five
  PARTIALs have sound arguments in `verification.md` and all five are still
  ungraded behaviour in production. The argument explains why the run did not
  fix it; it does not tell anyone whether it matters.
- **Stop letting the E2E suite's advisory status stand in for the E2E suite.**
  `Hospitality E2E` is advisory, path-gated, and its specs run against a
  `mockedPage` fixture — so the one automated thing that could have exercised the
  real dashboard exercises mocks instead, and nobody is required to look at it.

## Idea seeds

Six seeds appended to `docs/backlog.md` in full; condensed here.

- Mark a run's own deferred review findings as such in the tracker
  (`source:review-deferred` or a `run:` field) so Operate can tell homework from
  feedback without reading eleven issue bodies and comparing timestamps.
- Exclude a run's own exported work items from `ready`-queue-depth sensors —
  three loop runs re-derived the same exclusion by hand in five days.
- Fail a test that synchronizes on one async signal and asserts on a later one at
  edit time, instead of letting CI load decide — the #5288 class.
- Make the broken-main auto-filer prove the culprit commit can reach the failing
  test before naming it; #5287 accused a docs-only commit.
- Scope the AI-antipattern ratchet to git-tracked files — it walks the
  filesystem, so a deliberately git-excluded harness counts as regressions and
  forces a workaround at push time.
- Give the SPA one signal that distinguishes "nobody used it" from "it worked" —
  and make that a precondition for the next Auth0-gated feature run, not the
  next retro's regret.

Not re-filed, because it already exists and is still unclaimed:
`docs/backlog.md` line 89 — _"Give the hospitality dashboard an authenticated
production smoke check … any future feature living behind Auth0 inherits the
same blind spot" (from: feature:hospitality-animations)_. This run is the
inheritance it predicted.

## Flagged for a human

- **Ten open findings this run filed against itself** (#5270–#5279), zero
  comments, nobody assigned. Two of them — #5270 and #5271 — are user-facing
  defects live in production right now.
- **The Auth0 E2E credential gap**, standing on Matt since 2026-08-31, is now the
  proximate cause of two consecutive feature runs closing with no production
  evidence. CI holds `E2E_AUTH0_*`; this environment does not.
- **The Cloudflare account token** with Account Analytics Read — the only way to
  learn whether anyone loaded these pages. `maintenance:rialto-web-usage-instrumentation`
  is blocked on it too.
- **One human, one service night.** The cheapest possible answer to every
  unobservable row above is Matt opening the Timeline on a tablet once and saying
  what happened.

## Run complete

Closed **2026-09-12**. Nine artifacts, 42 criteria, 37 PASS / 5 PARTIAL / 0 FAIL,
PR #5269 merged as `e0816489007c45db91ca3c22ba9ce281432cbac7`, deployed and live.
Eleven findings filed by the run against itself, one already fixed. Zero
independent post-ship feedback, and no observed human user.

The seeds above are the input to the next Idea-stage run.
