# Dress Rehearsal — feasibility check + build plan

> **Status: future plan — unblocked, not yet filed.** Needs no venue history and no LLM key. Nothing here is filed as an issue; run `/decompose` on this file to start it. File references verified against `main` at `56fedb2c2`, 2026-10-18.

## Context

The hospitality product has no real venues, guests, or service history yet. An empty account is the worst first impression: every screen is blank until real guests book. Service Replay (needs history) and Snap Your Room (`docs/plans/2026-10-18-snap-your-room.md`, needs an LLM) are both blocked; Brand Match (`docs/plans/2026-10-18-brand-match.md`) is the other unblocked idea.

Dress Rehearsal: right after onboarding, the owner hits **"Run a Friday night"** and their _own_ floor plan comes alive with a simulated service at ~60x — bookings land on the timeline, parties are seated, tables cycle occupied → dirty → ready, a walk-in waits, a no-show frees a table. They watch their real room run on the product before a single real guest books. It ends on a summary card. Matt's favourite of the four ideas (2026-10-18).

## Verdict: feasible, client-side only, no migration

| Piece                                                                                                            | Exists?      | Where                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Floor plan view driven by props, incl. live statuses (`tableStatuses?: ReadonlyMap<string, TableDisplayStatus>`) | yes          | `apps/hospitality/src/components/floor-plan/FloorPlanCanvas.tsx:58`                                                         |
| Timeline view driven by props (`tables`, `reservations`, `date`, `seatedIds`, `emptyNight`)                      | yes          | `apps/hospitality/src/components/timeline/TimelineGrid.tsx:24-40`                                                           |
| "Quiet night" empty state on the timeline — natural home for the CTA                                             | yes          | `TimelineGrid` `emptyNight` prop (ux.md Screen 7)                                                                           |
| Status vocabulary + colour tokens                                                                                | yes          | `TableStatus` (`AVAILABLE \| OCCUPIED \| DIRTY \| READY`), `floor-plan/table-status.ts` (`TABLE_STATUS_COLOR_TOKEN`)        |
| Consumers to host rehearsal mode                                                                                 | yes          | `pages/TimelinePage.tsx`, `pages/FloorPlanEditorPage.tsx`                                                                   |
| Append-only occupancy log (for a later persisted rehearsal / Service Replay)                                     | yes          | `TableEvent` model (`fromStatus`, `toStatus`, `actorType`, `reservationId`) in `services/reservations/prisma/schema.prisma` |
| Simulation / demo mode of any kind                                                                               | **no** — new | only dev `prisma/seed.ts` files exist                                                                                       |

Because both views take plain props, the rehearsal never touches the API: a pure simulator produces events, a playback hook folds them into `tables` / `reservations` / `tableStatuses` at the current playback time, and the existing components render them.

## Approach

### 1. Pure seeded simulator — `apps/hospitality/src/components/rehearsal/simulate-service.ts`

`simulateService({ tables, openHour, closeHour, profile, seed }) → RehearsalEvent[]` (sorted by time). Deterministic for a given seed (seeded PRNG, no `Math.random`, no `Date.now`). Models:

- Arrival curve by profile (`friday`, `weeknight`, `brunch`) — bell-shaped peak around 19:30 for dinner.
- Party size distribution; assignment to the smallest free table whose `capacity`/`minCovers` fits.
- Turn time by party size (e.g. 2-top ~75 min, 6-top ~120 min) with jitter; bussing (`DIRTY`) ~8 min, then `READY` → `AVAILABLE`.
- Walk-ins that wait when full, a few no-shows (booked, never seated, table released after a grace period).

Event union: `booked | seated | status-change | walk-in-waiting | no-show | departed`. Unit-tested heavily: determinism, no table double-booked, capacity respected, every seated party leaves before close.

### 2. Pure reducer — `rehearsalStateAt(events, t)`

Returns `{ reservations, tableStatuses, seatedIds, waiting, metrics }` at simulated time `t`. Pure so it's trivially testable and reusable later for Service Replay (`replayStateAt` from the 2026-10-16 Service Replay idea is the same shape).

### 3. Playback hook — `useRehearsalPlayback(events)`

`requestAnimationFrame` clock with play / pause / speed (15x, 60x, 240x) / scrub; respects `prefers-reduced-motion` (step mode, no animated transitions). No state set inside `useEffect` bodies in rialto code (gotcha); this hook lives in hospitality.

### 4. Rehearsal mode in the views

- `TimelinePage` and the floor plan view get a rehearsal mode that swaps their data source for the playback hook's output. Read-only: no drag, no status change, no reservation click-through to real APIs.
- Persistent, unmistakable "Rehearsal — not real bookings" banner plus distinct visual treatment, so simulated data can never be mistaken for live service.
- Entry points: CTA in the timeline's empty-night state, onboarding's final (Launch) step, and a settings link.
- Strings in `en-US.json` / `fr-CA.json`.

### 5. Curtain-call summary

At close: covers served, average turn time, peak hour, tables that never sat, longest walk-in wait. All derived from `rehearsalStateAt(events, close).metrics`. "Run it again" (new seed) and "Try a weeknight" buttons.

### Later (out of scope v1)

- Persist a rehearsal as `TableEvent` rows flagged simulated (needs an `actorType: "simulation"` convention + exclusion from every metric/notification) — unlocks Service Replay on synthetic data.
- Simulate against the venue's real `operatingHours` and deposit policy.
- Shareable rehearsal recording for marketing.

## Risks

- **Simulated data leaking into real data, metrics, or guest notifications** — v1 is client-side only and never calls a write API, which removes this by construction. Pin it with a test that the rehearsal module imports no `@mbe/api-client` write method.
- **Implausible simulation looks fake** — tune profiles against published restaurant norms (turn times, peak curve); determinism makes tuning reviewable.
- **Performance at 240x on a large floor** — reducer is O(events); memoize by event index, cap at ~80 tables.

## Delivery

`/decompose` into ordered issues: (1) seeded PRNG + `simulateService`, (2) `rehearsalStateAt` reducer, (3) `useRehearsalPlayback`, (4) timeline rehearsal mode + banner, (5) floor plan rehearsal mode, (6) entry points (empty-night CTA, onboarding), (7) curtain-call summary, (8) E2E. Steps 1–4 alone are a shippable demo. TDD each.

## Verification

- Unit: simulator invariants across 1,000 seeds (no double-booking, capacity fits, all parties depart, deterministic output per seed); reducer snapshots at fixed times; playback hook with fake timers.
- Guard: rehearsal module never imports an api-client write method.
- E2E (hospitality Playwright): fresh venue → "Run a Friday night" → advance clock → tables show occupied on the floor plan and reservations on the timeline → summary card appears → real API received zero writes (route spy).
- Manual: run on a preview deploy with a real onboarded floor plan; check reduced-motion mode.
