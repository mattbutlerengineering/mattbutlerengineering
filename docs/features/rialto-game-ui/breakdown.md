---
stage: decompose
run: feature:rialto-game-ui
date: 2026-08-15
---

# Breakdown: Game-UI vibe for Rialto

Progress lives in the checkboxes below — Implement checks items off as their
acceptance criteria are met.

No tracker mirror: this breakdown is the only state. GitHub issue #3978 holds
the originating idea, not the work items.

## Milestone 1: Mechanism lands, provably a no-op

Demonstrable at the boundary: three new unit-tested primitives exist and
nothing anywhere renders differently. This milestone is what makes the PRD's
"no unopted surface changes" criterion testable instead of hoped-for.

- [x] **Reduced-motion adapter** — new `packages/rialto/src/providers/reduced-motion.ts`, sibling of `reduced-data.ts`, deriving `VibeOverrides` from `device.reducedMotion`.
  - Accept: returns `{}` when `reducedMotion` is false (byte-identical composition to today); returns `0s` for `--rialto-duration-fast|standard|slow` when true; pure and total, unit-tested both branches.
  - Blocked by: —
- [x] **Provider composition + precedence** — wire the adapter into `RialtoProvider`'s merge chain.
  - Accept: order is preset → reduced-data → reduced-motion → explicit `vibeOverrides`; a test asserts reduced-motion loses to an explicit override; every existing `RialtoProvider` test passes unmodified. (The "beats a preset's duration" half moved to Milestone 2 — see Notes 2026-08-15.)
  - Blocked by: Reduced-motion adapter
- [x] **`useMotionPreset()` hook** — new providers hook resolving framer-motion configs from vibe + `device.reducedMotion`.
  - Accept: rendered **outside** a provider it returns the `tokens/motion.ts` statics and does **not** throw (regression test for external npm consumers); under `reducedMotion` durations resolve to 0 and springs to instant, standalone as well as under a provider. (The `useContext(UIEnvironmentContext)` read moved to Milestone 2 — see Notes 2026-08-15.)
  - Blocked by: —
- [x] **ADR decision recorded** — "Motion presets resolve through context, not imported constants" (owner's call, see `architecture.md`).
  - Accept: `docs/adr/ADR-025-motion-presets-through-context.md` exists with `status: active` and is indexed in `docs/adr/README.md`.
  - Blocked by: —

## Milestone 2: The game vibe exists and is selectable

Demonstrable at the boundary: flip the rialto showcase to `game` and the
components that already read motion tokens visibly shift.

- [ ] **`game` preset** — add the preset to `vibes.ts` and the member to the `VibeName` union.
  - Accept: `Record<VibeName, VibeOverrides>` compiles (the type forces the preset to exist); `vibes.game` is non-empty; `default`, `transacting`, and `presenting` are byte-identical to before; **a test asserts the reduced-motion adapter's `0s` durations beat the `game` preset's duration tokens** (moved from Milestone 1 — no preset carried a duration token until this item).
  - Blocked by: — (design gap resolved 2026-08-15: no colour tokens)
- [ ] **Showcase vibe list** — add `game` to the `VIBES` array in `packages/rialto/src/showcase/App.tsx`.
  - Accept: the showcase vibe switcher offers `game`; existing showcase tests pass. (The `Record` type does not catch this list — it is a separate literal.)
  - Blocked by: `game` preset
- [ ] **Game-tuned motion configs** — `useMotionPreset()` returns different configs when the active vibe is `game`.
  - Accept: unit test asserts game configs differ from default configs, and that `reducedMotion` still wins over `game`.
  - Blocked by: `useMotionPreset()` hook, `game` preset

## Milestone 3: HUD components respond to the vibe

Demonstrable at the boundary: under `game` the ten HUD components retime;
under `default` they are indistinguishable from today.

- [ ] **CSS duration backfill (bounded, value-preserving)** — tokenize hardcoded durations in `StatusLED`, `Meter`, `Odometer`, `SplitFlap`, `DepartureBoard`, `DataTable`, `Card`, `Stat`, `Progress`, `TapeChart` only.
  - Accept: every changed declaration maps exactly `0.1s → --rialto-duration-fast`, `0.15s → --rialto-duration-standard`, `0.2s → --rialto-duration-slow`; **no `0.3s` declaration is touched** (no matching token exists, and inventing one would change default-vibe output); no component outside the ten is modified; existing visual baselines pass unmodified.
  - Blocked by: —
- [ ] **framer-motion call sites → hook** — the six HUD components driving motion in JS (`Meter`, `Odometer`, `SplitFlap`, `DepartureBoard`, `Card`, `Progress`) resolve configs from `useMotionPreset()` instead of importing statics.
  - Accept: each of the six still renders standalone with no provider present (test per component); default-vibe motion is unchanged; no other component's imports are touched.
  - Blocked by: `useMotionPreset()` hook

## Milestone 4: The route exists

Demonstrable at the boundary: walk the whole primary flow from `ux.md` by hand.

- [ ] **`useTelemetryFeed()`** — route-local hook producing deterministic mock frames and the `FeedState` machine.
  - Accept: same `seed` produces the same frame sequence; `frozen: true` resolves one fixed frame and never ticks; every `FeedState` variant (`connecting`/`empty`/`live`/`hold`/`stale`) is reachable in unit tests; the clock derives from frame `t`, never `Date.now()`.
  - Blocked by: —
- [ ] **Telemetry HUD route** — `/demos/telemetry` rendering the four regions of the `ux.md` wireframe (status strip, zone table, vitals rail, event ticker), inside `DemoLayout` and registered in the demo nav.
  - Accept: all four regions render; the route appears in the demo nav alongside Sign In / Dashboard / Drivers / Layouts; `?frozen=1` pins the feed; the live row highlight follows `activeZoneId`.
  - Blocked by: `useTelemetryFeed()`, `game` preset
- [ ] **Route-local vibe switch** — toggle between `game` and `default`, mirroring `ThemeToggle`'s placement and immediacy.
  - Accept: toggling swaps the vibe with no reload and no confirmation; the choice does **not** persist across navigation and is not written to storage; no other route can observe it.
  - Blocked by: Telemetry HUD route
- [ ] **Empty, loading, and stale states** — per `ux.md`.
  - Accept: the HUD frame never blanks; `connecting` shows skeleton value slots, `empty` shows STANDBY with placeholder glyphs, `stale` retains last-known values dimmed and labelled with their capture timestamp; zero layout shift between the three and `live`.
  - Blocked by: Telemetry HUD route

## Milestone 5: Gates

Demonstrable at the boundary: CI is green on the real gates, baselines committed.

- [ ] **A11y coverage** — the route joins `apps/rialto-web/e2e/a11y-pages.spec.ts`.
  - Accept: zero violations; every control reachable by keyboard in reading order; screen-reader announcements at parity with the same components under the default vibe.
  - Blocked by: Telemetry HUD route
- [ ] **Reduced-motion spec** — assert the designed reduced-motion presentation, not a blanket animation kill-switch.
  - Accept: with `prefers-reduced-motion: reduce` emulated, the route renders the same regions and the same values; duration tokens resolve to `0s`; the spec asserts that nothing is _removed_ — no state, value, or event is reachable only through motion.
  - Blocked by: Telemetry HUD route, Provider composition + precedence
- [ ] **Visual baselines** — the frozen route joins `visual.spec.ts`.
  - Accept: baselines are pulled from the Linux CI artifact, **never rendered on macOS**; the spec screenshots `?frozen=1`; every pre-existing baseline in the repo is unmodified.
  - Blocked by: Empty/loading/stale states, CSS duration backfill
- [ ] **CI wiring** — new specs listed by explicit full path in `.github/workflows/rialto-web-e2e.yml`.
  - Accept: `apps/rialto-web/e2e/workflow-coverage.test.ts` passes; each new spec is listed by full path, never by glob.
  - Blocked by: A11y coverage, Reduced-motion spec, Visual baselines
- [ ] **Contrast verification** — every colour token the `game` preset overrides, in both themes.
  - Accept: a test asserts `vibes.game` contains **no** `--rialto-color-*` token, matching the decision recorded in `architecture.md` — the criterion is now a guard against colour creeping in later, not a contrast audit.
  - Blocked by: `game` preset

## Design gaps found

- ~~**Which colour tokens the `game` preset overrides is unspecified.**~~
  **Resolved 2026-08-15 — the answer is none.** `architecture.md` had listed
  "state-color token overrides" among the preset's responsibilities while
  naming none, and all three existing vibes override zero colour tokens.
  Architect now records the decision explicitly: the `game` preset overrides
  **no** colour tokens, colour stays the theme's job, and the WCAG-AA criterion
  is satisfied by the existing light/dark palettes. The contrast-verification
  item became a guard test asserting no colour token creeps in. Unblocks the
  `game` preset item.

## Notes

_Deviations discovered during Implement get logged here, dated._

- **2026-08-15 — precedence assertion moved M1 → M2.** The provider-composition
  item's criterion asked for a test proving reduced-motion outranks a vibe
  preset's duration. That is unverifiable at Milestone 1: `default`,
  `transacting`, and `presenting` override spacing, radii, and weight only —
  **no existing preset sets a duration token**, so the preset-vs-adapter
  ordering has nothing to observe. `deriveReducedDataOverrides` and
  `deriveReducedMotionOverrides` emit disjoint token sets, so their relative
  order is unobservable too. The assertion moved to the `game` preset item,
  which is where a preset first carries durations. The half that _is_
  observable now — explicit `vibeOverrides` beating reduced-motion — is tested.
- **2026-08-15 — the hook reads the device signal, not the context (yet).** The
  item asked for a `useContext(UIEnvironmentContext)` read. That clause existed
  to keep the hook away from `useUIEnvironment()`, which throws outside a
  provider — and reading `useDeviceContext()` instead satisfies the intent more
  strongly: it is a provider-free `useSyncExternalStore` hook, so reduced motion
  is honoured even with no provider in the tree (tested). Nothing in this item
  needs the active vibe, and adding an unused context read would be dead code.
  The context read lands in Milestone 2's game-tuned-configs item, which is the
  first thing that actually needs `vibe`.
- **2026-08-15 — exported interfaces land in `registry.json`.** Exporting the
  `MotionPreset` interface added a 152nd registry entry with `props: []`. This
  is pre-existing behaviour, not a regression: `UIEnvironment` is already in
  there on the same terms. Regenerate rather than "fix" it.
- **2026-08-15 — `registry.json` is generated from provider JSDoc.** Editing
  `RialtoProvider`'s doc comment (two → three adapters) drifted the committed
  `registry.json`, failing three artifact-drift specs. Regenerate with
  `pnpm --dir packages/rialto build:registry` after any JSDoc edit on an
  exported component; the diff is one line but the drift specs are not
  optional.
