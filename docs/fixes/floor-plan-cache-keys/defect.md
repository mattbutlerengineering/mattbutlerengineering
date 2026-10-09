---
stage: capture
run: maintenance:floor-plan-cache-keys
date: 2026-10-07
re-entry: implement
assumptions:
  - "Re-entry depth chosen by Capture (the brief delegated it): `implement`. The fix is one shared key builder plus call-site swaps inside `apps/hospitality/src/hooks/`; no data model, API, or cross-package interface changes, so there is no design decision big enough to need architecture.md."
  - "Guest segments is IN scope: the brief asked Capture to decide, and the sibling is confirmed with the same mismatch at two call sites (see Blast radius). It matches the brief's 'plus any confirmed sibling' scope line."
  - "`useAddGuest` (useGuests.ts:134) has no production caller (only its own definition matches a repo-wide grep). Default: fix its invalidation through the shared builder like the others; do not delete the export in this run (deleting dead code is out of scope per the surgical-change rule). It is flagged in Notes."
  - "Recurrence guard = behavioural regression tests that use a real QueryClient (seed the cache under the query's real key, run the mutation, assert `isInvalidated`), plus routing every param-bearing invalidation through the same key builder the query uses. No lint rule or AST guard. That is the cheap option the brief allowed; a custom ESLint rule is not cheap."
  - "In-flight check re-run by this stage (the orchestrator also ran it); see Notes."
  - "Implement (2026-10-07): the `useGuestDirectory().addGuest` regression test asserts that the mounted `useGuestSegments` observer refetches (`getSegments` called twice) instead of seeding the cache and reading `isInvalidated`. The directory hook mounts its own segments query, so an active observer refetches immediately on invalidation and `isInvalidated` resets once that fetch settles, which makes a state read racy. The refetch count is the observable effect of the same invalidation; it was RED on pre-fix code (called 1 time, expected 2)."
  - "Implement (2026-10-07): regression tests live in the existing hook test files (`useFloorPlans.test.ts`, `useGuests.test.ts`, `useGuestDirectory.test.ts`) rather than a new file, following the skill's 'prefer existing test seams' default."
  - "Implement (2026-10-07): the fresh worktree had no `packages/rialto/dist`, so `FloorPlanEditorPage.test.tsx` failed to resolve `@mattbutlerengineering/rialto` before reaching any assertion. Built it with `pnpm build --filter @mattbutlerengineering/rialto` (alongside `@mbe/cli...`) before taking the page-level RED run, so the recorded RED failure is the real one (Active badge not found)."
---

# Defect: floor-plan and guest-segment invalidations never match their queries' cache keys

## Defect

`createQueryHook` (`apps/hospitality/src/hooks/create-query-hook.ts:54`) builds every
query key as `[key, queryParams]`, where `queryParams` is the params **object** with
`enabled` removed (`stripEnabled`, lines 91-102). Five hand-written invalidations still
use the older shape, with a bare string in position 1. TanStack Query's prefix match
compares `"fp-1"` with `{ id: "fp-1" }`, they are not equal, and so each of these
invalidations does nothing.

| Mutation                                        | Call site                      | Invalidates                  | Query caches under                                   |
| ----------------------------------------------- | ------------------------------ | ---------------------------- | ---------------------------------------------------- |
| `useActivateFloorPlan`                          | `useFloorPlans.ts:71`          | `["floorPlan", id]`          | `["floorPlan", { id }]` (`useFloorPlans.ts:55`)      |
| `useBulkUpdatePositions` (drag-reposition save) | `useFloorPlans.ts:87`          | `["floorPlan", floorPlanId]` | same                                                 |
| `useAddTable`                                   | `useFloorPlans.ts:97`          | `["floorPlan", floorPlanId]` | same                                                 |
| `useAddGuest` (no production caller)            | `useGuests.ts:138`             | `["guestSegments", venueId]` | `["guestSegments", { venueId }]` (`useGuests.ts:78`) |
| `useGuestDirectory` → `addGuestMutation`        | `useGuestDirectory.ts:101-103` | `["guestSegments", venueId]` | same                                                 |

**Expected:** after a successful mutation, the affected detail/segment query is marked
stale and any mounted observer refetches.
**Observed (code-read, plus a matcher-level probe; NOT reproduced in a browser):** the
query is never invalidated. The UI keeps showing pre-mutation server data until something
else refetches it: a remount after `staleTime`, or a family-wide invalidation from another
path.

Contrast cases that work: `useDeleteTable` (`useFloorPlans.ts:105`) invalidates the whole
`["floorPlan"]` family, and `useAddStaffNote` (`useGuests.ts:155`) uses the object shape
`["guests", { id }]`.

## Reproduction / Evidence

1. **Matcher probe (real command, run 2026-10-07).** A scratch Node script seeded a real
   `QueryClient` from the worktree's installed `@tanstack/query-core@5.103.1` (via
   `@tanstack/react-query@5.103.1`), called
   `invalidateQueries({ queryKey, refetchType: "none" })`, and read
   `getQueryState(cacheKey).isInvalidated`:

   ```text
   floorPlan bare id   filter ["floorPlan","fp1"] -> isInvalidated: false
   floorPlan object    filter ["floorPlan",{"id":"fp1"}] -> isInvalidated: true
   floorPlan family    filter ["floorPlan"] -> isInvalidated: true
   segments bare id    filter ["guestSegments","v1"] -> isInvalidated: false
   segments object     filter ["guestSegments",{"venueId":"v1"}] -> isInvalidated: true
   ```

   This shows the matcher behaviour the five call sites depend on. It does not run the
   hooks themselves. The first work item turns it into hook-level failing tests.

2. **History (git, real commands).** Before `ff9e1ae71` (#2365, 2026-06-17 08:08 -0700,
   "createQueryHook factory"), the hand-written queries keyed by bare value
   (`git show ff9e1ae71^:apps/hospitality/src/hooks/useFloorPlans.ts` line 60:
   `queryKey: [FLOOR_PLAN_QUERY_KEY, id]`; `useGuests.ts` line 88:
   `queryKey: [GUEST_SEGMENTS_QUERY_KEY, venueId]`), so the invalidations matched. #2365
   moved the queries to `createQueryHook`, which wraps params in an object, and left the
   invalidations unchanged. `ce03c1872` (#2373, same day at 09:56, after #2365) then
   copied the stale bare-`venueId` shape into `useGuestDirectory.ts`.

3. **Why no test caught it (code-read):**
   - `FloorPlanEditorPage.test.tsx:561-574` ("activates floor plan when Set as Active is
     clicked") only asserts `mockSetActive` was called. It never asserts that the
     "Active" badge appears.
   - `create-mutation-hook.test.ts:256-271` asserts invalidation **arguments** through a
     spy (`toHaveBeenCalledWith({ queryKey: ["entitySegments", "venue-1"] })`). A spy on
     the arguments cannot see a shape mismatch against a real cache entry.
   - `useFloorPlans.test.ts` has no invalidation assertions.

## Root-cause hypothesis

_Hypothesis (strongly supported by the probe and git history, not browser-verified):_
query-key construction is duplicated. `createQueryHook` owns the key for reads, while
each mutation rebuilds the key by hand for invalidation. #2365 changed the read-side
shape (bare value → params object) without touching the write side. Nothing ties the two
together: the keys are plain arrays typed `readonly unknown[]`, so TypeScript accepts
either shape, and the existing tests assert arguments, not effects.

## Blast radius

**Sweep:** every `invalidateQueries` / `refetchQueries` / `setQueryData` / `queryKey` /
`invalidateKeys` usage in `apps/hospitality/src`, excluding tests, read on
`origin/main @ 563aa94d8`.

**Mismatched (in scope):**

- `hooks/useFloorPlans.ts:71`, `:87`, `:97`. These are live and user-visible on
  `FloorPlanEditorPage` (`pages/FloorPlanEditorPage.tsx:48-50`, route `floor-plans/:id`
  in `main.tsx:240`). Effects, by code-read:
  - **Activate:** the clearest defect. The header renders the badge from
    `floorPlan.isActive` (`FloorPlanEditorPage.tsx:262-267`). After a successful
    "Set as Active", the badge does not appear and the button stays, because nothing
    refetches the detail query. The list query (`floorPlans`) is invalidated correctly
    through `invalidateKeys`.
  - **Drag-save and add table:** the page mirrors tables in local state
    (`setTables`, lines 42-46, 118, 213-215), so the open page looks right. The cached
    detail stays stale, though. If the user navigates away and back within the 5-min
    default `gcTime`, the page renders the old positions or table list. Within the
    30-second `staleTime` (`providers/QueryProvider.tsx:20`) it does not refetch at all.
    After that it shows the stale data first, then corrects itself.
- `hooks/useGuestDirectory.ts:101-103`. Live on `GuestsPage`. The segments grid and
  `totalGuestCount` are derived from `segments` (`pages/GuestsPage.tsx:188`, `:236-238`).
  After adding a guest, the counts stay stale for as long as the page is mounted, because
  `refetchOnWindowFocus: false` (`QueryProvider.tsx:24`) and nothing else invalidates the
  `guestSegments` family.
- `hooks/useGuests.ts:138`. Same mismatch, but latent: `useAddGuest` has no production
  caller.

**Checked and correct (out of scope):**

- `invalidateKeys` in `create-mutation-hook.ts:49-51` always invalidates `[key]` (family
  prefix), which matches any params. That covers `useGuests.ts:109/135/145/152`,
  `useDeposits.ts:39`, `useFloorPlans.ts:61/68/105`, `useReservations.ts:135`,
  `useWaitlist.ts:25/34/39/44`, and `useVenues.ts:33`.
- Family-prefix calls: `useTimelineData.ts:136-137`, `useGuestDirectory.ts:100/111`,
  `useSSESync.tsx:203` (SSE catalog keys, always `[key]`), and `VenueContext.tsx:97`
  (`refetchQueries [VENUES_QUERY_KEY]`).
- `useGuests.ts:155` uses `["guests", { id }]`, which matches `useGuestQuery`'s
  `{ id }` key (`useGuests.ts:122-129`). It is redundant with the family invalidation but
  correct.
- `useUsers.ts:43/57` `setQueryData([CURRENT_USER_QUERY_KEY])` needs an exact match.
  `useCurrentUserQuery()` is called with no params, so its key is `[key]` and the match
  holds.
- The hand-written query keys in `useVenuePolicy.ts:25`, `useDashboardStatsQuery.ts:127/139/145`,
  `PublicBookingPage.tsx:48`, and `ManageReservationPage.tsx:78` have no param-bearing
  invalidation targeting them.

**SSE does not hide the floor-plan defect (code-read):** `floor-plan:created` (which
invalidates `floorPlan` and `floorPlans`, `packages/types/src/sse-events.ts:57`) is emitted
only by the clone route (`services/reservations/src/routes/floor-plans.ts:193`).
`table:updated` invalidates `tables`, not `floorPlan`, and is emitted only from the
table-status PUT (`routes/tables.ts:395`) and walk-in seating. Activate, bulk positions,
and table create emit nothing that would refresh the detail query.

**Who and how badly:** staff and admins of a venue using the hospitality dashboard's
floor-plan editor and guest directory. Severity is low to moderate: the data is stale,
not lost. The server writes succeed, and a reload shows the correct state. The most
noticeable symptom is that Activate seems to do nothing.
**Since when:** 2026-06-17 (#2365 `ff9e1ae71`, and #2373 `ce03c1872` for the directory
copy). That is roughly 3.7 months on `main`, deployed with every hospitality release
since. No user report exists. This was found by reading code during the 2026-10-06
`/idea-to-prod:deepen` review (ranked #2).

## Ruled out

- **SSE refresh hides the bug:** ruled out. No SSE event fires for activate, bulk
  positions, or table create (see Blast radius).
- **`invalidateKeys` family invalidations:** correct. They always use the `[key]` prefix.
- **`setQueryData` on `currentUser`:** correct. The params-less key is `[key]`.
- **`useAddStaffNote` `["guests", { id }]`:** correct shape.
- **The server is not persisting the change:** not investigated as a cause and not
  needed. Successful 2xx responses are assumed. The defect is purely a client cache
  defect, and the matcher probe shows the cause on its own.

## Work items

- [x] **Failing regression tests (RED)** — in `apps/hospitality/src/hooks/`, add
      hook-level tests with a real `QueryClient` and mocked API client. For each of
      `useActivateFloorPlan`, `useBulkUpdatePositions`, and `useAddTable`, seed
      `["floorPlan", { id: "fp-1" }]`. For `useAddGuest` and `useGuestDirectory().addGuest`,
      seed `["guestSegments", { venueId: "v-1" }]`. Run the mutation and assert
      `getQueryState(key).isInvalidated === true`.
  - Accept: all five tests fail on current code with `isInvalidated` false, and the
    failure is recorded before any fix.
- [x] **One owner for query-key shape** — extract the key derivation in
      `create-query-hook.ts` (the `stripEnabled` step plus `[key]` / `[key, params]`) into
      one exported function that the factory itself uses. Expose per-family builders where
      needed (for example `floorPlanQueryKey(id)` and `guestSegmentsQueryKey(venueId)`) that
      call it with the same params object the query hook passes.
  - Accept: `createQueryHook` builds its `queryKey` only through this function, and the
    existing `create-query-hook.test.ts` still passes unchanged.
- [x] **Route the five invalidations through the builders (GREEN)** — `useFloorPlans.ts:71/87/97`,
      `useGuests.ts:138`, and `useGuestDirectory.ts:101-103` call the family builders
      instead of hand-written arrays.
  - Accept: the five regression tests pass, and `grep -nE "queryKey: \[[A-Z_]+_QUERY_KEY, [^{\]]" apps/hospitality/src --include='*.ts' --include='*.tsx'`
    (bare-value position-1 keys), excluding tests, returns only `useVenuePolicy.ts:25`; that is a hand-written query definition with no invalidation, and it is correct. Before the fix the same grep also lists the five sites (verified 2026-10-07).
- [x] **Page-level assertion for the visible symptom** — extend
      `FloorPlanEditorPage.test.tsx` "activates floor plan…" so that after activation the
      `getById` mock returns `isActive: true` and the "Active" badge appears.
  - Accept: the test fails on pre-fix code (confirm by stash or revert) and passes after
    the fix.
- [x] **Gates** — `pnpm --dir apps/hospitality test`, `pnpm --dir apps/hospitality typecheck`,
      and `pnpm --dir apps/hospitality lint` all pass, with output quoted for Verify.
  - Accept: all three exit 0.

## Notes

- **In-flight check:** _nothing matched._ Re-run by this stage on 2026-10-07:
  `gh pr list --state open --limit 100` returned 27 open PRs, and none touch
  `useFloorPlans`, `useGuests`, `useGuestDirectory`, `create-query-hook`,
  `create-mutation-hook`, or `FloorPlanEditorPage` (filtered on the files list). The
  orchestrator's earlier pass (28 PRs) agreed.
- **Origin:** `/idea-to-prod:deepen` review 2026-10-06, candidate #2 ("hospitality
  cache-key module"). It was never filed, and there is no tracker or intake issue.
- **Out of scope, flagged only:** `useAddGuest` (`useGuests.ts:134`) is an exported
  mutation with no production caller. `useGuestDirectory` builds its own `useMutation`
  inline, which duplicates `useAddGuest` and `useUpdateGuest`.
  `create-mutation-hook.test.ts:256-271` documents the bare-value invalidation shape as
  an example; it is harmless because its keys are synthetic, but it is misleading. The
  SSE key mapping (`sse-query-keys.ts`) is untouched: SSE invalidates by family prefix,
  which stays correct.
- **Evidence labels:** every user-visible effect above is a code-read inference. The
  only executed evidence is the matcher probe and git history. Nothing has been
  reproduced in a browser.
- **Next stage:** `implement` (re-entry: implement). There is no architecture.md or
  breakdown.md; the work items above are the breakdown.
- **Implement log (2026-10-07):** commits `e3dcc1682` (RED tests), `39f7a54cc`
  (`buildQueryKey` extracted, item 2), `afa1bf12c` (five invalidations routed through
  `floorPlanQueryKey` / `guestSegmentsQueryKey`, item 3). The RED run failed 6 tests:
  five hook tests (`expected false to be true` on `isInvalidated`, and
  `expected "vi.fn()" to be called 2 times, but got 1 times` for the directory refetch)
  and the page test (`Unable to find an element with the text: Active`). After the fix,
  the full hospitality suite passed 182 files / 2544 tests; typecheck and lint exit 0
  (lint: 0 errors, 137 pre-existing warnings, none in touched files). The work-item 3
  grep now returns only `useVenuePolicy.ts:25`. `buildQueryKey` is exported from
  `create-query-hook.ts`; `floorPlanQueryKey` and `guestSegmentsQueryKey` sit beside
  the query hooks they describe.
