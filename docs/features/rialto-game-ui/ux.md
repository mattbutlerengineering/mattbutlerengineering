---
stage: ux-design
run: feature:rialto-game-ui
date: 2026-08-15
assumptions:
  - "Narrow viewports stack the HUD into a single column in region order; no bespoke small-screen information architecture was designed."
  - "The route is registered in the rialto-web demo nav. prd.md left linked-vs-unlisted open for the design-system owner; registering is the reversible default."
  - "Vibe selection is scoped to this route and resets on leave, so no other surface can inherit it."
---

# UX: Game-UI vibe demo route

Proposed path: `/demos/telemetry`, alongside the existing `/demos/*` routes.

## Flows

### Primary flow — the evaluator sees the point

1. Evaluator opens `/demos/telemetry`. The route renders **already under the
   game vibe**, with telemetry already running — no start button, no empty
   first impression.
2. Within the first second and with no input at all: the status strip reads
   LIVE, the zone-table row highlight advances to the current zone, the
   odometer digits roll, the ticker advances. The screen is alive before the
   evaluator does anything.
3. Evaluator hovers a zone row. The row answers immediately — visibly, under
   100 ms — and its delta reads as emphasized rather than merely tinted.
4. Evaluator selects a zone row. Selection is unambiguous, and the vitals
   rail retargets to that zone. Their action changed the screen; the screen
   said so.
5. Evaluator flips the vibe switch to `default`. Same data, same layout,
   same components — the design language flattens to standard Rialto. Flip
   back to `game`. **This flip is the pitch**, and it is their action, not a
   canned animation.
6. Optional: evaluator holds the feed. LIVE → HOLD, every value freezes
   legibly, and the ticker stops with an explicit HOLD marker rather than
   just going quiet.

### Secondary flow — reduced motion

Covers the reduced-motion evaluator actor. This is a designed presentation,
not a fallback.

1. Evaluator with `prefers-reduced-motion` (or arriving by keyboard) opens
   the route.
2. Layout, density, and information are **identical**. What changes is the
   channel: transitions become instant rather than eased — odometer digits
   swap instead of rolling, the row highlight jumps instead of sliding, the
   ticker advances stepwise with no travel.
3. Feedback is still visible within 100 ms, carried by contrast, weight, and
   border-state change instead of movement.
4. Nothing is removed. No state, value, or event is reachable only through
   motion, and the result is still visibly not the default vibe.

### Tertiary flow — degraded feed

1. The telemetry feed drops.
2. The status LED bank goes to its alert state and the strip reads SIGNAL
   LOST with time since the last packet.
3. Values **freeze at last known and are explicitly marked stale** — dimmed,
   with the timestamp they were captured at. The HUD is never blanked; a
   game HUD that goes empty reads as broken, and stale-but-labeled is more
   useful than absent.
4. An alert offers reconnect. Reconnecting returns to primary flow step 2.

### Coverage check against PRD user stories

| PRD story                       | Where it is reachable                                                     |
| ------------------------------- | ------------------------------------------------------------------------- |
| 1 — immediate visible feedback  | Primary flow, steps 2-4                                                   |
| 2 — density legible at a glance | Screen composition, all regions                                           |
| 3 — reduced motion stays whole  | Secondary flow                                                            |
| 4 — vibe is opt-in / selectable | Primary flow step 5, vibe switch                                          |
| 5 — other surfaces unaffected   | No UI surface — structural, satisfied by scoping the switch to this route |

## Screens

### Telemetry HUD — `/demos/telemetry`

```
┌────────────────────────────────────────────────────────────────┐
│ ◉LIVE  LAP 14/58  P3  ▮▮▮▯▯ SYS        vibe: [GAME] default    │
├──────────────────────────────────────┬─────────────────────────┤
│ ZONE           SPD  BEST   Δ         │ THROTTLE ▓▓▓▓▓▓▓░░  74% │
│ Pit Exit        82    84  ▁▂ -2      │ BRAKE    ▓▓░░░░░░░  18% │
│ Turn 1 Entry   264   268  ▁▃ -4      │ FUEL     ▓▓▓▓▓▓░░░  61% │
│ Turn 1 Apex    142   139  ▅▆ +3   ◉  │ TYRE FL  ▓▓▓▓▓▓▓▓░  88% │
│ Back Straight  312   315  ▁▂ -3      │ TYRE FR  ▓▓▓▓▓▓▓░░  79% │
│ Chicane Entry  198   195  ▅▆ +3      │                         │
│ Chicane Exit   167   171  ▁▂ -4      │  ┌───────────────────┐  │
│ Turn 7 Apex    108   106  ▅▆ +2      │  │   3 2 8  km/h     │  │
│ Main Straight  328   331  ▁▂ -3      │  │   ▲ session best  │  │
│                                      │  └───────────────────┘  │
├──────────────────────────────────────┴─────────────────────────┤
│ ▸14:02:11 SECTOR 2 PURPLE  ▸14:02:03 DRS ON  ▸14:01:47 P4→P3   │
└────────────────────────────────────────────────────────────────┘
```

- **Purpose:** the one thing the evaluator does here is _flip the vibe and
  watch the same screen change character_. Everything else exists to give
  that flip something to act on.
- **Regions** (four density registers, deliberately different component
  families so the vibe is stressed rather than flattered):
  - _Status strip_ — StatusLED bank, lap counter, position, system meter,
    and the vibe switch at right. Answers "is this live, how am I doing" in
    one glance.
  - _Zone table_ — the main mass. Live row highlight follows the current
    zone (`◉`). Rows are hoverable and selectable.
  - _Vitals rail_ — Meters for throttle / brake / fuel / tyres, plus the
    odometer focal readout.
  - _Event ticker_ — pinned bottom, SplitFlap/DepartureBoard-style feed.
- **Empty state:** feed not yet started. Full HUD chrome renders with every
  field showing an explicit placeholder glyph rather than blank space;
  status strip reads STANDBY; ticker reads "awaiting telemetry". The frame
  is the point — an empty HUD still looks like an instrument, not a hole.
- **Loading state:** identical frame, status strip reads CONNECTING with the
  LED bank in its pending state, value slots show skeletons. No layout shift
  between loading, empty, and live — the frame never moves.
- **Error state:** the degraded-feed flow above. Stale values retained and
  labeled, never cleared; reconnect offered inline.

## Conventions to match

- `/demos/*` route family and the existing `DemoLayout`; the route is
  registered in the demo nav alongside Sign In, Dashboard, Drivers, Layouts.
- Light and dark themes both supported, via the existing theme control.
- The vibe switch mirrors the existing `ThemeToggle`: a single control at
  top-right, immediate effect, no confirmation step, no page reload.
- Existing Rialto components only — PRD scope excludes net-new components,
  so the vibe must land on StatusLED, Meter, Odometer, SplitFlap,
  DepartureBoard, DataTable, Card, Stat, and friends as they are.
- Every control reachable by keyboard in reading order, with the same
  affordances the rest of rialto-web already uses.

## Deliberately not designed

- **Sound cues.** #3978 lists sound as a game-UI attention mechanism; it is
  out of this run. Autoplay policy, consent UI, and screen-reader
  interaction are a whole problem space with no answer at this scope.
- **A bespoke mobile or tablet HUD.** Narrow viewports stack the regions in
  order; no separate small-screen information architecture was designed.
- **Track map / spatial layout.** The diegetic-placement thread from #3978 —
  controls living where the thing they act on lives — is not attempted here.
  It is the most interesting unexplored thread and the natural follow-on.
- **Side-by-side vibe comparison.** Rejected in favour of the toggle: the
  flip is more persuasive than the diff, and side-by-side halves the density
  on both sides.
- **Applying the vibe to any other rialto-web page**, including the existing
  showcase sections.
- **Where the telemetry values come from.** The data is mocked; how it is
  generated, and how that interacts with visual-regression determinism, is
  Architect's problem, not a UX decision.
