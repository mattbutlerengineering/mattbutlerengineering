---
stage: architect
run: feature:rialto-game-ui
date: 2026-08-15
---

# Architecture: Game-UI vibe for Rialto

## Approach

The upstream artifacts assumed the vibe mechanism could not carry motion.
Measurement says otherwise, but with a twist: motion in Rialto lives in **two
places**, and today's vibe reaches only one.

- **CSS channel** — 92 `transition:` declarations across the catalog. Easing
  is already tokenized (`var(--rialto-ease-*)`, 40 uses); duration mostly is
  not (`var(--rialto-duration-*)`, 6 uses — the rest hardcode `0.1s`,
  `0.15s`, `0.3s`).
- **JS channel** — 56 component files drive motion through `framer-motion`,
  37 of them importing static constants from `tokens/motion.ts`. No CSS
  custom property can reach a JS object.

So the design does not invent a mechanism; it gives the existing vibe a
**second channel** and keeps one interface over both. The CSS channel gains a
`game` preset in `vibes.ts` (the same shape as `transacting`/`presenting`).
The JS channel gains `useMotionPreset()`, a providers hook that resolves
framer-motion configs from the same two signals `RialtoProvider` already
composes: the active vibe and the device context. Reduced motion becomes a
**third adapter** in the existing composition chain, mirroring
`deriveReducedDataOverrides` exactly — the codebase already wrote this
pattern once, and this run writes it a second time rather than inventing a
third.

Everything stays opt-in: a surface that does not pass `vibe="game"` composes
the identical override map it composes today.

## Components

### `vibes.game` preset — `packages/rialto/src/providers/vibes.ts`

- Responsibility: the static CSS-side design language — density, radii,
  weight, duration, and easing token overrides that make the game vibe
  visually distinct.
- **Colour: none.** Resolved 2026-08-15, after Decompose flagged the original
  wording ("state-color token overrides") as unspecified. The preset overrides
  **zero** colour tokens, matching `default`, `transacting`, and `presenting`,
  which override none either. Colour remains the theme's job (`data-theme`),
  so the vibe composes with light and dark instead of fighting them, and the
  PRD's WCAG-AA-in-both-themes criterion is satisfied by the existing theme
  palettes rather than by a new contrast surface.
- Collaborators: `RialtoProvider` (consumes), `VibeName` union (extends).
- Note: `vibes` is typed `Record<VibeName, VibeOverrides>`, so adding the
  union member is compile-enforced to add the preset. `showcase/App.tsx`
  carries its own `VIBES` list and must be updated in the same change.

### Reduced-motion adapter — `packages/rialto/src/providers/reduced-motion.ts` (new)

- Responsibility: derive `VibeOverrides` from `device.reducedMotion` —
  collapse duration tokens to `0s` while leaving every non-motion token
  alone, so state still changes visibly through contrast, weight, and border.
- Collaborators: `useDeviceContext` (signal), `RialtoProvider` (composition).
- Deliberately a sibling of `reduced-data.ts`, not an extension of it: two
  device signals, two adapters, one interface.

### `RialtoProvider` composition — modified

- Responsibility: unchanged — compose adapters into one inline style map.
- Change: precedence becomes preset → reduced-data → **reduced-motion** →
  explicit `vibeOverrides`. Reduced motion must outrank the game preset's
  durations; the caller's explicit overrides stay final.

### `useMotionPreset()` — `packages/rialto/src/providers/useMotionPreset.ts` (new)

- Responsibility: the JS motion channel. Resolve `precision` / `spring` /
  `springGentle` configs from the active vibe and `device.reducedMotion`.
- Collaborators: `UIEnvironmentContext` (read directly, not via
  `useUIEnvironment`), `tokens/motion.ts` (default values).

### HUD component motion backfill — bounded set

- Responsibility: make ~10 components respond to the vibe at all —
  `StatusLED`, `Meter`, `Odometer`, `SplitFlap`, `DepartureBoard`,
  `DataTable`, `Card`, `Stat`, `Progress`, `TapeChart`.
- Two mechanical edits: CSS transitions swap hardcoded durations for
  `var(--rialto-duration-*)`; framer-motion call sites swap the static
  `precision`/`spring` import for `useMotionPreset()`.
- **Value-preserving constraint:** the backfill must not change any rendered
  duration under the default vibe. `0.1s → --rialto-duration-fast`,
  `0.15s → --rialto-duration-standard`, `0.2s → --rialto-duration-slow` are
  exact. `0.3s` has **no** matching token — leave those declarations
  untouched rather than inventing a token that changes default output.

### Telemetry demo route — `apps/rialto-web/src/pages/demos/telemetry/`

- Responsibility: render the HUD from `ux.md` at `/demos/telemetry`, wrapped
  in its own `RialtoProvider` carrying the route-local vibe state.
- Collaborators: `useTelemetryFeed` (data), the vibe switch (control), the
  existing `DemoLayout` and demo nav registration.

### `useTelemetryFeed()` — route-local hook

- Responsibility: produce deterministic mock telemetry frames on a tick, and
  expose the `live` / `hold` / `stale` states `ux.md` specifies.
- Collaborators: the route only. This is demo data and does not belong in
  `packages/rialto`.

### Vibe switch — route-local control

- Responsibility: toggle the route's vibe between `game` and `default`.
- Scoping: local `useState` inside the route. Nothing persists, nothing is
  written to storage, and no other route can observe it — this is what makes
  PRD's "no unopted surface changes" true by construction rather than by
  discipline.

## Data model

No persistence, no API. One in-memory frame shape:

```ts
interface TelemetryZone {
  id: string;
  zone: string; // "Turn 1 Apex"
  speed: number; // km/h, current pass
  best: number; // km/h, session best
  delta: number; // speed - best
}

interface TelemetryFrame {
  t: number; // ms since session start — drives the clock, never Date.now()
  lap: number;
  totalLaps: number;
  position: number;
  zones: TelemetryZone[];
  activeZoneId: string; // drives the live row highlight
  vitals: { throttle: number; brake: number; fuel: number; tyreFL: number; tyreFR: number }; // 0-1
  events: Array<{ t: number; label: string }>; // ticker feed, newest first
}

type FeedState =
  | { kind: "connecting" }
  | { kind: "empty" }
  | { kind: "live"; frame: TelemetryFrame }
  | { kind: "hold"; frame: TelemetryFrame }
  | { kind: "stale"; frame: TelemetryFrame; since: number };
```

Seed data derives from the existing `/demos/dashboard` racing mock, which
already carries zone/speed/best/delta rows.

## Interfaces & contracts

### `deriveReducedMotionOverrides(device: DeviceContext): VibeOverrides`

- Input: the full device context.
- Output: `{"--rialto-duration-fast": "0s", "--rialto-duration-standard": "0s", "--rialto-duration-slow": "0s"}` when `device.reducedMotion`, else `{}`.
- Failure modes: none — pure, total, no I/O. The empty map is a true no-op,
  so users without the preference compose byte-identical style to today.

### `useMotionPreset(): MotionPreset`

- Input: none. Reads `UIEnvironmentContext` **directly via `useContext`**.
- Output: `{ precision, spring, springGentle }` — framer-motion configs.
  Under `reducedMotion`, durations resolve to `0` and springs to instant, so
  transitions land in one frame rather than being removed.
- Failure modes: **context absent → returns the static defaults from
  `tokens/motion.ts`**. It must not call `useUIEnvironment()`, which throws
  outside a provider. Rialto is published to npm and external consumers
  render these components standalone today; throwing would convert ten
  catalog components into provider-only components — a breaking change
  disguised as a feature.

### `useTelemetryFeed(options): FeedState`

- Input: `{ seed: number; frozen: boolean; intervalMs?: number }`.
- Output: a `FeedState`. With `frozen: true` the hook resolves one fixed
  frame from the seed and never ticks.
- Failure modes: no network, so no I/O failure exists. The `stale` state is
  _simulated_ on demand to exercise the degraded-feed flow in `ux.md`; it is
  a demo affordance, not error handling.

### Route contract — `/demos/telemetry`

- Input: optional `?frozen=1` query param.
- Output: the HUD. `frozen=1` pins the feed and stops the ticker so
  screenshots are byte-stable; the default is live.
- Failure modes: unknown params ignored; the route renders the `connecting`
  state first and never blanks the frame (per `ux.md`).

## Stack & dependencies

- **No new dependencies.** `framer-motion` and the token system are already
  present; every piece of this design is composition of existing parts.
- **React context + CSS custom properties** — the mechanism `RialtoProvider`
  already uses; a second mechanism would need justification and has none.
- **Playwright** — the route joins `visual.spec.ts` (frozen) and the
  functional spec list. Per repo gotcha, `rialto-web-e2e.yml` lists specs by
  explicit path and `e2e/workflow-coverage.test.ts` fails if a spec is not
  wired in; any new spec must be added to both.

## Traceability — PRD success criteria → design

| Criterion                              | Where it lands                                                                                                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visible feedback under 100 ms          | `game` preset duration tokens + `useMotionPreset` + HUD backfill                                                                                               |
| A11y suite passes, zero exceptions     | Route joins `a11y-pages.spec.ts`; no component APIs change                                                                                                     |
| WCAG AA in light and dark              | Preset overrides no colour tokens; contrast is inherited from the existing theme palettes, and the run records that explicitly rather than leaving it unstated |
| Keyboard / SR parity with default vibe | Guaranteed by construction — same components, same DOM, only tokens differ                                                                                     |
| Reduced-motion presentation, asserted  | `deriveReducedMotionOverrides` + `useMotionPreset` reduced branch, both unit-tested; route-level spec                                                          |
| No unopted surface changes             | Opt-in `vibe` prop; backfill is value-preserving; existing baselines must pass unmodified                                                                      |
| Owner side-by-side verdict             | Process gate at Verify — the vibe switch is the instrument                                                                                                     |

## Decisions & alternatives

- **`useMotionPreset()` context hook** over leaving framer-motion untouched —
  a CSS-only vibe cannot change JS-driven motion, so the vibe would ship
  unable to carry the language it exists to carry.
- **Defensive context read** over `useUIEnvironment()` — the latter throws
  outside a provider, which would break external npm consumers rendering
  these components standalone.
- **Backfill bounded to HUD components** over catalog-wide tokenization —
  92 transitions and 56 framer-motion files is a design-system migration, not
  a pilot, and it would churn every visual baseline in the repo.
- **Value-preserving backfill, `0.3s` left alone** over adding a `slower`
  token — inventing a token to absorb a stray value changes default-vibe
  output, breaking the no-unopted-change criterion for a cosmetic tidy.
- **Reduced motion as a third adapter** over a `@media (prefers-reduced-motion)`
  block in the preset — the JS channel needs the same signal, and
  `DeviceContext` already computes it once for the whole tree.
- **Seeded feed + `?frozen=1`** over unseeded randomness — visual baselines
  cannot race a tick boundary, and this repo has already been burned by ±1px
  baseline cascades.
- **Route-local vibe state** over persisting the choice — persistence would
  let an opted-in choice leak to surfaces the PRD says must not change.
- **Demo data stays in the app** over shipping mock telemetry from
  `packages/rialto` — the design system does not ship fixtures.

## ADRs

**Recommended, not yet written:** _"Motion presets resolve through context,
not imported constants."_ It clears the bar on all three counts — hard to
reverse (the convention spreads to every animated component), surprising
without context (two ways to obtain a motion config will coexist during the
backfill), and a real trade-off (provider coupling against static-import
simplicity). Everything else here is a one-line record above and needs no
ADR. Owner's call; `/new-adr` scaffolds it in `docs/adr/`.
