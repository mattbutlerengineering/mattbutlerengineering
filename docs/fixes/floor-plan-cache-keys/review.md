---
stage: review
run: maintenance:floor-plan-cache-keys
date: 2026-10-07
assumptions:
  - "Review depth scaled to the brief's blast radius (maintenance run, client-cache-only fix inside apps/hospitality/src/hooks). Per the protocol's Run scale section, Verify's regression tests are the floor; this pass re-ran them independently instead of re-verifying every criterion."
  - "Minor findings are deferred without asking the user, as the review skill allows ('Minors may be deferred freely'). Each deferral carries a reason below."
  - "No docs/standards.json exists in this repo, so no finding cites a standard slug (the skill says to proceed when it is absent)."
---

# Review: floor-plan and guest-segment invalidations hit their real cache keys

**No critical or major findings. Nothing blocks Ship.**

## Scope

`git diff origin/main...HEAD` on `fix/floor-plan-cache-keys` (base `563aa94d8`), five
commits: `e3dcc1682` (RED tests), `39f7a54cc` (`buildQueryKey` extraction), `afa1bf12c`
(five invalidations routed through `floorPlanQueryKey` / `guestSegmentsQueryKey`),
`d2ddb9a5b` and `1c6d3bc3e` (run docs).

Source examined in full: `apps/hospitality/src/hooks/create-query-hook.ts`,
`useFloorPlans.ts`, `useGuests.ts`, `useGuestDirectory.ts`, and the four touched test
files. The generated `apps/hospitality/llms.txt` / `llms-full.txt` were sanity-checked
only: they add the three new exported signatures and nothing else.

Checks I ran myself (not taken from the artifacts):

- **Revert-proves-RED, independently.** I restored `useFloorPlans.ts`, `useGuests.ts` and
  `useGuestDirectory.ts` to `origin/main` and ran the four touched test files. Result:
  `Tests 6 failed | 74 passed (80)`. The six failures are exactly the new tests: the three
  floor-plan mutation tests, `useAddGuest`, the `useGuestDirectory` refetch test, and the
  page test "activates floor plan when Set as Active is clicked". I restored the files
  with `git checkout HEAD -- apps/hospitality/src/hooks/` and the tree was clean.
- **Gates on HEAD:** `pnpm --dir apps/hospitality test` gave `Test Files 182 passed (182)`
  and `Tests 2544 passed (2544)`, exit 0. `typecheck` exited 0. `lint` exited 0 with
  `137 problems (0 errors, 137 warnings)`; none is in a file this run modifies (the nearest is
  `FloorPlanEditorPage.tsx:44`, whose test file changed but which itself did not).
- **ADRs:** `node tools/cli/dist/index.js check-adr` printed `No architectural violations
detected.` None of the 24 active ADRs in `docs/adr/` covers client query keys or
  TanStack Query, so there is no semantic ADR surface to check.
- **Sweep re-run:** every `invalidateQueries` / `setQueryData` / `refetchQueries` /
  `invalidateKeys` / `queryKey` in `apps/hospitality/src` outside tests. It matches
  defect.md's blast-radius table. No other parameterized invalidation targets a
  `createQueryHook` key.

## Correctness pass

**`buildQueryKey` preserves the exact prior key for every `createQueryHook` caller.** The
old inline expression was
`queryParams !== undefined ? [key, queryParams] : [key]` with
`queryParams = stripEnabled(params)`. `buildQueryKey(key, params)` calls the same
`stripEnabled(params)` and applies the same ternary, so it is the same function over the
same input. Case by case:

- `params` undefined or null: `stripEnabled` returns `undefined`, giving `[key]`. Same as
  before.
- `params` holds only `enabled` (for example `{ enabled: false }`): `rest` is empty and
  `stripEnabled` returns `undefined`, giving `[key]`. Same as before.
- `params` is a primitive: it is returned unchanged, giving `[key, p]`. Same as before.
- `params` contains a key whose value is `undefined` (for example `useFloorPlan(undefined)`
  gives `{ id: undefined }`): `Object.keys` counts it, so the key is
  `[key, { id: undefined }]`. Same as before, and `floorPlanQueryKey(undefined)` builds
  the identical key.

The hook still uses its own `queryParams` for the fetcher, so `stripEnabled` now runs
twice per render. That costs a few nanoseconds and changes no behaviour.

**The per-family builders match the queries.** `useFloorPlan(id)` calls
`useFloorPlanQuery({ id })` and `floorPlanQueryKey(id)` builds `{ id }`. Likewise
`useGuestSegments(venueId)` and `guestSegmentsQueryKey(venueId)` both build
`{ venueId }`. Neither query's `getEnabled` affects the key.

**Other cache paths cannot now diverge.** SSE (`useSSESync.tsx:203`) invalidates by family
prefix `[key]`, which matches every param shape. `create-mutation-hook`'s
`invalidateKeys` does the same. `useUsers` `setQueryData([CURRENT_USER_QUERY_KEY])` targets
a params-less `createQueryHook` call, whose key is still `[key]`. The hand-written query
keys (`useVenuePolicy`, `useDashboardStatsQuery`, the two public pages) do not go through
`createQueryHook`, and this change does not touch them.

**Test quality.** The tests exercise the production hooks, not reimplementations:

- They render the real `useActivateFloorPlan` / `useBulkUpdatePositions` / `useAddTable` /
  `useAddGuest` / `useGuestDirectory` against a real `QueryClient`. Only the API client is
  mocked.
- They seed the cache under a **literal** key (`["floorPlan", { id: "fp-1" }]`), not one
  built by the builder under test. A bug in the builder therefore fails the test instead
  of agreeing with itself.
- The page test drives the real page and asserts the user-visible symptom: the "Active"
  badge appears and "Set as Active" disappears. My revert run confirms all six tests fail
  without the fix.

## Findings

### Minor: per-family builders re-state the hook's params object, so a param rename can drift silently past the hook tests

- Scenario: someone renames the param in `useFloorPlan` to `useFloorPlanQuery({ floorPlanId: id })`
  but leaves `floorPlanQueryKey` building `{ id }`. The query then caches under
  `["floorPlan", { floorPlanId }]` and invalidation misses again. The hook tests in
  `useFloorPlans.test.ts` seed the literal `{ id }` key, so they keep passing. The page
  test does catch this for Activate, because it asserts the badge after a real refetch.
  It does not catch it for drag-save or add-table, because the page mirrors those in
  local state. Note that adding a second param would _not_ break anything: TanStack's
  partial match treats `{ id }` as a subset of `{ id, extra }`.
- Standard: none.
- Decision: deferred. A rename is unlikely, the builder and hook sit three lines apart in
  the same file, and the Activate page test covers the most visible path. A full fix would
  have each hook and its builder share one params factory. That is more abstraction than
  the brief's "keep it minimal" allows for a hypothetical edit.

### Minor: `buildQueryKey`'s doc comment says parameterized invalidations "must build the key here", but `useAddStaffNote` still hand-builds one

- Scenario: `useGuests.ts:160` invalidates `[GUESTS_QUERY_KEY, { id: variables.guestId }]`
  by hand. Its shape is correct today, and the call is redundant with the mutation's
  family invalidation (`invalidateKeys: GUESTS_QUERY_KEY`), so it has no user-visible
  effect. It is still a live exception to the "single owner" contract the new comment
  states, and a reader copying it would copy the pattern the run set out to remove.
- Standard: none.
- Decision: deferred. defect.md explicitly ruled this call site correct and out of scope.
  Changing it is a no-behaviour edit that belongs to a follow-up sweep (route it through a
  `guestQueryKey(id)` builder, or delete it as redundant).

### Nit: no static guard stops a new hand-built parameterized key

- Scenario: a future mutation writes `invalidateQueries({ queryKey: [X_QUERY_KEY, id] })`.
  Nothing fails until someone writes a behavioural test for it.
- Standard: none.
- Decision: accepted. The brief asked for a guard only "if cheap", and Capture logged that
  a lint/AST rule is not cheap. The regression tests cover the five known sites.

### Nit: `create-mutation-hook.test.ts:256-271` still shows the bare-value invalidation shape as an example

- Scenario: its synthetic keys (`["entitySegments", "venue-1"]`) are harmless at runtime,
  but they model the exact shape this run fixed.
- Standard: none.
- Decision: deferred. This is pre-existing, and Capture flagged it as out of scope.

## Observations (not findings against this run)

- `apps/hospitality/tsconfig.json` excludes `src/**/*.test.ts(x)`, so `pnpm typecheck` never
  type-checks test files, and vitest does not either. I ran an ad-hoc `tsc` with the
  exclude removed: the four touched test files carry 10 pre-existing type errors (lines
  39, 31/49/144/341, 40/123/124, 235/253) and **zero** in lines this run added.
- `useAddGuest` still has no production caller, and `useGuestDirectory` duplicates its
  mutation inline. Both were flagged by Capture and are left alone (surgical scope).

## Passes with no findings

- Correctness: clean. The key derivation is byte-for-byte equivalent for every caller,
  all five invalidations now match their cached keys, and RED/GREEN was reproduced
  independently.
- Security: clean. The change is client-side cache keying only, with no new input
  surface, secrets, network calls, or auth/payment/migration paths.
- Design produced only the two minors above. The change otherwise matches the brief's
  desired shape: one owner (`buildQueryKey`), used by both the factory and the
  invalidations.

## Verdict

Ready to ship. There are no critical or major findings, and no unresolved finding cites an
enforced standard. The two minors and two nits are deferred or accepted, each with a
reason. Next stage: Ship.
