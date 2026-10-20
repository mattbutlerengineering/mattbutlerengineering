---
stage: ux-design
run: feature:dress-rehearsal
date: 2026-10-19
assumptions:
  - "Interview answered from prd.md, idea.md, autorun-brief.md and docs/plans/2026-10-18-dress-rehearsal.md alone; no live user input. Sketches are unconfirmed."
  - "Settings entry point (PRD open question): a new Card 'Dress Rehearsal' on SettingsPage (same Card pattern as Appearance / Notifications / Venue), one sentence plus a 'Run a Friday night' button, placed directly above the Venue card. Recommended default: reuse the existing Card, no new settings section or nav item."
  - "Profiles (PRD open question): v1 exposes exactly two profiles in the UI, Friday (default, every entry point) and weeknight (only via 'Try a weeknight' on the curtain call). The brunch profile exists in the simulator but has no v1 control. After a weeknight run the same slot reads 'Try a Friday night', so the two toggle. No profile picker anywhere."
  - "Start has no setup dialog: one click starts a Friday run with a fresh seed. Seed is never shown to the owner; 'Run it again' always picks a new seed."
  - "Where rehearsal lives: one rehearsal workspace (a single surface with a Timeline / Floor plan segmented switch sharing one playback bar and one banner), entered from every entry point. The plan says 'TimelinePage and the floor plan view get a rehearsal mode'; whether that is a route, a mode flag or an overlay is Architect's call. UX requires only: both views reachable without losing playback position, one banner, one transport."
  - "Onboarding entry point: Launch's celebration is unchanged (it auto-navigates to the new floor plan per the venue-onboarding-floor-plan ruling). The entry is a dismissible Alert on the floor-plan editor the owner lands on, 'Your room is ready. Watch a Friday night run on it.' with a 'Run a Friday night' button. Dismissal is a per-viewer convenience, not required state."
  - "Reduced motion: playback does NOT auto-start and never tweens. Controls become 'Previous event' / 'Next event' step buttons; scrub moves in whole events; changes are instant. Under normal motion, playback starts automatically at 60x."
  - "Screen-reader strategy: Konva canvas is not exposed; the timeline plus a text 'Right now' summary is the accessible equivalent. A polite live region announces at most once per 10 real seconds and never at 240x."
  - "Leaving a rehearsal needs no confirmation (nothing is saved, nothing is lost). Reload ends the rehearsal; this is stated nowhere in UI."
  - "Simulated guests are named 'Party of N' only, never fake personal names, so a simulated row can never be mistaken for a real guest."
  - "Strings use sentence case; 'Launch Venue' Title Case contract untouched."
---

# UX: Dress Rehearsal

Actor: the new venue owner, after onboarding, before any real guest has booked. Never a host or guest.

## Flows

### Flow 1 — Empty night to curtain call (primary)

1. Owner opens the Timeline on a venue with tables and no reservations. The empty-night state (hospitality-service-ux Screen 7) shows its "Quiet so far." message, with a second action: **Run a Friday night**.
2. Owner clicks it. The rehearsal workspace opens at the venue's opening time, tables all available, banner already up. Playback starts at 60x (reduced motion: paused, see Flow 4).
3. Owner watches the Timeline (default view): reservation blocks appear, seat, finish. A walk-in appears in the Waiting strip, later gets seated; one booking is marked no-show and its table frees.
4. Owner switches to Floor plan: their own tables colour by status (occupied, dirty, ready, available). Playback position is unchanged.
5. Owner pauses, scrubs back to 7:30 PM, changes speed to 240x to skip ahead.
6. At close the clock stops and the Curtain call card opens over the workspace.
7. Owner chooses **Run it again** (new seed, Friday), **Try a weeknight** (new seed, weeknight), or **Leave rehearsal** (returns to where they came from).

### Flow 2 — Other entry points

- **Settings:** Settings, Dress Rehearsal card, **Run a Friday night**, then step 2 above.
- **Onboarding end:** Launch completes, owner lands on the new floor plan, info Alert offers **Run a Friday night**. Dismissing the Alert hides it for that viewer; Settings remains.
- **No tables:** every entry point is replaced by its disabled/explained form (see Screen 6).

### Flow 3 — Leaving mid-run

Owner clicks **Leave rehearsal** (always visible in the banner) or uses browser back. Returns to the entry surface. No dialog, no toast. Real data is exactly as before.

### Flow 4 — Reduced motion

1. Owner with `prefers-reduced-motion` opens the rehearsal. Workspace opens paused at opening time; a one-line hint reads "Motion is reduced. Step through the night with Next event."
2. **Next event** advances to the next simulated event (a booking, seating, status change, walk-in, no-show, departure); the changed table/block updates instantly and the "Right now" line states what changed.
3. **Previous event** steps back. Scrub moves by whole events. Speed control is hidden; **Play** remains available and, if used, advances in 15-simulated-minute jumps once per real second with no transitions (a deliberate, user-initiated choice).
4. Curtain call is identical.

### Flow 5 — Keyboard / screen reader

1. Tab order: banner Leave button, view switch, transport (play/pause, speed, scrub), the view, Right now summary.
2. Space on the transport toggles play/pause; Left/Right on the scrub slider moves one event (Shift: one hour); speed is a SegmentedControl (arrow keys).
3. Polite announcements as described under Copy. At the curtain call, focus moves to the card heading; Escape does not dismiss it (use **Leave rehearsal**), so focus is never lost.

## Screens

### Screen 1 — Rehearsal workspace, Timeline view, 7:45 PM, 60x

```
┌─ REHEARSAL ─ Rehearsal, not real bookings. Nothing here is saved. ─ [Leave rehearsal] ┐
│  (dashed gold rule + diagonal hatch band, full width, sticky, cannot be dismissed)    │
├───────────────────────────────────────────────────────────────────────────────────────┤
│ [ Timeline | Floor plan ]                          Friday night · 7:45 PM             │
│ Booked 22   Seated 9   Covers 31   Waiting 1                                          │
│ ┌──────────┬────────────────────────────────────────────────────────────────────┐    │
│ │ Tables   │  6 PM  │  7 PM  │ 8 PM ┃ 9 PM  │  10 PM │  11 PM                    │    │
│ │ Table 1  │        [Party of 2 ▪ seated ]                                      │    │
│ │ Table 2  │   [Party of 4 ▪ seated      ]      [Party of 4 · booked]           │    │
│ │ Table 3  │                 [Party of 6 · no-show]                             │    │
│ └──────────┴────────────────────────────────────────────────────────────────────┘    │
│ Waiting: Party of 4 · 12 min                                                          │
├───────────────────────────────────────────────────────────────────────────────────────┤
│ [⏸ Pause]  [15x | 60x | 240x]  ──────●────────────────────────  6 PM ... 11 PM       │
│ Right now: 9 tables occupied, 1 party waiting.                                        │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

- Purpose: watch the owner's own night run on the real timeline component.
- Non-real treatment (all views, all states): (1) the sticky banner above, a persistent, non-dismissible `Alert`-style strip with a "Rehearsal" `Tag`; (2) the whole workspace sits inside a dashed accent-token border with a faint diagonal hatch on the grid background, so a screenshot cropped to the grid still reads as not real; (3) the page title and `document.title` carry "Rehearsal"; (4) every simulated block is a "Party of N", never a person's name; (5) no real reservation, guest, deposit or notification data is ever shown, even if real data exists for tonight.
- Read-only: blocks are not buttons; no drag, no context menu, no status control, no Walk-in/New reservation actions. Blocks show tooltip-less text only. Hovering a block does nothing; nothing links to a real reservation record.
- Empty state: at opening time, before the first booking, grid rows stand with an inline note "The night is about to start." (not an EmptyState; it clears at the first event).
- Loading state: the venue's tables are loading, so the entry surface handles it (Skeleton) and the workspace is never opened half-loaded. Simulation itself is synchronous and brief; show "Setting the tables…" (`role=status`) with a Skeleton grid if it exceeds ~300 ms.
- Error state: see Screen 7.

### Screen 2 — Rehearsal workspace, Floor plan view

```
┌─ REHEARSAL ─ Rehearsal, not real bookings. Nothing here is saved. ─ [Leave rehearsal] ┐
│ [ Timeline | Floor plan ]                          Friday night · 8:10 PM             │
│ ┌ (hatched dashed frame) ───────────────────────────────────────────────────────┐   │
│ │   ( T1 ● )   ( T2 ● )      [ T5 ○ ]      Legend: ● occupied ◐ dirty ◌ ready   │   │
│ │   ( T3 ◐ )   ( T4 ○ )      [ T6 ● ]              ○ available                  │   │
│ └───────────────────────────────────────────────────────────────────────────────┘   │
│ Waiting: Party of 4 · 12 min                                                          │
│ [⏸ Pause]  [15x | 60x | 240x]  ──────●──────────────  Right now: 9 occupied, 1 dirty │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

- Purpose: see the owner's own room come alive.
- Status never relies on colour alone: each table also shows a glyph/fill pattern and its status word in the legend (same vocabulary as `TABLE_STATUS_COLOR_TOKEN`: available, occupied, dirty, ready).
- Read-only: tables are not selectable, no drag handles, no editing sidebar, the editor's toolbar is absent. The canvas is exposed to AT as `role="img"` with an `aria-label` that repeats the "Right now" sentence; the Timeline view and Right now line are the accessible equivalent.
- Empty state: all tables available before the first seating; legend still shown.
- Loading / Error: as Screen 1.
- Animation: status changes cross-fade over a short duration (normal motion only); reduced motion: instant swap, no pulse on the changed table (a 2 px outline marks the most recently changed table until the next event, which is not motion).

### Screen 3 — Transport bar

```
[⏸ Pause]  [ 15x | 60x | 240x ]  6 PM ├────────●──────────────┤ 11 PM   7:45 PM
```

- Play/pause `IconButton` (label "Pause"/"Play"); speed `SegmentedControl` (default 60x); scrub is a slider with `aria-valuetext` "7:45 PM" and a visible time. Scrubbing while playing pauses, then resumes on release only if it was playing.
- All targets at least 44 x 44.
- At the end, play becomes **Replay from start** (same seed), distinct from the card's **Run it again** (new seed).
- Reduced motion variant: `[⏮ Previous event] [Play] [Next event ⏭]` plus the scrub slider; speed control hidden.
- 240x with about 80 tables: if frame cost exceeds budget the clock drops render rate, never skips events (Architect owns the budget).

### Screen 4 — Curtain call

```
┌──────────────── Curtain call ────────────────┐
│  Your Friday night                            │
│  Covers served            148                 │
│  Average turn time        1 h 12 min          │
│  Peak hour                7 PM to 8 PM        │
│  Tables that never sat    T9, T14             │
│  Longest walk-in wait     18 min              │
│                                               │
│  This was a rehearsal. Nothing was saved.     │
│  [ Run it again ]  [ Try a weeknight ]        │
│                              [Leave rehearsal]│
└───────────────────────────────────────────────┘
```

- Purpose: turn the night into a verdict on fit and offer another run.
- Modal-style card over the workspace (focus trapped, labelled by its heading; focus on heading on open). The workspace behind stays visible and dimmed, banner still on top.
- Empty/edge: "Tables that never sat" empty reads "Every table sat tonight."; no walk-in waited reads "Nobody waited."; zero covers (only possible with a degenerate floor plan) reads "Not enough tables to seat anyone. Add tables to your floor plan." with link **Floor plans**.
- After a weeknight run the second action reads **Try a Friday night**; the card heading reads "Your weeknight".
- A "Show the night again" is not offered; scrubbing remains available by closing the card via the close affordance (the workspace returns paused at close time with a **Show curtain call** button in the transport).
- Loading: none (metrics derived at close). Error: none beyond Screen 7.

### Screen 5 — Entry points

```
Timeline empty night (extends hospitality-service-ux Screen 7)
  Quiet so far.
  Nothing on the book for tonight. Walk-ins go straight to a table.
  [ Walk-in ]   [ Run a Friday night ]   (secondary, outline)

Floor plan editor, first landing after onboarding
  ┌ ℹ Your room is ready. ─────────────────────────────────────┐
  │ Watch a Friday night run on it before your first guest.     │
  │ [ Run a Friday night ]                              [ ✕ ]   │
  └────────────────────────────────────────────────────────────┘

Settings > Dress Rehearsal (Card)
  Dress Rehearsal
  Watch a simulated Friday night on your own floor plan. Nothing is saved.
  [ Run a Friday night ]
```

- Purpose: one obvious verb at each place the owner feels the emptiness.
- Walk-in stays the primary action on the empty-night state; Run a Friday night is secondary so a host mid-service is never nudged away from the real job. The CTA is shown only when the venue has at least one table, and is hidden on other-date empty states.
- Loading: the CTA is disabled with the surrounding grid's loading state. Error: a failed tables load shows that surface's existing error; the CTA is not shown.

### Screen 6 — No tables / too few tables

- Venue has no tables: the empty-night CTA is not shown (that state already says "No tables yet." with **Floor plans**). The Settings card keeps its text, button disabled, caption "Add tables to your floor plan first." with link **Floor plans**. The onboarding Alert never appears (the editor with tables is where it lands).
- Fewer than 3 tables: runs normally; the curtain call, if it seats very few, uses its edge copy. No pre-warning.

### Screen 7 — Simulation failure

```
┌ ⚠ Couldn't set up the rehearsal. ───────────────────────────┐
│ Something went wrong building the night. Nothing was saved. │
│ [ Try again ]                              [ Leave ]        │
└─────────────────────────────────────────────────────────────┘
```

- `Alert variant="error"` in place of the workspace body (banner still shown). **Try again** uses a new seed. Reported to the error tracker, never silent. There is no network error state, since the rehearsal makes no calls; if the tables themselves fail to load the entry surface's own error state applies.

## Copy

All strings go through `t()` in `en-US.json` and `fr-CA.json`; no concatenated fragments (French needs whole sentences with interpolated values). Keys under `rehearsal.*` and `settings.rehearsal.*`.

| Key                                                      | en-US                                                                                                        | fr-CA need                                                                                                                            |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| banner.text                                              | Rehearsal, not real bookings. Nothing here is saved.                                                         | Whole sentence, plus "Répétition" tag                                                                                                 |
| banner.leave                                             | Leave rehearsal                                                                                              | Short button                                                                                                                          |
| tag                                                      | Rehearsal                                                                                                    |                                                                                                                                       |
| cta.run                                                  | Run a Friday night                                                                                           | "Friday" is a profile name, translate: Lancer un vendredi soir                                                                        |
| cta.weeknight / cta.friday                               | Try a weeknight / Try a Friday night                                                                         |                                                                                                                                       |
| view.timeline / view.floorPlan                           | Timeline / Floor plan                                                                                        |                                                                                                                                       |
| title                                                    | {{profile}} night · {{time}}                                                                                 | profile as separate keys (Friday night, Weeknight); gender/article agreement means separate full strings, not a profile interpolation |
| stats                                                    | Booked {{n}} / Seated {{n}} / Covers {{n}} / Waiting {{n}}                                                   | plural rules (`_one`/`_other`)                                                                                                        |
| party                                                    | Party of {{n}}                                                                                               | "Groupe de {{n}}"                                                                                                                     |
| block.status                                             | seated / booked / no-show / finished                                                                         |                                                                                                                                       |
| waiting                                                  | Waiting: Party of {{n}} · {{min}} min                                                                        | plural                                                                                                                                |
| transport.play/pause/replay                              | Play / Pause / Replay from start                                                                             |                                                                                                                                       |
| transport.next/previous                                  | Next event / Previous event                                                                                  |                                                                                                                                       |
| transport.speed                                          | 15x / 60x / 240x                                                                                             | numerals and "x" read "15 fois" for AT; provide `aria-label` strings                                                                  |
| transport.scrub                                          | Scrub through the night                                                                                      |                                                                                                                                       |
| reducedMotion.hint                                       | Motion is reduced. Step through the night with Next event.                                                   |                                                                                                                                       |
| rightNow                                                 | {{occupied}} tables occupied, {{waiting}} parties waiting.                                                   | plurals on both counts                                                                                                                |
| startOfNight                                             | The night is about to start.                                                                                 |                                                                                                                                       |
| curtain.title                                            | Your Friday night / Your weeknight                                                                           |                                                                                                                                       |
| curtain.covers / avgTurn / peak / neverSat / longestWait | Covers served / Average turn time / Peak hour / Tables that never sat / Longest walk-in wait                 | time formats via locale (fr-CA 24 h "19 h à 20 h"), duration "1 h 12 min"                                                             |
| curtain.allSat / nobodyWaited / noCovers                 | Every table sat tonight. / Nobody waited. / Not enough tables to seat anyone. Add tables to your floor plan. |                                                                                                                                       |
| curtain.disclaimer                                       | This was a rehearsal. Nothing was saved.                                                                     |                                                                                                                                       |
| curtain.again                                            | Run it again                                                                                                 |                                                                                                                                       |
| settings.card.title / body                               | Dress Rehearsal / Watch a simulated Friday night on your own floor plan. Nothing is saved.                   |                                                                                                                                       |
| settings.noTables                                        | Add tables to your floor plan first.                                                                         |                                                                                                                                       |
| onboarding.alert.title / body                            | Your room is ready. / Watch a Friday night run on it before your first guest.                                |                                                                                                                                       |
| error.title / body / retry                               | Couldn't set up the rehearsal. / Something went wrong building the night. Nothing was saved. / Try again     |                                                                                                                                       |

- Live-region sentences (polite, `role=status`): on pause and at most once per 10 real seconds while playing at 15x or 60x, never at 240x: "7:45 PM. 9 tables occupied, 1 party waiting." On a step in reduced motion, every step: "7:52 PM. Party of 4 seated at Table 5." At close: "Service is over. Covers served: 148."
- Voice: speakeasy, plain, a little warm ("The night is about to start."); never jokes about money or guests; no emoji in strings.
- Dates/times use the existing locale formatters (`formatTime`), never hand-built.

## Accessibility

- Contrast and focus follow Rialto tokens in both themes; the banner and hatch must pass 3:1 against the grid and the banner text 4.5:1. The brand treatment is applied by the banner and frame, never by lowering text contrast.
- Meaning never by colour or motion alone (status glyphs/words, outline for latest change).
- 44 x 44 targets at 1024 x 768 and on phone width; on phone the view switch and transport stack, the Timeline scrolls horizontally as it does today, the floor plan fits to width.
- No auto-moving content that cannot be paused: Pause is always reachable, and the whole rehearsal can be stopped by **Leave rehearsal**.
- Focus: opening the workspace focuses its heading; opening the curtain call focuses its heading and returns to the Replay/Show curtain call control when closed.

## Story reachability check

1. Start from empty-night, onboarding end, settings: Flow 1 step 1, Flow 2, Screen 5.
2. Watch own floor plan and timeline animate: Screens 1 and 2.
3. Pause, speed (15x, 60x, 240x), scrub: Screen 3.
4. Persistent "Rehearsal, not real bookings" marking: Screen 1 non-real treatment; every screen carries the banner.
5. Curtain call with Run it again and Try a weeknight: Screen 4.
6. Reduced motion: Flow 4.

## Conventions to match

- Rialto components only: `Alert`, `Card`, `Button`, `IconButton`, `SegmentedControl`, `Tag`, `EmptyState`, `Skeleton`, `Stat`; no raw buttons. Existing `TimelineGrid` and `FloorPlanCanvas` render the views unchanged apart from read-only/rehearsal props.
- Tokens only, dark-first, both themes; accent gold used for the banner rule, frame and focus ring; warning amber stays reserved for real warnings.
- Sentence-case buttons; `useMotionPreset()` for reduced motion; one `aria-live` region per page; `role=dialog`, `aria-modal`, labelled, focus-trapped for the curtain call.
- Strings through react-i18next (`t()`), en-US and fr-CA completeness check applies.
- Empty/error patterns follow hospitality-service-ux Screen 7; the Alert-with-Retry pattern follows `ErrorRetryBanner` usage.

## Deliberately not designed

- Choice of brunch profile, custom seed, custom party mix, or profile tuning controls.
- Sound, confetti, share/export of the curtain call, saved or historical rehearsals.
- Simulated deposits, guest profiles, real operating hours, staff roles.
- Editing the floor plan from inside the rehearsal.
- Onboarding Launch step changes (celebration timing untouched).
- Visual styling of the hatch and frame beyond "token-driven, distinct, passes contrast".
- The route, state-machine or hook design (Architect).

## Surfaced for later stages

- Demand is unvalidated; nothing here is evidence an owner wants this.
- The reduced-motion Play behaviour (15-minute jumps) and the 10-second announcement throttle are invented defaults, unverified with users.
- The existing `TableShape` drag-shadow tween ungated by reduced motion (noted by the onboarding run) does not apply here since drag is disabled, but it is not fixed by this run.
