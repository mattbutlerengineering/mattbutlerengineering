---
stage: operate
run: feature:venue-onboarding-floor-plan
date: 2026-09-09
assumptions:
  - "Nine days of a green synthetic journey (`venue-journey.yml`, first green 2026-08-31T22:42Z, then eight scheduled successes 2026-09-01 → 2026-09-08) is taken as the run having been 'in users' hands' for the purpose of running Operate at all. The hospitality app is behind Auth0, its real user population is one person, and no human has been observed completing the six-step wizard. Every outcome below labelled `measured` is measured for the synthetic journey only; real-user usage is `no signal` throughout and is never upgraded by the absence of complaints."
  - "The absence of complaints carries no information here: n = 0 user reports at Idea time (idea.md: 'never upgrade this label') and a population of one at Operate time. Silence is recorded as `no signal`, not as a pass."
  - "Today's `venue-journey.yml` failure (run 34384782119) is classified as environment from the step log release.md quotes (apt `Hash Sum mismatch` fetching dl.google.com during `Install Playwright chromium`; the `Run venue journey` step was skipped). This stage did not re-dispatch it — the brief is silent on Operate dispatching workflows, and tomorrow's 14:00 UTC scheduled run is the retest."
  - "Verify's three FAILs and one PARTIAL count as resolved on the strength of release.md's mapping (each routed to an issue, each issue closed by a merged PR, the journey green afterwards) — not on a human re-grading each criterion. Autorun had no user available at any stage after the brief."
  - "The live journey walks the Blank template (`venue-journey.spec.ts:93`), so the Tables stage of the Launch sequence has never executed against production by any machine. This stage treats M7 as `measured` for venue → plan → activate → landing and `no signal` for tables, rather than reading nine green runs as covering all four stages."
  - "The `packages/agent-core/dist` pre-push misreport Ship surfaced is filed as a backlog seed (a concrete hook-message fix) rather than only as a gotcha; the brief left that call to this stage. It is also a `/gotcha-harvest` candidate — the two are not exclusive."
  - "Fresh numbers pulled in this stage, all else cited from release.md: `gh run list --workflow venue-journey.yml --limit 4` (nothing newer than today's failure); `gh run list --workflow e2e.yml --limit 12` (9 of the 12 runs on 2026-09-09 green; the 3 failures sit on two `revert/*` branches and one dependabot branch, and job-level attribution to `onboarding.spec.ts` was not checked, so the advisory job's current state is `pattern`, not `measured`)."
---

# Retro: venue-onboarding-floor-plan — floor plan inside the new-venue wizard

The run put a floor-plan step inside the new-venue wizard and made Launch
create venue → plan → tables → active plan as one resumable sequence, landing
the manager in the editor. It shipped as 12 squash merges on 2026-08-31
(#4767 → #4815) plus six fixes through 2026-09-04 (#4823, #4826, #4829,
#4872, #4861, #5044). The one production signal is `venue-journey.yml`, the
daily synthetic walk of the six steps against production that Verify
dispatched for the first time: red on its first run (the activate 400), green
from 2026-08-31T22:42Z through 2026-09-08 (nine consecutive), and dead in apt
today before reaching the feature. No human has been observed using the
wizard; the app's real user population is one. Read every "measured" below
as measured for a robot.

## Outcomes vs. intent

### idea.md — "A manager who finishes the new-venue wizard ends with a venue whose active floor plan holds the tables they laid out inside the wizard — no dead end, no half-created venue, Timeline populated with no extra navigation"

- What happened: a synthetic manager does, daily — venue created, plan
  created, plan activated, landed on `/floor-plans/:id`, venue deleted — nine
  times in a row after #4826. But the synthetic manager lays out zero tables
  (Blank template), lands in the editor rather than the Timeline (UX's
  choice; "Timeline populated" is inferred from the venue being
  `operational`, never looked at), and is a robot. The first attempt against
  production produced exactly the half-created venue the sentence forbids
  (venue + plan + tables persisted, activate 400) — caught by the journey,
  fixed the same evening. No real manager has finished the wizard.
- Signal strength: **measured** for the synthetic, table-less path;
  **no signal** for a human, for a template with tables, and for the
  Timeline.

### M1. Six steps, one count

- What happened: PARTIAL at Verify (the promised `ONBOARDING_STEPS.length === TOTAL_STEPS` pin did not exist) → #4822 → #4823 `8839ae8a2`. The journey walks six labelled steps daily.
- Signal strength: **measured** (unit pin + nine live walks).

### M2. Template picker with live previews

- What happened: five radios, geometry-derived SVG previews, replace-confirm — all unit-proven. Live, the journey opens the picker and chooses Blank (`venue-journey.spec.ts:93`). The four drawn layouts have been chosen by nobody, and breakdown.md's surfaced note stands: whether 14 tables at 48 covers reads as a restaurant is a product judgement no stage could make.
- Signal strength: **measured** for the picker mechanics; **no signal** for whether the four layouts are what a manager wants.

### M3. Template invariants

- What happened: 55 pure tests (unique names, capacity ≥ 1, grid multiples, in-canvas, pairwise non-overlapping, schema-parse per table) green at every merge.
- Signal strength: **measured** (unit; nothing live is needed).

### M4. The chosen layout is editable on the real canvas

- What happened: drag-snap proven through the real `FloorPlanCanvas` handler, add/remove/duplicate-reject in the reducer. Nothing in the repo drives a real Konva drag (verification.md § Not verified), no manual check was ever done, and the journey never touches the canvas (M15 forbids it).
- Signal strength: **pattern** (unit-level only, same shape the editor always had); **no signal** for a real pointer.

### M5. Back / Next / rail preserve the draft

- What happened: reducer round-trips and the page-level AC of #4804 hold; #4872 later froze the draft once server state exists (review Major 2). The journey never goes back.
- Signal strength: **measured** (unit); **no signal** live.

### M6. Launch review shows the plan

- What happened: fifth review card with template, name, count, and preview — unit-proven; the journey passes through step 6 and launches but asserts nothing about the card.
- Signal strength: **measured** (unit); **anecdote** live (rendered, not asserted).

### M7. Launch produces venue + plan + tables + active, visibly

- What happened: FAIL at Verify — live `POST /floor-plans/:id/activate` 400ed because `@mbe/api-client` sent a JSON content-type with no body (pre-existing since #4735, unexposed until this run made activate a mainline step). Fixed by #4826 `f4eb21bef`; nine green journeys since. But the journey's Blank template means the Tables stage (`POST /api/v1/tables` × N, the duplicate-400 resume rule) has run only against unit fakes. The four-row stage panel is unit-proven and live-rendered, never live-asserted.
- Signal strength: **measured** for venue → plan → activate → landing; **no signal** for tables against production.

### M8. Partial failure is recoverable and never re-posts the venue

- What happened: the resume algebra is unit-proven (29 `launch-sequence` tests + page-level M8 case). Live, exactly one partial failure has occurred (the activate 400 on run 33440536553): venue, plan and tables persisted and the Retry banner appeared as designed. Retry itself was never pressed against production; the fix shipped instead. Review found the draft stayed editable after a partial failure so Retry could desync the live plan — #4872 closed it.
- Signal strength: **anecdote** live (one occurrence, banner only); **measured** unit.

### M9. Landing: new venue selected, tables visible, no bounce

- What happened: the journey asserts `toHaveURL(/\/floor-plans\/[^/]+$/)` after the celebration daily (`venue-journey.spec.ts:114`). Multi-venue selection (`venues[0]` vs the new venue) is unit-only; the synthetic identity has one venue at a time.
- Signal strength: **measured** for the first-venue landing; **pattern** (unit) for multi-venue.

### M10. Copy no longer contradicts

- What happened: "finish setup" is gone from `src/`; the journey asserts the new celebration sentence ("Your venue is live — add tables next") daily.
- Signal strength: **measured**.

### M11. Reduced motion

- What happened: guards present in both new stylesheets, unit-tested under mocked `matchMedia`. No live check runs with the preference set.
- Signal strength: **measured** (unit); **no signal** live.

### M12. Tokens, rialto components, Konva fill rule

- What happened: hex grep clean across the ten new files, lint 0 errors, no new Konva fill introduced.
- Signal strength: **measured** (static).

### M13. Mobile: pick and preview, never blocked

- What happened: the 0–1023 px preview-only band is unit-proven with Next enabled. Nothing has rendered it in a real narrow viewport; the journey runs at 1280 × 720.
- Signal strength: **pattern** (unit); **no signal** on a phone.

### M14. Keyboard completion

- What happened: arrow-key radiogroup, scoped nudge keys, and the #4804 double-fire guard are unit-proven. No keyboard-only walk has happened against a browser.
- Signal strength: **pattern** (unit); **no signal** live.

### M15. E2E spec update, frozen files untouched

- What happened: `onboarding.spec.ts` walks six steps; `auth.spec.ts` / `auth.setup.ts` have no diff across the range. The spec runs only in the advisory `Hospitality E2E` job — which was red on every code PR from 2026-09-01 to 2026-09-04 because of the StrictMode bug (#5017 → #5044), and nothing blocked on it. Today 9 of the 12 latest `E2E Tests` runs are green; the three failures sit on unrelated branches and were not attributed at job level.
- Signal strength: **measured** that the spec exists and runs; **pattern** that it is green now.

### M16. The daily live journey walks six steps and still cleans up

- What happened: `journey-api` / `journey-recorder` unit suites green; the live walk succeeded nine consecutive times; the run-start sweep demonstrably reclaimed the prior failure's venue once (verification.md). Today's run 34384782119 never reached the feature — apt `Hash Sum mismatch` on Google's chrome-stable index during `playwright install --with-deps chromium`.
- Signal strength: **measured** for the walk; **anecdote** for cleanup (observed once, not re-checked here); today's red is **environment**.

### M17. Docs move with the code

- What happened: #4814 `0898c214c` updated `apps/hospitality/CLAUDE.md`, `USER-FLOWS.md` Flow 1, `IMPROVEMENT-BACKLOG.md` § 13; `regen --check` clean. USER-FLOWS's "can be activated immediately" tick was false in production for ~45 minutes until #4826 deployed.
- Signal strength: **measured** (static).

### M18. Gates

- What happened: `CI Gate` green on all 18 merges; lint / typecheck / 1936 unit tests / regen / check-adr / check-deps / circular-deps clean at Verify; size 12.04 kB / 81 kB / 5.89 kB against 500 / 100 / 7.5 kB; no `packages/rialto/src` change, so no changeset owed.
- Signal strength: **measured**.

### S1. Arrow-key nudge

- What happened: nudge-by-`GRID_SIZE` with announcement, unit-proven.
- Signal strength: **measured** (unit); **no signal** live.

### S2. Preview on the Launch review

- What happened: the review card renders the same `TemplatePreview`, unit-proven.
- Signal strength: **measured** (unit).

### S3. E2E asserts the landing

- What happened: FAIL at Verify (no spec clicked Launch; the new collection-POST mocks were exercised by nothing) → #4817 → #4861 `61c923c1d`. Delivered into the advisory job.
- Signal strength: **measured** that it exists; runs only where nothing blocks on it.

### S4. Motion with intent

- What happened: `LaunchStagePanel` transitions on `--rialto-duration-standard` / `--rialto-ease-precision`; `FloorPlanStep` carries no bespoke motion.
- Signal strength: **measured** (static read).

### S5. Onboarding-chunk budget

- What happened: a 7.5 kB entry measured from a real build (5.89 kB), proven live by a forced red in #4811. Not re-measured since.
- Signal strength: **measured** at Verify.

## Run retrospective

- **Keep: the live journey as Verify's most valuable check.** Verify's only production-blocking finding (M7/M16, the activate 400) was invisible to 1936 unit tests, to every E2E mock, and to the review — a client↔service content-type contract that only a real Fastify parser rejects. Verify dispatching `venue-journey.yml` instead of waiting for tomorrow's schedule turned a latent production defect (broken since #4735 for the editor's "Set as Active" too) into a same-evening fix. Dispatch it at every Verify that touches a live surface.
- **Keep: review-then-same-night-fix.** Review found two new Majors on 2026-08-31 (dead `isSubmitting` guards stranding a launch; Retry desyncing the draft); #4829 merged 46 minutes after the Critical, #4872 by 05:46Z the next morning, both through the normal classifier → reviewer → auto-merge rail. The loop worked because the review named a concrete fix for each finding, not just a scenario.
- **Keep: horizontal decomposition with a single keystone.** Twelve items in three milestones, three-wide batches, the six-step flip held back into #4761 so `main` never deployed a half-wizard. Every one of the 12 merged the same day with no branch race.
- **Change: commit run artifacts at every stage boundary.** Eight of the nine artifacts lived untracked in a stale checkout for nine days; Ship found them by accident. A run whose docs exist only on one disk has no state — `next` could not have oriented, and a lost checkout would have erased idea → review with nothing to reconstruct from but issue bodies. Stage skills should commit their artifact (explicit path) before handing off; autorun should refuse to advance past an uncommitted artifact.
- **Change: a Critical's fix must deploy on its own merge.** `f4eb21bef` (#4826) touched only `packages/api-client` and produced no `deploy-static.yml` run at all — the workflow's `on.push.paths` and its dorny `hospitality:` filter watch three of the eight `workspace:*` packages `apps/hospitality` depends on. The fix reached production 25 minutes later only because #4829 happened to touch `apps/hospitality/`. This is the second measured instance of the class (the first: `deploy-services.yml` and `packages/sentry`, #4927/#4931); the filter needs to derive from the dependency graph, not from a hand-written list.
- **Change: review must render under StrictMode, or the harness must.** #5044's defect (`unmountedRef` set `true` in cleanup, never reset on mount, so the dev build's double-invoke made `handleLaunch` bail forever) sat one line from the ref the review's own Major examined. The review missed it because nothing renders `LaunchStep` under `<StrictMode>` — and #5044 shipped with no unit test either, so the exact bug can return with the unit suite green. Production was unaffected; the advisory E2E job was red for three days on three unrelated PRs (#4965, #4967, #5009) and nobody was paged.
- **Change: an advisory job that is red on consecutive PRs is a signal, not noise.** `Hospitality E2E` failing byte-identically on three PRs in a row is exactly the shape of a real regression; it was diagnosed only when #5017 was filed by hand. Consecutive redness on distinct heads should surface somewhere a human reads.
- **Change: the synthetic journey should exercise a template with tables.** Blank was chosen so drag-snap stays a unit concern (`venue-journey.spec.ts:89`), which is right — but it also means the Tables stage and its resume rule have never run against production. Alternating templates, or a second lighter journey on Cafe, would close that at the cost of one more sweep rule.
- **Change: one flaky apt mirror must not blank the only live signal.** `playwright install --with-deps chromium` re-fetches Google's chrome-stable index on every run; today it cost the whole day's evidence. Cache the browser or drop the transitive apt dependency.
- **Stop: treating a green synthetic walk as "in users' hands".** It is the best signal this app can produce today, and it is not usage. The next feature behind Auth0 should budget for one observed human before Operate calls anything an outcome — the population exists (it is one person) and the wizard takes under five minutes.
- **Stop: writing "verified by unit tests" into the success sentence.** idea.md's sentence ends with its own evidence clause, so the run could satisfy the sentence while the outcome it describes stayed unobserved. Success sentences should name the outcome; Verify names the evidence.

## Idea seeds

Appended to `docs/backlog.md` in this order:

- Derive `deploy-static.yml`'s trigger paths and dorny filters from each app's `workspace:*` dependencies.
- Cache the Playwright browser in `venue-journey.yml` (or retry / drop the Google apt source) so one mirror `Hash Sum mismatch` cannot blank the day's only live signal.
- Surface consecutive redness of the advisory `Hospitality E2E` job across distinct PR heads.
- Commit run artifacts at every stage boundary; have autorun refuse to advance past an uncommitted artifact.
- Add a StrictMode double-mount unit test for `LaunchStep` (and decide whether the hospitality harness should render under `<StrictMode>` by default).
- Make the pre-push `regen --check` hook name the real cause when `packages/agent-core/dist` is missing instead of reporting "llms-txt stale".
- Have the daily journey exercise a template with tables so the Launch sequence's Tables stage and duplicate-400 resume rule run against production.
- Have one human complete the six-step wizard on production, observed.
- Hoist `DEFAULT_LAYOUT` into `floor-plan-geometry.ts` so `launch-sequence.ts` and `NewFloorPlanDialog.tsx` stop carrying two pinned copies.

## Run complete

Closed 2026-09-09. Nine days of a green synthetic journey, zero observed
humans, six fixes after Ship's review, one Critical whose fix did not deploy
on its own merge. The seeds above are the input to the next Idea-stage run;
the first human walk is the one that would change any label in this file.
