---
stage: capture
run: maintenance:sse-event-catalog
date: 2026-10-04
re-entry: implement
origin: "/idea-to-prod:deepen review at fcd4be0a1 (2026-10-04), candidate #2 — no tracker issue, no backlog seed"
assumptions:
  - "venue:updated is DELETED (brief default: delete names nothing emits). Zero emitters in services/, infrastructure/, packages/; it is not in the server union either."
  - "floor-plan:created is HANDLED client-side (brief default: handle names the server emits), invalidating the floor-plans query keys (FLOOR_PLANS_QUERY_KEY, FLOOR_PLAN_QUERY_KEY) and subscribed in the EventSource list."
  - "reservation:updated, hold:created, hold:released are KEPT in the catalog, not deleted. They are in the server union with emitter methods on ReservationEventEmitter but no callers. The brief's 'delete names nothing emits' default conflicts with its explicit Out-of-scope clause (do not touch the emitter wiring in services/reservations/src/services/events.ts — that is run #1 reservation-transition-effects, running in parallel and likely to wire reservation:updated). The scope clause is the more specific instruction, so it wins. The catalog is therefore the SERVER's declared vocabulary, and the coverage test asserts every catalog name is handled client-side."
  - "guest:lapsing gains invalidation of LAPSING_GUESTS_QUERY_KEY. The brief names the missing invalidation as part of the condition and 'derived invalidation' as in scope; recorded here as the one deliberate client behaviour change besides floor-plan:created."
  - "Every other event keeps its CURRENT invalidation set exactly (reservation:created/updated/cancelled + hold:confirmed -> reservations; table:updated -> tables; hold:created, hold:released, table-status:changed -> none). The refactor must not silently change these."
  - "Catalog rows carry invalidation keys as string literals equal to the client's existing `as const` *_QUERY_KEY values ('reservations', 'tables', 'floorPlans', 'floorPlan', 'lapsingGuests'); a client test pins the equality. @mbe/types does not import from apps/hospitality. Implementer may choose a different mechanism if it keeps drift a type error and the dependency direction intact — log it in Notes."
---

# Condition: SSE event vocabulary is declared on both sides of the seam and has drifted

## Defect (or Condition)

**Degraded, not broken.** The names of server-sent events between
`services/reservations` and `apps/hospitality` are declared independently in
several places with no shared source, and the lists have drifted: the client
handles a name nothing emits, ignores a name the server does emit, and the
cache invalidation each event triggers is hand-written per `case`, so
`guest:lapsing` refreshes nothing. Adding live refresh for a new feature today
means editing 3–4 lists on two sides of the seam and remembering to.

**Target state that ends the run:** one catalog in `@mbe/types` mapping event
name → payload type → query keys to invalidate, imported by the server
emitter's types and by `useSSESync`. The client subscription list, the
handler's invalidation, and the event type unions are all derived from it.
Drift becomes a type error or a failing test; live refresh for a new event is
one catalog row.

## Reproduction / Evidence

Re-verified against the worktree at `b6c7e7176` (base `origin/main`
`2653312ff`), read-only, on 2026-10-04.

1. **Server union** — `services/reservations/src/services/events.ts:11-21`:
   10 names including `"floor-plan:created"` (`:19`); payload union at `:27`
   includes `FloorPlan`. _Brief claim confirmed, lines unchanged._
2. **Client union** — `apps/hospitality/src/hooks/useSSESync.tsx:57-67`:
   10 names including `"venue:updated"` (`:66`) and lacking
   `floor-plan:created`; payload union at `:73` lacks `FloorPlan`.
   _Confirmed._
3. **Client subscription list** — `useSSESync.tsx:105-116`
   (`SSE_EVENT_TYPES`, passed to the SSE client at `:337`). _Brief said
   `:103-114`; moved by 2 lines._
4. **Client handler switch** — `useSSESync.tsx:229-316`; the
   `venue:updated` case is at `:311-315`. _Brief said the switch is at
   `:295-299` — moved; the switch spans `:229-316`. Brief's `:230-314`
   range for the invalidation code is correct within ±2._ Only
   `RESERVATIONS_QUERY_KEY`, `TABLES_QUERY_KEY`, `VENUES_QUERY_KEY` are ever
   invalidated.
5. **`venue:updated` has zero emitters** — `grep -rn "venue:updated"
services infrastructure packages` (excluding node_modules/dist/llms)
   returns nothing. Its only other appearance is the client test
   `apps/hospitality/src/hooks/useSSESync.test.tsx:318-326` ("invalidates
   venues query on venue:updated"). _Confirmed._
6. **`floor-plan:created` emitted but not handled** — emitted via
   `services/reservations/src/services/floor-plan.ts:14` →
   `emitFloorPlanCreated` (singleton helper, `events.ts:202-204`, into the
   module singleton `events.ts:169` — the dead-singleton problem is run #1's
   scope). No client `case`, not in `SSE_EVENT_TYPES`. _Confirmed._
7. **Declared and handled, never emitted** — `reservation:updated`,
   `hold:created`, `hold:released`: emitter methods exist on
   `ReservationEventEmitter` (`events.ts:80,98,107`) and singleton helpers
   (`events.ts:178-192`), but no non-test caller of either form exists in
   `services/` (route callers are only `emitReservationCreated`,
   `emitReservationCancelled`, `emitTableUpdated` in
   `routes/reservations.ts:296,298,589` and `routes/tables.ts:395`).
   Client handles all three (`useSSESync.tsx:246, 269, 275`).
   _Confirmed._
8. **`guest:lapsing` does not invalidate lapsing guests** — handler at
   `useSSESync.tsx:295-300` only forwards to feed listeners.
   `LAPSING_GUESTS_QUERY_KEY` is declared at
   `apps/hospitality/src/hooks/useGuests.ts:8`. _Brief cited `:109`, which
   is `useSendWinBack`'s mutation `invalidateKeys` — the key's use, not its
   declaration; the substantive claim is true._

**Additional vocabulary copies found during verification (not in the brief):**

9. `apps/hospitality/src/components/dashboard/ActivityFeed.tsx:18-26` —
   `EVENT_LABELS: Record<string, string>`, a fifth hand-kept list (7 names;
   falls back to the raw type string at `:29`). Typed `Record<string, …>`,
   so it cannot drift-fail. It is a display concern; whether it is keyed by
   the catalog's name type is an implementer call (prefer
   `Partial<Record<SseEventName, string>>` so a removed name is a type
   error).
10. `services/reservations/src/routes/events.ts:43-48` —
    `RESERVATION_TRANSITION_EVENT_TYPES`, a server-side subset filter typed
    against `ReservationEvent["type"]`. It is a behaviour filter, not a
    vocabulary copy, and is already type-checked against the union; it
    follows the catalog automatically once the union is derived. Leave it.

**No reproducing failing test exists today** — reproduction is work item 1
(the coverage test fails on current code).

## Root-cause hypothesis

_Hypothesis:_ the SSE contract was never lifted into `@mbe/types` when the
client was built, so each side copied the vocabulary at a point in time and
evolved it independently (`venue:updated` added client-side for the venue
switcher with no server work; `floor-plan:created` added server-side with no
client work). Nothing compiles across the seam, so nothing noticed.

## Blast radius

- **Users:** hospitality dashboard staff. Live refresh is wrong in two
  places: a floor plan created in another session never appears without a
  reload; the lapsing-guests list never refreshes on a lapse scan. Note both
  server emissions currently go to the dead singleton (run #1), so in
  production neither event reaches clients yet — this run makes the client
  ready; run #1 makes the server deliver.
- **Developers/agents:** every new real-time feature pays the multi-list
  tax and can silently miss one (the live-demo-venue feature, paused, is a
  known next consumer).
- **Severity:** low (degraded). No data loss, no security surface, no
  migration. Since: whenever each side first diverged — not dated.
- **Touches:** `packages/types` (new export → llms regen, possibly
  `generated-schemas` if schemas are added — prefer plain types),
  `apps/hospitality` hooks + ActivityFeed, `services/reservations`
  `services/events.ts` type declarations only.

## Ruled out

- **Fixing where events are emitted** (the dead singleton, never-called
  emitter methods) — out of scope; that is run #1
  `reservation-transition-effects`. Do not change emitter wiring.
- **Work already in flight:** checked `gh pr list --state open` (18 open
  PRs on 2026-10-04) and local/remote branches matching `sse|event` — no
  open PR does this. Old branches (`fix/4216-sse-delta-cache-collapse`,
  `fix/3102-sse-ownership-guard`, etc.) have no open PR and address other
  defects. Sibling run #1 is expected and disjoint by scope. Outcome:
  **nothing matches; check ran.**
- **ADR conflicts:** none identified. Active ADRs in `docs/adr/`; ADR-004
  and ADR-006 are superseded. ADR-024 (date-value vocabulary) is the nearest
  precedent for a shared vocabulary in `@mbe/types` and supports this shape.

## Work items

Ordering is mandatory (deepening test discipline): new interface-level tests
first, against today's code; then deepen; then delete the old shallow tests
last, in the same change, stating in the diff which coverage moved where.
Setup in a fresh worktree: `pnpm install --frozen-lockfile` and
`pnpm build --filter @mbe/cli...`.

- [ ] **1. RED: catalog coverage test** — in `packages/types`, add a test
      for the (not-yet-existing) catalog export asserting it contains exactly
      the server's 10 declared names and NOT `venue:updated`; in
      `apps/hospitality`, add a test that drives `useSSESync` with every
      catalog name and asserts each is subscribed (present in the list passed
      to the SSE client) and handled (no unhandled-case fall-through).
  - Accept: both tests exist and fail on current code for the right reason
    (missing export / `floor-plan:created` not subscribed); failure output
    recorded in the commit or Notes.
- [ ] **2. RED: invalidation contract test** — in `useSSESync.test.tsx`,
      a table-driven test asserting, per event name, the exact set of query
      keys invalidated: `floor-plan:created` → floor-plan keys;
      `guest:lapsing` → `lapsingGuests`; every other name → its current set
      (see `assumptions`).
  - Accept: test fails on current code only for `floor-plan:created` and
    `guest:lapsing` rows; all other rows pass against today's code (proves
    the refactor preserves them).
- [ ] **3. GREEN: add the catalog to `@mbe/types`** — one module (e.g.
      `packages/types/src/sse-events.ts`, exported from the index) defining
      each event's name, payload type, and invalidation keys; export the
      derived name union, payload map, and `ReservationEvent` shape.
  - Accept: item 1's types test passes; `pnpm --dir packages/types
typecheck` and `test` green; llms artifacts regenerated
    (`pnpm regen`).
- [ ] **4. GREEN: server consumes the catalog types** — replace the
      hand-written union and `ReservationEvent` in
      `services/reservations/src/services/events.ts:11-28` with imports /
      re-exports from `@mbe/types`. No change to emitter methods, singleton,
      or call sites.
  - Accept: diff to that file is type declarations only; reservations
    `typecheck` + `test` green; `RESERVATION_TRANSITION_EVENT_TYPES` still
    compiles unchanged.
- [ ] **5. GREEN: client derives subscription + invalidation** —
      `useSSESync.tsx` imports the name union and payload types; the
      subscription list is derived from the catalog; query invalidation runs
      from the catalog row (generic, before the per-type switch); the switch
      keeps only feed-forwarding and toasts and is made exhaustive (a
      `never` check) so a new catalog name without a case is a type error;
      delete the `venue:updated` case; add `floor-plan:created`. Pin the
      `*_QUERY_KEY` constants to the catalog's strings with a test or a
      `satisfies` check. Key `ActivityFeed`'s `EVENT_LABELS` by the catalog
      name type.
  - Accept: items 1 and 2 pass; hospitality `typecheck`, `lint`, `test`
    green; deleting a name from the catalog produces a type error in
    `useSSESync.tsx` (demonstrate once, note in Notes).
- [ ] **6. Delete superseded shallow tests** — remove the old per-event
      invalidation tests (incl. `useSSESync.test.tsx:318` "invalidates venues
      query on venue:updated") now covered by item 2's table; state in the
      commit message which old test moved to which new row.
  - Accept: no coverage regression on `useSSESync.tsx` (compare
    `test:coverage` before/after for that file); commit message lists the
    moves.
- [ ] **7. Gates** — `pnpm typecheck`, `pnpm lint`, `pnpm test` for the
      three touched packages; `pnpm regen --check` clean; `/local-ci-precheck`.
  - Accept: all green locally before PR.

## Notes

- Release authorization (Matt, 2026-10-04) per `autorun-brief.md`: PR +
  squash-merge after `reviewer` pass and green `CI Gate`; stop on secrets or
  non-additive migrations (neither expected).
- Sequencing: runs in parallel with #1 `reservation-transition-effects`.
  Both touch `services/reservations/src/services/events.ts` (this run: types
  at the top; #1: emitter wiring). Rebase on `origin/main` before the PR and
  expect a small textual conflict there if #1 lands first.
