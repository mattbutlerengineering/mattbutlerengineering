---
stage: ux-design
run: feature:hospitality-animations
date: 2026-08-30
assumptions:
  - "Tube word: one tube spelling OPEN and nothing else — no CLOSED tube. A dark OPEN tube reads as closed by the universal shop-window convention; the fact itself lives in the caption and aria-label. Chosen over a two-word fixture because it is one glyph with three light states plus absent, the minimum that carries all four states."
  - "Composition: NeonSign is its own tube and housing; it does not compose StatusLED. A power LED beside a tube would encode nothing the tube does not already show."
  - "Time format: 12-hour with minutes (5:00 PM) to match `apps/hospitality/src/utils/format.ts` formatTime and `dashboard/ReservationList.tsx` on the same page; the PRD's 17:00 / 22:00 are raw DaySchedule values and the PRD delegated copy to UX."
  - "unset copy: 'No operating hours set', reusing the product's existing phrase (`venue-onboarding/LaunchStep.tsx:151`, `booking-widget/TimeSlotPicker.tsx:137`) instead of the PRD's 'Operating hours not set' — same fact, consistent wording."
  - "Caption and aria-label are the identical string in every state; the consumer derives one string and passes it to both."
  - "closed copy names the weekday whenever the next opening is not on the current venue-local calendar day ('Closed, opens Tuesday at 5:00 PM'); no 'tomorrow' special case — fewer branches for the derivation, and it still satisfies PRD story 3."
  - "opening-soon lead window kept at the PRD default of 60 minutes; UX had licence to tune the number and found no reason to."
  - "Dashboard renders size md; sm | md | lg are kept for parity with Handshake's contract (three custom-property presets), although sm has no consumer in this run."
  - "The strike-on plays on first paint in `open` as well as on a live transition into `open` — the sign turns on when the host opens the dashboard mid-service; it lasts under a second and reduced motion removes it."
  - "`open` is steady (no continuous motion) — motion only while something is in flight (opening-soon) and at state transitions, mirroring Handshake's settled state and the design language's gold-only-in-flight rule."
  - "Placement: PageHeader gains an optional inline-end slot; HomePage passes the sign block into it. Below 768px the slot wraps beneath the title block, start-aligned. Other pages are untouched (slot optional)."
  - "Showcase: no reduced-motion toggle — measured 2026-08-30, no rialto-web page has one and framer-motion MotionConfig is unused in rialto-web or rialto; reduced motion is documented in the Accessibility DataList like every sibling page."
  - "Glow radii (2px / 8px text-shadow) and the durations `--neon-strike: 0.9s` / `--neon-warm-cycle: 2.4s` are component-local, following Handshake's pulse shadow and `--handshake-shuttle` / `--watch-cycle`; the tokens-only rule is applied to every colour, easing, spacing, radius and type value."
  - "The tube word is fixed English OPEN; no `word` prop (no i18n requirement exists)."
  - "Slug, run scale, evidence label and the deployed-venue UNKNOWN are inherited from idea.md / prd.md unchanged."
---

# UX: Neon OPEN sign

The dashboard header gains a neon OPEN sign — a rialto instrument that
shows, at a glance, whether the venue is trading right now. One tube, one
word, four states: lit green (`open`), warming gold (`opening-soon`), dark
glass (`closed`), and no tube at all (`unset`). A caption beneath the housing
states the fact in words; the same words are the sign's accessible name.

Binding inputs: prd.md's state table (which fact each state carries), the
brief's decided constraints (`role="img"` + required `aria-label`,
`data-state` / `data-reduced-motion`, state-as-props, static truthful reduced
frame, gold only for `opening-soon`, success tokens for `open`, `unset`
distinct from `closed`, transform/opacity keyframes only, dashboard header
only, no visual-suite sections).

## Flows

### Host reads the sign (primary)

1. Host opens the dashboard on the tablet (`HomePage`). `DashboardLayout`
   has already resolved the venue (its readiness gate shows `LoadingPage`
   until then), so the header paints with the sign in its true state on the
   first frame — no placeholder, no late pop-in.
2. If the venue is open, the tube strikes on (a sub-second neon flicker, see
   Motion) and holds lit green; caption "Open until 10:00 PM". Under reduced
   motion it is simply lit.
3. Host reads the tube first (lit / warming / dark / absent), the caption
   second. Nothing to tap: the sign is `role="img"` and is not a control.
4. Time passes; the page re-derives state at least once a minute (PRD). At
   4:00 PM for a 5:00 PM opening the tube warms to gold and the caption
   flips to "Opens at 5:00 PM"; at 5:00 PM the tube strikes on, "Open until
   10:00 PM"; at 10:00 PM the tube goes dark, "Closed, opens Tuesday at
   5:00 PM". Each flip is a state transition (see Motion); nothing else in
   the header moves.

### Operator sees hours are not set

1. Operator (or a Host on a fresh venue) opens the dashboard; the venue
   has no usable hours.
2. The header shows the housing outline with no tube and the caption "No
   operating hours set". It cannot be mistaken for a dark tube.
3. The sign does not link anywhere (PRD: no interaction). The existing path
   is the sidebar's "Set Operating Hours" (`nav-sections.ts:49`,
   `SetupPage`). After hours are saved and the operator returns, the sign
   renders in its true state.

### Assistive-technology user

1. Screen reader reaches the header: "Dashboard, heading level 1", the
   welcome caption, then the sign as a single image whose name is the
   caption string, e.g. "Open until 10:00 PM, image". The tube, housing and
   visible caption are inside the `role="img"` root and are not read
   separately — one fact, announced once.
2. With `prefers-reduced-motion`, every state is a static frame: lit green,
   lit gold at reduced brightness, dark glass, or the empty outline — four
   distinguishable frames, no strike, no pulse.

### Evaluator on the showcase

1. rialto-web → Data Display → Neon Sign. A service-day replay cycles
   closed → opening-soon → open so the strike is seen within five seconds.
2. A playground lets them set each state by hand (and replay the strike);
   the States section lays all four out with captions; Sizes shows sm | md
   | lg; Props and Accessibility follow the Handshake page.

### Consuming developer

1. `<NeonSign state="open" aria-label="Open until 10:00 PM" caption="Open until 10:00 PM" size="md" />`
   — state, label and caption are props; the instrument owns no clock and
   no timezone logic.

## Screens

### The instrument — anatomy

```
        housing: recessed plate, 1px border, radius-default, shadow-pressed
        ┌──────────────────────────────┐
        │ ░░░ backboard wash (lit) ░░░ │  ← pseudo-layer, *-muted token, fades in
        │          O P E N             │  ← tube: display font, weight 300,
        │                              │    uppercase, tracking-wide; colour and
        └──────────────────────────────┘    halo (text-shadow) from the state token
              Open until 10:00 PM         ← caption: text-sm, text-secondary
```

Every element encodes state or is housing:

| Part           | What it is                                                                                                                                                                               | Encodes                                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Housing        | `background: var(--rialto-surface-recessed)`; `border: 1px solid var(--rialto-border)`; `border-radius: var(--rialto-radius-default)`; `box-shadow: var(--rialto-shadow-pressed)`        | Structural — the plate the tube is mounted on (same recess idiom as StatRow tiles and Handshake grooves) |
| Backboard wash | Pseudo-layer filling the housing with `--rialto-success-muted` (open) or `--rialto-accent-muted` (opening-soon); opacity 0 → 1                                                           | Light spilling from a lit tube onto its backboard — present only when lit                                |
| Tube           | The word `OPEN` in `--rialto-font-display`, `--rialto-weight-light` (md/lg; `--rialto-weight-regular` at sm), `text-transform: uppercase`, `letter-spacing: var(--rialto-tracking-wide)` | Lit / warming / dark / absent — the state itself                                                         |
| Halo           | `text-shadow: 0 0 2px currentColor, 0 0 8px currentColor` on the tube while lit (Handshake pulse radii)                                                                                  | Lit vs unlit glass                                                                                       |
| Caption        | `font-size: var(--rialto-text-sm)` (xs at sm), `color: var(--rialto-text-secondary)`, `--rialto-space-xs` below the housing, `text-align: end` when the block is end-aligned             | The fact in words; identical to `aria-label`                                                             |

No mounting screws, no transformer box, no power LED — none would encode a
state the tube does not. The footprint is stable across states: the housing
never resizes when the state flips (the `unset` outline keeps the word's
footprint).

Sizes (one preset = one set of custom properties, as in Handshake):

| Size | Tube size            | Housing padding                            | Caption size       | Use                                 |
| ---- | -------------------- | ------------------------------------------ | ------------------ | ----------------------------------- |
| `sm` | `--rialto-text-base` | `--rialto-space-2xs` × `--rialto-space-sm` | `--rialto-text-xs` | compact rows (no consumer this run) |
| `md` | `--rialto-text-lg`   | `--rialto-space-xs` × `--rialto-space-md`  | `--rialto-text-sm` | dashboard header                    |
| `lg` | `--rialto-text-2xl`  | `--rialto-space-sm` × `--rialto-space-lg`  | `--rialto-text-sm` | showcase replay / playground        |

At `md` the housing is roughly button height (about 40px) and the 23px
light-weight tube sits clearly below the 28px display title in weight and
size — it is noticed because it glows, not because it is big.

### The instrument — the four states

```
 open              opening-soon        closed              unset
 ┌────────────┐    ┌────────────┐      ┌────────────┐      ┌ ─ ─ ─ ─ ─ ─┐
 │ ≈ O P E N ≈│    │ ~ O P E N ~│      │   O P E N  │      │            │
 └────────────┘    └────────────┘      └────────────┘      └ ─ ─ ─ ─ ─ ─┘
 lit, success      warming, gold       dark glass          no tube, no plate
 wash on           wash on, pulsing    no wash             dashed outline
 Open until        Opens at            Closed, opens       No operating
 10:00 PM          5:00 PM             Tuesday at 5:00 PM  hours set
```

| State          | Tube colour                                        | Halo                                        | Wash                     | Housing                                                                                           | Light theme read                                                                                                                     | Dark theme read                                                                           |
| -------------- | -------------------------------------------------- | ------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `open`         | `--rialto-success` (#5e6a2e)                       | on, full                                    | `--rialto-success-muted` | plate as above                                                                                    | olive tube on the warm recessed plate (about 4.9:1), halo reads as a soft bloom around coloured glass, faint olive tint on the plate | bright olive (#9aaa4c) on near-black (#141312) — a true lit neon with a visible glow      |
| `opening-soon` | `--rialto-accent` (#b0841e light / #d4a23a dark)   | on, breathing 0.6 → 1 (tube + halo opacity) | `--rialto-accent-muted`  | plate as above                                                                                    | amber tube, visibly not at full brightness, amber tint on the plate                                                                  | gold tube breathing on black; the only place gold appears on the page besides focus rings |
| `closed`       | `--rialto-border` (#918d87 light / white 40% dark) | none                                        | none                     | plate as above                                                                                    | dim grey word on the plate — glass with nothing in it                                                                                | dim grey word on black — an unlit tube you can still make out                             |
| `unset`        | no tube                                            | none                                        | none                     | no plate: `background: transparent`, `border: 1px dashed var(--rialto-border)`, no pressed shadow | an empty dashed outline where a sign would be mounted                                                                                | same                                                                                      |

`unset` vs `closed`: closed has a solid plate and a visible dark tube; unset
has neither — a dashed outline with nothing inside. They differ in three
independent cues (plate presence, tube presence, border style), not just
colour. `open` vs `opening-soon` differ in hue (success vs gold), in wash
tint, in brightness (opening-soon holds below full), and in motion (only
opening-soon breathes); the caption text disambiguates for anyone for whom
hue alone is not enough — which is why the caption is required on the
dashboard and every consumer.

### The instrument — motion

All motion is opacity on the tube and wash layers — compositor-driven CSS
keyframes, no transforms of layout, no JS timers, nothing the instrument
schedules itself. Component-local timing properties, after `--watch-cycle`
and `--handshake-shuttle`: `--neon-strike: 0.9s`, `--neon-warm-cycle: 2.4s`.

| Moment                                  | Motion                                                                                                                                                                                                                                                                                                        | Timing / easing                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Enter `open` (first paint or live flip) | **Strike-on.** Tube opacity 0 → 1 → 0.3 → 1 → 0.5 → 1, then holds — at most three brightness dips, spread across the strike so no one-second window carries more than three flashes (WCAG 2.3.1; the sign's area is also far below the general-flash threshold). The wash fades in underneath it. Plays once. | `--neon-strike`; `linear` between frames (as `watch-spin`); wash `--rialto-duration-slow` `--rialto-ease-smooth` |
| Hold `open`                             | **Steady.** No continuous motion — a lit sign during service just stays lit.                                                                                                                                                                                                                                  | —                                                                                                                |
| Enter `opening-soon`                    | **Warm-in.** Tube colour crosses to gold and the wash fades in; no strike (warming is gradual, the strike is the "on" moment).                                                                                                                                                                                | `--rialto-duration-slow` `--rialto-ease-smooth`                                                                  |
| Hold `opening-soon`                     | **Warm-up breathe.** Tube (and its halo, which rides on it) opacity 0.6 → 1 → 0.6, looping. The transformer is charging; doors are about to open.                                                                                                                                                             | `--neon-warm-cycle`, `--rialto-ease-smooth`, infinite (as `rialto-handshake-shuttle`)                            |
| Enter `closed`                          | **Switch-off.** Tube colour drops to `--rialto-border` and the wash fades out — the switch is thrown, no afterglow.                                                                                                                                                                                           | `--rialto-duration-standard` `--rialto-ease-precision`                                                           |
| Enter / hold `unset`                    | None. It is a configuration state; the tube is simply not there.                                                                                                                                                                                                                                              | —                                                                                                                |

Nothing translates, so there is no RTL keyframe variant to write; the block
sits at the header's inline-end via logical properties and mirrors on its
own.

**Reduced motion** (`useReducedMotion()` true → `.reduced` on the root and
`data-reduced-motion="true"`, plus the `@media (prefers-reduced-motion:
reduce)` fallback as in Handshake / WatchLoader):

| State          | Static frame                                                                       |
| -------------- | ---------------------------------------------------------------------------------- |
| `open`         | lit green tube, full halo, wash on; no strike                                      |
| `opening-soon` | gold tube parked at the breathe's mid-frame (about 0.8 opacity), wash on; no pulse |
| `closed`       | dark glass tube on the plate                                                       |
| `unset`        | dashed empty outline                                                               |

Four frames, four looks; no flicker anywhere.

### The instrument — copy and accessible name

The tube always says `OPEN`. The caption and `aria-label` are the same
string, built by the consumer from the derived state (times via the app's
12-hour convention, weekday names in full as `formatLongDate` does):

| State          | Caption = `aria-label`                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| `open`         | `Open until 10:00 PM` (overnight window: `Open until 2:00 AM`)                                                |
| `opening-soon` | `Opens at 5:00 PM`                                                                                            |
| `closed`       | `Closed, opens at 5:00 PM` when the next opening is later today; `Closed, opens Tuesday at 5:00 PM` otherwise |
| `unset`        | `No operating hours set`                                                                                      |

Commas, not middle dots, so screen readers pause rather than announce
punctuation. The visible caption is inside the `role="img"` root and is
therefore presentational to assistive technology — the label is heard once.

Props the design needs (names are the Architect's to finalise): required
`aria-label`; `state` (`open | opening-soon | closed | unset`); optional
`caption` (the visible line; when supplied it must equal `aria-label`);
`size` (`sm | md | lg`, default `md`). Root carries `data-state` and
`data-reduced-motion`; the tube and housing are `aria-hidden`, as
Handshake's track is.

### Dashboard header (`HomePage`, consumer)

Desktop and tablet landscape (sidebar visible, content column ≥ 768px):

```
┌ main content ──────────────────────────────────────────────────────────┐
│ Home                                                     ● API healthy │  breadcrumb bar (unchanged)
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│ Dashboard                                          ┌────────────────┐  │  title block (unchanged)
│ Welcome back, Matt                                 │  ≈ O P E N ≈   │  │  sign block, inline-end, top-aligned
│                                                    └────────────────┘  │
│                                                   Open until 10:00 PM  │
│                                                                        │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                    │  StatRow (unchanged)
│ │   12     │ │   48     │ │    3     │ │    0     │                    │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘                    │
│ [New Walk-In] [View Floor Plan] [Guest Lookup] [Booking Widget]        │
└────────────────────────────────────────────────────────────────────────┘
```

Tablet portrait at 768px (the host persona's device; sidebar still shown,
content column about 500px — the title block and the sign block still fit on
one row):

```
│ Dashboard                       ┌──────────────┐ │
│ Welcome back, Matt              │ ≈ O P E N ≈  │ │
│                                 └──────────────┘ │
│                                Open until 10:00 PM│
│ ┌────────────┐ ┌────────────┐                     │  StatRow already 2-up here
```

Narrow (< 768px — phone or a narrow split view; sidebar collapses to the
floating toggle):

```
│ Dashboard                   │
│ Welcome back, Matt          │
│ ┌──────────────┐            │  sign block wraps beneath, start-aligned,
│ │ ≈ O P E N ≈  │            │  caption start-aligned under the housing
│ └──────────────┘            │
│ Open until 10:00 PM         │
│ ┌────────────┐ ┌──────────┐ │
```

- Purpose: answer "are we open, and until/from when?" without reading the
  hours table. The title block is untouched; the sign is additive at the
  row's inline-end and sits above the StatRow instruments it belongs with.
- Layout: `PageHeader` gains an optional inline-end slot; `.header` becomes
  `display: flex; justify-content: space-between; align-items: flex-start;
gap: var(--rialto-space-md); flex-wrap: wrap`. The sign block is the
  `md` instrument with its caption, `align-items: flex-end` so housing and
  caption share the end edge. Below 768px (`@media (max-width: 767px)`,
  matching `DashboardLayout.module.css`) the block wraps to its own row,
  `align-items: flex-start`. Pages that pass no slot render exactly as
  today.
- Empty state: no selected venue (still loading, or none) renders no sign
  and the header is exactly today's header — no reserved gap. In practice
  `DashboardLayout`'s readiness gate means the venue is present before
  `HomePage` paints, so nothing pops in. A venue with no usable hours is
  not empty: it is `unset`, rendered as above.
- Loading state: none of the sign's own. The dashboard's stats skeleton is
  independent; the sign renders from venue data while stats load.
- Error state: stats error (`ErrorRetryBanner`) does not touch the sign.
  An `ianaTimezone` the runtime does not recognise renders no sign (PRD) —
  the header falls back to today's header rather than guessing a zone.
- Selectors: the sign adds no `heading`, `status` or `meter` role and no
  "Dashboard" / "Welcome back" / "Live Activity" text, so `dashboard.spec.ts`
  and `HomePage.test.tsx` selectors stay unique; the caption text is
  matched by nothing in either.

### Showcase page (`apps/rialto-web`, Data Display → Neon Sign)

Mirrors `HandshakePage` section for section:

```
Neon Sign
An instrument for a venue's trading state … (description)

Service Day Replay        ┌ Card ────────────────────────────────┐
                          │          ┌──────────────┐            │  lg; cycles closed → opening-soon → open,
                          │          │ ≈ O P E N ≈  │            │  ~2.4 s per phase (open holds a beat longer
                          │          └──────────────┘            │  so the strike is seen settling);
                          │        Open until 10:00 PM           │  page-level interval, as SignInReplay
                          └──────────────────────────────────────┘

States                    open          ┌ OPEN ┐  Open until 10:00 PM
                          opening-soon  ┌ OPEN ┐  Opens at 5:00 PM             md, one row per state,
                          closed        ┌ OPEN ┐  Closed, opens Tuesday at 5:00 PM   caption shown
                          unset         ┌ ─ ─ ─┐  No operating hours set

Playground                ┌ Card ────────────────────────────────┐
                          │  [lg sign + caption]                 │  buttons: open · opening-soon · closed · unset
                          │  (open)(opening-soon)(closed)(unset) │  pressing "open" replays the strike
                          └──────────────────────────────────────┘

Sizes                     sm ┌OPEN┐   md ┌ OPEN ┐   lg ┌  O P E N  ┐   each with caption

Props                     <PropsTable component="NeonSign" />

Accessibility             Role · role="img"
                          Name · Required aria-label — state the fact, not the tube
                          Tube hidden from AT · housing, tube and caption are aria-hidden; only the label is read
                          Reduced motion · no strike, no breathe; four static frames stay distinct
                          Colour is not the only signal · pair with the caption; open and opening-soon are both lit
                          Owns no clock · state is a prop; the consumer derives it from hours + timezone
```

- Purpose: let an evaluator see all four states, the strike, and the sizes
  within a minute, and let a developer read the contract.
- Empty / loading / error states: none — static demo data. Not added to
  either visual suite (binding).

## Conventions to match

- Instrument contract from `Handshake.tsx`: `forwardRef`, `role="img"`,
  required `aria-label`, `data-state`, `data-reduced-motion`, `.reduced`
  class plus the `@media (prefers-reduced-motion: reduce)` fallback, visual
  layer `aria-hidden`, `size` presets as custom-property blocks, exported
  `NeonSignProps`.
- Material honesty (`packages/rialto/CLAUDE.md`): the housing is the same
  recessed idiom as StatRow tiles and Handshake grooves
  (`--rialto-surface-recessed` + `--rialto-shadow-pressed` + `--rialto-border`);
  no pure black backboard even in dark theme — `--rialto-surface-recessed`
  (#141312) is the dark plate.
- Surgical colour: gold (`--rialto-accent`, `--rialto-accent-muted`) appears
  only in `opening-soon`; `open` uses `--rialto-success` /
  `--rialto-success-muted`; `closed` and `unset` use `--rialto-border`.
  Warning amber is not used (it is a distinct token from gold and would
  read as a third lit colour).
- Typography: `--rialto-font-display` for the tube (DepartureBoard precedent
  for an instrument glyph), three weights only (300 for the tube at md/lg,
  400 at sm and for captions), `--rialto-tracking-wide` for the letter
  spacing.
- Copy: 12-hour times as `utils/format.ts` `formatTime`; full weekday names
  as `formatLongDate`; the `unset` phrase already used by `LaunchStep` and
  `TimeSlotPicker`.
- Layout: logical properties throughout; the `767px` mobile breakpoint from
  `DashboardLayout.module.css`.
- Showcase: `ComponentPageLayout name=…`, `Section title=…`, `PropsTable
component=…`, `DataList` accessibility rows — the `HandshakePage` shape;
  registered in `page-registry.ts` under "Data Display" (the brief's
  measured single touchpoint).

## Deliberately not designed

- A reduced-motion toggle on the showcase — the page pattern has none;
  documented in the Accessibility list instead. (If Architect wants one
  later, framer-motion's `MotionConfig reducedMotion="always"` flips
  `useReducedMotion()` for a subtree without a new prop.)
- A `CLOSED` tube, a `closing-soon` state, holiday/special hours, multiple
  windows per day, click-to-edit or a link to settings, sound — all PRD
  out-of-scope or decoration.
- A "tomorrow" phrasing for `closed`; weekday names cover it.
- Localising the tube word; `OPEN` is fixed.
- Placement anywhere other than the `HomePage` header (`BriefingPage`,
  breadcrumb bar beside `SystemHealthBadge`, `PublicBookingPage`).
- A consumer for `sm`.
- Tuning the tube's 300 weight per theme: if Implement finds the light
  weight illegible on the light plate at md, `--rialto-weight-regular` is
  the fallback — a check at implementation, not a design decision left open.

## Unknowns

- **UNKNOWN — needs human input (inherited from prd.md):** whether the
  deployed demo venue has `operatingHours` and a valid `ianaTimezone`. If
  not, the deployed header shows `unset` until an operator sets hours. —
  Matt, via the dashboard settings page.

Next stage: Architect (`architect` skill, or the router) — the PageHeader
slot, the prop names, the derivation and clock live there.
