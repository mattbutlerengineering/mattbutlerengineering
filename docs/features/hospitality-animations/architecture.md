---
stage: architect
run: feature:hospitality-animations
date: 2026-08-30
ux: required
assumptions:
  - "Component name: `NeonSign` kept as final (prd.md left the final name to this stage); registry id `neon-sign`, label `Neon Sign`, so the page module resolves by the `{label}Page` convention with no `load` override."
  - "`opening-soon` boundary is inclusive: a lead of exactly 60 minutes is `opening-soon` (prd.md tests only 59 and 61)."
  - "Boundaries are venue-local wall-clock `HH:MM` strings, not instants; the opening lead is computed in venue-local minutes. Consequence: inside a DST transition hour the lead can be off by ±60 minutes for a venue that opens between 01:00 and 03:00 that night; the open/closed state itself is never wrong because it is read from `Intl`'s true local clock."
  - "When today's own window and yesterday's overnight spill both cover `now` (degenerate overlapping data), today's window wins and supplies the closing time."
  - "Hours whose every non-closed day is malformed derive `unset` even though `hasOperatingHours` returns `true` for them — the one documented divergence; every well-formed fixture agrees with `hasOperatingHours`."
  - "The hospitality `PageHeader` slot is named `aside`; its flex layout is applied only through a `withAside` modifier class so the 13 pages that pass no slot render byte-identically."
  - "The visible caption is switched by `showCaption` (default `true`) and always renders the `aria-label` text — chosen over a free-form `caption` string so ux.md's 'caption must equal aria-label' is true by construction, not by convention."
  - "`NeonSign` centres its caption under the housing in every context; ux.md's end-aligned caption on the dashboard (a few px difference) is not realised, to avoid an alignment prop or a consumer reaching into the instrument's layout."
  - "`useNow` is a new plain 60 s interval hook in `apps/hospitality/src/hooks/useNow.ts` — no visibility pause, no minute-boundary alignment; `useSessionClock` is not reused (token-bound, 1 s tick)."
  - "`now` crosses the derivation as a `Date` instant. ADR-024's ISO-string vocabulary governs rialto's date-family props; `NeonSign` takes no date and the hook is app-internal."
  - "No `NeonSign.catalog.ts`: catalog meta is a curated set (38 of 86 component dirs; `Handshake` has none) and adding one would require a `rialto-catalog` registry adapter to satisfy the 1:1 drift test."
  - "No showcase-page unit test (1 of 22 data pages has one; `HandshakePage` has none); `page-registry.test.ts` exercises the module load and `manifest-drift.test.ts`'s `DATA_COMPONENTS` gains `NeonSign`."
  - 'No new E2E assertion on the sign''s state (it depends on CI wall-clock against the `America/New_York` fixture venue); an optional visibility check by accessible-name regex is left to Implement after a `role="img"` collision grep.'
  - "Weekday names in the caption come from a module constant (en-US, capitalised), matching `formatLongDate`'s output, rather than a second `Intl` call — the label never needs an instant."
  - "Storybook story carries no `play()` (Storybook 10.5.0 stopped auto-running them, #3518); the instrument is absent from both visual suites by the brief's binding rule."
  - "Slug, run scale, the measured-in-code evidence label and the deployed-venue UNKNOWN are inherited from idea.md / prd.md / ux.md unchanged."
---

# Architecture: Neon OPEN sign

## Approach

Three small pieces, each owning one thing. A pure derivation in the
hospitality app turns `Venue.operatingHours` + `Venue.ianaTimezone` + an
instant into one of four states plus a venue-local boundary time, using only
`Intl.DateTimeFormat` (the same parts-based trick `utils/ics.ts:86-100` already
uses) — no date library, no browser zone. A rialto instrument, `NeonSign`,
renders a state it is handed: `role="img"`, required `aria-label`, `data-state`,
`data-reduced-motion`, CSS-keyframe motion bound to `data-state` so the strike-on
needs no React state, effect or `key`. The dashboard `HomePage` composes the
two through a 60 s `useNow` tick and a new optional `aside` slot on the
hospitality `PageHeader`. Nothing is added to the backend, to `packages/types`,
or to the token set.

The shape that lost: a "smart" instrument that takes `operatingHours` +
`ianaTimezone` and owns its own clock. It would put a business rule and a
timer inside `packages/rialto` (where `setState`-in-effect is banned and where
`Intl` zone parsing has no business), make the four states untestable without
the clock, and tie a design-system component to a hospitality data shape. The
split above keeps the rule where its data lives and the instrument as dumb as
`Handshake` (`Handshake.tsx:69-135` takes `state` and renders).

## Components

### `deriveVenueOpenState` — policy (`apps/hospitality/src/utils/venueOpenState.ts`)

- Responsibility: the only place that knows what "open right now" means for a
  `DaySchedule` table — half-open windows, overnight spill, closed and missing
  days, malformed entries, the opening-soon lead, and which zone's clock to
  read. Pure; `O(7)`; never throws.
- Collaborators: `hasOperatingHours` (reused from
  `components/booking-widget/hasOperatingHours.ts:21-27`, the product's
  existing definition of "hours are set"), `Intl.DateTimeFormat` (runtime),
  `OperatingHours`/`DaySchedule` types (`packages/types/src/venue.ts:40-54`).
  Lives in `utils/` beside the other pure helpers with sibling tests
  (`format.ts`, `ics.ts`, `calendarLinks.ts`, `reservation-display.ts`).

### `formatVenueOpenLabel` — presentation (`apps/hospitality/src/utils/venueOpenLabel.ts`)

- Responsibility: the exact caption/accessible-name copy per state from
  ux.md's table, in the app's 12-hour convention.
- Collaborators: `formatLocalTime` (new, in `utils/format.ts` next to
  `formatTime`, `format.ts:43-49`, same `en-US` / `hour: "numeric"` /
  `minute: "2-digit"` / `hour12` option set, pinned to `timeZone: "UTC"` so an
  `HH:MM` wall-clock string formats identically on every machine); a
  `WEEKDAY_LABEL` constant.

### `useNow` — clock (`apps/hospitality/src/hooks/useNow.ts`)

- Responsibility: re-render its caller every `intervalMs` (default 60 000) with
  a fresh `Date`; clean up on unmount; restart when the interval changes.
- Collaborators: none. Prior art is `useSessionClock.ts:68-104` (interval +
  `setNow`) and `timeline/TimelineGrid.tsx:127-133` (inline equivalent);
  neither is reusable — the first is bound to a token expiry at a 1 s tick, the
  second is embedded in the timeline.

### `NeonSign` — instrument (`packages/rialto/src/components/NeonSign/`)

- Responsibility: render one of four trading states as a neon tube on a
  recessed housing with a caption, honouring reduced motion, exposing the
  contract in ux.md § "Conventions to match". Owns no clock, no timezone, no
  copy — it prints `OPEN` and whatever `aria-label` it is given.
- Collaborators: `useReducedMotion` from `framer-motion` (as
  `Handshake.tsx:83`), `cn` (`utils/class-composer`), CSS module + `--rialto-*`
  tokens. Files mirror `Handshake/` exactly: `NeonSign.tsx`,
  `NeonSign.module.css`, `NeonSign.test.tsx`, `NeonSign.motion.test.tsx`,
  `NeonSign.stories.tsx`, `index.ts`.

### `PageHeader.aside` — slot (`apps/hospitality/src/components/PageHeader.tsx`)

- Responsibility: place optional inline-end content on the title row and wrap
  it beneath the title below 768 px. Everything else about the header is
  unchanged.
- Collaborators: 14 pages render `<PageHeader>`; only `HomePage` passes the
  slot.

### `HomePage` — composition (`apps/hospitality/src/pages/HomePage.tsx`)

- Responsibility: wire venue → derivation → label → instrument → slot. Six
  lines; no logic of its own.
- Collaborators: `useVenue().selectedVenue` (`contexts/VenueContext.tsx:99-102`),
  `useNow`, the two utils, `NeonSign`, `PageHeader`.

### `NeonSignPage` — showcase (`apps/rialto-web/src/pages/data/NeonSignPage.tsx`)

- Responsibility: ux.md's six sections (Service Day Replay, States,
  Playground, Sizes, Props, Accessibility) in the `HandshakePage.tsx` shape.
- Collaborators: `page-registry.ts` (one row), `PropsTable component="NeonSign"`
  (reads `dist/manifest.json` via `use-props-from-manifest.ts:1,27`).

Deletion test: remove any one of these and its complexity reappears in its
callers (the derivation in `HomePage`, the label in both `HomePage` and the
story data, the slot as a hand-rolled flex row in `HomePage`, the hook as an
inline interval). None only forwards.

## Data model

No new persisted data. Access pattern is one read per render of `HomePage`:
`selectedVenue.operatingHours` and `selectedVenue.ianaTimezone` from the
react-query-backed `VenueContext` (already in memory; SSE `venue:updated`
invalidates `VENUES_QUERY_KEY`, `VenueContext.tsx:53-56`, so an hours edit
reaches the sign without a reload), plus `now` from `useNow`. Consistency
required: eventual, bounded by the 60 s tick — the sign may lag a boundary by
up to 59 s, which prd.md's "at least once a minute" accepts.

Derived values (owned by the derivation module):

```ts
// apps/hospitality/src/utils/venueOpenState.ts
export type Weekday = keyof OperatingHours; // "monday" … "sunday"
/** Venue-local wall-clock, validated "HH:MM" (00:00–23:59). */
export type LocalTime = string;

export type VenueOpenState =
  | { readonly state: "open"; readonly closesAt: LocalTime }
  | { readonly state: "opening-soon"; readonly opensAt: LocalTime }
  | { readonly state: "closed"; readonly opensAt: LocalTime; readonly opensOn: Weekday | null } // null = later today
  | { readonly state: "unset" };
```

Instrument-side vocabulary (owned by rialto):

```ts
// packages/rialto/src/components/NeonSign/NeonSign.tsx
export type NeonSignState = "open" | "opening-soon" | "closed" | "unset";
```

`VenueOpenState["state"]` is assignable to `NeonSignState` by construction;
the derivation never learns rialto's type (dependency points app → rialto,
never the reverse).

Invariant owners:

| Invariant                                             | Owner                                             |
| ----------------------------------------------------- | ------------------------------------------------- |
| "Hours are set" (some non-closed day exists)          | `hasOperatingHours` (reused, not restated)        |
| Which weekday and minute it is _at the venue_         | `deriveVenueOpenState` via `Intl` in the zone     |
| Half-open `[open, close)`, overnight spill, lead ≤ 60 | `deriveVenueOpenState`                            |
| Caption text equals accessible name                   | `NeonSign` (caption is rendered from the label)   |
| `data-state` is one of four values                    | `NeonSignState` + the `state` prop being required |

## Interfaces & contracts

### `deriveVenueOpenState(input): VenueOpenState | null`

```ts
export interface DeriveVenueOpenStateInput {
  readonly operatingHours: OperatingHours | null | undefined;
  readonly ianaTimezone: string | null | undefined;
  readonly now: Date;
  /** Lead window for `opening-soon`, inclusive. @default 60 */
  readonly openingSoonMinutes?: number;
}
```

- Input: as above. `now` is an instant; the zone is the venue's, never the
  caller's.
- Output: a `VenueOpenState`, or `null` meaning "render no sign" (zone not
  usable).
- Algorithm, in venue-local minutes (`nowMin = h * 60 + m`, `d` = weekday):
  1. Zone gate. If `ianaTimezone` is not a non-empty string → `null`.
     Otherwise `new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now)`
     inside `try` — a `RangeError` → `null`. Measured on Node 22.22.3:
     `"Mars/Olympus"` and `""` throw `RangeError`; **`undefined` does not throw
     and silently resolves to the machine zone** (`America/Los_Angeles` here),
     which is exactly the guess prd.md forbids — hence the explicit string gate
     before `Intl`. `weekday: "long"` lower-cased is the `OperatingHours` key.
  2. `if (!hasOperatingHours(operatingHours)) → { state: "unset" }`.
  3. Normalise seven windows: `null` when the day is missing, `closed: true`,
     either time fails `/^([01]\d|2[0-3]):[0-5]\d$/`, or `open === close`;
     else `{ open, close, overnight: close < open }` in minutes.
  4. All seven `null` (only malformed days remained) → `{ state: "unset" }`.
  5. Today's window `t`: not overnight and `t.open ≤ nowMin < t.close` → open
     until `t.close`; overnight and `nowMin ≥ t.open` → open until `t.close`
     (an early-morning time, "Open until 2:00 AM").
  6. Yesterday's window `y = windows[(d + 6) % 7]`: overnight and
     `nowMin < y.close` → open until `y.close`. This is the "00:30 and
     yesterday's schedule is still open" case, independent of today's entry.
  7. Next opening: for `offset` in `0..7`, `w = windows[(d + offset) % 7]`;
     skip `null`; skip `offset === 0` when `w.open ≤ nowMin` (today's window
     has passed or is in progress-and-already-handled); the first hit gives
     `lead = offset * 1440 + w.open − nowMin`. Some window exists (step 4), so
     a hit is guaranteed within one week; `offset === 7` is "same weekday next
     week" and names the day.
  8. `lead ≤ openingSoonMinutes` → `{ state: "opening-soon", opensAt }`; else
     `{ state: "closed", opensAt, opensOn: offset === 0 ? null : day }`.
- Failure modes: never throws (malformed days are skipped per day; an unusable
  zone is `null`). No I/O, no clock read — `now` is an argument, so tests are
  deterministic regardless of the machine's `TZ` (nothing pins `TZ` in
  `apps/hospitality/vitest.config.ts`; every test passes an explicit zone and
  a UTC instant).
- DST: step 1 reads the true local clock, so state is right on both sides of a
  transition (measured: `2026-03-08T09:30Z` → Sun 01:30 PST, `T10:30Z` → Sun
  03:30 PDT; `2026-11-01T08:30Z` and `T09:30Z` both → Sun 01:30 in
  `America/Los_Angeles`). Only step 7's `lead` is local-minute arithmetic —
  see the frontmatter assumption for its one-hour-a-year caveat.

### `formatVenueOpenLabel(s: VenueOpenState): string`

- Input: any `VenueOpenState`.
- Output (ux.md copy table, commas not middle dots):
  `open` → `Open until 10:00 PM`; `opening-soon` → `Opens at 5:00 PM`;
  `closed` with `opensOn === null` → `Closed, opens at 5:00 PM`, otherwise
  `Closed, opens Tuesday at 5:00 PM`; `unset` → `No operating hours set`.
- Failure modes: total function; `formatLocalTime` receives only strings the
  derivation validated (`"17:00"` → `5:00 PM`, `"02:00"` → `2:00 AM`,
  `"00:00"` → `12:00 AM`, `"12:30"` → `12:30 PM`, measured).

### `useNow(intervalMs = 60_000): Date`

- Input: tick period. Output: a new `Date` per tick (never mutated).
- Contract: `useState(() => new Date())` + `useEffect` with `setInterval` and
  `clearInterval` cleanup keyed on `intervalMs`. Test with
  `vi.useFakeTimers()` / `vi.setSystemTime()` / `act(() => vi.advanceTimersByTime(60_000))`
  and `vi.getTimerCount() === 0` after unmount — the `useSessionClock.test.ts:101-141`
  pattern.

### `NeonSign` props

```ts
export interface NeonSignProps extends Omit<HTMLAttributes<HTMLDivElement>, "aria-label"> {
  /** Accessible name — required because the component renders as role="img". Also the visible caption. */
  "aria-label": string;
  /** Trading state the tube shows. Required: a sign with no state would be a lie. */
  state: NeonSignState;
  /** Print the accessible name as a caption beneath the housing. @default true */
  showCaption?: boolean;
  /** Tube, housing padding and caption scale together. @default "md" */
  size?: "sm" | "md" | "lg";
}
```

- Output DOM: root `div[role="img"][aria-label][data-state][data-reduced-motion]`
  with classes `neonSign`, `size{Sm|Md|Lg}`, `reduced` (when
  `useReducedMotion()`), `className`, `...rest`; inside, `div.housing[aria-hidden]`
  whose `::before` is the wash and whose child `span.tube[data-tube][data-lit]`
  prints `OPEN` (`data-lit` is `"true"` for `open` / `opening-soon`, derived at
  render); then, when `showCaption`, `span.caption[aria-hidden]` with the
  label text. The tube stays in the DOM in `unset` (`visibility: hidden`) so the
  footprint never changes.
- Strike-on mechanism: the keyframe is bound to the state attribute, not to
  React —
  `.neonSign[data-state="open"] .tube { animation: rialto-neon-strike var(--neon-strike) linear 1 both; }`.
  When `data-state` becomes `open` (first paint or a live flip) the rule
  starts matching, the tube's computed `animation-name` goes from `none` to
  `rialto-neon-strike`, and the browser starts the animation (CSS Animations
  Level 1: a new animation is created when `animation-name` gains a name).
  Leaving `open` removes the rule and cancels it; re-entering restarts it.
  Re-renders that keep `data-state="open"` (the caption ticking, a venue switch
  between two open venues) do not restart it because nothing in the computed
  style changed. No `setState`, no `useEffect`, no `key`; the showcase
  playground forces a replay while already `open` by re-keying the element at
  page level (`key={replayNonce}`), outside the instrument.
- Reduced motion: `useReducedMotion() ?? false` → `.reduced` + `data-reduced-motion`
  (Handshake.tsx:83-102); CSS `.reduced .tube { animation: none }` and the
  `@media (prefers-reduced-motion: reduce)` twin (Handshake.module.css:154-165);
  `.reduced[data-state="opening-soon"] .tube { opacity: 0.8 }` parks the breathe
  at its mid-frame.
- Tests (jsdom sees attributes and classes, not keyframes): `NeonSign.test.tsx`
  under the global `useReducedMotion → true` mock (`test/setup.ts:9-17`) asserts
  role + name, `data-state` per state, tube `data-lit` per state, `aria-hidden`
  on housing and caption, caption present by default and absent with
  `showCaption={false}`, size classes, `data-reduced-motion="true"` and the
  `reduced` class, `className` + `ref` forwarding. `NeonSign.motion.test.tsx`
  overrides the mock file-wide (`Handshake.motion.test.tsx:7-13`) and asserts
  `data-reduced-motion="false"`, no `reduced` class, tube `data-lit="true"` in
  `open`. prd.md's "animated class" is the **absence** of `reduced` — the
  inverse convention `Handshake` established.
- Failure modes: none at runtime; an out-of-range `state` is a type error.

CSS module structure (`NeonSign.module.css`), tokens exactly as ux.md names
them and all verified present in `packages/rialto/src/tokens/*.css`:

```
.neonSign      --neon-tube: var(--rialto-text-lg); --neon-pad-b: var(--rialto-space-xs);
               --neon-pad-i: var(--rialto-space-md); --neon-caption: var(--rialto-text-sm);
               --neon-weight: var(--rialto-weight-light); --neon-strike: 0.9s; --neon-warm-cycle: 2.4s;
               display: inline-flex; flex-direction: column; align-items: center; gap: var(--rialto-space-xs);
               font-family: var(--rialto-font-sans);
.sizeSm        --neon-tube: var(--rialto-text-base); --neon-pad-b: var(--rialto-space-2xs); --neon-pad-i: var(--rialto-space-sm);
               --neon-caption: var(--rialto-text-xs); --neon-weight: var(--rialto-weight-regular);
.sizeMd        (defaults live on .neonSign; class exists for targeting — Handshake.module.css:30-33)
.sizeLg        --neon-tube: var(--rialto-text-2xl); --neon-pad-b: var(--rialto-space-sm); --neon-pad-i: var(--rialto-space-lg);
.housing       position: relative; padding: var(--neon-pad-b) var(--neon-pad-i); border: 1px solid var(--rialto-border);
               border-radius: var(--rialto-radius-default); background: var(--rialto-surface-recessed);
               box-shadow: var(--rialto-shadow-pressed);
.housing::before  (wash) position: absolute; inset: 0; border-radius: inherit; opacity: 0;
               transition: opacity var(--rialto-duration-slow) var(--rialto-ease-smooth);
.tube          position: relative; font-family: var(--rialto-font-display); font-weight: var(--neon-weight);
               font-size: var(--neon-tube); letter-spacing: var(--rialto-tracking-wide); text-transform: uppercase;
               line-height: 1; color: var(--rialto-border);
               transition: color var(--rialto-duration-standard) var(--rialto-ease-precision);
.caption       font-size: var(--neon-caption); color: var(--rialto-text-secondary); white-space: nowrap;
[data-state="open"] .tube            color: var(--rialto-success); text-shadow: 0 0 2px currentColor, 0 0 8px currentColor;
                                     animation: rialto-neon-strike var(--neon-strike) linear 1 both;
[data-state="open"] .housing::before background: var(--rialto-success-muted); opacity: 1;
[data-state="opening-soon"] .tube    color: var(--rialto-accent); text-shadow: (same radii);
                                     animation: rialto-neon-breathe var(--neon-warm-cycle) var(--rialto-ease-smooth) infinite;
[data-state="opening-soon"] .housing::before  background: var(--rialto-accent-muted); opacity: 1;
[data-state="unset"] .housing        background: transparent; border-style: dashed; box-shadow: none;
[data-state="unset"] .tube           visibility: hidden;
@keyframes rialto-neon-strike   0%{opacity:0} 15%{opacity:1} 30%{opacity:.3} 45%{opacity:1} 65%{opacity:.5} 80%,100%{opacity:1}
@keyframes rialto-neon-breathe  0%,100%{opacity:.6} 50%{opacity:1}
.reduced .tube / @media (prefers-reduced-motion: reduce) .tube   animation: none
.reduced[data-state="opening-soon"] .tube                          opacity: 0.8
```

Only `opacity` animates (compositor); `color` and the wash transition once per
state change; `text-shadow` is static per state. Nothing translates, so no
RTL keyframe variant. The state selectors are written `.neonSign[data-state=…]`
as `Handshake.module.css:109-123` does. No colour literal anywhere; the
`currentColor` halo inherits the token.

### `PageHeader` slot

```ts
interface PageHeaderProps {
  title: string;
  description?: string;
  /** Inline-end content on the title row; wraps beneath the title below 768px. */
  aside?: ReactNode;
}
```

- Output: today's markup exactly when `aside` is omitted. When present, the
  root gains `withAside` and a trailing `div.aside` wraps the node.
- CSS (`PageHeader.module.css`): `.withAside { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--rialto-space-md); flex-wrap: wrap; }`,
  `.aside { flex: 0 0 auto; }`, and
  `@media (max-width: 767px) { .aside { flex-basis: 100%; } }` — the
  `767px` breakpoint from `DashboardLayout.module.css:143`.
- Tests: `PageHeader.test.tsx` gains "renders the aside at the inline-end when
  provided" (`getByText` on a passed `<span>`, `container.querySelector(".aside")`
  present — class names are literal under `classNameStrategy: "non-scoped"`,
  `vitest.config.ts:31-33`) and "adds no aside wrapper when omitted". The five
  existing cases and the rialto mock (`PageHeader.test.tsx:6-26`) are untouched.

### `HomePage` composition

```tsx
const { selectedVenue } = useVenue();
const now = useNow();
const openState = selectedVenue
  ? deriveVenueOpenState({ operatingHours: selectedVenue.operatingHours, ianaTimezone: selectedVenue.ianaTimezone, now })
  : null;

<PageHeader
  title="Dashboard"
  description={…unchanged…}
  aside={openState && <NeonSign state={openState.state} aria-label={formatVenueOpenLabel(openState)} />}
/>
```

- No venue, or an unusable zone → `openState === null` → no slot → header as
  today (ux.md empty state). `unset` renders the sign.
- `DashboardLayout` gates on `useVenueReadiness` (`DashboardLayout.tsx:63,249`),
  so `selectedVenue` is resolved before `HomePage` paints — the sign is in its
  true state on the first frame, no pop-in.
- `HomePage.test.tsx` changes, all additive: mock
  `../contexts/VenueContext.js` → `useVenue: vi.fn()` (as
  `FloorPlansPage.test.tsx:30`), defaulting to `{ selectedVenue: null }` in
  `beforeEach` so the 11 existing cases see today's header; extend the rialto
  mock (`HomePage.test.tsx:66-71`) with
  `NeonSign: ({ state, "aria-label": label }) => <div role="img" aria-label={label} data-state={state} />`;
  extend the `PageHeader` mock (`:26-33`) to render `{aside}`. New cases pin
  `vi.useFakeTimers(); vi.setSystemTime(<UTC instant>)` with an
  `America/Los_Angeles` fixture venue: one per state (`open`, `opening-soon`,
  `closed`, `unset`), "no selected venue renders no `img`", "unrecognised zone
  renders no `img`", and the tick: system time 16:59:30 local before a 17:00
  opening → `data-state="opening-soon"`, `act(() => vi.advanceTimersByTime(60_000))`
  → `data-state="open"` and name `Open until 10:00 PM`. `afterEach(vi.useRealTimers)`.
- Selectors preserved: the sign adds no `heading`/`status`/`meter` role and no
  "Dashboard" / "Welcome back" / "Live Activity" text, so `HomePage.test.tsx`
  and `e2e/dashboard.spec.ts:8,20-28,36,43-45,62-65` keep resolving uniquely.
  The E2E fixture venue (`e2e/fixtures/venues-list.json`: `America/New_York`,
  open daily 11:00–22:00/23:00, Sun 10:00–21:00) means the mocked dashboard
  always renders a sign whose state follows CI wall-clock — nothing in
  `dashboard.spec.ts` selects `img` or that text today.

### Showcase page

`apps/rialto-web/src/pages/data/NeonSignPage.tsx`, named export `NeonSignPage`,
resolved by `page-registry.ts:73-113` from the row
`{ id: "neon-sign", label: "Neon Sign", category: "Data Display" }` inserted
after `handshake` (`page-registry.ts:177`); path `/components/neon-sign`.
`COMPONENT_COUNT` is derived (`nav-sections.ts:22`) — nothing to bump.
Sections, in the `HandshakePage.tsx` shape (`ComponentPageLayout name=…`,
`Section title=…`, `Card variant="elevated"`, `DataList`):

1. **Service Day Replay** — page-level `setInterval(1200)` over the phase
   table `closed, closed, opening-soon, opening-soon, open, open, open`
   (2.4 s / 2.4 s / 3.6 s so the strike settles), `size="lg"`, labels
   `Closed, opens at 5:00 PM` / `Opens at 5:00 PM` / `Open until 10:00 PM` —
   the `SignInReplay` pattern (`HandshakePage.tsx:22-54`).
2. **States** — four `md` rows with captions.
3. **Playground** — `lg` sign, four `Button size="sm"` state pickers; the
   `open` button also bumps `replayNonce`, which keys the `NeonSign`, so
   pressing it while already open replays the strike.
4. **Sizes** — sm / md / lg.
5. **Props** — `<PropsTable component="NeonSign" />`.
6. **Accessibility** — the six `DataList` rows from ux.md.

`apps/rialto-web/src/hooks/manifest-drift.test.ts:190-212` `DATA_COMPONENTS`
gains `"NeonSign"` (its comment says to update it when adding a data page; it
then fails if the manifest is stale). Not added to
`packages/rialto/src/test/visual/visual.spec.ts` `STORIES` (line 161) or
`apps/rialto-web/e2e/visual.spec.ts` `lightSections` (line 23).

## Stack & dependencies

- `Intl.DateTimeFormat` with `formatToParts`, `hourCycle: "h23"` — the
  zone-correct wall-clock source already used by `utils/ics.ts:86-100`;
  `apps/hospitality/package.json` has no date library and none is added.
- `framer-motion` `useReducedMotion` only — the instrument has no framer
  transitions to route through `useMotionPreset()` (ADR-025 applies to motion
  configs; CSS keyframes are the WatchLoader/Handshake idiom for continuous
  and one-shot motion).
- CSS Modules + `--rialto-*` tokens (ADR-001); logical properties throughout;
  component-local `--neon-*` custom properties for sizes and durations after
  `--handshake-*` / `--watch-cycle`.
- `@mattbutlerengineering/rialto` via `workspace:*`; consumers typecheck only
  after `pnpm --dir packages/rialto build` regenerates `dist/**/*.d.ts`,
  `package.json` exports (`scripts/lib-entrypoints.ts:26-43` scans
  `src/components/*/index.ts`, so the new folder is picked up), `registry.json`
  and `dist/manifest.json` (`scripts/generate-all.ts:38-75`).
- No backend, no `packages/types` change, no new tokens, no new dependency.

## Change surface

**rialto (`packages/rialto`)**

- `src/components/NeonSign/NeonSign.tsx`, `NeonSign.module.css`,
  `NeonSign.test.tsx`, `NeonSign.motion.test.tsx`, `NeonSign.stories.tsx`
  (`title: "Data Display/NeonSign"`; Default, AllStates, Sizes, WithoutCaption;
  no `play()`), `index.ts` (`export * from "./NeonSign";`).
- `src/components/index.ts` — `export * from "./NeonSign";` after line 97.
- `src/test/accessibility/component-fixtures.tsx` — import beside line 62,
  `| "NeonSign"` in the `BarrelExportName` union (alphabetical, after
  `NavigationMenu`), fixture `NeonSign: { element: <NeonSign state="open" aria-label="Open until 10:00 PM" /> }`.
- `src/test/accessibility/a11y-matrix.test.tsx` — `"NeonSign"` in the
  hardcoded `BARREL_COMPONENT_NAMES` (lines 28-116; the comment at 21-27
  requires it). This is the easy one to miss: the guard at 119-128 only
  checks names in that list.
- `.changeset/neon-sign-instrument.md` — `"@mattbutlerengineering/rialto": minor`,
  in the `handshake-instrument.md` shape.

**rialto-web (`apps/rialto-web`)**

- `src/pages/data/NeonSignPage.tsx` (new).
- `src/data/page-registry.ts` — one row after `handshake`.
- `src/hooks/manifest-drift.test.ts` — `"NeonSign"` in `DATA_COMPONENTS`.

**hospitality (`apps/hospitality`)**

- `src/utils/venueOpenState.ts` + `venueOpenState.test.ts` (new).
- `src/utils/venueOpenLabel.ts` + `venueOpenLabel.test.ts` (new).
- `src/utils/format.ts` + `format.test.ts` — add `formatLocalTime`.
- `src/hooks/useNow.ts` + `useNow.test.ts` (new).
- `src/components/PageHeader.tsx`, `PageHeader.module.css`, `PageHeader.test.tsx`.
- `src/pages/HomePage.tsx`, `HomePage.test.tsx`.
- `CLAUDE.md` — the `HomePage` row notes the `NeonSign` header instrument.

**generated (stage by explicit path after the builds below)**

- `packages/rialto/package.json` (exports map gains `./NeonSign`),
  `packages/rialto/registry.json` (regen family, `scripts/regen-manifest.mjs:154-156`).
- `packages/rialto/llms.txt`, `packages/rialto/llms-full.txt`,
  `apps/rialto-web/llms.txt`, `apps/rialto-web/llms-full.txt`,
  `apps/hospitality/llms.txt`, `apps/hospitality/llms-full.txt`, and root
  `llms.txt` / `llms-full.txt` if the pack changes them.
- Not expected to change: `packages/rialto-catalog/src/generated-schemas.ts`
  (no catalog meta), `infrastructure/worker/dep-graph.json` (no package
  graph change).

Untouched by design: `WatchLoader/**`, `LoginGate` / `CallbackPage` /
`SessionExpiredGate` / `App.tsx`, `apps/rialto-web/src/pages/auth/**`,
`components/venue-onboarding/**`, `components/floor-plan/**`,
`packages/types`, every service, both visual suites, `.changeset/config.json`.

## Derivation test list (Implement writes these first)

`venueOpenState.test.ts`; zone `America/Los_Angeles` and `now` a UTC instant
unless stated; `LA(h, m)` below means the UTC instant whose LA wall-clock is
that time on the named day.

1. `unset` for `null`, `undefined`, `{}`, and every day `closed: true` — the
   `hasOperatingHours.test.ts:5-28` fixtures, asserting agreement.
2. `unset` when the only non-closed days are malformed
   (`{ monday: { open: "9am", close: "22:00" } }`) — the documented divergence
   from `hasOperatingHours`.
3. `open` mid-window: Mon 11:00–22:00, `now` = Mon 12:00 → `{ open, closesAt: "22:00" }`.
4. Half-open: `now` = Mon 11:00 exactly → `open`; Mon 22:00 exactly → not open.
5. Overnight spill: Fri `{ open: "18:00", close: "02:00" }`; `now` = Sat 01:00 →
   `open`, `closesAt: "02:00"`, both when Saturday is `closed: true` and when it
   is missing; `now` = Sat 03:00 → not open.
6. Overnight evening side: `now` = Fri 23:30 → `open`, `closesAt: "02:00"`.
7. Overlap precedence: Fri 18:00–02:00 and Sat 01:00–10:00, `now` = Sat 01:30 →
   `open`, `closesAt: "10:00"` (today's window wins).
8. Closed, opens later today: Mon 17:00–22:00, `now` = Mon 10:00 →
   `{ closed, opensAt: "17:00", opensOn: null }`.
9. Closed, skips a `closed: true` day: Mon `closed: true`, Tue 17:00–22:00,
   `now` = Mon 10:00 → `opensOn: "tuesday"`.
10. Closed, skips missing days: only Friday set, `now` = Mon → `opensOn: "friday"`.
11. Closed, wraps to the same weekday next week: only Mon 17:00–22:00,
    `now` = Mon 23:00 → `opensOn: "monday"`.
12. Lead boundary: opens 17:00; `now` = 16:01 (59) → `opening-soon`; 15:59 (61) →
    `closed`; 16:00 (60) → `opening-soon` (inclusive).
13. Lead across midnight: Tue opens 00:30, `now` = Mon 23:45 → `opening-soon`.
14. `openingSoonMinutes: 30` at 59 minutes → `closed`.
15. Zone, not browser: `now` = `2026-08-31T00:30:00Z`, hours Sun 17:00–22:00,
    Mon absent: `America/Los_Angeles` → `open` (Sun 17:30);
    `Europe/London` → `closed` (Mon 01:30). Measured.
16. Unusable zone → `null`: `"Mars/Olympus"`, `""`, `undefined`, `null`.
17. Malformed days are skipped, never thrown: `"25:00"`, `"9am"`, `"7:5"`,
    `open === close`, each on a day preceding a valid one → that day is closed
    and the next valid day is named.
18. DST spring-forward (`2026-03-08`, 02:00 PST → 03:00 PDT): Sun 09:00–17:00;
    `now` = `T09:30:00Z` (01:30 PST) → `closed`, `opensAt: "09:00"`, `opensOn: null`;
    `now` = `T10:30:00Z` (03:30 PDT) → same. Sun 01:00–05:00; both instants → `open`.
19. DST fall-back (`2026-11-01`, 02:00 PDT → 01:00 PST): Sun 10:00–22:00;
    `now` = `T08:30:00Z` (01:30 PDT) and `T09:30:00Z` (01:30 PST) → both
    `closed`, `opensAt: "10:00"`.
20. Result objects are frozen-shape readonly (type-level) and the input is not
    mutated (`Object.isFrozen`-style spot check on the hours fixture).

`venueOpenLabel.test.ts`: the five copy strings from ux.md, including the
overnight `Open until 2:00 AM`. `format.test.ts`: `formatLocalTime` for
`"17:00"`, `"22:00"`, `"02:00"`, `"00:00"`, `"12:30"`.

## Gates & evidence

Run from inside each package (root turbo filters error out):

- `pnpm --dir packages/rialto lint && pnpm --dir packages/rialto typecheck && pnpm --dir packages/rialto test`
  — evidence: `NeonSign.test.tsx` + `NeonSign.motion.test.tsx` green; the
  a11y matrix line `Accessibility — component matrix › NeonSign`; the coverage
  guard green with the new list entry.
- `pnpm --dir packages/rialto build && pnpm --dir packages/rialto exports:check`
  — evidence: `./NeonSign` in `package.json` exports, `NeonSign` in
  `registry.json`, `exports:check` clean.
- `pnpm --dir apps/rialto-web lint && pnpm --dir apps/rialto-web typecheck && pnpm --dir apps/rialto-web test`
  — evidence: `page-registry.test.ts › every load() resolves without throwing`,
  `manifest drift guard — data category › NeonSign`.
- `pnpm --dir apps/hospitality lint && pnpm --dir apps/hospitality typecheck && pnpm --dir apps/hospitality test`
  — evidence: the 20 derivation cases, label/format/useNow suites,
  `PageHeader.test.tsx` 7 cases, `HomePage.test.tsx` 11 existing + 7 new.
- Root: `pnpm build --filter @mbe/cli... && pnpm regen && pnpm regen --check`
  — evidence: `regen --check` clean; the generated files above staged by path.
- Static checks the Verify stage quotes: `grep -nE "#[0-9a-fA-F]{3,8}|rgba?\(" packages/rialto/src/components/NeonSign/NeonSign.module.css`
  → no output; `grep -n "useEffect\|useState" NeonSign.tsx` → no output
  (`react-hooks/set-state-in-effect` is enforced at `warn` in
  `packages/config/eslint/react.js:28`; the instrument has no effect at all);
  `git diff --stat` shows neither visual spec touched.
- E2E (advisory `Hospitality E2E`): `apps/hospitality/e2e/dashboard.spec.ts`
  via `pnpm --dir apps/hospitality test:e2e` when `E2E_AUTH*` is available;
  Verify quotes the run id or records "environment unavailable" — it is not
  a merge gate (`CI Gate` is).
- Pre-commit `check-adr` (ADR-001 prohibited class patterns) passes trivially:
  no utility-class strings in JSX.
- `pnpm typecheck` before push — the pre-push hook runs neither typecheck nor
  tests.

## Decisions & alternatives

- **Derivation in `apps/hospitality/src/utils`** over a rialto-side helper or
  a hook in `packages/rialto` — the rule reads a hospitality data shape and a
  clock; rialto bans `setState`-in-effect and owns no venue types.
- **Wall-clock `HH:MM` boundaries in venue-local minutes** over instant
  (`Date`) boundaries via an inverse zone conversion — the label never needs
  an instant, and the inverse conversion must handle nonexistent (spring) and
  ambiguous (fall) local times for a gain confined to the DST transition hour.
- **CSS keyframe bound to `[data-state="open"]`** over a `key` remount or a
  class toggled from an effect — the browser restarts the animation when the
  selector starts matching, so first paint and live flips both strike with
  zero React state; the one case it cannot replay (pressing "open" while open)
  is the showcase's, solved there with a page-level `key`.
- **`showCaption: boolean`** over `caption: string` — ux.md requires the
  caption to equal the accessible name; a boolean makes that impossible to
  violate.
- **`PageHeader.aside` slot with a `withAside` modifier** over a sibling flex
  row in `HomePage` — ux.md binds placement to the header row and its wrap
  behaviour; the modifier keeps the 13 slot-less pages byte-identical.
- **New `useNow` (60 s interval)** over reusing `useSessionClock` (token-bound,
  1 s: 60× the renders for a once-a-minute fact) or a per-boundary
  `setTimeout` (exact flips, but timer maths across DST for ~59 s of latency
  nobody notices).
- **Reuse `hasOperatingHours`** over restating "any non-closed day" — one owner
  for the product's "hours are set"; the derivation only adds the malformed-day
  refinement on top.
- **Two util modules (state, label) + `formatLocalTime` in `format.ts`** over
  one module with a private formatter — policy and copy have different reasons
  to change, and `format.ts` is the declared home of shared time formatters.
- **No catalog meta** over adding `NeonSign.catalog.ts` — it is curated
  (ADR-013; 38/86; `Handshake` has none) and would drag a `rialto-catalog`
  adapter into scope to keep `drift-check.test.ts:33-43` 1:1.
- **No showcase page test** over a `TapeChartPage.test.tsx`-style stub test —
  the registry load test and manifest-drift list already fail on a broken page
  module or stale manifest; a stub-rendering test proves little the Playwright
  page navigation does not.
- **No E2E state assertion** over asserting the sign's text — the fixture
  venue's state follows CI wall-clock; a name-regex visibility check is
  optional and must first survive a `role="img"` collision grep
  (`e2e-selector-drift-reviewer` territory).

## Risks & trade-offs

- **Strike replay frequency.** Replays on every mount of `HomePage` in `open`
  (navigating back to the dashboard) and on every live entry into `open`; not
  on caption ticks, re-renders, or a venue switch between two open venues.
  ux.md accepts first-paint replay; if navigation replays read as noisy, the
  fix is a consumer-side `sessionStorage` flag, not an instrument change.
- **WCAG 2.3.1.** The strike is three brightness returns inside 0.9 s — at the
  general flash threshold's edge. The sign's area is far below the 25%-of-10°
  field limit, and reduced motion removes the strike; Implement must not add a
  fourth dip or shorten `--neon-strike`.
- **`useNow` re-render cost.** One extra `HomePage` render per minute cascades
  to `StatRow` / `ReservationList` / `ActivityFeed` (not memoised). Negligible
  at 1/min; seed for later if profiles ever show it.
- **Hardcoded lists to update.** `a11y-matrix.test.tsx` `BARREL_COMPONENT_NAMES`
  and `manifest-drift.test.ts` `DATA_COMPONENTS` — both enumerated above. Also
  noted, not fixed: `Handshake` is absent from `DATA_COMPONENTS` (pre-existing
  omission at #4720) and `packages/rialto/CLAUDE.md` still names `routes.tsx` /
  `nav-sections.ts` as showcase touchpoints (the registry is the only one).
- **Exports-map drift.** `pnpm exports:check` after the build; commit
  `packages/rialto/package.json` and `registry.json` with the component.
- **Hospitality tests never render the real `NeonSign`** (every page test
  stubs `@mattbutlerengineering/rialto` because the dist may be unbuilt in a
  worktree — `TapeChartPage.test.tsx:7-16`). Rendering is proved by rialto's
  own tests, the a11y matrix, Storybook and the E2E dashboard load.
- **DST transition hour.** The opening-soon lead can be an hour off for a
  venue opening between 01:00 and 03:00 on the two transition nights; state
  is never wrong. Recorded in the frontmatter.
- **Deployed venue data.** Inherited UNKNOWN: if the live venue has no hours
  or an unusable zone, the deployed header shows `unset` or no sign.
- **Lint traps.** `react/no-unescaped-entities` (`&apos;` in showcase copy);
  `noUncheckedIndexedAccess` on `windows[(d + offset) % 7]` (`?? null`).

## ADRs

None — no decision here is hard to reverse, surprising without context, and
the product of a real trade-off at once. Existing ADRs honoured: ADR-001
(rialto + CSS Modules, no utility classes), ADR-013 (catalog meta is curated
and optional), ADR-024 (scoped to rialto's date-family props; `NeonSign` takes
none), ADR-025 (no framer-motion transition configs to resolve; CSS keyframes
per the instrument idiom).

## Unknowns

- **UNKNOWN — needs human input (inherited from prd.md / ux.md):** whether the
  deployed demo venue has `operatingHours` and a valid `ianaTimezone` set.
  Not derivable from the repo. — Matt, via the dashboard settings page.

Next stage: Decompose (`decompose` skill, or the router) — publish work items
as `ready` + `feature` issues under a `tracking` parent per the brief.
