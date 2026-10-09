---
stage: verify
run: maintenance:sse-event-catalog
date: 2026-10-04
verified-head: fc4876224
base: 2653312ff
assumptions:
  - "No prd.md (maintenance run). Criteria = defect.md's target state + the 7 work items' acceptance criteria + autorun-brief.md scope rules (per the Verify skill's maintenance-run rule and the protocol's run-scale section)."
  - "Regression demo method: origin/main's useSSESync.tsx and packages/types/src/index.ts checked out over the run's versions, and packages/types/src/sse-events.ts moved aside, with the run's NEW tests left in place; then restored via `git checkout HEAD --` and the original file moved back (`git diff --quiet HEAD` confirmed). For the hospitality half, the built @mbe/types dist still carries the catalog, so the failures isolate the client defect (unsubscribed floor-plan:created, missing invalidations) rather than a missing import. This is a stronger demo than the implementer's (which failed on `SSE_EVENT_NAMES is not iterable`)."
  - "Drift probe goes through the catalog's real shape: a name lives in SsePayloadMap AND SSE_EVENT_CATALOG. 'Delete a catalog row' was probed both ways (row only; row + map entry); 'add a row without a case' adds the name to both. All probes reverted; tree verified == HEAD."
  - "@mbe/types exports resolve `types` from ./src, so typecheck probes need no dist rebuild."
  - "CI Gate was read on the verified code head fc4876224 (CI run 37259389971). The commit carrying this file is docs-only and moves the PR head; Ship must re-read CI Gate on the final head."
---

# Verification: SSE event vocabulary collapsed into one shared catalog

## Summary

13 criteria: **13 PASS, 0 FAIL.**
Verdict: the condition is fixed locally — one catalog in `@mbe/types` drives the
server union, the client subscription list, invalidation, and the exhaustive
handler switch; the regression tests fail on origin/main's code and pass on the
run's; drift in either direction is a type error; `CI Gate` is green on PR #6050's
code head `fc4876224`.

All commands run in `.claude/worktrees/sse-event-catalog` at `fc4876224`
(`origin/main` == merge-base == `2653312ff`, nothing to rebase), after
`pnpm build --filter "@mbe/hospitality^..."` (`Tasks: 9 successful, 9 total`).

## Criteria & evidence

### 1. Regression (centerpiece): new tests fail on origin/main's code, pass on the run's

- Check: swapped in origin/main's `apps/hospitality/src/hooks/useSSESync.tsx` and
  `packages/types/src/index.ts`, moved `packages/types/src/sse-events.ts` aside,
  kept the new tests; ran both test files; restored; re-ran.
- Evidence (origin/main code):
  ```
  types exit=1
   FAIL  src/sse-events.test.ts [ src/sse-events.test.ts ]
  Error: Cannot find module './sse-events.js' imported from …/packages/types/src/sse-events.test.ts
  hosp exit=1
       × forwards every SSE_EVENT_NAMES entry to feed listeners 36ms
       × floor-plan:created invalidates exactly ["floorPlan","floorPlans"] 2ms
       × guest:lapsing invalidates exactly ["lapsingGuests"] 1ms
  AssertionError: expected [ 'guest:lapsing', …(8) ] to deeply equal [ 'floor-plan:created', …(9) ]
  AssertionError: expected [] to deeply equal [ 'floorPlan', 'floorPlans' ]
  AssertionError: expected [] to deeply equal [ 'lapsingGuests' ]
   Test Files  1 failed (1)
        Tests  3 failed | 37 passed (40)
  ```
- Evidence (restored, run's code):
  ```
  tree==HEAD
   Test Files  1 passed (1)
        Tests  5 passed (5)
   Test Files  1 passed (1)
        Tests  40 passed (40)
  ```
- Result: PASS. The failures are exactly the defect: `floor-plan:created` not
  forwarded/subscribed, and no invalidation for `floor-plan:created` or
  `guest:lapsing`. The other 8 invalidation rows pass on origin/main's code,
  which proves the refactor preserves their sets (work item 2's acceptance).

### 2. One catalog in `@mbe/types` (name → payload → invalidation keys) — work item 3

- Check: read `packages/types/src/sse-events.ts`; ran the package suite.
- Evidence: `SsePayloadMap` (10 names), `SseEventName = keyof SsePayloadMap`,
  `SSE_EVENT_CATALOG … as const satisfies { readonly [K in SseEventName]: SseEventDefinition }`,
  `SSE_EVENT_NAMES`, `SseEvent`; no `venue:updated`.
  ```
  pnpm --dir packages/types test
   Test Files  12 passed (12)
        Tests  287 passed (287)
  exit=0
  ```
- Result: PASS

### 3. Server consumes catalog types; emitter wiring untouched (brief scope rule) — work item 4

- Check: `git diff origin/main -- services/reservations/src/services/events.ts`.
- Evidence (complete diff body):
  ```
  +  SseEvent,
  +  SseEventName,
   } from "@mbe/types";
  -export type ReservationEventType =
  -  | "reservation:created"
  -  … (10 names)
  -export interface ReservationEvent {
  -  type: ReservationEventType;
  -  venueId: string;
  -  timestamp: string;
  -  data: Reservation | Table | ReservationHold | FloorPlan | LapsingGuest[] | TableStatusDelta[];
  -}
  +/** Event names are owned by the shared catalog in @mbe/types (SSE_EVENT_CATALOG). */
  +export type ReservationEventType = SseEventName;
  +/** Wire envelope, owned by the shared catalog in @mbe/types. */
  +export type ReservationEvent = SseEvent;
  ```
  One hunk (`@@ -6,26 +6,15 @@`), type declarations and a type-only import only;
  no emitter method, singleton, or call site changed.
- Result: PASS

### 4. Client derives subscription + invalidation; exhaustive switch — work item 5

- Check: hospitality suite (incl. "every catalog event is subscribed and handled",
  "per-event invalidation contract", "query-key pin").
- Evidence:
  ```
  pnpm --dir apps/hospitality test
   Test Files  181 passed (181)
        Tests  2532 passed (2532)
  exit=0
  ```
- Result: PASS

### 5. Drift probe A — deleting a name from the catalog is a type error

- Check: removed `hold:released` from `SsePayloadMap` and `SSE_EVENT_CATALOG`;
  `tsc --noEmit` in all three packages; reverted.
- Evidence:
  ```
  == A packages/types
  exit=0
  == A apps/hospitality
  src/components/dashboard/ActivityFeed.tsx(23,3): error TS2353: … '"hold:released"' does not exist in type 'Partial<Record<keyof SsePayloadMap, string>>'.
  src/hooks/useSSESync.tsx(240,14): error TS2678: Type '"hold:released"' is not comparable to type 'keyof SsePayloadMap'.
  exit=2
  == A services/reservations
  src/services/events.ts(98,7): error TS2820: Type '"hold:released"' is not assignable to type 'keyof SsePayloadMap'. Did you mean '"hold:created"'?
  exit=2
  ```
  Row-only deletion (map keeps the name) fails inside `@mbe/types` itself:
  ```
  == A2 packages/types
  src/sse-events.ts(59,12): error TS1360: Type '{ … }' does not satisfy the expected type '{ readonly "reservation:created": SseEventDefinition; … }'.
  ```
- Result: PASS

### 6. Drift probe B — adding a name without a client case is a type error

- Check: added `"probe:added": Table` to the map and `{ invalidates: [] }` to the
  catalog; `tsc --noEmit`; reverted.
- Evidence:
  ```
  +  "probe:added": Table;
  +  "probe:added": { invalidates: [] },
  == B packages/types
  == B apps/hospitality
  src/hooks/useSSESync.tsx(249,17): error TS2322: Type '"probe:added"' is not assignable to type 'never'.
  tree==HEAD
  ```
- Result: PASS

### 7. Per-name decisions recorded and applied (`venue:updated` deleted; `floor-plan:created` handled; uncalled names kept)

- Check: catalog contents (criterion 2), types test "does not contain
  venue:updated, which nothing emits" (passing in the 287), regression row for
  `floor-plan:created` (criterion 1); decisions in `defect.md` `assumptions:`.
- Evidence: `SSE_EVENT_CATALOG` has `"floor-plan:created": { invalidates: ["floorPlans", "floorPlan"] }`
  and keeps `reservation:updated`, `hold:created`, `hold:released`; no `venue:updated` key.
- Result: PASS

### 8. `guest:lapsing` invalidates `LAPSING_GUESTS_QUERY_KEY`; every other name keeps its current set

- Check: criterion 1 (RED on origin/main only for the two changed rows; all
  rows GREEN on the run).
- Evidence: see criterion 1 — `guest:lapsing invalidates exactly ["lapsingGuests"]`
  fails on origin/main (`expected [] …`), passes on the run; 8 other rows pass on both.
- Result: PASS

### 9. Query-key constants pinned to the catalog strings

- Check: `apps/hospitality/src/hooks/sse-query-keys.ts`
  (`SSE_INVALIDATION_QUERY_KEYS … as const satisfies readonly SseQueryKey[]`) plus
  the "query-key pin" test (in the 40/40).
- Result: PASS

### 10. Superseded shallow tests deleted without coverage regression — work item 6

- Check: not re-measured in Verify; relies on Implement's recorded coverage table
  (`useSSESync.tsx` 85.08% → 94.87% lines, unchanged after deleting the 3 old tests)
  and the passing suite here.
- Result: PASS (carried from Implement evidence; see Not verified)

### 11. Typecheck of the three packages — work item 7

- Evidence:
  ```
  == types        > tsc --noEmit   exit=0
  == reservations > tsc --noEmit   exit=0
  == hospitality  > tsc --noEmit   exit=0
  ```
- Result: PASS

### 12. Tests, lint, regen drift — work item 7

- Evidence:
  ```
  pnpm --dir services/reservations test
   Test Files  107 passed | 4 skipped (111)
        Tests  1702 passed | 150 skipped (1852)
  exit=0
  lint: types exit=0; reservations exit=0; hospitality ✖ 137 problems (0 errors, 137 warnings) exit=0
  pnpm regen --check
  All generated artifacts are up to date.
  regen exit=0
  ```
  Warnings on touched files vs origin/main (eslint per-file `warningCount`):
  ```
  src/hooks/useSSESync.tsx base=6 head=6
  src/hooks/useSSESync.test.tsx base=0 head=0
  src/components/dashboard/ActivityFeed.tsx base=0 head=0
  ```
  (`sse-query-keys.ts` is new and has 0.)
- Result: PASS

### 13. PR #6050 `CI Gate` green on head

- Check: `gh pr view 6050`, `gh pr checks 6050`, check-runs API on `fc4876224`.
- Evidence (while running):
  ```
  {"headRefOid":"fc487622485c99d8192c324102b2ed4b6fc70ecf","isDraft":true,"mergeStateStatus":"BLOCKED","state":"OPEN"}
  Build           pending
  Test (Node 22)  pending
  ```
  Evidence (after CI run `37259389971` completed):
  ```
  completed	success	success          # run status, run conclusion, CI Gate job
  CI Gate	completed	success	2026-10-05T03:43:38Z   # check-runs API on fc4876224
  CI Gate	success                                    # commit statuses API on fc4876224
     1 fail
    42 pass
     8 skipping
  Visual Regression (hospitality)	fail	2m27s	…/actions/runs/37259390013/job/111603222317
  ```
  The one failure, `Visual Regression (hospitality)` (advisory, not in `ci-gate`
  needs), is pre-existing on main: main's run `37230629542` (`fcd4be0a1`) fails
  the same assertion with the same unmocked request:
  ```
  main 37230629542:  +   "GET /api/v1/deposits?venueId=ven_e2e_001&date=2026-06-15",
  PR   37259390013:  +   "GET /api/v1/deposits?venueId=ven_e2e_001&date=2026-06-15",
  ```
- Result: PASS

## Failures

None.

## Not verified

- **CI Gate on the final head** — this artifact's own docs-only commit moves the
  PR head; Ship must confirm `CI Gate` there.
- **Coverage before/after for `useSSESync.tsx`** — not re-run; accepted from
  Implement's recorded table in `defect.md`.
- **Live behaviour in production** — not verifiable by this run: both
  `floor-plan:created` and `guest:lapsing` are emitted into the dead singleton
  (run #1 `reservation-transition-effects`' scope), so no event reaches a real
  client yet. The client is verified ready; delivery is run #1's to prove.
- **`/local-ci-precheck`** — not invocable by an agent (`disable-model-invocation`);
  its lanes (lint, typecheck, regen drift) were run individually above.
