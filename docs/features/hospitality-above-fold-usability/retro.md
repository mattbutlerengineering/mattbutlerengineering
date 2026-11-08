---
stage: operate
run: feature:hospitality-above-fold-usability
date: 2026-11-07
users-observed: 0
signal-source: 'Read on 2026-11-07 against origin/main c4320513d. (1) Population: no analytics or usage instrumentation exists for hospitality page views; apps/hospitality wires Sentry only (apps/hospitality/src/main.tsx initSentry), which records errors, not visits. Sentry MCP search_issues (org mattbutlerengineering, query `is:unresolved environment:production hospitality`, 30d) returned 1 issue, HOSPITALITY-C, the synthetic `sentry heartbeat` round-trip (31 events, last seen 3 hours before the query): it counts no person. No issue, comment or message from anyone about the layout was found: `gh issue list --state all --search` on `hospitality-above-fold-usability`, `fold-budget` and `primary-content` returned no issue that cites the run, and #6367 closed 2026-10-15T14:40:58Z with no later comment read. (2) The ui-quality loop: `metrics/ui-quality-ledger.jsonl` on origin/main has `last_audited_at: null` for dashboard, floor-plans, guests, reservations, timeline and waitlist (Home, Floor Plans, Guests, Reservations, Timeline, Waitlist); `.claude/improvement-loop/log.md` records the hospitality authed routes as `unreachable:auth` (20 rows at the latest fire, line 4835). The loop has never looked at a touched page. (3) State: `git show origin/main:apps/hospitality/src/components/DashboardLayout.module.css` (no `padding-block-start`), `PageHeader.module.css` (margin-block-start xs, margin-block-end md), `git grep ''data-testid="primary-content"''` (10 pages), `git log origin/main --since=2026-10-15` on the touched CSS and `e2e/fold-budget.spec.ts`; `gh pr view 7051 7052`; `gh run view 42413795925 --json jobs` and its log (Hospitality E2E, 3 shards); `gh run list --workflow deploy-static.yml --branch main`. Open-issue search was `gh issue list --state all --search`. No browser or production render was taken: every touched page is behind Auth0 and no E2E credentials exist in this session.'
assumptions:
  - "users-observed is 0: nobody observed using the shipped layout. The Owner filed #6367 and chose the 8px fix on 2026-10-18, which shows he reads the product. That is the run's own review decision, not use of the shipped layout, and no record of him opening a page at 1280x720 after 2026-10-15 was found. The release.md minimum signal (one ui-quality judgment of a touched page dated after 2026-10-15, plus one Owner look) is unmet: the first half is unmeetable as written (see Outcomes), the second left no artifact."
  - "Open-debt boundary: the protocol rule 'created before the run's merge' is read as issues this run's own stages filed or cite. Taken literally it would sweep in every issue opened on 2026-10-15 before 14:40Z (for example #6699, a size-limit issue on other chunks). No issue cites this run's review.md or verification.md. The run filed none (release.md: 'None were filed'), so the debt below is the Review deferrals that exist only as release.md text, plus the Major 1 fix PR."
  - "The Sentry heartbeat issue (HOSPITALITY-C, 31 users) is a synthetic monitor and is not counted as people. Sentry's per-issue 'users' figure is not a population count for a layout change in any case."
  - "Environment-table classes are this retro's draft. 'Mechanical' means a deterministic check could have caught the mistake before the merge; where the mistake needed a human reading a rendered page, it is 'judgement'."
  - "Seed 1 (the data-region landmark) is kept as release.md proposed it. Seed 4 (S-1, the locale run) is not a seed in release.md and is folded into the guard-hardening seed, because the one measurement (fold-budget.spec.ts under `mbe-hospitality-locale=fr-CA`) is the same spec edit."
---

# Retro: hospitality above-the-fold usability (#6367 via #6541, #6681, #6705)

## Minimum signal

Not met, and not meetable from where the run stands. The retro is written
now because the three-week wait has passed, but the wait produced no
observation. Three readings of the same absence:

- **Usage.** No analytics exists for hospitality views. Sentry holds only the
  synthetic heartbeat. No human message about the layout was found.
- **The ui-quality loop** (release.md's named minimum signal). All six touched
  dashboard pages have `last_audited_at: null` in
  `metrics/ui-quality-ledger.jsonl`, because they render behind Auth0 and the
  loop marks them `unreachable:auth`. `docs/backlog.md` already says so
  (session:2026-10-22 line: "hospitality-above-fold operate gate is unmeetable
  as written"). Waiting longer will not change it. The Owner chose on 2026-10-22
  to leave the gate active, so this retro records it as unmet and moves on.
- **The Owner's own look** left no artifact.

## Outcomes vs. intent

With 0 users observed, no outcome below is marked landed. Each "what
happened" records state.

### idea.md success sentence: on 1280x720, each key hospitality page shows the start of its primary content without scrolling

- What happened: no person was observed at 1280x720. State: the change is on
  `origin/main` (c4320513d). `DashboardLayout.module.css` has no
  `padding-block-start`, `PageHeader.module.css` carries
  `margin-block-start: var(--rialto-space-xs)` (the 8px #7051 restored on
  2026-10-18, merge `5f9e049f2`) and `margin-block-end: var(--rialto-space-md)`,
  and `data-testid="primary-content"` is present on 10 page files, including all
  six key pages. The last Hospitality E2E on a recent PR
  (run 42413795925, 2026-11-07) was `success` on all three shards, 186 and 187
  tests passed on shards 2 and 3. `fold-budget.spec.ts` is not excluded from the
  suite (review.md) and is unchanged on `main`, but the log does not show it
  per test, so its pass on that run is inferred from the shards being green.
  Nothing re-measured the fold since Verify (Timeline 297.1px, other key pages
  187-235px). Both caveats stand from review.md: the guard measures a wrapper
  that opens with status chrome, not the data (Major 2), and the content start
  is not the same as "data above the fold" for Guests with 7+ segments.
- Signal strength: **unobserved**

### SC-1: each key page's primary content starts within the fold at 1280x720, asserted by the guard

- What happened: the guard exists and is unchanged on `main` (720px bound and
  the 312px ratchet). It has not been shown to fail since #6705. The guard runs
  only in the advisory `Hospitality E2E` job, outside the required `CI Gate`
  (ADR-016), so a red would not have blocked a merge. #6541 merged with this
  very spec red on Settings for 27 minutes. State only; nobody observed it
  working as a gate in anger.
- Signal strength: **unobserved**

### SC-2: audit artifact with before/after numbers per route at both viewports

- What happened: `docs/features/hospitality-above-fold-usability/audit.md` is
  on `main` with BEFORE, AFTER-WO-2 and FINAL for 8 routes at both viewports
  (Verify, cited, not re-measured). The largest change was Timeline 353.1 to
  297.1px; every other route moved by 40px. It is an artefact on disk, not an
  outcome for a person.
- Signal strength: **measured** at Verify (cited, not re-measured here); no
  one is observed to have read it.

### SC-3: no accessibility regression, axe clean at all impacts on touched pages

- What happened: still never run. `apps/hospitality/e2e/a11y.test.ts` on
  `main` scans the home route only and filters to `critical`/`serious`, as at
  Review. The ui-quality loop cannot reach the pages. No regression mechanism is
  known (CSS and `data-testid` only), but no evidence exists either.
- Signal strength: **unobserved**

### SC-4: all CI gates green, visual baselines regenerated from the Linux artifact

- What happened: `CI Gate` was green on all three PRs (release.md). #6709
  regenerated 31 of 38 baselines from the Linux artifact, #7044 refreshed
  stale ones, and #7051 restored the 8px gap. Hospitality baselines have been
  regenerated by bot PRs repeatedly since (#8053, #8267, #8277, #8289, #8297,
  #8309, #8348, #8427 merged in November): that churn is not attributable to this
  run, but no one has checked whether the PageHeader or fold change feeds it.
- Signal strength: **measured** for the CI results at merge time (cited from
  release.md); **unobserved** for anything after.

### Cost found live: the Major 1 defect (titles flush against the breadcrumb bar)

- What happened: Review found it live in production on 9 pages. The Owner chose
  "Fix: 8px gap" on 2026-10-18 and #7051 merged at 2026-10-18T16:30:20Z, about
  3 days after #6705 deployed. State: the fix is on `main`. No one is observed to
  have seen the defect in production, so the 3-day exposure is an upper bound with
  no known viewer.
- Signal strength: **unobserved**

## Open debt

The run's own debt. It is never feedback and counts toward nothing above. No
tracker issue was filed by or cites this run (`gh issue list --state all
--search`); these items exist only as text in `review.md` and `release.md`, which
is itself the finding behind the first Environment row below.

- **Review Major 2: the fold guard measures a wrapper, not the data** (Owner:
  "Defer to seed"). Open, no issue. Seed 1. `fold-budget.spec.ts` and the four
  page wrappers are unchanged on `main`.
- **Review minor: Floor Plans pads its content twice** (deferred). Open, no
  issue. `FloorPlansPage.module.css` still has `.container { padding:
var(--rialto-space-lg) }` on `main`. Seed 2.
- **Review minor, SC-3: axe at all impacts on touched pages never run**
  (deferred to Operate). Still open. The ui-quality signal that Review pointed
  Operate at does not exist (all six pages `unreachable:auth`), so the condition
  that was to make a seed unnecessary has failed. Seed 3.
- **Review S-1 (suspicion, not a finding): the guard runs en-US only and
  Timeline's date row can wrap** after #6741. Unsettled. Seed 4 carries it.
- **Review minor m-1 (#6541 merged with its own spec red):** fixed by #6681.
  Closed; listed for the record.
- **Review Major 1 fix: PR #7051**, `MERGED` 2026-10-18T16:30:20Z. Closed. The
  ship record PR #7052 `MERGED` 2026-10-18T17:06:30Z.
- **Intake issue #6367** `CLOSED` 2026-10-15T14:40:58Z by #6705. It is the run's
  origin, not feedback.
- **docs/backlog.md** carries one line about this run (the unmeetable operate
  gate, session:2026-10-22). It is not one of the Review deferrals. Seeds 1-3 from
  `release.md` § Follow-ups were never appended, so this retro appends them.

## Run retrospective

- Keep: **measure first, with a script.** The BEFORE/AFTER/FINAL table in
  `audit.md` turned an anecdote ("pages waste the first screenful") into numbers
  (every BEFORE value was 227-353px, every one already under 720px) and exposed
  that the issue's premise as phrased ("content below the fold") was not what the
  measurement found. The data changed the plan: WO-3 was a no-op by its own
  rule, and the real saving was a uniform 40px.
- Keep: **red proof for the guard.** Verify substituted `--rialto-space-2xl` and
  watched Timeline fail at 321.1px, and that is how the run learned the 720px
  bound alone was vacuous and added the 312px ratchet. The ratchet is the only
  part of the guard that can go red.
- Keep: Review reading the rendered Linux baselines (not only the diff) is what
  found Major 1. No unit test or CI gate flagged it.
- Change: **a guard should assert the thing the idea names, not a proxy.** The
  idea says "the table, the grid"; the guard measures a wrapper whose first child
  is status chrome (Major 2). Verify's red proof showed the guard can fail, not
  that it fails for the right reason. Put the data region in the Verify red proof.
- Change: **an Operate gate must name a carrier that can produce the signal
  before the brief is accepted.** The brief's minimum signal was a ui-quality
  judgment of the touched pages, which the ledger could never produce
  (`unreachable:auth`); the Owner noticed on 2026-10-22 and the gate stayed
  active. A 0-user retro three weeks later is the cost. The seeds say what to
  measure instead.
- Change: **file the Review deferrals as issues, or append the seeds at Ship.**
  Three deferrals lived only in `release.md` text for three weeks and none reached
  `docs/backlog.md`. The previous retro (dependabot-auto-merge) hit the same
  failure with a closed PR.
- Change: the rule applied to WO-3 was applied inconsistently: Timeline was
  tightened though under 720px, Floor Plans (the same wasted-spend class) was
  left. Decide the rule once, in architecture.md, and apply it to all or none.
- Stop: nothing here was wasted ceremony. Rollback-plan measuring (a whole-commit
  revert of `5e9fd4333` conflicts after localization landed) was costly but
  produced the preferred path-scoped patch.

## Environment

| Mistake                                                                                                                                                                                                                                            | Evidence                                                                               | Class      | Proposed carrier                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| #6541 merged with its own new fold spec red on Settings; `main`'s Hospitality E2E stayed red for 27 minutes. The visibility assertion gates every route, not only the key ones, though the spec calls the rest report-only.                        | `review.md` §Minor m-1; `release.md` Release log 1                                     | mechanical | The existing `.github/workflows/ci.yml` `CI Gate` job, whose required results are read by `scripts/ci-gate-required-results.mjs`: add the `Hospitality E2E` job to the required set so a newly added spec must be green before merge. ADR-016 calls E2E advisory today, so this is an Owner decision, not a quiet edit. The fold guard otherwise runs under no required check. |
| The 720px bound could never fail (every BEFORE value was already under 720), so the guard as first written was vacuous until Verify added the 312px ratchet.                                                                                       | `verification.md` §Breakdown WO-4; `review.md` §SC-1                                   | mechanical | The existing `apps/hospitality/e2e/fold-budget.spec.ts`: keep the red-proof as a recorded step in the spec header, and assert the bound against the BEFORE tree's measured value, not an absolute.                                                                                                                                                                             |
| #6705 removed `PageHeader`'s top margin on a false comment, leaving 9 page titles flush against the breadcrumb bar. Live for 3 days. The advisory `Visual Regression (hospitality)` job was red on all three SHAs, and its diff showed the change. | `review.md` §Major (flush titles); `release.md` §Live production defect; Release log 3 | judgement  | `docs/ui-quality/rubric.md` (the page-spacing bar the loop judges against), applied to the hospitality authed pages: the loop never captures them (`unreachable:auth`), so no reader saw the render. A reader gate has no existing home for authed pages.                                                                                                                      |
| The guard's primary-content landmark sits on a wrapper that opens with status chrome, not on the table/grid, contradicting architecture.md § Mechanism 1.                                                                                          | `review.md` §Major (fold guard measures a wrapper)                                     | judgement  | `apps/hospitality/CLAUDE.md` § E2E (it already describes the suite) could carry one line: a `primary-content` landmark belongs on the data region. The mechanical half (assert a data row's top, not the wrapper's) is Seed 1 and would live in `fold-budget.spec.ts`.                                                                                                         |
| Floor Plans doubles the layout's `lg` padding; the "convicted pages only" rule was applied to Timeline but not here.                                                                                                                               | `review.md` §Minor (Floor Plans); `breakdown.md` WO-3 note                             | judgement  | `docs/ui-quality/rubric.md`; the rule itself belongs in `architecture.md`, not a hook.                                                                                                                                                                                                                                                                                         |
| SC-3 asked for axe at all impacts on touched pages; the only axe spec scans home at critical/serious. A PRD criterion shipped with no check able to fail it.                                                                                       | `review.md` §Minor (SC-3); `verification.md` §SC-3 NOT RUN                             | mechanical | The existing `apps/hospitality/e2e/a11y.test.ts`: iterate the six key routes, drop the impact filter. It runs in the same advisory E2E job, so the first row's decision applies to it as well.                                                                                                                                                                                 |
| `useSSESync.test.tsx` failed twice on a stale `dist/` of a workspace dependency until deps were built; unrelated to the change but cost a verification pass.                                                                                       | `verification.md` §SC-4                                                                | mechanical | `scripts/agent-core-build-freshness.mjs` exists for the agent-core package only; extending it to the dependency closure of `apps/hospitality` is the existing carrier. Not run under any hook: `.husky/pre-push` runs the regen/antipattern checks, not `pnpm test`.                                                                                                           |
| Review's three deferrals and the seeds `release.md` proposed were text only; none reached `docs/backlog.md` or an issue.                                                                                                                           | `release.md` §Follow-ups; this retro §Open debt                                        | judgement  | The existing `idea-to-prod` Ship skill's seed step, as a one-line `AGENTS.md` instruction: a Review deferral gets an issue or a backlog line at Ship. A mechanical check needs a gate detector that does not exist.                                                                                                                                                            |
| The operate minimum signal (a ui-quality judgment of the touched pages) could not be produced by the loop.                                                                                                                                         | `release.md` §For human review; `docs/backlog.md` (session:2026-10-22)                 | mechanical | The existing `scripts/ui-quality/coverage.mjs`, which already reads the ledger and counts `unreachable:auth` rows: have the autorun brief check it before naming the ledger as a signal.                                                                                                                                                                                       |

Finding: the repo's own check command for this surface (`pnpm --dir
apps/hospitality lint && typecheck && test`) runs in `CI Gate`, but the guard this
run added (`fold-budget.spec.ts`) runs only in the advisory Hospitality E2E job
and under no hook (`.husky/pre-commit` runs `lint-staged`, ADR and secret scans;
`.husky/pre-push` runs the regen and antipattern checks). So the run's headline
guard has no required carrier at all.

## Idea seeds

Appended to `docs/backlog.md` by the caller, one line each. Each says what to
measure while the population is 0.

- Move the hospitality fold-budget primary-content markers from the page wrappers onto the table/data regions (Reservations table, Guests table, Waitlist list, etc.) per architecture.md § Mechanism 1, then re-measure every route at 1280x720 and 1366x768 and reset the 312px ratchet from the CI numbers; measure first-data-row top, not wrapper top (from: feature:hospitality-above-fold-usability)
- Make the fold guard a required check: decide whether `Hospitality E2E` joins `CI Gate`'s required results (ADR-016 calls it advisory), measuring first how often it has been red on main since 2026-10-15 versus how often a red merged anyway, and run `fold-budget.spec.ts` under `mbe-hospitality-locale` set to fr-CA and es-MX to settle suspicion S-1 (Timeline's wrapping date row) (from: feature:hospitality-above-fold-usability)
- Give hospitality's authed pages an observer: either an Auth0 path so the ui-quality loop can judge Reservations, Guests, Timeline, Floor Plans, Waitlist and Home (their ledger rows are `last_audited_at: null`, `unreachable:auth`), or a page-view/first-data-row-visible event, so the next layout change has a count of people and a number to read (from: feature:hospitality-above-fold-usability)
- Extend apps/hospitality/e2e/a11y.test.ts beyond the home route and the critical/serious filter so Reservations, Guests, Timeline, Floor Plans and Waitlist are axe-scanned at every impact; measure the violation count per route before deciding what to fix (from: feature:hospitality-above-fold-usability)
- Drop FloorPlansPage.module.css `.container`'s padding (it doubles DashboardLayout `.content`'s lg padding; content starts at 235px versus 187-211 elsewhere) and regenerate its Linux baselines from the CI artifact; measure the new Floor Plans contentStartY (from: feature:hospitality-above-fold-usability)
- Count hospitality visual-baseline regeneration PRs since 2026-10-15 (8 merged in November: #8053, #8267, #8277, #8289, #8297, #8309, #8348, #8427) and attribute each to the PageHeader/fold change or to unrelated content, so the cost of a spacing change in this app is a number (from: feature:hospitality-above-fold-usability)
- Make Review deferrals trackable: at Ship, file one issue or append one backlog line per deferred finding, and have Operate's open-debt step read issues instead of `release.md` prose (from: feature:hospitality-above-fold-usability)

## Run complete

Closed 2026-11-07. Zero people were observed using the shipped layout, so the
bet ("each key page shows its content without scrolling at 1280x720") is
`unobserved`, not confirmed. What exists is state: the three changes are on
`main`, the Owner-chosen 8px fix for the live Major 1 defect landed as #7051, the
audit table is on disk, and Hospitality E2E was green on a recent PR. What does not
exist is any signal about use, any axe result on the touched pages, or a required
check around the guard. The seeds above are the input to the next Idea-stage run.
