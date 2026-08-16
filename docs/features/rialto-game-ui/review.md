---
stage: review
run: feature:rialto-game-ui
date: 2026-08-15
---

# Review: Game-UI vibe for Rialto

## Scope

24 commits, `main...HEAD` on `feat/rialto-game-ui-vibe` — 49 files, +3349/-41.
The substantive surface is smaller than that count suggests: six shipped rialto
files changed (five CSS-token substitutions and three call sites moved onto the
preset hook), three new provider modules, one new demo route of ~700 lines, and
the rest is docs, tests, and regenerated `llms` artifacts.

Read in full for this review: `useTelemetryFeed.ts`, `regions.tsx`,
`Telemetry.tsx`, `reduced-motion.ts`, `useMotionPreset.ts`, and the
`RialtoProvider` / `useTilt` / `vibes` diffs. Two findings were confirmed by
probing the running route rather than by reading alone.

## Findings

### Major: the status strip announced the feed status twice

- Scenario: a screen-reader user on `/demos/telemetry` hears the status
  twice — "LIVE LIVE", and in the degraded state "STALE, STALE captured
  00:00". `StatusLED` given a `label` renders `role="img"` with that label as
  its accessible name, and the visible `<Text>` beside it already carries the
  same string. Measured on the running route:
  ```
  PROBE STALE {"stripText":"STALE · captured 00:00LAP 1/12P3SYS…","imgs":["STALE"]}
  ```
  axe passes the page: both nodes are individually valid, and nothing in the
  unit suite reads the accessibility tree as a whole.
- Decision: **fixed** (`8bbaee8e1`). The LED drops its label and becomes
  `aria-hidden` — it is decoration where text carries the status. The
  `StatusLED` inside the zone table keeps its label, because there it is the
  only carrier of "this row is the current zone" and has no text beside it.
  The spec now asserts the region holds exactly one mention and no labelled
  image.
- Note: this is the **second** occurrence of the same bug class in this run —
  the first was a duplicate `Meter` label in `VitalsRail`, caught during
  Implement. Two occurrences in one route is a pattern, not an accident: the
  route composes labelled rialto widgets next to its own text, and the widgets'
  `label` props are accessible names rather than visible ones. That is worth
  remembering the next time this codebase places a labelled rialto component
  beside a caption.

### Major: meters assert a definite `0` when no frame exists

- Scenario: load `/demos/telemetry?feed=empty`. Every value slot correctly
  reads `––`, but all six meters report a real reading to assistive tech:
  ```
  PROBE EMPTY {"stripText":"STANDBYLAP ––P––SYS…",
    "meters":[{"name":"SYS","now":"0"},{"name":"THROTTLE","now":"0"},
              {"name":"BRAKE","now":"0"},{"name":"FUEL","now":"0"},
              {"name":"TYRE FL","now":"0"},{"name":"TYRE FR","now":"0"}]}
  ```
  So the slot says "unknown" and the widget beside it says "zero", about the
  same quantity, in the same row. For `FUEL` and the two tyre meters that is
  not merely unknown-rendered-as-zero, it is a false reading: a car on standby
  has fuel. Sighted users get the same impression from a bar drawn at zero
  length. The same holds during `connecting`, where every other element is a
  skeleton.
- Decision: **deferred** — the correct fix does not belong in this run.
  `role="meter"` requires `aria-valuenow`; there is no ARIA spelling of
  "unknown" for it, so a meter that cannot express indeterminacy should not be
  a meter until it can. The right change is an indeterminate state on rialto's
  `Meter` (rendering an unfilled track with no `role="meter"`, or a busy
  affordance), which is a design-system feature with its own API decision,
  tests, and visual baselines. Reproducing that locally inside `regions.tsx`
  would put a private imitation of a catalog capability in a demo route — the
  exact decay this run's architecture spends its length avoiding. Filed as
  follow-up work; the route keeps the honest half (the `––` slots) meanwhile.

### Minor: `frozen` and `feed` are read only at mount

- Scenario: `useTelemetryFeed` seeds `useState` from `frozen || paused ||
degraded`, so those options are read once. An in-app navigation from
  `/demos/telemetry` to `/demos/telemetry?frozen=1` keeps the component
  mounted, stops the tick, and pins the feed at whatever index it had already
  reached — not at frame 0, which is what every screenshot assumes. No link in
  the app constructs that URL today (`nav-sections.ts` and `demo-routes.ts`
  both point at the bare route) and a hand-typed URL is a full page load, so
  the state is currently unreachable. Recorded because the guard is
  circumstantial: adding one in-app link with a query string would make the
  visual baselines nondeterministic, and nothing would fail to say so.
- Decision: deferred — unreachable today, and the fix (deriving the index from
  the props on change rather than at mount) is a behavioural change to a hook
  whose determinism the baselines depend on. Worth doing alongside the first
  in-app link that carries a query param, not before.

### Minor: the route path deviates from `architecture.md`, unlogged

- Scenario: `architecture.md` places the route at
  `apps/rialto-web/src/pages/demos/telemetry/`; it was built at
  `apps/rialto-web/src/pages/telemetry/`. The built path is right — every
  sibling demo (`pages/dashboard`, `pages/drivers`, `pages/auth`) uses
  `pages/<name>/`, and the architecture doc mis-stated the existing
  convention. The defect is the silence: a reader diffing doc against tree
  finds an unexplained mismatch and cannot tell which one is wrong.
- Decision: fixed by logging — recorded as a dated deviation in
  `breakdown.md`, alongside the ten already there.

### Minor: explicit `vibeOverrides` can re-impose motion on a user who asked for less

- Scenario: `RialtoProvider` composes preset → reduced-data → reduced-motion →
  explicit `vibeOverrides`. An app passing
  `vibeOverrides={{"--rialto-duration-slow": "0.4s"}}` overrides the zeroed
  duration for a `prefers-reduced-motion` user. This matches the documented
  contract exactly (`architecture.md` line 68, "the caller's fine-tuning,
  always final say"), so it is not a deviation — but the contract's
  accessibility consequence is not written down anywhere a consumer would
  read it.
- Decision: deferred — a docs change to `packages/rialto/docs/vibes.md`, not a
  behaviour change. Flipping the precedence so reduced-motion outranks the
  caller is defensible and arguably better, but it would silently break any
  consumer relying on the documented ordering, which is not this run's call to
  make.

### Minor: the `hold` feed state has no route-level test

- Scenario: `?feed=hold` renders a state — `HOLD`, accent LED, retained
  frame — that no test loads. `useTelemetryFeed.test.ts` covers the hook's
  `hold` branch, and `Telemetry.test.tsx` covers `live`, `empty`,
  `connecting`, and `stale` at route level, but not `hold`. A regression in
  how the route renders it would ship silently.
- Decision: deferred — the hook branch is covered, and `hold` is the least
  consequential of the five states (it is `live` with the tick stopped). Cheap
  to add whenever this file is next touched.

### Minor: `Stat` shows a downward trend beside a placeholder

- Scenario: in `empty` and `connecting` there is no active zone, so
  `trend={activeZone && activeZone.delta >= 0 ? "up" : "down"}` falls through
  to `"down"` — a downward arrow next to a `––` value, implying a decline that
  no data supports.
- Decision: deferred — cosmetic, in two synthetic states, and it disappears
  the moment a frame lands. Bundle it with the indeterminate-`Meter` work
  above, which touches the same rows.

## Passes with no findings

- **Security.** No secrets, no network, no storage, no `dangerouslySetInnerHTML`,
  no interpolation of user-controlled strings into markup. The only external
  input is `useSearchParams`, and both reads (`frozen`, `feed`) are compared
  against string literals rather than used as values — an unrecognised
  `?feed=anything` falls through to the normal live path. `SESSION_SEED` is a
  fixed demo constant, not a credential.
- **Determinism.** Every frame is `(seed, index)`; the clock is
  `index * intervalMs`, never `Date.now()`. `randomFrom`/`mix` are pure, and
  the `events` array is derived from the index rather than accumulated, so any
  frame can be produced standalone. This is what makes `?frozen=1` genuinely
  screenshot-stable rather than merely slow.
- **Design against `architecture.md`.** The three-adapter composition, the
  reduced-motion precedence above the preset, the no-throw contract on
  `useMotionPreset` (verified by `hud-standalone.test.tsx` rendering four
  components with no provider), the colour-token abstention, and the
  value-preserving CSS backfill all match their documented contracts. The two
  signature expansions — `MotionPreset.tilt` and the feed hook's
  `started`/`paused`/`degraded` — are already logged as dated deviations.

## Verdict

Ready to ship, with the two Ship gates Verify already recorded still open: the
Linux visual baselines, and the design-system owner's side-by-side verdict.

Two majors were found; one is fixed, one is deferred with the follow-up named.
Neither blocks: the deferred one degrades two synthetic demo states, not the
live path an evaluator lands on.

The honest summary of this review is that both majors were invisible to every
gate the run already passes. 2707 unit tests, a clean typecheck, a clean
linter, and an axe sweep that reports zero violations all held while the route
announced its status twice and reported six false readings. Both were found by
querying the accessibility tree of the running page and reading what came back.
That is the technique worth keeping from this run, more than either fix.
