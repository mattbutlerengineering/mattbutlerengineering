---
stage: architect
run: feature:dress-rehearsal
date: 2026-10-19
assumptions:
  - "Interview answered from prd.md, ux.md, idea.md, autorun-brief.md and docs/plans/2026-10-18-dress-rehearsal.md alone; no live user input."
  - "Plan file references re-verified against this worktree (3d78c6275, based on origin/main) rather than 56fedb2c2: FloorPlanCanvas, TimelineGrid, TimelineEmptyNight, TimelinePage, FloorPlanEditorPage, SettingsPage, table-status.ts and main.tsx all exist; line numbers in the plan are not relied on."
  - "ADR-027 exists in this worktree (same-zone batching under non-strict main, unrelated). ADR-028 (rialto localization through context) is active and unaffected: rehearsal strings use the app's react-i18next catalogs, not rialto's locale context. Next free ADR number is 029; none written because no decision passed the ADR bar."
  - "Route vs mode (UX deferred): a route, /rehearsal under DashboardLayout, with the run's profile and seed carried in navigation state. Recommended default; two-way door, so no ADR."
  - "Per-viewer dismissal storage for the onboarding Alert: localStorage key per venue, wrapped in try/catch, matching the app's existing localStorage use (VenueContext, SettingsPage, use-theme)."
  - "The 'no api-client write import' guard is a vitest allowlist test over rehearsal sources, not an ESLint rule (reasons under Decisions)."
  - "240x performance budget numbers (Interfaces: Performance budget) are set here; none were given upstream."
  - "Rehearsal hours are fixed per profile (friday 17:00-23:00, weeknight 17:00-22:00), not the venue's operatingHours, because real operating hours are out of scope in the PRD."
  - "TableDisplayStatus has no 'ready' value (available, seated, needs-bussing, reserved-soon). The simulator keeps the plan's occupied, dirty, ready, available cycle internally; the view model maps ready to available. UX Screen 2's 'ready' legend entry therefore cannot render as a distinct state; surfaced for Decompose and a UX amendment."
  - "Floor plan view shows one floor plan: the one the entry came from (floorPlanId in navigation state), else the active plan with the most active tables. Tables on other plans still simulate and appear in the Timeline. UX shows no floor-plan switcher and none is added."
  - "DST: simulated instants are venue-midnight plus minutes; on the two DST-change days a year this can drift by an hour. Accepted for a throwaway rehearsal."
---

# Architecture: Dress Rehearsal

## Approach

Client-side only, no migration, no API write. A pure, seeded simulator turns the venue's tables and a profile into a sorted list of events once per run. A pure reducer folds those events into the night's state at any simulated minute. A playback hook owns the clock and nothing else. A view-model adapter is the single place that turns the reducer's state into the shapes the existing `TimelineGrid` and `FloorPlanCanvas` already accept (`Reservation[]`, `tableStatuses`, `seatedIds`). The owner sees it through one `/rehearsal` route that hosts both views behind a segmented switch, one banner and one transport bar.

The shape that lost: a rehearsal "mode" inside `TimelinePage` and `FloorPlanEditorPage`, as the plan words it. That spreads a mode flag through two pages that each own data hooks, mutations and dialogs, so every write path would need a "not in rehearsal" guard and the no-write property would have to be proven across both pages. A separate route that never mounts those hooks removes the writes by construction and leaves exactly one place to guard.

The no-write property is therefore structural: the rehearsal route mounts no mutation hook and no timeline data hook; it reads the venue's tables and floor plan through two existing read hooks and nothing else. The guard test (below) pins that.

## Components

### `rehearsal/simulate-service.ts` (+ `prng.ts`, `profiles.ts`)

- Responsibility: `simulateService({ tables, openMinute, closeMinute, profile, seed }) -> RehearsalEvent[]`, sorted by `at`, deterministic per input. Owns the plausibility rules: arrival curve, party-size mix, smallest-fitting-table assignment, turn times, bussing, walk-in waiting, no-show grace. Owns the invariants: no table double-booked, party fits `minCovers`/capacity, every seated party departs before close.
- Collaborators: none. Policy; imports only its own `prng.ts` and `profiles.ts`. Its table input is a structural `RehearsalTable { id, name, capacity, minCovers, maxCovers }` that `@mbe/types` `Table` satisfies, so it imports no app, framework or `@mbe/types` runtime code.

### `rehearsal/rehearsal-state.ts`

- Responsibility: `rehearsalStateAt(events, minute) -> RehearsalState` and `rehearsalMetrics(events)`. The fold is the only definition of what is true at a time; curtain-call metrics derive from the same fold at close so the card cannot disagree with the screen.
- Collaborators: event types from `simulate-service.ts`.

### `rehearsal/rehearsal-view-model.ts`

- Responsibility: the one adapter to existing view props. Maps `RehearsalState` to `Reservation[]` (id `rehearsal-<seed>-<n>`, `guestName` set to a localized "Party of N" supplied by the caller's `t`, all guest, contact, user and venue ids null), `tableStatuses` (`seated`, `needs-bussing`, `available`; ready maps to available), `seatedIds`, and the waiting list. Converts minutes to ISO instants as `venueMidnight + minutes`, where `venueMidnight = now - minutesOfDayIn(now, tz)` minutes.
- Collaborators: `@mbe/types` (types only), `utils/service-day`.

### `rehearsal/use-rehearsal-playback.ts`

- Responsibility: the clock. Play, pause, speed (15, 60, 240), scrub, replay, and step mode. Holds the exact simulated minute in a ref; commits a quantized value (0.25 simulated minute) to React state. Exposes `{ minute, eventIndex, playing, speed, atEnd, play, pause, setSpeed, scrubTo, stepEvent(+1|-1), restart }`. Derives `eventIndex` by binary search over the sorted events; the state fold is memoized on `eventIndex`, so a commit that crosses no event re-renders the clock label only.
- Collaborators: `useMotionPreset()` from rialto providers (reduced motion), `requestAnimationFrame`. Lives in hospitality, not rialto.

### `rehearsal/RehearsalWorkspace.tsx` (+ `RehearsalBanner`, `TransportBar`, `CurtainCall`, `RightNow`)

- Responsibility: the screens in ux.md 1 to 4 and 7, composed from rialto components. Owns the single `aria-live` region and its throttle. Read-only: passes no click, drag or status handlers.
- Collaborators: `TimelineGrid`, `FloorPlanCanvas`, the playback hook, the view model, `useTranslation`.

### `pages/RehearsalPage.tsx`

- Responsibility: the route. Reads navigation state `{ profile, seed, floorPlanId? }`; with none (reload, direct URL) it redirects to `/timeline` with `replace`, which is how "reload ends the rehearsal" is kept without any UI. Loads tables and the floor plan through `useTables` and `useFloorPlans` (read hooks), runs the simulator in a memo, handles loading, no-tables and simulator-failure states, owns Run it again / Try a weeknight (navigate with a new seed and `replace`), and Leave (`navigate(-1)`, fallback `/timeline`).
- Collaborators: `RehearsalWorkspace`, `VenueContext`, `@mbe/sentry/react` for the failure report.

### Entry points (small edits to existing files)

- `TimelineEmptyNight` gets an optional `onRehearse`; the secondary "Run a Friday night" button renders only for the `today` variant and only when `onRehearse` is given. `TimelinePage` passes it when `tables.length > 0`.
- `FloorPlanEditorPage` renders the dismissible info `Alert` when `location.state.fromOnboarding` is true and the per-venue flag is unset. `VenueOnboardingPage` adds `state: { fromOnboarding: true }` to its existing `navigate(/floor-plans/<id>)` call.
- `SettingsPage` gets the Dress Rehearsal `Card` above the Venue card; button disabled with the "Add tables" caption and `Floor plans` link when the venue has no tables.
- Each entry builds `{ profile: "friday", seed: Date.now() >>> 0 }` at click time. Seed generation is the one impure step and it sits in the entry handler, never in the simulator.

### Read-only support in shared view components

- `TimelineGrid` gains `readOnly` (suppresses `TableStatusMenu`, keyboard row/col intents that open or act on a reservation, and passes `inert` to blocks) and `now?: Date` (replaces the internal `new Date()` for the now-line so the line tracks the simulated clock; also forces `isToday`). `ReservationBlock` gains `readOnly`: renders a `div` with the same visual and no `onClick`, not the `<button>` it renders today (verified: it always renders one).
- `FloorPlanCanvas` already has `readOnly`; the workspace passes a no-op `onTableSelect`, `onTableMove`. The editor's toolbar and sidebar are not mounted.

## Data model

No persisted entity. In-memory only, all plain data:

```ts
type RehearsalProfile = "friday" | "weeknight" | "brunch"; // brunch has no v1 control
interface RehearsalTable {
  id;
  name;
  capacity;
  minCovers;
  maxCovers: number | null;
}

type RehearsalEvent = { at: number /* whole minutes from venue midnight */ } & (
  | { kind: "booked"; partyId; size; tableId; startAt; endAt }
  | { kind: "seated"; partyId; tableId }
  | { kind: "status-change"; tableId; to: "dirty" | "ready" | "available" }
  | { kind: "walk-in-waiting"; partyId; size }
  | { kind: "no-show"; partyId; tableId }
  | { kind: "departed"; partyId; tableId }
);

interface RehearsalState {
  parties: ReadonlyMap<
    partyId,
    { size; tableId; phase: "booked" | "seated" | "finished" | "no-show" }
  >;
  tableCycle: ReadonlyMap<tableId, "available" | "occupied" | "dirty" | "ready">;
  waiting: readonly { partyId; size; sinceAt }[];
  counts: { booked; seated; covers; waiting };
  lastEvent: RehearsalEvent | null;
}
interface RehearsalMetrics {
  coversServed;
  avgTurnMinutes;
  peakHour;
  tablesNeverSat: tableId[];
  longestWalkInWaitMinutes: number | null;
}
```

Access patterns, which chose this shape: (1) once per run, produce the whole night from `(tables, profile, seed)`; (2) per commit, answer "what is true at minute m"; (3) per commit, find the last event at or before m (binary search); (4) once at close, derive metrics; (5) step to the previous or next event. A flat sorted event array serves all five; a per-table index would only help a query nobody makes. Whole-minute event times keep the model timezone-free and make a quantized clock sufficient.

Invariant ownership: the simulator owns the no-double-booking, capacity and depart-before-close invariants (it is the only producer of events). The reducer assumes them and owns none; `RehearsalState` is derived, never stored across runs. Consistency: everything is synchronous and in one tab; there is nothing to settle.

Event volume for sizing: about 80 tables, 2 to 3 turns each, roughly 6 events per party gives on the order of 1,500 events per night.

## Interfaces & contracts

### `simulateService`

- Input: tables, `openMinute < closeMinute`, profile, 32-bit integer seed.
- Output: events sorted by `at` (ties by a fixed kind order, so output is byte-stable), identical for identical input.
- Failure modes: throws `RangeError` for `closeMinute <= openMinute` or a non-integer seed (programmer errors). Zero or all-too-small tables returns `[]`, and the curtain call renders its "Not enough tables" copy; that is a result, not an error. Retry is safe (pure). Cost: under 50 ms for 80 tables (see budget).

### `rehearsalStateAt` / `rehearsalMetrics`

- Input: events from `simulateService`, a minute (clamped to `[0, close]`).
- Output: `RehearsalState` / `RehearsalMetrics`; same input, same output; never mutates `events`.
- Failure modes: none beyond malformed events, which cannot occur from the simulator. No defensive handling is added for them.

### `useRehearsalPlayback(events, { openMinute, closeMinute, reducedMotion })`

- Input as above; initial state paused at open (reduced motion) or playing at 60x (otherwise).
- Output: the controls and values listed under Components. `scrubTo` while playing pauses and resumes on release only if it was playing (the caller says when release happens). At `closeMinute` the clock stops, `atEnd` is true and the workspace opens the curtain call.
- Failure modes: a hidden tab throttles rAF; the clock advances by measured real elapsed time capped at 250 ms per frame, so returning to the tab never fast-forwards the night past events the owner did not see. Unmount cancels the frame. Reduced motion: no rAF; Play schedules one 1 s interval that advances 15 simulated minutes per tick with no transition (UX Flow 4).

### `/rehearsal` route

- Input: navigation state `{ profile: "friday" | "weeknight", seed: number, floorPlanId?: string }`, validated with a small Zod schema (the app uses Zod for URL params).
- Output: the workspace. Invalid or absent state redirects to `/timeline` (replace).
- Failure modes: tables loading shows the existing skeleton and the simulator never runs half-loaded; tables load error shows that surface's existing error; `simulateService` throwing shows UX Screen 7 and calls the `@mbe/sentry/react` reporter, with "Try again" using a fresh seed. No network call, so no timeout or retry semantics of its own beyond the two read hooks' existing ones.

### Performance budget (240x, about 80 tables)

The clock commits at most every 15 simulated seconds, which is 16 commits per real second at 240x, 4 at 60x, 1 at 15x. A commit that crosses no event re-renders only the clock label and the now-line. Numeric thresholds:

1. Compute (hard gate, vitest, `scripts`-free `performance.now()` loop): for an 80-table fixture over 20 seeds, `simulateService` at most 50 ms each; `rehearsalStateAt` plus view model at most 5 ms median and at most 20 ms p95 over 1,000 random minutes. Local reference is about 1 ms; the 20 ms bound is 4x CI-runner slack.
2. Render (measured, Playwright, 80-table fixture, 240x, 10 real seconds): median animation-frame interval at most 50 ms (20 fps or better) and no long task over 200 ms. Playwright runs on CI runners and the hospitality E2E job is advisory per the repo's gotchas, so this check reports and warns; item 1 is the merge gate.
3. If a commit takes longer than 50 ms, the playback hook halves its commit rate (floor 4 per second) and never skips an event: state is a pure function of the minute, so a coarser commit changes how often the screen refreshes, not what is true.

### Guard: no write path from the rehearsal

`rehearsal-imports.guard.test.ts` (in `apps/hospitality/src/components/rehearsal/`, same style as `lib/describe-api-error.guard.test.ts`) reads every source file under `components/rehearsal/` and `pages/RehearsalPage.tsx` and fails if:

- any import specifier (static, `export ... from`, or dynamic `import()`) is outside an explicit allowlist: relative imports inside the rehearsal folder; `react`, `react-dom`, `react-router`, `react-i18next`, `zod`; `@mattbutlerengineering/rialto` and its subpaths; `@mbe/types`; `@mbe/sentry/react`; `TimelineGrid`, `FloorPlanCanvas`, `TimelineEmptyNight` component modules; `contexts/VenueContext`; `hooks/useVenueFormat`, `hooks/useNow`, `hooks/useDocumentTitle`, `hooks/use-url-params`; `utils/service-day`, `utils/format`; and, by named import only, `useTables` from `hooks/useTables` and `useFloorPlans`/`useFloorPlan` from `hooks/useFloorPlans` (the latter module also exports `useCloneFloorPlan`, `useAddTable` and other mutation hooks, so a module-level allowlist would be a hole);
- any source mentions `@mbe/api-client`, `useApiClient`, `usePublicApiClient`, `createMutationHook`, `fetch(`, `XMLHttpRequest` or `sendBeacon`.

An allowlist is used because the property wanted is "can only read", and a blocklist of write hooks silently permits the next one added. The E2E route spy (below) is the dynamic backstop for anything the static check cannot see, such as a write reached through a shared component's own hook.

### Accessibility contracts carried from UX

Single polite live region, throttled to one announcement per 10 real seconds at 15x and 60x, none at 240x, one per step in reduced motion; curtain call is a labelled, focus-trapped modal that focuses its heading and ignores Escape; the canvas exposes `role="img"` with the Right now sentence. Implemented in `RehearsalWorkspace`; the throttle is a pure function (`shouldAnnounce(lastAt, nowMs, speed, reduced)`) so it is unit-testable without timers.

### Per-viewer dismissal of the onboarding Alert

- Input: `venueId`. Output: `[dismissed, dismiss]`. Key `rehearsal.onboardingAlert.dismissed.<venueId>`, value `"1"`.
- Failure modes: every `localStorage` read and write is in try/catch; on failure the Alert shows and dismissal lasts only for the mounted page. Nothing depends on it; Settings remains the durable entry. Per-browser, not per-account, which matches the UX ruling that it is a convenience.

## Stack & dependencies

- No new dependency. `mulberry32` is eight lines and lives in `prng.ts`; a PRNG library would add a dependency for a function we would still need to pin the output of.
- `react-konva`/`TimelineGrid` rendering reused unchanged apart from the two read-only props above.
- `react-i18next` catalogs `en-US.json` and `fr-CA.json` under `rehearsal.*` and `settings.rehearsal.*`; `mbe-local/no-literal-ui-strings` already covers `src/**` and applies. French needs whole sentences and `_one`/`_other` plurals per ux.md Copy.
- Tests: vitest (unit, determinism over 1,000 seeds, fixed-time snapshots, fake-timer playback, guard, perf), Playwright for the E2E and the 240x measurement. Hospitality E2E specs must be listed in the workflow (`workflow-coverage.test.ts`), so the new spec is added there too.

## Decisions & alternatives

- **A `/rehearsal` route** over a mode flag inside `TimelinePage`/`FloorPlanEditorPage` (the plan's wording) — the pages own mutation hooks and dialogs, so a flag needs a guard on every write path; a route that mounts none of them has no write path to guard, makes browser Back meaningful, and keeps one banner and one transport across both views. Costs a new route and the redirect-on-reload rule.
- **Navigation state, not URL params, carries profile and seed** over `?seed=..&profile=..` — a seed in the URL is a shareable recording, which the PRD puts out of scope, and a stale link would silently re-run a night. State also gives "reload ends the rehearsal" with a one-line redirect.
- **Commit quantum of 0.25 simulated minute** over committing every animation frame — state only changes at whole-minute events, so finer commits are wasted renders; this is what makes the 240x budget cheap (16 commits per second at most).
- **Guard as an allowlist vitest test** over an ESLint `no-restricted-imports` override — ESLint's rule expresses a blocklist only, cannot restrict named imports from a mixed module like `useFloorPlans`, and would duplicate the rule in two places; the test is also what the PRD names. A lint rule would give earlier editor feedback and was left out for that reason, a recorded cost.
- **Onboarding Alert dismissal in per-venue localStorage** over a server-side flag — a server flag is a write and a migration, both out of scope; the UX ruling already calls dismissal a per-viewer convenience.
- **Onboarding entry via `navigate` state `fromOnboarding`** over detecting "first visit" from venue data — there is no reliable first-visit signal before any reservation exists, and the state flag costs one line in the existing `navigate`.
- **View-model adapter as the only code that knows `Reservation`** over letting the simulator emit `Reservation` objects — the simulator stays framework-free and testable without `@mbe/types` fixtures with 20 required fields; guest name localization stays out of policy.
- **Fixed rehearsal hours per profile** over the venue's `operatingHours` — the PRD excludes real operating hours.
- **`TimelineGrid` takes `now`** over a rehearsal-only grid — the now-line is a real feature of the grid and tracking the simulated clock is what an owner expects; a fork of the grid would drift from the real one.
- **Seam note, no port:** the simulator and the playback hook each have one implementation, so no interface is introduced for either; the test double for the clock is fake timers on the real hook.

## ADRs

none — no decision met the ADR bar. Each is a two-way door undone by a revert (the route, the guard style, the storage key) and none is surprising without context once the plan is read.

## Requirement traceability

| PRD item                                                 | Where                                                                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Determinism; 1,000-seed invariants; fixed-time snapshots | `simulate-service.ts`, `rehearsal-state.ts` unit tests                                                       |
| Playback play/pause/speed/scrub under fake timers        | `use-rehearsal-playback.ts` tests                                                                            |
| Guard: no api-client write import                        | `rehearsal-imports.guard.test.ts` plus E2E route spy                                                         |
| E2E fresh venue to curtain call with zero writes         | Playwright spec using route spy, listed in workflow                                                          |
| Summary metrics consistent with events                   | `rehearsalMetrics` unit test; card reads the same fold                                                       |
| Banner, distinct treatment, read-only                    | `RehearsalBanner`, `readOnly` on `TimelineGrid`/`ReservationBlock`/`FloorPlanCanvas`; component and E2E test |
| Entry points (empty night, onboarding end, settings)     | Entry points section                                                                                         |
| en-US and fr-CA completeness                             | catalogs, existing completeness check                                                                        |
| Reduced motion                                           | `useMotionPreset` in playback hook; step mode; manual check on preview deploy                                |
| 240x on about 80 tables                                  | Performance budget                                                                                           |
| lint, typecheck, test pass                               | standard gates                                                                                               |

## Surfaced for Decompose and later stages

- `ReservationBlock` always renders a `<button>`, so the `readOnly` change touches a shared, memoized component with its own style-identity tests (`TimelineGrid.styleIdentity.test.tsx`, `reservationStyleStability`); the change must keep them green.
- UX Screen 2 lists a "ready" status the existing `TableDisplayStatus` cannot show; either amend the UX or extend the shared type (out of this run's no-migration spirit but not a migration).
- UX Screen 7 says failures go to the error tracker; `@mbe/sentry/react` is the app's tracker and is on the guard allowlist.
- `DashboardLayout` redirect behavior for venues in setup mode was not read in depth; confirm `/rehearsal` is reachable for an onboarded venue with no reservations.
