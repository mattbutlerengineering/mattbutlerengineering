---
stage: verify
run: maintenance:floor-plan-cache-keys
date: 2026-10-07
assumptions:
  - "Criteria list = the defect's Expected behaviour, the reproduction-as-regression-test, and each work item's Accept line in defect.md (a maintenance run has no prd.md/breakdown.md; defect.md's work items are the breakdown, per its Next-stage note). Source: autorun orchestrator instruction plus the verify skill's 'every acceptance criterion' rule."
  - "Revert-proves-RED reverts only the fix commit's source files (afa1bf12c: useFloorPlans.ts, useGuestDirectory.ts, useGuests.ts) to afa1bf12c~1, keeping the buildQueryKey refactor (39f7a54cc) and the tests in place. This isolates exactly the change that claims to fix the bug. Restored with `git checkout HEAD -- <files>` and confirmed clean."
  - "No browser reproduction. The floor-plan editor and guest directory sit behind Auth0 and no E2E credential is available to this stage. The verify skill allows recording a gap rather than faking a check, so the user-visible effect is verified at the page-test level (jsdom) and is code-read only in a real browser."
  - "Lint 'pass' = exit 0 with 0 errors. The 137 warnings are pre-existing, and none are in a file this branch modifies (see the lint criterion)."
---

# Verification: floor-plan and guest-segment invalidations hit their real cache keys

## Summary

7 of 7 criteria PASS, 0 FAIL. Removing only the fix commit's source changes turns all six
regression tests red with the defect's exact symptoms. Restoring it turns them green. The
full hospitality suite, typecheck, lint, and the affected-packages turbo typecheck all
exit 0. Verdict: the defect is fixed and guarded by tests. One gap remains: nobody has
watched it in a real browser (Auth0).

Verified on branch `fix/floor-plan-cache-keys` @ `d2ddb9a5b`, which is 4 commits on top
of `origin/main` @ `563aa94d8`. The fix commit is `afa1bf12c`.

## Criteria & evidence

### 1. Expected behaviour + regression: each of the five mutations invalidates the query's real cache key (work item 1)

Covers `useActivateFloorPlan`, `useBulkUpdatePositions`, `useAddTable`, `useAddGuest`, and
`useGuestDirectory().addGuest`.

- Check: I ran the targeted regression tests twice, using a real `QueryClient` seeded under
  `["floorPlan", { id }]` / `["guestSegments", { venueId }]`. The first run had the fix
  commit's source reverted and the second had it restored:
  ```
  git checkout afa1bf12c~1 -- apps/hospitality/src/hooks/useFloorPlans.ts \
    apps/hospitality/src/hooks/useGuestDirectory.ts apps/hospitality/src/hooks/useGuests.ts
  (cd apps/hospitality && pnpm exec vitest run src/hooks/useFloorPlans.test.ts \
    src/hooks/useGuests.test.ts src/hooks/useGuestDirectory.test.ts \
    src/pages/FloorPlanEditorPage.test.tsx)
  git checkout HEAD -- <same three files>
  ```
- Evidence (fix reverted, exit 1):
  ```
       × useActivateFloorPlan invalidates the detail entry 6ms
       × useBulkUpdatePositions invalidates the detail entry 1ms
       × useAddTable invalidates the detail entry 1ms
       × invalidates the cached useGuestSegments entry for the venue 4ms
         × activates floor plan when Set as Active is clicked 1064ms
       × refetches the mounted segments query after adding a guest 1064ms
  ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 6 ⎯⎯⎯⎯⎯⎯⎯
   FAIL  src/hooks/useFloorPlans.test.ts > floor-plan mutations invalidate the cached useFloorPlan entry > useActivateFloorPlan invalidates the detail entry
  AssertionError: expected false to be true // Object.is equality
   FAIL  src/hooks/useFloorPlans.test.ts > floor-plan mutations invalidate the cached useFloorPlan entry > useBulkUpdatePositions invalidates the detail entry
  AssertionError: expected false to be true // Object.is equality
   FAIL  src/hooks/useFloorPlans.test.ts > floor-plan mutations invalidate the cached useFloorPlan entry > useAddTable invalidates the detail entry
  AssertionError: expected false to be true // Object.is equality
   FAIL  src/hooks/useGuestDirectory.test.ts > useGuestDirectory — addGuest refreshes segments > refetches the mounted segments query after adding a guest
  AssertionError: expected "vi.fn()" to be called 2 times, but got 1 times
   FAIL  src/hooks/useGuests.test.ts > useAddGuest > invalidates the cached useGuestSegments entry for the venue
  AssertionError: expected false to be true // Object.is equality
   FAIL  src/pages/FloorPlanEditorPage.test.tsx > FloorPlanEditorPage > edit mode > activates floor plan when Set as Active is clicked
  TestingLibraryElementError: Unable to find an element with the text: Active. ...
   Test Files  4 failed (4)
        Tests  6 failed | 74 passed (80)
  ```
- Evidence (fix restored, `git diff HEAD` empty, exit 0):
  ```
   Test Files  4 passed (4)
        Tests  80 passed (80)
  ```
- Result: PASS. All five hook tests fail on the old invalidation shape. The failures are
  `isInvalidated` false and, for the directory, no refetch. All five pass with the fix. The
  tests are proven to guard the bug.

### 2. Visible symptom: the "Active" badge appears after "Set as Active" (work item 4)

- Check: same revert/restore runs as criterion 1, using the page-level test in
  `FloorPlanEditorPage.test.tsx`.
- Evidence: reverted → `× activates floor plan when Set as Active is clicked` with
  `Unable to find an element with the text: Active`. Restored → part of `80 passed (80)`.
- Result: PASS (in jsdom; see Not verified).

### 3. One owner for query-key shape; `create-query-hook.test.ts` passes unchanged (work item 2)

- Check: `git diff origin/main -- apps/hospitality/src/hooks/create-query-hook.test.ts | wc -l`,
  then `pnpm exec vitest run src/hooks/create-query-hook.test.ts`.
- Evidence:
  ```
  0
   Test Files  1 passed (1)
        Tests  10 passed (10)
  ```
- Result: PASS. The test file is byte-identical to `origin/main` and green. `createQueryHook`
  builds its key through the exported `buildQueryKey` (commit `39f7a54cc`).

### 4. No bare-value position-1 keys remain except `useVenuePolicy.ts:25` (work item 3)

- Check:
  `grep -rnE "queryKey: \[[A-Z_]+_QUERY_KEY, [^{\]]" apps/hospitality/src --include='*.ts' --include='*.tsx' | grep -v '\.test\.'`
- Evidence:
  ```
  apps/hospitality/src/hooks/useVenuePolicy.ts:25:    queryKey: [VENUE_POLICY_QUERY_KEY, slug],
  ```
- Result: PASS. Only the expected hand-written query definition remains, and nothing
  invalidates it with a param-bearing key.

### 5. Gate: full hospitality test suite (work item 5)

- Check: `pnpm --dir apps/hospitality test`
- Evidence (exit 0):
  ```
   Test Files  182 passed (182)
        Tests  2544 passed (2544)
     Start at  12:26:16
     Duration  53.73s
  ```
- Result: PASS

### 6. Gate: hospitality typecheck + affected-packages turbo typecheck (work item 5)

- Check: `pnpm --dir apps/hospitality typecheck` and
  `pnpm turbo typecheck --filter='...[origin/main]'`
- Evidence:
  ```
  > @mbe/hospitality@0.0.7 typecheck .../apps/hospitality
  > tsc --noEmit
  tc exit 0

     • Packages in scope: //, @mbe/hospitality
   Tasks:    10 successful, 10 total
  Cached:    3 cached, 10 total
    Time:    12s
  turbo exit 0
  ```
- Result: PASS

### 7. Gate: hospitality lint (work item 5)

- Check: `pnpm --dir apps/hospitality lint`, then grep the output for touched paths.
- Evidence (exit 0):
  ```
  ✖ 137 problems (0 errors, 137 warnings)
    0 errors and 8 warnings potentially fixable with the `--fix` option.
  ```
  The only warning on a touched-area path is `src/pages/FloorPlanEditorPage.tsx:44:7`
  (`setState` in an effect). That file is not modified on this branch: `git diff origin/main
--stat -- apps/hospitality/src` lists only its `.test.tsx`. The warning is pre-existing.
- Result: PASS

## Failures

none.

## Not verified

- **Real-browser behaviour.** The floor-plan editor (`floor-plans/:id`) and the guests page
  sit behind Auth0, and this stage has no E2E credential. The user-visible effects (Active
  badge after activation, fresh positions/tables after navigating back, guest segment counts
  after adding a guest) are proven in jsdom with mocked API clients. In a real browser
  against the deployed API they are still code-read only.
- **Drag-save / add-table navigation round-trip.** These are verified only at the hook level
  (the cache entry is invalidated). No page test drives "save, navigate away, navigate back
  within `gcTime`".
- **Production.** Nothing has been deployed yet; that belongs to Ship/Operate.
