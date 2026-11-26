---
stage: ux-design
run: feature:rialto-signature-pass
date: 2026-11-25
assumptions:
  - "Unattended autorun. Interview answers come from autorun-brief.md, idea.md and prd.md. The scenario walkthrough list and the sketches were not confirmed with the Owner one at a time."
  - "No docs/ux-patterns.md exists. The skill suggests running ux-patterns first; that is a suggestion, not a gate, so the stage proceeded without it."
  - "'Denser' in the demo sentence is read as information density by emphasis (quieter decoration, stronger contrast on the data that matters), not by spacing. PRD criterion 8 and the brief forbid any change to an interactive element's box, and the existing vibes get density by shrinking --rialto-space-* tokens, which moves controls. This resolves the PRD open question 'Density without resizing' on the UX side."
  - "First covered screens are Timeline (the index route, / and /timeline) and Dashboard (/dashboard). Reservations and Waitlist are deferred. This resolves the PRD open question 'Which screens'."
  - "The two new accent roles are named plum (royal, the voice accent) and verdigris (speakeasy patina, the live accent). The mid-tone surfaces are named tinted and velvet. All hex values in this doc are candidates for the kill test, not final tokens."
  - "Content on a mid-tone surface reads text, border and focus tokens re-declared for that surface (the same pattern as the existing nested light scope in colors.css). How that is built is the Architect's call."
  - "The service phase indicator is non-interactive status text. There is no override, toggle or setting, per PRD criterion 7."
  - "A phase change that arrives while a dialog or drawer is open, or while a text field has focus, waits until it closes or blurs, up to a maximum delay the Architect sets."
  - "When live sync drops (the existing OfflineBanner shows), the phase holds where it was rather than guessing; it settles to calm only after a hold limit the Architect sets."
  - "The uniqueness verdict board is blinded first (columns A, B, C) with the key revealed below the verdict prompt. This is a UX choice the PRD left open."
  - "The go/no-go for the kill test is recorded the same way as the PRD's verdict: a ready-for-human GitHub issue assigned to Matt."
  - "The new audit replaces the content of packages/rialto/docs/ui-audit.md at the same path, so existing links keep working; the 2026-05-16 version stays in git history and is quoted in the re-check table."
---

# UX: Rialto signature pass

Five surfaces change in this run, each for a different reader:

1. **The palette.** Every Rialto component inherits it, so hosts, managers
   and prospects all see it.
2. **The kill-test board.** Matt's go/no-go on five primitives.
3. **Service-aware mode.** On Timeline and Dashboard in the hospitality app.
4. **The audit report.** Read by Matt and by agents.
5. **The verdict board.** Matt's uniqueness verdict against two stock kits.

## Scenario walkthroughs

### 1. Friday 8pm: the mode shifts while a host is mid-tap

- Actor and goal: a Host on Timeline seats a walk-in as covers climb past
  the rush threshold.
- Steps: the Host presses **Walk in** in the page header. At that moment
  the load signal crosses into rush. The Walk-in dialog is open, so the
  phase change waits (Flow B, step 4). The Host fills the dialog and
  confirms. The dialog closes, focus returns to **Walk in**, and the phase
  then moves to rush over the cinematic fade. The page header band warms,
  ambient decoration stops, and the now-line, the Covers KPI and the
  reservation blocks starting in the next 30 minutes gain the verdigris
  emphasis ring. The phase slot reads "Rush". The Host
  taps the next reservation block. It sits at the same position and size it
  had before the shift.
- Result: completes. Geometry is pinned by the box rule (Service-aware mode
  § The rule), and the bounding-box test in PRD criterion 8 proves it.

### 2. Load wobbling on the threshold

- Actor and goal: a Host through a service where covers hover around the
  rush threshold for twenty minutes. They want a screen that does not
  flicker between modes.
- Steps: load crosses up, so the phase moves to rush. Load dips below the
  threshold, but rush has a minimum dwell and the exit threshold sits lower
  than the entry, so the phase stays at rush. Load stays low past the dwell
  and the phase moves to settling. Settling has its own dwell. A new spike
  during settling returns the phase to rush with no stop at calm.
- Result: completes. Hysteresis values are the Architect's job (PRD open
  question 1). UX requires asymmetric thresholds, a minimum dwell per
  phase, and settling as a visible phase.

### 3. A screen-reader manager with reduced motion during rush

- Actor and goal: a Manager using VoiceOver with
  `prefers-reduced-motion: reduce` works the Timeline through a rush.
- Steps: the phase moves to rush. Colour and emphasis change instantly,
  with no fade, and nothing ever animated ambiently for this user. The
  page's existing single live region (`LiveStatus`) says once, politely:
  "Service is in rush. Upcoming arrivals are highlighted." The
  Manager moves through the page. Element order and names are unchanged,
  and the phase slot reads "Service: Rush". Later the region says
  "Service is settling". At calm it says "Service is calm."
- Result: completes. Nothing is conveyed by colour alone. The phase slot
  carries the word, and each emphasised region keeps its visible text.

### 4. Matt says no-go on the kill test

- Actor and goal: the Owner judges the candidate palette on five
  primitives.
- Steps: Matt opens the go/no-go issue and reads the board (Screens § Kill-
  test board): each primitive before and after, light and dark, on canvas,
  tinted and velvet. He replies "no-go: plum reads as error-adjacent". The
  run stops palette work. No other component's styling changes. The board
  can be re-run with revised candidates as a new issue.
- Result: completes. PRD criterion 1 owns the stop.

### 5. Offline mid-rush

- Actor and goal: a Host during rush when the SSE connection drops.
- Steps: the existing OfflineBanner appears. This feature does not change
  it. The phase holds at rush, because no fresh signal means no evidence of
  change. If sync stays down past the hold limit, the phase moves to
  settling and then calm on the normal dwell. When sync returns, the phase
  follows live data again.
- Result: completes, with a recorded assumption. A held phase is labelled
  the same as a live one; the OfflineBanner is what tells staff the data is
  stale.

### 6. Browsing tomorrow during tonight's rush

- Actor and goal: a Host on Timeline steps to tomorrow's date with the
  date arrows to check a large party, while tonight is in rush.
- Steps: the phase reflects the room, not the viewed date, so the phase
  slot still reads "Rush" and ambient decoration stays quiet. The emphasis
  ring targets (the now-line and the next 30 minutes of arrivals) only exist for today's
  view, so tomorrow shows no rings. Stepping back to today shows them
  again.
- Result: completes.

### 7. The demo behind Auth0

- Actor and goal: Matt, or Verify, runs the demo sentence without
  production access.
- Steps: open Timeline in rehearsal mode (`?rehearsal=true`) on local dev.
  The simulated Friday service fills the grid. The phase follows the
  simulated load through calm, building, rush and settling, with no
  setting touched.
- Result: completes, if rehearsal mode can drive the signal. That is
  recorded under Dependencies surfaced for Architect.

### 8. A prospect judging the craft

- Actor and goal: a Prospect browsing rialto-web component pages.
- Steps: every component page renders with the new palette through tokens.
  The Theme toggle shows light and dark. Plum and verdigris appear in their
  roles: plum on hover tints, links and highlighted options; verdigris on
  live examples. Nothing on rialto-web is service-aware.
- Result: completes. Story 5 is reached through the palette alone.

## Code facts

- Colour tokens: `packages/rialto/src/tokens/colors.css`, generated from
  `colors.json` (light) and `colors.dark.json` (dark). Today the light
  surface ladder runs `#fdfcfa` elevated, `#f8f6f3` canvas, `#edeae5`
  recessed, `#d8d4cd` matte, `#a8a49d` deep. The dark ladder runs
  `#141312` recessed, `#1e1c1a` canvas, `#2a2725` elevated, `#3a3633`
  matte, `#4a4643` deep. The one accent is gold, `#b0841e` light and
  `#d4a23a` dark. The six neon tones are restricted to NeonSign tube text.
  A nested light scope (`[data-theme="dark"] [data-theme="light"]`)
  already re-declares tokens on an island.
- Focus ring: `packages/rialto/src/tokens/shadows.css`
  `--rialto-shadow-focus` is a 2px `--rialto-surface` gap and then a 2px
  `--rialto-accent` ring, so the ring is judged against the gap colour.
  Light gold on canvas gives 3.16:1.
- Contrast test: `packages/rialto/src/test/token-contrast.test.ts` reads
  the DTCG JSON and checks text at 4.5:1 and UI at 3:1, compositing `rgb(…
/ a)` tokens over their background.
- Vibes: `packages/rialto/src/providers/vibes.ts`. `transacting` and `game`
  change `--rialto-space-sm/md/lg` and set `--rialto-weight-medium: 600`.
  `RialtoProvider` merges preset, reduced-data, reduced-motion and caller
  overrides into inline custom properties on a wrapper `<div>`
  (`RialtoProvider.tsx`). The reduced-data adapter also shrinks spacing.
- Spacing reaches control boxes:
  `packages/rialto/src/tokens/component-tokens.css` sets
  `--rialto-button-md-padding-x: var(--rialto-space-md)` and input padding
  from `--rialto-space-sm`, so any space override resizes auto-width
  buttons and inputs. A weight change alters text width, so it also
  resizes auto-width controls. Heights are fixed tokens (32/40/48px).
- Kill-test primitives read: Button uses `--rialto-accent`,
  `--rialto-text-on-accent`, `--rialto-surface-recessed` and
  `--rialto-border` (component tokens in `component-tokens.css`). Input
  and Select read `--rialto-surface-recessed` for the well,
  `--rialto-accent` for the focus border and `--rialto-text-tertiary` for
  placeholders. Card reads `--rialto-surface-elevated`,
  `--rialto-shadow-sm` and `--rialto-shadow-luminous`. Tabs read
  `--rialto-text-primary`, `--rialto-text-tertiary` and
  `--rialto-radius-round`.
- Hospitality mount: `apps/hospitality/src/main.tsx` renders one
  `<RialtoProvider persistTheme>` with no `vibe` around the whole app. The
  index route and `/timeline` render `TimelinePage`. `/dashboard` renders
  `HomePage`.
- Timeline: `apps/hospitality/src/pages/TimelinePage.tsx` has the header
  with date arrows (IconButton), **Today**, **Walk in**, the live text,
  four `KpiStat`s (reservations, covers, confirmed, pending), the grid,
  `AutopilotPanel` and a details sidebar `Card`. It mounts the page's
  single live region `LiveStatus` (`role="status"`, `aria-live="polite"`)
  and `OfflineBanner` when `isFromCache || !isConnected`. With
  `?rehearsal=true` it renders `RehearsalTimelinePage` instead, which fills
  the grid from `simulate-service.ts` and mounts none of the live data
  hooks.
- Dashboard: `apps/hospitality/src/pages/HomePage.tsx` uses
  `useDashboardStatsQuery` (`expectedCovers`, `upcomingCount`,
  `waitlistCount`, `longestWaitMinutes`). It shows a `NeonSign` in the
  header that is a status indicator, not decoration: it takes
  `state={openState.state}` and is lit only when the venue is open or
  opening soon (`NeonSign.tsx`), a stat row, quick-action secondary Buttons, `ReservationList`,
  `ActivityFeed`, `LapsingGuestsWidget`, `DepositExposureWidget` and
  `TurnedAwayHeatmap`.
- Audit document: `packages/rialto/docs/ui-audit.md` is prose grouped in
  alphabetical batches, one `###` per component file, with `file:line —
finding` lines or `✓ pass`. It has no severity, date per row or status.
- Motion: `useMotionPreset()` returns instant transitions under reduced
  motion. Ambient loops must pause offscreen and above 5s
  (`packages/rialto/CLAUDE.md`, `docs/motion.md`). Duration tokens are
  `fast|standard|slow|scene (0.6s)|cinematic (1.2s)|ambient (8s)`.

## Palette direction

**Name:** Parchment and Velvet (light), Smoke and Velvet (dark). Warm
neutrals stay the base. Two mid-tone surfaces fill the gap between the
extremes, and two jewel accents join gold, so colour carries meaning
instead of decoration.

### Surfaces (new)

| Token                     | Light     | Dark      | Use                                                                                   |
| ------------------------- | --------- | --------- | ------------------------------------------------------------------------------------- |
| `--rialto-surface-tinted` | `#e9dfcf` | `#3b3022` | Parchment / smoked brass. Page bands, Tabs track, grouped regions, rush header band.  |
| `--rialto-surface-velvet` | `#4a3a5c` | `#3b2f4a` | Plum velvet. Signature bands (feature Card scene, nav rail, hero strips); ivory text. |

Light luminance moves from 0.92 (canvas) through 0.75 (tinted) to 0.05
(velvet). Dark luminance moves from 0.012 (canvas) through 0.03 (tinted
and velvet, separated by hue). Neither new dark surface is a disabled
look: `#3a3633` matte stays the disabled fill.

Content on each mid-tone surface reads re-declared tokens:

| On surface   | text-primary          | text-secondary        | text-tertiary          | border                | focus ring |
| ------------ | --------------------- | --------------------- | ---------------------- | --------------------- | ---------- |
| tinted light | `#1a1918`             | `#5f5a54`             | `#625d57`              | `#7a746c`             | `#8f6a14`  |
| velvet light | `#f6efe2`             | `#f6efe2` at 72%      | (use secondary)        | `#f6efe2` at 45%      | `#d4a23a`  |
| tinted dark  | ivory 92% (unchanged) | ivory 60% (unchanged) | ivory **55%** (was 50) | white 40% (unchanged) | `#d4a23a`  |
| velvet dark  | ivory 92% (unchanged) | ivory 60% (unchanged) | ivory **55%**          | white 40% (unchanged) | `#d4a23a`  |

Light gold `#b0841e` fails as a focus ring on tinted (2.58:1). That is why
tinted needs its own deeper focus gold, `#8f6a14` (3.76:1). Gold as a fill
(primary Button) keeps `#b0841e` and dark text everywhere.

The ring is judged against its gap, and today the gap is drawn in
`--rialto-surface` (canvas). Inside a mid-tone band the gap must take the
band's own colour, or the light velvet ring would sit on a canvas gap at
2.16:1 (fail). So each mid-tone scope also re-declares a focus-gap colour
equal to its surface. The ring is then checked against the band in the
table below, and the contrast test checks both ring-on-gap and
ring-on-band.

### Accent roles (new, beyond gold)

| Role          | Token family                                                   | Light     | Dark      | Meaning (never decoration)                                                                                                                                           |
| ------------- | -------------------------------------------------------------- | --------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gold (kept)   | `--rialto-accent*`                                             | `#b0841e` | `#d4a23a` | Primary action, focus, **selected**. Rule unchanged.                                                                                                                 |
| **Plum**      | `--rialto-plum`, `-plum-muted`, `-text-on-plum`                | `#7a2e6a` | `#d58ac4` | The voice: hover and pressed tints of secondary and ghost controls, **highlighted** (not selected) options, links, text selection, caret, secondary emphasis. Royal. |
| **Verdigris** | `--rialto-verdigris`, `-verdigris-muted`, `-text-on-verdigris` | `#1f6b62` | `#5cc4b4` | Live: anything reflecting live service state, such as the live dot, now-line, real-time counts and the service-aware emphasis ring. Speakeasy patina.                |

Muted tints use the existing gold recipe: 12% light and 15% dark over the
canvas. On-fill text is `#fdfcfa` on light plum and verdigris, and
`#1a1918` on dark. The dark values are deliberately vivid: that is the
gen-z register, carried by jewel tones on smoke, never neon fills. Neither
accent is ever the only signal (icon or text always accompanies it).
Neither replaces the semantic error, warning or success tokens.

### Contrast checks the candidates must pass

The candidates were computed by the WCAG 2.1 formula that
`token-contrast.test.ts` uses. Each row becomes a test assertion in
Implement.

| Pair                                                       | Light                     | Dark                     | Threshold |
| ---------------------------------------------------------- | ------------------------- | ------------------------ | --------- |
| text-primary on tinted                                     | 13.31                     | 10.89                    | 4.5       |
| text-secondary (re-declared) on tinted                     | 5.17                      | 5.58                     | 4.5       |
| text-tertiary (re-declared) on tinted                      | 4.94                      | 4.97                     | 4.5       |
| border (re-declared) on tinted                             | 3.51                      | 3.43                     | 3         |
| focus ring on tinted                                       | 3.76 (`#8f6a14`)          | 5.53                     | 3         |
| text-on-velvet primary / secondary                         | 8.95 / 5.52               | 10.53 / 5.46             | 4.5       |
| text-tertiary 55% on velvet (dark)                         | n/a                       | 4.87                     | 4.5       |
| border on velvet                                           | 3.15                      | (white 40%) ≥3           | 3         |
| focus ring on velvet                                       | 4.40 (`#d4a23a`)          | 5.34                     | 3         |
| plum as text on canvas / elevated / recessed / tinted      | 8.02 / 8.44 / 7.21 / 6.56 | 6.68 / 5.84 / n/a / 5.06 | 4.5       |
| verdigris as text on canvas / elevated / recessed / tinted | 5.83 / 6.14 / 5.24 / 4.77 | 8.10 / 7.07 / n/a / 6.13 | 4.5       |
| plum on its muted tint / verdigris on its muted tint       | 6.60 / 4.92               | to be computed           | 4.5       |
| on-fill text on plum / verdigris                           | 8.44 / 6.14               | 6.91 / 8.37              | 4.5       |
| verdigris emphasis ring on canvas / tinted                 | 5.83 / 4.77               | 8.10 / 6.13              | 3         |

Two tests the current tokens already carry still matter. The re-declared
light text-secondary `#5f5a54` must also pass on the plain canvas (it is
darker than today's `#6b6660`, so it does). Dark text-tertiary at 50% fails
on both new dark surfaces (4.39 and 4.31), so the 55% re-declaration is
required, not optional.

### Kill-test mapping (token remaps only, no component API change)

| Primitive | Before                                                          | After                                                                                                                                     |
| --------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Button    | primary gold; secondary elevated + grey border; ghost grey text | primary gold (unchanged); secondary: plum text, plum 1px border, plum-muted hover; ghost: plum-muted hover; destructive unchanged         |
| Input     | recessed well, grey border, gold focus border                   | well becomes elevated when on tinted; plum caret and text-selection; hover border plum; focus border stays gold (tinted-scope focus gold) |
| Select    | as Input; highlighted option gold-muted                         | trigger as Input; highlighted option plum-muted, with the selected option keeping the gold check                                          |
| Card      | elevated on canvas, grey shadow                                 | elevated on tinted band reads as a lifted sheet; a velvet scene shows the same Card on velvet with ivory text                             |
| Tabs      | neutral track, primary/tertiary text                            | track tinted; selected indicator gold; hover text plum; live count badges verdigris                                                       |

## Service-aware mode

### The rule

Service-aware mode never changes any element's box. It may change only:

- **Colour:** surface fills, text colour between AA-passing tokens, accent
  emphasis.
- **Paint-only effects:** `box-shadow`, `outline` (with no layout effect),
  and the opacity of purely decorative layers.
- **Motion:** durations, easing, and whether ambient loops run.
- **Words inside a reserved slot:** the phase label, in a slot sized for
  the longest localised label in every phase.

It never changes `--rialto-space-*`, `--rialto-text-*` sizes, any weight
or tracking token, border widths, radius-driven insets, element order, or
whether an element is in flow. So the existing `transacting`, `game` and
reduced-data overrides cannot be reused for rush. Rush is a new override
set limited to colour, shadow and motion tokens.

"Denser" in the demo means **denser in emphasis**. Decoration goes quiet,
data gains contrast, and what matters in the next 30 minutes is ringed.
The layout stays still.

### Phases

| Channel                                                                            | Calm (default)     | Building                       | Rush                                                                                                                     | Settling                      |
| ---------------------------------------------------------------------------------- | ------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| Phase slot text                                                                    | "Calm"             | "Building"                     | "Rush"                                                                                                                   | "Settling"                    |
| Page header band                                                                   | canvas             | canvas                         | `surface-tinted`                                                                                                         | `surface-tinted`, fading back |
| Ambient decoration (NeonSign flicker, backdrops, `shadow-ambient`, luminous bloom) | full               | at half opacity, loops slowed  | off and static: NeonSign keeps its open-state lighting but stops flicker and bloom; no backdrops, elevation-only shadows | returns at half               |
| Feedback durations                                                                 | tokens as-is       | as-is                          | fast 0.06s / standard 0.09s (inside the 100ms budget)                                                                    | as-is                         |
| Priority emphasis                                                                  | none               | verdigris live dot pulses once | verdigris 2px ring (box-shadow) on priority targets (see Screens)                                                        | ring at half opacity          |
| Deprioritised panels                                                               | normal             | normal                         | panel titles drop to text-secondary (Dashboard: Lapsing guests, Deposit exposure, Turned-away heatmap)                   | normal                        |
| Live region (once per change)                                                      | "Service is calm." | silent                         | "Service is in rush. Upcoming arrivals are highlighted."                                                                 | "Service is settling."        |

Announcements fire only on a phase change. Page load announces nothing,
building is silent, and "Service is calm." fires only when settling ends.
Entry runs calm → building → rush. Exit runs rush → settling → calm. A
spike during settling returns straight to rush. Building that subsides
returns to calm with no announcement.

### Transitions

- Colour changes cross-fade over `--rialto-duration-cinematic` (1.2s),
  so a large area changes slowly in a host's peripheral vision. There is
  never a flash and never more than one phase change in flight.
- Under `prefers-reduced-motion: reduce`, every change is instant, and
  ambient decoration is off in every phase (as today).
- A phase change waits while a Dialog or Drawer is open or a text field
  has focus. It applies on close or blur, capped by a maximum delay.
- Under `prefers-contrast: more`, the emphasis ring becomes a solid 2px
  outline in the verdigris token. Under `forced-colors: active`, it
  becomes an outline in `Highlight`. The phase word carries the meaning in
  both.

## Flows

### A. Kill test (Owner)

1. Implement builds the kill-test board (Screens § Kill-test board) in
   Storybook with current and candidate tokens side by side.
2. Screenshots for light and dark are attached to a `ready-for-human`
   issue assigned to Matt, titled "Palette kill test: go or no-go".
3. Matt replies in writing, "go" or "no-go: <reason>".
4. Go: palette work continues to the other components. No-go: palette
   work stops (Walkthrough 4).

### B. A service shifts (Host, no action)

1. The Host opens Timeline (`/`) or Dashboard. The phase is computed from
   live data on load. A page opened mid-rush starts in rush with no
   transition and no announcement.
2. Load rises past the building threshold, then building applies.
3. Load rises past the rush threshold for the dwell, then rush applies.
4. If an overlay is open or a field focused, the change waits (Transitions).
5. Load falls below the exit threshold for the dwell, then settling
   applies, then calm.
6. The Host never touches a setting. Every control stays where it was.

### C. Audit (Owner and agents)

1. The auditor writes one row per component exported from
   `packages/rialto/src/components/index.ts`.
2. Each finding gets an ID, severity, WCAG criterion where one applies,
   evidence, and status.
3. Each of the 2026-05-16 findings is re-checked into the re-check table.
4. Critical and serious findings are fixed in batches. Each row links the
   test that pins the fix.
5. Moderate and minor findings link their filed issue.
6. A script fails on any exported component without a row.

### D. Uniqueness verdict (Owner)

1. When Ship writes release.md, a `ready-for-human` issue is opened for
   Matt with a due date 7 days out.
2. Matt picks two stock kits and names them in the issue. The board is
   filled with matching screenshots (Screens § Verdict board).
3. Matt judges the blinded columns, then opens the key, then writes the
   verdict: "unmistakably Rialto: yes/no" with a sentence on why.
4. No verdict by the date counts as not met.

## Screens

### Timeline, with the phase slot

```
┌ PageHeader ─────────────────────────────────────────────────────────────┐
│ Timeline                      [‹] [›] [Today] [Walk in]                  │
│ Tue 25 Nov · ● Live           Service: Rush ← reserved slot, fixed width │
├ KPI row (non-interactive) ──────────────────────────────────────────────┤
│ Reservations 84 │ Covers 212 │ Confirmed 70 │ Pending 14                │
├ Grid ─────────────────────────────────────────────┬ Details Card ───────┤
│ 19:30   19:45  ┃now  20:00   20:15   20:30         │                     │
│ T4 [Ruiz 4]    ┃     ╔[Okafor 2]╗                  │                     │
│ T7             ┃  ╔[Lee 6]╗         [Hart 2]       │                     │
│ blocks in next 30 min ringed; now-line verdigris   │                     │
└────────────────────────────────────────────────────┴─────────────────────┘
```

- Purpose: run the floor. The mode adds nothing to do.
- Phase slot: plain text, "Service: <phase>", next to the live text. It is
  not a button, not focusable, and has no tooltip. Its width is reserved
  for the longest localised phase label in all four locales.
- Priority targets on Timeline: the existing now-line (drawn in verdigris
  instead of its current colour), the Covers KPI, and reservation blocks
  whose start falls in the next 30 minutes. The ring is a box-shadow on
  each existing element, so it paints outside the box without taking
  space or changing hit areas. Blocks keep their status colours; the ring
  sits outside them.
- Priority targets on Dashboard: the Upcoming and Waitlist stats.
- Empty state (no tables or no reservations, existing EmptyState): the
  phase is always calm. The slot shows "Service: Calm".
- Loading state: the existing skeleton. The slot is empty but keeps its
  width. The phase is not shown until the first data arrives.
- Error state: the existing ErrorRetryBanner or OfflineBanner. The phase
  holds (Walkthrough 5) and the slot keeps its last value.

### Dashboard, in rush

```
┌ PageHeader: Tonight  [NeonSign: lit, no flicker]   Service: Rush ─────────┐
├ Stats: Expected covers │ Upcoming (ring) │ Waitlist · longest (ring)    │
├ [Walk in] [Floor plans] [Guests] [Booking widget]   ← unchanged         │
├ Reservations          │ Activity feed                                   │
├ Lapsing guests (title: text-secondary) │ Deposit exposure (dimmed title) │
└ Turned-away heatmap (dimmed title) ────────────────────────────────────┘
```

- Purpose: see the shape of tonight. In rush, the eye goes to upcoming
  arrivals and the waitlist first.
- Empty, loading and error states: the existing states are unchanged. The
  phase rules match Timeline.

### Kill-test board (Storybook story, screenshotted)

```
             │ Light canvas │ Light tinted │ Velvet │ Dark canvas │ Dark tinted
─────────────┼──────────────┼──────────────┼────────┼─────────────┼────────────
Button before│ prim sec ghost destr (rest / hover / focus-visible / disabled)
Button after │ …
Input  before│ empty / filled / focus / invalid
Input  after │ …
Select before│ closed / open with highlighted + selected option
Select after │ …
Card   before│ default / interactive-hover
Card   after │ …
Tabs   before│ 3 tabs, one selected, one hovered, one with a count
Tabs   after │ …
```

- Purpose: Matt answers one question. Does "after" read as more Rialto
  and less generic?
- Each cell labels its contrast-critical pair (for example "focus 3.76:1")
  in caption text below the row, so the go/no-go can see AA held.
- Before columns render with today's tokens. They have no tinted or
  velvet surface, so those cells show "n/a: new surface".

### Audit report (`packages/rialto/docs/ui-audit.md`, rewritten)

```
# Rialto component audit — 2026-11-xx
Scope: every export of src/components/index.ts at audit time (N components).
Open: critical 0 · serious 0 · moderate n · minor n   Old findings: fixed n · open n · obsolete n

## Summary
| Component | Audited    | A11y | Visual | Interaction | Open (C/S/M/m) | Issues |
| Accordion | 2026-11-xx | pass | pass   | pass        | 0/0/0/0        |        |
| Alert     | 2026-11-xx | fixed| pass   | pass        | 0/0/1/0        | #nnnn  |

## Findings
### Alert
- RA-Alert-1 · serious · WCAG 2.3.3 · fixed — exit animated height (Alert.tsx:126) → pinned by Alert.motion.test.tsx
- RA-Alert-2 · moderate · — · open — "Dismiss" label vague → #nnnn

## Re-check of the 2026-05-16 audit
| Old finding (quoted)                        | Status   | Severity | Where now      |
| Alert.tsx:126-130 exit animates height…     | fixed    | serious  | RA-Alert-1     |
| GenCopilot …                                | obsolete | —        | component gone |
```

- Purpose: Matt sees at a glance that critical and serious findings are
  zero. Agents can grep a component and get its state.
- Status vocabulary is exactly `fixed`, `open`, `obsolete`. Severity is
  exactly `critical`, `serious`, `moderate`, `minor`.
- Empty state: a component with no findings shows `pass` in every column
  and no Findings subsection.

### Verdict board (in the verdict issue)

```
| Scene (same composition) | A | B | C |
| Host stand, light        | img | img | img |
| Host stand, dark         | img | img | img |
| Form: Input+Select+Button| img | img | img |
| Tabs + Card              | img | img | img |
<details>Key: A = …, B = …, C = Rialto</details>
Verdict: unmistakably Rialto? yes / no — why:
```

- Purpose: one written judgement, made before the key is seen.
- Rialto shots come from the rehearsal Timeline in rush plus the kill-test
  primitives. Kit shots come from each kit's own docs at the same viewport.
  Column order is shuffled.

## Conventions to match

- `packages/rialto/CLAUDE.md`: tokens only, never hex in components.
  Gold stays limited to focus, selected and primary. Motion resolves
  through `useMotionPreset()`, animating only transform and opacity, with
  ambient loops paused offscreen. Logical properties throughout.
- `.claude/rules/ui-quality.md`: no accidental dark canvas, atmosphere
  only from tokens, zero axe violations at any impact.
- `motion.md`: tab switches and other 100+/day actions stay instant or
  opacity-only. Nothing in rush animates on a host's action.
- One page-level live region (`LiveStatus`). Never add a second (#8883:
  duplicate announcements shipped once).
- Localisation through `RialtoMessages` and the app's i18next. The four
  phase labels and three announcements need every locale (en-US, en-GB,
  es-MX, fr-CA).

## Dependencies surfaced for Architect

- **Surface scopes.** Mid-tone surfaces need re-declared text, border and
  focus tokens for the content on them (the table in Palette direction).
  The token pipeline (`colors.json` → `colors.css`) and
  `token-contrast.test.ts` must learn per-surface pairs.
- **A focus-ring token separate from the accent fill**, so tinted can use
  `#8f6a14` for focus while primary Buttons keep `#b0841e`.
- **The vibe seam carries geometry today.** Rush needs an override set
  that the box-rule test can prove is colour, shadow and motion only.
  `RialtoProvider` applies vibes app-wide on one wrapper, but the mode
  covers two routes.
- **Ambient on/off** needs a mechanism (token or context) that NeonSign,
  backdrops and luminous shadows obey.
- **Reserved-width phase slot** across four locales.
- **Defer-while-busy:** detecting an open overlay or a focused field, and
  the maximum delay.
- **Offline hold limit**, thresholds, dwell and hysteresis (PRD open
  question 1).
- **Dashboard has no live region today** (`HomePage.tsx` mounts no
  `role="status"`). The phase announcements need exactly one page-level
  region there, matching Timeline's `LiveStatus`.
- **A focus-gap colour separate from `--rialto-surface`**, re-declared
  per mid-tone scope (Palette direction), because re-declaring
  `--rialto-surface` itself would repaint every component that fills
  with it.
- **Rehearsal mode** mounts no `LiveStatus`, so the demo cannot voice
  phase announcements without one page-level region there.
- **Rehearsal mode** mounts none of the live hooks. The demo and Verify
  need the simulated service to feed the same load signal (Walkthrough 7).

## Deliberately not designed

- Service-aware mode on Reservations, Waitlist, Floor plans, rialto-web,
  marketing and public booking. Only Timeline and Dashboard are in this
  run.
- Any manual override or "pin calm" control. Criterion 7 forbids a
  setting. If hosts ask for one after Operate, it becomes a new idea.
- Restyles beyond token remaps (PRD out of scope). New components are
  filed as issues.
- A third theme (for example "dusk") as a user choice. The mid-tones are
  surfaces inside light and dark, not a theme toggle.
- Plum and verdigris muted-tint values in dark (to be computed when the
  tokens are written). Final tuning of any candidate hex after Matt's
  kill-test feedback.
- Audit on rialto-web as a page. The report is a markdown document.
- Sound or haptics for phase changes (the Moonshot).

## Review

- Review: independent (fresh reviewer subagent, given idea.md, prd.md,
  autorun-brief.md, ux.md and the code paths under Code facts). 2 High, 0
  Critical.
- High: the Dashboard NeonSign shows the venue's open state, so turning
  it unlit in rush would show "closed" at the busiest hour. Fixed: rush
  keeps its open-state lighting and stops only flicker and bloom (Phases
  table, Dashboard sketch, Code facts).
- High: the light velvet focus ring was measured against the band, but
  the ring's gap is drawn in `--rialto-surface` (canvas), which gives
  2.16:1. Fixed: each mid-tone scope re-declares a focus-gap colour equal
  to its surface, and the contrast test checks ring-on-gap and
  ring-on-band (Palette direction, Dependencies).
- Below High, also fixed: calm announcement timing clarified; Rehearsal
  mode has no live region (added to Dependencies); dark tertiary-on-tinted
  corrected to 4.39:1 (still a fail, so the 55% rule stands).
- Walkthroughs 1–8 re-walked after the fixes. All complete.
