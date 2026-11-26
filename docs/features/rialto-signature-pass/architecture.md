---
stage: architect
run: feature:rialto-signature-pass
date: 2026-11-25
assumptions:
  - "Unattended autorun. The trade-off questions were answered from idea.md, prd.md, ux.md and autorun-brief.md, not with the Owner one at a time."
  - "Load signal: load = (seats at tables whose status is OCCUPIED + covers of live reservations starting in the next 30 minutes) / total seats on the venue's tables. The waitlist is left out because no SSE event invalidates the waitlist query (`apps/hospitality/src/hooks/sse-query-keys.ts`), so it would be the one stale input. This answers the PRD open question 'Load signal and thresholds'."
  - "Thresholds, dwell and hysteresis are the values in Data model § Phase machine config, chosen by a spike run of `simulateService` (friday, weeknight and brunch profiles, seven seeds, a 22-table, 72-seat room). They are constants a calibration test pins. Implement may tune them only while that test stays green."
  - "Defer-while-busy cap 60 s, post-busy settle 3 s, offline hold 10 min. UX left all three to the Architect; none had a skill default, so these are the smallest values that keep a phase change off a host's hands and out of the way of an action's own announcement."
  - "Phase state is page-local: Timeline, Dashboard and rehearsal each run their own machine, seeded from the current load on mount with no transition and no announcement (ux.md Flow B step 1). A layout-level machine was the alternative."
  - "Rush retimes CSS duration tokens only. framer-motion presets from `useMotionPreset()` are not page-scoped and do not change in rush."
  - 'The kill test''s candidate remap ships behind a scoped `[data-palette="signature"]` selector, so the kill-test PR changes no shipped component and no existing visual baseline. On a go, the remap moves to `:root` in a later PR.'
  - "The audit-coverage test reads `packages/rialto/src/components/index.ts`, as PRD criterion 4 says, not the compiled manifest that `scripts/rialto-component-count.mjs` treats as the component count. The manifest needs a build and rialto's vitest run does not have one."
  - "The bounding-box test drives the phase through a dev-only seam (a window event that only `import.meta.env.DEV` builds listen for). Production builds have no override and no setting (PRD criterion 7)."
  - "The geometry and reduced-motion Playwright specs run in Hospitality E2E, which is advisory. `CI Gate` does not require it, so Verify must run those specs and record the result. They do not block merge on their own."
  - "Rialto changesets are `patch`, per packages/rialto/CLAUDE.md, including the new `PaintScope` export."
---

# Architecture: Rialto signature pass

## Approach

The run has two parts that share no code. Both rest on one idea: Rialto
changes the look through tokens and scopes, never through component props.

The **palette** is additive tokens, plus a new kind of scope. Two mid-tone
surfaces (tinted, velvet) become `data-surface` scopes. A scope
re-declares the text, border and focus tokens for content on it, the way
the nested light island already does. Two accent families (plum, verdigris)
and a focus-ring token separate from the gold fill join the DTCG sources.
All of it is generated into `colors.css` and checked by
`token-contrast.test.ts`. The kill test can ship alone because the candidate
remap of the five primitives sits behind a scoped `[data-palette="signature"]`
selector. Only the board story uses that selector.

**Service-aware mode** is a pure phase machine in the hospitality app. Load
samples go in and a phase comes out (calm, building, rush, settling). The
phase is painted through a new Rialto primitive, `PaintScope`. It applies a
typed, paint-only override map on a `display: contents` wrapper, so the
wrapper itself has no box. Geometry is safe in three layers: the type system
refuses a spacing or type token, a unit test parses the token sheets, and a
Playwright spec compares every interactive element's bounding box across
phase changes.

The design does not reuse a `RialtoProvider` vibe preset. That provider is
app-wide, its presets carry geometry (`transacting` and `game` shrink
`--rialto-space-*`), and a subscribed, time-driven adapter would trip ADR-022's
pipeline trigger.

## Components

### Palette tokens (`packages/rialto/src/tokens/colors.json`, `colors.dark.json`)

- Responsibility: owns every colour value in both themes. This run adds
  `color.surface.tinted` and `color.surface.velvet`, the `color.plum.*` and
  `color.verdigris.*` families (default, muted, text-on), and
  `color.focus.ring` / `color.focus.gap`.
  `--rialto-focus-ring` defaults to the accent value and `--rialto-focus-gap`
  to the surface value, so existing surfaces render exactly as before.
- Collaborators: the colors.css generator, the contrast test, and the Figma
  token export (`scripts/generate-figma-tokens.ts`).

### Surface scopes (`packages/rialto/src/tokens/colors.surfaces.json`, new, and `scripts/generate-colors-css.ts`)

- Responsibility: owns the tokens re-declared for content on a mid-tone
  surface (ux.md § Palette direction, the table of on-surface tokens). One
  DTCG file holds `surface-scope.<tinted|velvet>.<light|dark>.<token>`
  overrides. The generator emits four blocks after the existing ones:
  `[data-surface="X"]` (light),
  `[data-theme="dark"] [data-surface="X"]` (dark), and
  `[data-theme="dark"] [data-theme="light"] [data-surface="X"]` (light inside a
  nested light island). Each block re-declares `--rialto-surface` to the band
  colour, plus `--rialto-focus-gap`, the text tokens, the border tokens and
  `--rialto-focus-ring`.

  Re-declaring `--rialto-surface` inside a band is deliberate. Content on a
  band (a Tabs track, a ghost Button) should paint on the band, not on canvas.
  Components that need a lifted sheet (Card, the Input well) read
  `--rialto-surface-elevated`, which the scope leaves alone.

- Collaborators: palette tokens; the derived-token re-resolution below;
  `assertTokenParity` in `scripts/lib/color-tokens.ts`, which grows a check
  that every scope declares the same keys in light and dark.

### Derived-token re-resolution (`packages/rialto/src/tokens/component-tokens.css`, `shadows.css`)

- Responsibility: makes tokens defined in terms of other tokens follow a
  scope. A custom property such as `--rialto-input-border-focus:
var(--rialto-accent)` is substituted where it is declared (`:root`), and
  descendants inherit the substituted value. So a scope that re-declares
  `--rialto-accent` or `--rialto-focus-ring` changes nothing for components
  that read a Tier-3 token or `--rialto-shadow-focus`. Today this is a latent
  bug in nested light islands.

  The fix: the selector of `component-tokens.css` becomes
  `:root, [data-theme], [data-surface], [data-palette]`. `shadows.css` gains
  one rule with the same selector that declares `--rialto-shadow-focus` from
  `--rialto-focus-gap` and `--rialto-focus-ring`. It replaces the two copies
  of the focus shadow under `:root` and `[data-theme="dark"]`. The kill-test PR
  ships only `[data-surface]` and `[data-palette]`. `[data-theme]` lands with
  the palette promotion; see Accepted behaviour changes.

- Collaborators: surface scopes; every component that reads a Tier-3 token.
  ADR-035 records the decision.

### Signature remap (`component-tokens.css`, scoped block)

- Responsibility: owns the kill-test mapping in ux.md § Kill-test mapping,
  as Tier-3 re-points only. Examples: `--rialto-button-secondary-text` points
  to `var(--rialto-plum)`, `--rialto-tabs-track-bg` to
  `var(--rialto-surface-tinted)`, and the Select highlighted option to
  `var(--rialto-plum-muted)`. No component file changes.

  Until the go, the block's selector is `[data-palette="signature"]`. On a go,
  the declarations move into the `:root` block and the scoped selector is
  deleted. The selector is marked `@internal` in a comment and is not
  documented as public API.

  Where a component reads a semantic token directly rather than a Tier-3 one
  (ux.md Code facts: Card reads `--rialto-surface-elevated`, Tabs read
  `--rialto-text-*`), the remap first adds a Tier-3 token with today's value,
  then points the component at it. That one-line component change is
  value-identical, so it does not move a baseline.

- Collaborators: derived-token re-resolution; the kill-test board.

### Kill-test board (`packages/rialto/src/stories/SignaturePalette.stories.tsx`, new)

- Responsibility: renders ux.md § Kill-test board. Rows are Button, Input,
  Select, Card and Tabs, before and after. Columns are light canvas, light
  tinted, velvet, dark canvas and dark tinted. Before cells render plain.
  After cells sit inside `data-palette="signature"`, with `data-surface` on
  the band cells. Each row's caption lists its contrast-critical pairs, read
  from the same JSON the contrast test reads, so a caption cannot drift from
  the tested value.

  It is not added to `src/test/visual/visual.spec.ts`'s story list. The
  screenshots are for Matt's eyes, not a baseline, so no macOS PNG is ever
  committed. Implement takes them with a one-off Playwright run against
  Storybook and attaches them to the go/no-go issue.

- Collaborators: the signature remap, surface scopes, the contrast test.

### Contrast test (`packages/rialto/src/test/token-contrast.test.ts`)

- Responsibility: proves every new pair in ux.md § Contrast checks, in light
  and dark. It also gains a data-driven loop over `colors.surfaces.json`: for
  each scope and theme it checks the re-declared text-primary, -secondary and
  -tertiary at 4.5:1 and the border at 3:1 against the band. It checks the
  focus ring at 3:1 against both the focus gap and the band (the ux.md review
  High). Plum and verdigris are checked as text on canvas, elevated, recessed
  and tinted, against their muted tints, and with their text-on tokens on
  them. The dark muted tints, left open by UX, are computed and asserted
  here.
- Collaborators: palette tokens and surface scopes. It reads only the JSON
  sources, as it does today.

### PaintScope (`packages/rialto/src/providers/PaintScope.tsx` and `paint-tokens.ts`, new; exported from `@mattbutlerengineering/rialto/providers`)

- Responsibility: applies a paint-only override set to a subtree without
  adding a box and without overriding the user's reduced-motion preference.
  It renders `<div class={contents} data-ambient={ambient} style={merged}>`,
  where `contents` is `display: contents` and `merged = { ...overrides,
...deriveReducedMotionOverrides(device) }`. Reduced motion ranks last, as in
  `RialtoProvider` (ADR-022 amendment). The scope element exists in every
  phase, so a phase change never adds or removes a DOM node.

  `paint-tokens.ts` exports `PAINT_TOKENS`, a readonly tuple of allowed names:
  every colour token from `colors.json`, the `--rialto-shadow-*` tokens, the
  six `--rialto-duration-*` tokens and the two `--rialto-ease-*` tokens. It
  also exports `type PaintToken = (typeof PAINT_TOKENS)[number]` and
  `type PaintOverrides = Partial<Record<PaintToken, string>>`. ADR-034 records
  the decision.

- Collaborators: `useDeviceContext` (provider-free, so PaintScope keeps the
  no-throw contract of ADR-025), `reduced-motion.ts`, and the ambient obeyers.

### Ambient obeyers (`NeonSign.module.css`; shadow tokens)

- Responsibility: honour `data-ambient="full" | "dim" | "quiet"` on the
  nearest ancestor. NeonSign gains `:global([data-ambient="quiet"]) .tube {
animation: none }` and stops its bloom. It keeps its open-state lighting,
  because the sign is a status indicator (ux.md review High).
  `:global([data-ambient="dim"])` puts its glow layer at half opacity. The
  luminous and ambient shadows are quieted by token overrides in the phase
  paint map (`--rialto-shadow-ambient: none`, and `--rialto-shadow-luminous`
  set to the `-sm` elevation value), not by new component rules.

  Canvas backdrops (`components/_ambient/ambient-canvas.ts`) appear on no
  covered screen (only `components/showcase/`), so they do not learn
  `data-ambient` in this run.

- Collaborators: PaintScope, which sets the attribute.

### Component audit (`packages/rialto/docs/ui-audit.md`, rewritten, and `packages/rialto/src/test/audit-coverage.test.ts`, new)

- Responsibility: the audit document has the shape in ux.md § Audit report.
  The test makes that shape a contract. It parses the Summary table and the
  Findings and Re-check sections and fails when:
  - a component exported from `src/components/index.ts` has no row, or a row
    names a component that is not exported;
  - a row's `Audited` date is before 2026-11-25;
  - a severity is outside `critical | serious | moderate | minor`, or a
    status is outside `fixed | open | obsolete`;
  - any finding is `open` and `critical` or `serious` (PRD criterion 6);
  - a `fixed` critical or serious finding names a pinning test file that does
    not exist;
  - an `open` moderate or minor finding carries no `#NNNN` issue reference;
  - the Re-check table does not have exactly one row for each finding of the
    2026-05-16 audit. That list is frozen as
    `src/test/fixtures/ui-audit-2026-05-16.json`, extracted once from
    `git show <sha>:packages/rialto/docs/ui-audit.md`.
- Collaborators: the a11y fixes, each pinned by a test the audit row names;
  the existing `src/test/accessibility/a11y-matrix.test.tsx`, which must
  report no critical or serious violation.

### Accessibility fixes (per component, `packages/rialto/src/components/**`)

- Responsibility: one fix per critical or serious finding. Each is pinned by
  a test that fails without the fix: axe for structure, a
  testing-library behaviour test for keyboard (the Slider double step) and
  live regions, and the existing motion guard tests for the height/padding
  animations. Fixes follow the standing component rules in
  `packages/rialto/CLAUDE.md`. There is no cross-cutting design beyond that
  rule.
- Collaborators: the component audit.

### Service-phase policy (`apps/hospitality/src/service-phase/load.ts`, `phase-machine.ts`, new)

- Responsibility: owns what "load" and "phase" mean. Both files are pure, with
  no React, no `@mbe/types` imports and no clock. `loadRatio(sample)` returns
  a number, or `null` when there are no seats. `initialPhase(sample, config)`
  and `nextPhase(state, sample, config)` implement the machine in Data model.
  This is the only place thresholds, dwell and hysteresis live.
- Collaborators: none inward. Two adapters build its `ServiceLoadSample`.

### Load adapters (`service-phase/live-load.ts` + `useLiveServiceLoad.ts`; `service-phase/rehearsal-load.ts`, new)

- Responsibility: translate the outside world into `ServiceLoadSample`.
  - Live: `useLiveServiceLoad()` reads `useTables({ venueId })` (seats and
    `OCCUPIED` status, kept fresh by `table:updated`) and
    `useReservations({ venueId, date: <today's service day>, limit: 200 })`
    (kept fresh by `reservation:*`). Today's service day comes from
    `useStaffTonight`, so the phase follows the room, not the viewed date
    (ux.md Walkthrough 6). On Timeline viewing today, this shares
    `useTimelineData`'s query key, so it costs no extra request. It ticks with
    `useNow(30_000)`. It marks the sample stale when `useSSEStatus().isConnected`
    is false or the data came from the offline cache.
  - Rehearsal: `rehearsalLoadSample(state, tables, minute)` reads
    `RehearsalState.tableStatuses` (`seated`) and the synthesized reservations
    from `rehearsal-state.ts`, with `at = minute × 60 000`.
- Collaborators: the service-phase policy (callee); live React Query hooks;
  `use-rehearsal-playback.ts`.

### Phase driver (`service-phase/useServicePhase.ts`, new)

- Responsibility: runs the machine over time, and decides when a phase change
  may reach the screen. It:
  - steps `nextPhase` on every new sample;
  - holds the applied phase while the page is busy, meaning
    `document.querySelector('[aria-modal="true"]')` exists, or the active
    element is an `input`, `textarea`, `select` or `[contenteditable]`. Rialto
    Dialog and Drawer both set `aria-modal`. It re-checks every 1 s while a
    change is pending, applies the change 3 s after the page stops being busy,
    and applies it anyway after 60 s;
  - while the sample is stale, holds for 10 min and then feeds the machine
    `load = 0`, so the normal exit dwell runs (ux.md Walkthrough 5);
  - calls `announce()` with the phase sentence once per applied change.
    Nothing is announced on mount, on entering building, or on building
    returning to calm.
  - in DEV builds only, listens for `mbe:force-service-phase` window events
    and applies the forced phase through the same apply path.
- Collaborators: the policy; the page's existing `useStatusMessage().announce`.

### ServicePhaseScope and PhaseSlot (`service-phase/ServicePhaseScope.tsx`, `PhaseSlot.tsx`, `phase-paint.ts`, `ServicePhase.module.css`, new)

- Responsibility: paints the applied phase. `ServicePhaseScope` renders
  `<PaintScope overrides={PHASE_PAINT[phase]} ambient={PHASE_AMBIENT[phase]}>`
  wrapping a `display: contents` element with `data-service-phase={phase}`.
  `PHASE_PAINT` is typed `Record<ServicePhase, PaintOverrides>`, so a spacing
  token fails `tsc`. It carries the rush feedback durations (fast 0.06s,
  standard 0.09s) and the shadow overrides.

  Paint that is not a token change lives in `ServicePhase.module.css`, keyed
  on `[data-service-phase]`:
  - the header band's tinted layer, a `::before` whose `opacity` cross-fades
    over `--rialto-duration-cinematic`;
  - the verdigris emphasis ring, an `::after` on each
    `[data-service-priority]` element, inset `-2px`, `opacity` only. Under
    `prefers-contrast: more` it becomes a solid outline, and under
    `forced-colors: active` an outline in `Highlight`;
  - the de-emphasised panel titles' colour.

  Both pseudo layers exist in every phase at `opacity: 0`, so a phase change
  is opacity only (ADR-033 limit 8). `data-service-priority` is set from time
  alone (the now-line, the Covers KPI, reservation blocks starting within 30
  minutes on today's view, and Dashboard's Upcoming and Waitlist stats), never
  from phase. `PhaseSlot` renders all four labels stacked in one
  `inline-grid` cell. The current label is visible and the other three are
  `visibility: hidden` and `aria-hidden`, so the slot is always as wide as the
  widest label in the active locale, with no measuring and no per-locale
  widths. It renders empty but keeps its width until the first sample.

- Collaborators: PaintScope; phase driver; hospitality i18n catalogs (four
  labels, three announcements, the "Service: {{phase}}" frame, in en-US,
  es-MX and fr-CA; en-GB only where the wording differs).

### Page wiring (`pages/TimelinePage.tsx`, `pages/HomePage.tsx`, `components/rehearsal/RehearsalTimeline.tsx`)

- Responsibility: mount one live adapter, one driver and one scope per page.
  `LiveTimelinePage` reuses its existing `LiveStatus`. `HomePage` gains
  `useStatusMessage()` and exactly one `LiveStatus`, because it has none today.
  In rehearsal, `RehearsalNight` (which owns `useRehearsalPlayback`) mounts
  the rehearsal adapter, the driver, the scope, a `PhaseSlot` beside
  `RehearsalPlaybackBanner`, and one `LiveStatus`.
- Collaborators: all hospitality components above.

## Data model

No persistence, no API change and no migration. Every read is client-side
over data the app already fetches. Consistency needed: "may settle within one
tick". A phase that lags the room by up to 30 s (live tick), or by up to one
SSE round-trip, is acceptable because dwell windows are minutes long.

### Access patterns

| Read                  | Source                                                                | Freshness                       |
| --------------------- | --------------------------------------------------------------------- | ------------------------------- |
| Seats, occupied seats | `useTables` → `Table.capacity`, `Table.status === "OCCUPIED"`         | `table:updated` SSE             |
| Covers due in 30 min  | today's `useReservations`, status not CANCELLED, NO_SHOW or COMPLETED | `reservation:*` SSE + 30 s tick |
| Rehearsal equivalents | `rehearsalStateAt(events, minute)`                                    | per simulated minute            |
| Token pairs           | `colors.json`, `colors.dark.json`, `colors.surfaces.json`             | build time                      |
| Audit rows            | `ui-audit.md` + `index.ts` + frozen `ui-audit-2026-05-16.json`        | test time                       |

### Types (hospitality policy)

```ts
type ServicePhase = "calm" | "building" | "rush" | "settling";

interface ServiceLoadSample {
  at: number; // ms; wall clock live, simulated minute × 60 000 in rehearsal
  seats: number;
  occupiedSeats: number;
  coversDueSoon: number; // live reservations starting in (at, at + 30 min]
  stale: boolean; // SSE down or offline cache
}

interface PhaseState {
  phase: ServicePhase;
  enteredAt: number; // for minimum dwell
  conditionSince: number | null; // when the pending transition's condition first held
}
```

Invariant owner: `PhaseState` is only ever produced by `initialPhase` and
`nextPhase`. Callers never construct or edit one.

### Phase machine config

| Constant               | Value                                   | Meaning                                                             |
| ---------------------- | --------------------------------------- | ------------------------------------------------------------------- |
| `BUILDING_ENTER`       | 0.60                                    | calm → building, immediately                                        |
| `BUILDING_EXIT` / hold | < 0.50 for 5 min                        | building → calm (silent)                                            |
| `RUSH_ENTER` / hold    | ≥ 0.90 for 5 min                        | calm or building → rush                                             |
| `RUSH_MIN_DWELL`       | 15 min                                  | rush cannot exit sooner                                             |
| `RUSH_EXIT` / hold     | < 0.75 for 10 min                       | rush → settling                                                     |
| `SETTLING_MIN_DWELL`   | 10 min                                  | then → calm once load < `BUILDING_ENTER`; ≥ `RUSH_ENTER` → rush now |
| `COVERS_DUE_WINDOW`    | 30 min                                  | look-ahead for `coversDueSoon` (matches the ring targets)           |
| `initialPhase`         | ≥ 0.90 rush; ≥ 0.60 building; else calm | page opened mid-service, no transition                              |

A spike ran this machine at 1-minute steps over `simulateService` (22 tables,
72 seats). It produced:

| Profile   | Seeds | Entered rush | Time in rush | Shortest phase |
| --------- | ----- | ------------ | ------------ | -------------- |
| friday    | 7     | 7 of 7, once | 90–125 min   | 10 min         |
| weeknight | 7     | 2 of 7, once | 40–60 min    | ≥ 5 min        |
| brunch    | 7     | 7 of 7, once | 25–125 min   | 5 min          |

These rows become `phase-calibration.test.ts`'s assertions. Every friday seed
enters rush exactly once and stays at least 90 min. No weeknight seed spends
more than 75 min in rush. No phase in any run lasts under 5 min. No service
enters rush twice.

### Token scope data (`colors.surfaces.json`)

```json
{
  "surface-scope": {
    "tinted": {
      "light": { "surface": {…}, "focus-gap": {…}, "text-primary": {…}, "text-secondary": {…},
                 "text-tertiary": {…}, "border": {…}, "border-strong": {…}, "focus-ring": {…} },
      "dark":  { … same keys … }
    },
    "velvet": { "light": {…}, "dark": {…} }
  }
}
```

The keys must be equal across light and dark, and across scopes; the parity
check enforces it. Values are the ux.md candidates until Matt's kill-test
feedback.

## Interfaces & contracts

### `data-surface` scope (CSS, public)

- Input: `data-surface="tinted" | "velvet"` on any element inside a
  `RialtoProvider` tree, or under a `data-theme` ancestor.
- Output: the element's subtree reads the band's surface, focus-gap, text,
  border and focus-ring tokens. It also gets Tier-3 component tokens and
  `--rialto-shadow-focus` re-resolved against them. The element does not
  paint its own background: the consumer sets
  `background: var(--rialto-surface-tinted)` (or `-velvet`), so a scope can
  also mark an image or gradient band.
- Failure modes: an unknown value matches no rule and the subtree keeps its
  parent's tokens, with no error. A scope nested in a scope takes the inner
  one. Mixing a light-only value into dark is impossible, because every block
  is generated from the parity-checked JSON.

### `PaintScope` (React, public)

- Input: `overrides: PaintOverrides`, `ambient?: "full" | "dim" | "quiet"`
  (default `"full"`), `children`.
- Output: a `display: contents` div carrying `data-ambient` and inline
  custom properties, with reduced-motion zeroing merged last.
- Failure modes: never throws, with or without a provider (ADR-025 contract).
  A key outside `PaintToken` fails `tsc`. At runtime, keys are not filtered
  because the type is the guard, and `paint-scope.geometry.test.ts` guards
  the allowlist itself. The `display: contents` wrapper is not focusable and
  has no role, so it adds nothing to the accessibility tree.

### `loadRatio`, `initialPhase`, `nextPhase` (hospitality policy)

- Input: `ServiceLoadSample` (and `PhaseState`, config for the step).
- Output: `number | null`; a `PhaseState`.
- Failure modes: `seats === 0` gives `null`, which the machine treats as calm
  (ux.md empty state). A sample with `at` earlier than `state.enteredAt` (a
  clock step back, or a rehearsal scrub backwards) re-seeds through
  `initialPhase` rather than computing negative dwell. A stale sample does not
  move the machine. The driver, not the policy, owns the 10-minute hold.

### `useLiveServiceLoad()` (hospitality adapter)

- Input: none. It reads venue context.
- Output: `ServiceLoadSample | null`. `null` while the tables or reservations
  query has never resolved, which keeps `PhaseSlot` empty but full width.
- Failure modes: a query error after first success keeps the last data
  (React Query) and marks the sample `stale`, so the phase holds. Timeouts
  and retries are the existing api-client and React Query defaults; this
  adapter adds no network call of its own. More than 200 reservations in a
  day under-counts `coversDueSoon`, which errs toward calm. That is the safe
  direction.

### `useServicePhase(sample, { announce })` (hospitality driver)

- Input: the latest sample, the page's `announce`.
- Output: `{ phase: ServicePhase | null }`. This is the applied phase, not the
  machine's pending one.
- Failure modes: if busy detection misses a custom overlay without
  `aria-modal`, the change applies with no wait. That is still geometry-safe,
  because the wait exists for attention, not layout. Timers are cleared on
  unmount. Retry is not applicable.

### Dev-only forced phase (test seam)

- Input: `window.dispatchEvent(new CustomEvent("mbe:force-service-phase", { detail: "rush" }))`.
- Output: the driver applies that phase through the normal apply path.
- Failure modes: inert in production. The listener is registered inside
  `if (import.meta.env.DEV)`, and a unit test asserts no listener exists when
  `DEV` is false.

### Geometry guarantee (tests)

1. **Type:** `PHASE_PAINT: Record<ServicePhase, PaintOverrides>`.
   `--rialto-space-md` is not a `PaintToken`, so `pnpm typecheck` fails.
2. **Static:** `packages/rialto/src/providers/paint-scope.geometry.test.ts`
   parses `spacing.css`, `typography.css` and `radius.css` and asserts that
   no `PAINT_TOKENS` entry is declared there. It asserts that every entry is
   declared in `colors.css` or `shadows.css`. It then scans every
   `*.module.css` under `packages/rialto/src` and `apps/hospitality/src` and
   fails when a paint token appears in the value of a geometry longhand:
   `width`, `height`, `min-*`, `max-*`, `padding*`, `margin*`, `inset*`,
   `top`, `right`, `bottom`, `left`, `gap*`, `font-size`, `font-weight`,
   `letter-spacing`, `line-height`, `border-*-width` or `outline-offset`.
3. **Runtime:** `apps/hospitality/e2e/service-phase-geometry.spec.ts` runs
   on the `mockedPage` fixture, on `/timeline`, `/dashboard` and
   `/timeline?rehearsal=true` (rehearsal paused), with `page.clock` fixed.
   For each phase in calm → building → rush → settling → calm, it dispatches
   the forced-phase event. It collects
   `getBoundingClientRect()` of every visible element matching
   `a[href], button, input, select, textarea, [role=button|link|tab|combobox|checkbox|switch|menuitem|option], [tabindex]:not([tabindex="-1"])`
   in document order, at 0 ms, 600 ms (mid cross-fade) and 1 300 ms. It
   asserts the list length, order and every `x, y, width, height` exactly
   equal the calm snapshot. A second pass runs under
   `emulateMedia({ reducedMotion: "reduce" })` and also asserts that
   `document.getAnimations()` is empty after each change (PRD criterion 10).

### Audit document (markdown contract)

- Input: `ui-audit.md`, with the Summary table columns `Component | Audited |
A11y | Visual | Interaction | Open (C/S/M/m) | Issues`, finding lines
  `RA-<Component>-<n> · <severity> · <WCAG|—> · <status> — <text> → <test path | #issue>`,
  and the Re-check table.
- Output: pass or fail from `audit-coverage.test.ts`.
- Failure modes: a malformed line fails with the line number. The test never
  skips. A component renamed in `index.ts` fails until its row is renamed.

## Accepted behaviour changes

The design replaces two rules. Running old and new over the inputs where they
differ gives:

- **Where derived tokens resolve** (old: `:root` only; new: `:root`, every
  `[data-theme]`, `[data-surface]` and `[data-palette]` element). They differ
  only on an element whose theme differs from `<html>`, which means a nested
  light island inside dark. In the repo today, that is the SilkFlow docs
  "Light" panel on rialto-web, and any `data-theme="light"` island in
  rialto-web stories. Inside one, Tier-3 component tokens and the focus ring
  now take the island's light values instead of the dark ones computed at
  `:root`. Everywhere else the computed values are identical, because
  `<html>` carries the same `data-theme` the provider's wrapper does. This is
  accepted: it is the fix for the latent bug.
- **How the focus ring is composed** (old: `--rialto-surface` gap and
  `--rialto-accent` ring; new: `--rialto-focus-gap` and `--rialto-focus-ring`,
  defaulting to those same values). They differ only inside a `data-surface`
  scope, which is new, so no existing screen changes.
- **After the go, the signature remap at `:root`:**
  - secondary Button: plum text and border, with a plum-muted hover;
  - ghost Button: plum-muted hover;
  - Input: plum caret and selection, with a plum hover border;
  - Select and other highlighted options: plum-muted instead of gold-muted;
  - Tabs: tinted track and plum hover text.

  The gold rule is unchanged: primary, focus and selected stay gold. This
  flips the rialto Storybook baselines (53), rialto-web and hospitality.

- **Calm phase on covered screens:** the phase slot adds the text "Service:
  Calm" to the Timeline and Dashboard headers. That flips their hospitality
  baselines (the visual spec fixes the clock at 17:30, so the phase is calm).
  Nothing else renders differently in calm.

## Stack & dependencies

- No new runtime or dev dependency. This run uses the tools the repo already
  has: DTCG JSON plus the colors.css generator, CSS custom properties,
  CSS Modules, vitest, testing-library, vitest-axe and Playwright.
- `display: contents` for PaintScope and the scope element. It has shipped in
  every evergreen browser since 2023. Custom-property inheritance passes
  through it, and on a role-less `div` the old accessibility-tree bugs do not
  apply.
- Changesets: rialto token, provider, CSS and component changes each need a
  `patch` changeset (`check-rialto-changeset.mjs` gate). Hospitality changes
  need none. No npm release is cut (PRD out of scope).
- Visual baselines change only through
  `gh workflow run visual-baseline-regen.yml -f app=<rialto|rialto-web|hospitality>`,
  one app per dispatch. Which PR flips which suite is listed under Accepted
  behaviour changes. Ordering is Decompose's job.

## Requirement traceability

| PRD criterion                | Met by                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| 1 Kill test first            | Signature remap (scoped), kill-test board, go/no-go issue (UX Flow A)                |
| 2 Palette                    | Palette tokens, surface scopes                                                       |
| 3 Contrast holds             | Contrast test (per-scope loop, ring-on-gap and ring-on-band)                         |
| 4 Complete audit             | Component audit + `audit-coverage.test.ts`                                           |
| 5 Old findings re-checked    | Frozen `ui-audit-2026-05-16.json` + Re-check table check                             |
| 6 Zero open critical/serious | Accessibility fixes, audit-coverage open-severity check, a11y matrix                 |
| 7 Mode with no setting       | Load adapters, policy, driver; `phase-machine.test.ts` rising/falling; DEV-only seam |
| 8 Nothing moves              | Geometry guarantee layers 1–3                                                        |
| 9 No flapping                | Hysteresis + dwell in config; oscillation unit test; calibration test                |
| 10 Reduced motion            | PaintScope reduced-motion precedence; reduced-motion pass of the geometry spec       |
| 11 Demo                      | Rehearsal adapter + scope in `RehearsalNight`; palette promotion                     |
| 12 Uniqueness verdict        | Process, not code (UX Flow D); kill-test board scenes reused for the verdict board   |
| 13 Release hygiene           | Changesets, regen workflow, Zero-Touch Audit                                         |

## Decisions & alternatives

- **Rush is a page-scoped `PaintScope`** over a fourth `RialtoProvider`
  adapter or a new `rush` vibe preset. The provider is app-wide, but the mode
  covers two routes. The preset maps carry geometry. A time-driven adapter
  with its own lifecycle trips ADR-022's pipeline trigger. See
  [ADR-034](../../adr/ADR-034-service-aware-mode-is-a-scoped-paint-only-override.md).
- **Surface scopes re-declare tokens, and derived tokens re-resolve on every
  scope element**, over per-component `surface` props or hand-written
  overrides of each Tier-3 token per scope. Props would touch every
  component, and hand-written overrides drift from the JSON. See
  [ADR-035](../../adr/ADR-035-mid-tone-surfaces-are-data-surface-token-scopes.md).
- **A separate `--rialto-focus-ring` token** over re-declaring
  `--rialto-accent` in the tinted scope. Re-declaring the accent would also
  darken the primary Button fill on the band, which UX keeps at `#b0841e`.
- **Kill-test remap behind `[data-palette="signature"]`** over editing
  `:root` and showing a branch preview. Editing `:root` would flip all three
  baseline suites before the go/no-go, and a no-go would need a revert.
- **Load = (occupied seats + covers due in 30 min) / seats** over expected
  covers, the waitlist, or `upcomingCount`. Expected covers is a whole-day
  total. The waitlist is not SSE-fresh. `upcomingCount` counts parties over
  2 h and ignores room size, so a 30-seat bar and a 200-seat room would share
  thresholds.
- **Page-local phase state** over a `DashboardLayout`-level machine. A
  layout machine would poll on every route, for the sake of keeping dwell
  across a Timeline ↔ Dashboard hop. Re-seeding from current load on mount
  already meets ux.md Flow B step 1.
- **Defer-while-busy by polling the DOM** (`aria-modal`, active element)
  over a context every dialog reports into. Rialto Dialog and Drawer already
  set `aria-modal`, so polling needs no change to any overlay.
- **Pseudo-element layers whose `opacity` cross-fades** over transitioning
  `background-color` and `box-shadow`. ADR-033 limit 8 allows only
  `transform` and `opacity`.
- **Reserved slot by stacking all four labels in one grid cell** over
  measuring, or a fixed width per locale. Stacking is exact in every locale
  and needs no upkeep when a translation changes.
- **A DEV-only forced-phase event for the geometry spec** over driving real
  data. Every data lever (waitlist, occupied tables, the clock) also changes
  rendered data, so a box change could not be blamed on the mode.
- **Audit as a test-parsed markdown table** over a JSON or YAML source that
  renders markdown. The doc stays at its old path for links (ux.md
  assumption), and agents grep it as text. The test gives it a schema
  without a generator.
- **Rush leaves framer-motion presets alone** over a page-scoped motion
  context. Rush's feedback budget is met by the CSS tokens on the covered
  screens. A context would be a second channel for a single consumer.

## ADRs

- [ADR-034: Service-aware mode is a scoped, paint-only override, not a vibe preset](../../adr/ADR-034-service-aware-mode-is-a-scoped-paint-only-override.md) (provisional)
- [ADR-035: Mid-tone surfaces are `data-surface` token scopes, and derived tokens re-resolve on every scope](../../adr/ADR-035-mid-tone-surfaces-are-data-surface-token-scopes.md) (provisional)
