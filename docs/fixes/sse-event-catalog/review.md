---
stage: review
run: maintenance:sse-event-catalog
date: 2026-10-04
reviewed-head: 1f75f7788
base: origin/main (merge-base 2653312ff)
reviewer-gate: "reviewer subagent — PASS, 9/10, 0 issues (one non-blocking nit, fixed here)"
assumptions:
  - "No architecture.md (maintenance run). Design pass judged against defect.md's target state, its frontmatter decisions, and the codebase's existing patterns, per the protocol's run-scale rule."
  - "No docs/standards.json in this repo; no standards slugs cited (skill default: proceed without)."
  - "Scale: light pass per the maintenance-run rule. The regression test from Verify is the floor; criteria Verify already proved (RED on origin/main, drift probes, gates, CI Gate on fc4876224) are not re-run."
  - "Fixing a non-critical finding in Review is allowed by the stage instructions; the VenueContext comment fix is comment-only, so no RED test applies (no behaviour to pin)."
---

# Review: SSE event vocabulary collapsed into one shared catalog

## Scope

`git diff origin/main...HEAD` on `refactor/sse-event-catalog` (PR #6050, draft), commits
`ad6f93891`..`1f75f7788`. Source examined line by line:

- `packages/types/src/sse-events.ts` (new), `sse-events.test.ts` (new), `index.ts` (exports)
- `services/reservations/src/services/events.ts` (type aliases only)
- `apps/hospitality/src/hooks/useSSESync.tsx`, `useSSESync.test.tsx`, `sse-query-keys.ts` (new)
- `apps/hospitality/src/components/dashboard/ActivityFeed.tsx`
- llms artifacts (root, `apps/hospitality`, `packages/types`, `services/reservations`) — consistency only

Also read, for context: `apps/hospitality/src/lib/sse-client.ts` (event filter),
`useFloorPlans.ts`, `useGuests.ts`, `FloorPlanEditorPage.tsx`, `VenueContext.tsx`,
`services/reservations/src/routes/events.ts`.

### Key questions from the stage brief

| Question                                  | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Is the catalog the single source?         | **Yes, for code.** Grep of `apps/ services/ packages/ infrastructure/ tools/` for every event-name literal (excl. node_modules/dist/llms): the remaining hits are emitter call sites (`events.ts` emit methods), tests, the catalog itself, `ActivityFeed`'s labels (now `Partial<Record<SseEventName, …>>`, drift-checked), and `routes/events.ts` `RESERVATION_TRANSITION_EVENT_TYPES` (a typed behaviour subset defect.md says to leave). No untyped name list remains. Prose copies remain in `apps/hospitality/docs/ARCHITECTURE.md` and `services/reservations/CLAUDE.md` (minor finding 3). `venue:updated` appears nowhere except the negative test. |
| Is `events.ts` emitter wiring untouched?  | **Yes.** One hunk: type-only import of `SseEvent`/`SseEventName` plus two aliases replacing the hand-written union/interface. No emitter method, singleton, or call site changed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `floor-plan:created` in the activity feed | Sensible. It renders "Floor plan created" (new label). `ActivityFeed` is currently exported but not rendered by any page (only `BriefingPage` consumes the feed, with `maxItems: 0`), so the user-visible effect today is nil. Invalidation of `floorPlans` is right; `floorPlan` is over-broad (minor finding 1).                                                                                                                                                                                                                                                                                                                                           |
| `guest:lapsing` invalidation              | Correct. `useLapsingGuests` keys on `["lapsingGuests", { venueId }]`; invalidating the `["lapsingGuests"]` prefix refreshes `HomePage`'s lapsing list. Emitted by the lapsed-guest cron via the singleton, which is run #1's delivery problem, not this run's.                                                                                                                                                                                                                                                                                                                                                                                               |
| Is the loose `SseEvent` envelope a hole?  | **Yes, a real but out-of-scope gap** (minor finding 2). Measured, see below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Test quality                              | Good. Verify proved the new tests fail on origin/main code for exactly the two changed rows plus the unsubscribed name, while the other 8 invalidation rows pass on both — the strongest possible proof that the refactor preserves them. The `never` exhaustiveness check and the `satisfies` mapped type make drift a compile error in both directions (Verify drift probes A/B).                                                                                                                                                                                                                                                                          |
| llms regen consistency                    | Consistent: llms diffs cover exactly the three touched packages plus the root; Verify recorded `pnpm regen --check` exit 0 on `fc4876224`. Re-checked after this stage's commit (see Verdict).                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ADR compliance                            | `node tools/cli/dist/index.js check-adr` → `Checking codebase against 1 active ADRs... ✅ No architectural violations detected.` Shape follows ADR-024's precedent (shared vocabulary in `@mbe/types`, app keeps its own constants, no app→package import).                                                                                                                                                                                                                                                                                                                                                                                                  |

## Findings

No critical or major findings.

### Minor 1: `floor-plan:created` invalidates every single-floor-plan query (`floorPlan`) though a new plan cannot be in any of them

- Scenario: staff A has the floor-plan editor open on plan P (`useFloorPlan(P)` → `["floorPlan", P]`); staff B creates or clones plan Q. On `floor-plan:created`, A's client refetches P. P's server data is unchanged, so TanStack Query's default structural sharing keeps the same `floorPlan` reference and `FloorPlanEditorPage`'s `[floorPlan]` sync effect does not fire — A's unsaved drag edits are not clobbered. Net cost: one redundant `GET /floor-plans/P` per creation. No wrong behaviour.
- Standard: none
- Decision: deferred — harmless (verified the editor sync path above), not live in production until run #1 delivers events, and the two-key set was an explicit Capture decision in `defect.md` `assumptions:`. Ship may carry a one-line backlog seed: "narrow `floor-plan:created` to `["floorPlans"]`".

### Minor 2: `SseEvent` is a loose envelope — `type` and `data` are not correlated, so the catalog's payload column is not enforced on the wire type

- Scenario: `SseEvent.data` is `SsePayloadMap[SseEventName]` (the union of all payloads). An emitter can build `{ type: "guest:lapsing", data: someReservation }` and it typechecks; the client still casts `event.data as Reservation` in its toast cases. The catalog's target state is "name → payload type", and the payload map exists, but nothing ties a given `type` to its `data` at the envelope.
- Measured: temporarily replacing `SseEvent` with the discriminated union `{ [K in SseEventName]: { type: K; …; data: SsePayloadMap[K] } }[SseEventName]` (reverted, tree verified == HEAD) yields 3 type errors: `services/reservations/src/routes/events.ts:197` (the transition re-emit path — run #1's territory), `services/reservations/src/services/sse-connection.test.ts:43`, and `apps/hospitality/src/hooks/useSSESync.tsx:187` (`makeEvent`'s generic signature). So closing it touches run #1's file.
- Standard: none
- Decision: deferred — out of scope by the brief's explicit Out clause and recorded as a deliberate choice in `defect.md` `assumptions:` (Implement). Recommend a follow-up after run #1 merges: make `SseEvent` the discriminated union and make `makeEvent`/emitters generic over `K`. Ship should seed it in `docs/backlog.md`.

### Minor 3: prose docs still carry hand-kept event lists

- Scenario: `apps/hospitality/docs/ARCHITECTURE.md:120-126,230-236` and `services/reservations/CLAUDE.md:410-424` list a 7-name subset of the vocabulary (no `floor-plan:created`, `guest:lapsing`, `table-status:changed`). An agent reading them gets an incomplete vocabulary and no pointer to the catalog. Pre-existing; this run neither added nor worsened them, but they are now the only untyped copies left.
- Standard: none
- Decision: deferred — docs-only, outside the defect's code scope; Ship may seed "point SSE docs at `SSE_EVENT_CATALOG`" or fold into run #1's docs.

### Minor 4 (fixed): stale comment claimed SSE invalidates the venue list

- Scenario: `apps/hospitality/src/contexts/VenueContext.tsx:54-56` said "SSE venue mutations and the useUpdateVenue mutation both invalidate VENUES_QUERY_KEY". With `venue:updated` deleted (it never fired) that is false and would mislead the next reader into expecting live venue refresh. Raised by the `reviewer` gate as a non-blocking nit.
- Standard: none
- Decision: fixed in this stage's commit — comment-only rewrite stating that only `useUpdateVenue` invalidates venues and no SSE event does.

## Reviewer gate

`reviewer` subagent on PR #6050's diff vs `defect.md` acceptance criteria: **PASS, score 9/10, 0 issues.**
It compared every old per-event handler with its catalog row (all 8 unchanged rows preserved, toasts unchanged, only the two intended changes), found no remaining hand-kept name list, re-ran hospitality `useSSESync` + `ActivityFeed` tests (50/50), types `sse-events` tests (5/5) and hospitality `tsc --noEmit` (clean), and found no gate bypass. The one point deducted was the `VenueContext` comment nit (Minor 4, now fixed).

## Passes with no findings

- **Correctness** — clean apart from Minor 1 (inefficiency, not wrong behaviour). The `SSE_EVENT_CATALOG[eventType]` lookup cannot hit an unknown name: `SseClient` drops any event not in `eventTypes` (`sse-client.ts:116`) before `onEvent`, and `eventTypes` is `SSE_EVENT_NAMES`. Invalidate-then-forward-then-toast ordering matches the old per-case order.
- **Design** — clean apart from Minor 2 (deferred by scope) and Minor 3. Dependency direction preserved (`@mbe/types` imports nothing from apps); server/client keep their exported alias names so no importer churn; query-key pin lives in its own module to avoid a react-refresh lint warning (documented).
- **Security** — clean. No new input boundary: event payloads are parsed by the existing `SseClient`, the change only narrows which names are subscribed; no secrets, no injection surface, no error text added.

## Verdict

**Ready to ship. No unfixed critical.** Three minors deferred with reasons (1: harmless over-invalidation; 2: discriminated envelope, blocked on run #1's file; 3: prose docs), one minor fixed. Ship must re-read `CI Gate` on the final head (this stage's commit moves it) and should seed Minors 1–3 in `docs/backlog.md`.
