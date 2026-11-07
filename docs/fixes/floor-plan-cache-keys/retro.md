---
stage: operate
run: maintenance:floor-plan-cache-keys
date: 2026-11-07
users-observed: 0
signal-source: "none identifiable. `gh pr view 6140 --json state,mergedAt,mergeCommit` (merged 2026-10-07T19:46:42Z, `cbb97b638`); `git -C $W log origin/main --since=2026-10-07 -- apps/hospitality/src/hooks/{create-query-hook,useFloorPlans,useGuests,useGuestDirectory}.ts apps/hospitality/src/pages/FloorPlanEditorPage.tsx`; `git grep invalidateQueries origin/main -- apps/hospitality/src` (non-test); `gh search issues` on the slug, `buildQueryKey`, `useAddStaffNote`; `gh run list --workflow deploy-static.yml`; Sentry MCP `search_traces` (hospitality, 14d, floor-plan activate / bulk-positions spans) returned no results, which says nothing about use because it is not known that those client calls are instrumented. No analytics, no per-user activation record, no user report or issue about the fixed behaviour"
assumptions:
  - "Population 0. The Activate button, drag-save and Add Table sit behind Auth0 and no record shows a person using any of them. Matt (`mattbutlerengineering`) counts only on a record of his use; none was found. The run's own regression tests and the reviewer agent are samples, not users."
  - "No minimum signal was named: `autorun-brief.md` has no `operate:` section (it covers Run, Defect, Scope, Constraints, Release authorization only). This retro is therefore graded against `defect.md`'s Expected behaviour and its work-item Accept lines."
  - "Recurrence is judged from code on `origin/main` @ `c4320513d`, not from a browser. A recurrence would show as a param-bearing `invalidateQueries` call that bypasses the builder, or a later fix commit for stale cache; both were searched for (see Outcomes)."
  - "The release.md fields were written back by a follow-up docs PR on 2026-10-08 (its own assumption). PR state was re-read from `gh` today rather than trusted from the file."
---

# Retro: floor-plan and guest-segment invalidations hit their real cache keys

## Release state

`release.md` records the release as done: PR #6140, squash `cbb97b638` at 2026-10-07T19:46:42Z. `gh pr view 6140` reports `MERGED` with that same commit and time, so there is no pending merge to resolve. The deploy it names (`deploy-static.yml` run `37677051612`) was Deploy Hospitality success. The run is 31 days past release.

## Did the defect recur?

No. Evidence, all from `origin/main` @ `c4320513d`:

- `buildQueryKey` (`create-query-hook.ts:76`) still owns key shape, and `createQueryHook` still builds its `queryKey` through it (`:54`).
- `useFloorPlans.ts` invalidates through `floorPlanQueryKey(...)` at `:77`, `:107`, `:117` and `:152`. Three of those are new mutations added after the fix, so later work followed the pattern. `:91` is a new `removeQueries` that also uses the builder.
- `guestSegmentsQueryKey` is called at `useGuests.ts:158` and `useGuestDirectory.ts:123/132`.
- `useMenus.ts:40` and `useClosures.ts:60`, both written after the fix, build their keys through `buildQueryKey`.
- One param-bearing invalidation outside the builders remains: `useGuests.ts:175`, `[GUESTS_QUERY_KEY, { id }]`. It is the correct shape, and it is review.md's deferred minor (still open, see Open debt).
- `git log origin/main --since=2026-10-07` over the five touched source files lists 11 later commits, all features or other fixes. None is a stale-cache fix. The one that looks related, #6386 (a `FloorPlanEditorPage` draft-state defect, created 2026-10-12), is about rollback and unsaved moves, not cache keys, and it is closed. A `gh search` for the slug, `buildQueryKey` and `useAddStaffNote` finds no report of stale floor-plan or segment data.

Nothing recurred, so no missed-gate question arises. That is absence of a recurrence, not evidence the fix works for a person: see Outcomes.

## Outcomes vs. intent

The population is 0 (frontmatter), so every outcome is `unobserved`. Each records state, not use. Targets are `defect.md`'s Expected behaviour and Accept lines.

### After Activate, drag-save and Add Table the floor-plan detail query is invalidated, and the Active badge appears after "Set as Active"

- What happened: the fix is on `main` and deployed (run `37677051612`, Deploy Hospitality success). The five regression tests are still in the tree (`useFloorPlans.test.ts`, `useGuests.test.ts`, `useGuestDirectory.test.ts`, `FloorPlanEditorPage.test.tsx`). `release.md` § Post-release checks left the production smoke to Operate and said it needs an Auth0 session; it still has not been done, so no one has watched the badge appear in a browser. Not run here for the same reason.
- Signal strength: unobserved

### Adding a guest refreshes the guest-segment counts on the Guests page

- What happened: `useGuestDirectory` now invalidates `guestSegmentsQueryKey(venueId)` (`useGuestDirectory.ts:123`). Since release that file also gained #6504 (guest directory real total and paging, 2026-10-13), which changed the same mutation's contract, so the verified behaviour has been built on since. No browser check, no user report either way.
- Signal strength: unobserved

### One owner of query-key shape, so write-side keys cannot drift again

- What happened: the strongest state signal in this retro. `buildQueryKey` is exported and used by the factory and by every hook that builds a key by hand after it (`useMenus`, `useClosures`, `useFloorPlans`, `useGuests`). The one hand-built key left (`useGuests.ts:175`) has the right shape. This is a measured fact about the code, not about people.
- Signal strength: measured (code state only; says nothing about use)

### A guard against recurrence "if cheap"

- What happened: the guard shipped is behavioural tests only (Capture's decision). No lint rule or AST check exists: `packages/config/eslint/react.js`'s `no-restricted-syntax` carries only the two hex-colour selectors. A new hand-built `invalidateQueries({ queryKey: [X_QUERY_KEY, id] })` would pass lint, typecheck and every existing test until someone writes a behavioural test for that hook. Whether that matters has not been measured. The pattern worked for at least four later hooks, which is anecdote.
- Signal strength: anecdote

## Open debt

The run's own deferrals. `review.md` records four; none was filed as an issue, and `release.md` records them only as prose ("no critical or major findings (4 deferred minors/nits)"). A `gh search issues` on the slug, `buildQueryKey` and `useAddStaffNote` returns only #6386 (created after the merge, a different defect, so not this run's debt, not feedback) and #2906 (the earlier `createMutationHook` refactor). They count toward nothing.

- Minor, per-family builders restate the hook's params object (`{ id }` in `floorPlanQueryKey` and in `useFloorPlan`'s `useFloorPlanQuery({ id })`): still true on main (`useFloorPlans.ts:60-61`). No issue.
- Minor, `useAddStaffNote` hand-builds `[GUESTS_QUERY_KEY, { id }]`: still in place on main at `useGuests.ts:175`. No issue.
- Nit, no static guard against a new hand-built parameterised key: accepted at Review, still absent (see the guard outcome).
- Nit, `create-mutation-hook.test.ts` still models a bare-value invalidation key (`["entitySegments", variables.venueId]`, `:256`, asserted at `:271`): still in place.
- Not filed anywhere, flagged by Capture and Review: `useAddGuest` (`useGuests.ts`) still has no production caller (only `useGuests.test.ts` imports it) and `useGuestDirectory` still builds its own inline `useMutation`.

Closed since release, so not open: Review's observation that `apps/hospitality/tsconfig.json` excludes test files from `pnpm typecheck` (10 pre-existing errors in the touched test files). `bdfcad156` (#6167, 2026-10-08, one day after merge) added `tsconfig.test.json`, and the `typecheck` script now runs `tsc --noEmit -p tsconfig.test.json`. That run did not cause it (no issue cites it), so it takes no credit.

## Run retrospective

- Keep: the revert-only-the-fix RED proof. Verify reverted just the fix commit's three source files, kept the tests, and showed six failures with the defect's exact symptoms, then restored them. It is cheap and makes "the tests guard the bug" a fact rather than a claim.
- Keep: seeding the cache under a literal key (`["floorPlan", { id: "fp-1" }]`) instead of the builder's output, so a builder bug fails the test instead of agreeing with itself. Review credited it. The earlier spy-on-arguments style could not see this class of bug at all.
- Keep: Capture's sweep of every `invalidateQueries` / `setQueryData` call with its checked-and-correct list. It found the guest-segments siblings (a second hook and an unused third), which the brief had only suspected, and recorded why the rest were fine. Later hooks have followed the builder, so the sweep's result held.
- Change: the brief asked for a recurrence guard "if cheap", and the pipeline concluded a lint rule was not. Nobody measured how expensive one is. A `no-restricted-syntax` selector for `invalidateQueries` with an array-literal key whose second element is not an object is a few lines in the config this repo already uses, and the repo's own text says a mechanical mistake gets a check. The call was reasonable on the evidence at hand but was made without trying.
- Change: file or backlog each deferred Review finding at Review. Four were left as prose in `release.md`, so this stage had to find them by grep, and two of them are still sitting untouched. This run's evidence for a point already in `docs/backlog.md` (a seed from `feature:hospitality-above-fold-usability` and another from `feature:localization` already say this), so no new seed is added.
- Change: Ship could not run its own post-release smoke (Auth0), so "did the fix work for a person" has been open for 31 days with no owner. The release already knew this and handed it to Operate, which cannot do it either.
- Stop: nothing worth stopping. The run was small, the stages were proportionate, and the page-level test for the visible symptom earned its place by being the only check that failed for the Activate badge.

## Environment

One row per mistake the run recorded. Sources: `verification.md` § Failures ("none"), `review.md` § Findings, `defect.md` § Notes and "Why no test caught it". The root cause is itself a mistake: #2365 changed the read-side key shape and #2373 copied the stale write-side shape afterwards, and nothing in the environment connected the two.

| Mistake | Evidence | Class | Proposed carrier |
|---|---|---|---|
| Query keys built by hand in mutations drifted from the factory's shape (#2365), and a second site copied the stale shape the same day (#2373); lived on main about 3.7 months | `defect.md` § Reproduction / Evidence item 2, § Root-cause hypothesis | mechanical | `packages/config/eslint/react.js` (`no-restricted-syntax` is already there, warn-level, for hex colours): add a selector flagging `invalidateQueries` / `setQueryData` / `refetchQueries` with an array-literal `queryKey` whose second element is not an object literal. The shipped guard is tests only, which catches a known site and not a new one |
| Tests asserted invalidation arguments through a spy, so a shape mismatch against a real cache entry was invisible; the page test never asserted the Active badge | `defect.md` § Reproduction item 3; `review.md` (Nit, `create-mutation-hook.test.ts:256-271`) | judgement | `apps/hospitality/src/hooks/create-mutation-hook.test.ts:256-271`, which still models the bare-value shape. A repo line (`apps/hospitality/CLAUDE.md` if present, else the root `AGENTS.md`) would be the prose rule this mistake already slipped past, so the proposed carrier is rewriting that synthetic example to the object shape, not a new rule |
| Per-family builder restates the hook's params object; a rename in one place would silently drift (Review minor) | `review.md` § Findings, first minor | mechanical | A hook-level test per family that renders the real query hook and asserts `getQueryCache().find({ queryKey: builder(x) })` finds its entry. `useFloorPlans.test.ts` seeds a literal key today, which pins the mutation side only |
| `useAddStaffNote` still hand-builds a parameterised key, a live exception to the "single owner" comment | `review.md` § Findings, second minor | mechanical | The same `no-restricted-syntax` selector as row 1 would flag `useGuests.ts:175` immediately. Today no check does |
| `tsconfig.json` excluded test files, so `pnpm typecheck` never saw type errors in the four touched test files | `review.md` § Observations | mechanical | Already closed by `apps/hospitality/package.json` `typecheck` script (`tsc --noEmit -p tsconfig.test.json`, `bdfcad156`), which `ci.yml`'s `typecheck` job runs via `pnpm typecheck` (`ci.yml:340`) |
| Brief fixed on a fresh worktree needed `pnpm build --filter @mattbutlerengineering/rialto` before page tests could resolve the design system; the first RED run failed for the wrong reason | `defect.md` assumptions (Implement, 2026-10-07) | judgement | Caught by the author, and the brief's Constraints already named `pnpm build --filter @mbe/cli...`. No deterministic carrier found: the repo's own worktree setup line is the place, and is the same prose rule that missed `rialto` here |

Finding: the pre-commit hook (`.husky/pre-commit`) runs only `pnpm lint-staged`. Neither `pnpm --dir apps/hospitality lint` nor `typecheck` is run by any local hook, so rows 1, 4 and 5 are caught at CI (`typecheck` and `lint` jobs) or not at all.

## Idea seeds

- Measure whether anyone uses floor-plan Activate, drag-save and Add Table: count server-side `activate`, bulk-positions and table-create requests per week from the reservations service logs, split by venue, so the next floor-plan change has a number and a count of venues (from: maintenance:floor-plan-cache-keys)
- Add the `no-restricted-syntax` selector in `packages/config/eslint/react.js` for a hand-built parameterised `queryKey` array in `invalidateQueries` / `setQueryData` / `refetchQueries`, and measure what it flags on main today (expected: `useGuests.ts:175` only) (from: maintenance:floor-plan-cache-keys)
- Route `useAddStaffNote`'s `[GUESTS_QUERY_KEY, { id }]` through a `guestQueryKey(id)` builder or delete it as redundant, then rewrite `create-mutation-hook.test.ts:256-271` to the object key shape, so no example of the old shape remains (from: maintenance:floor-plan-cache-keys)
- Delete `useAddGuest` (no production caller) and fold `useGuestDirectory`'s inline `useMutation` into one mutation hook, with `useGuests.test.ts` and `useGuestDirectory.test.ts` kept as the guard; measure with `git grep useAddGuest origin/main` (from: maintenance:floor-plan-cache-keys)
- Give each query family's hook and its key builder one shared params factory (`useFloorPlan` and `floorPlanQueryKey`), with a test that renders the real hook and finds its cache entry by the builder's key (from: maintenance:floor-plan-cache-keys)

## Run complete

Closed 2026-11-07. Seeds above are the input to the next Idea-stage run. The browser confirmation `release.md` left to Operate (Activate badge, positions and tables after navigating back, segment counts after Add Guest) is still unperformed: no one with an Auth0 session was available to this stage. The existing `docs/backlog.md` seed on giving hospitality's authed pages an observer (from `feature:hospitality-above-fold-usability`) is the carrier for ever counting people on this surface; it is not duplicated here.
