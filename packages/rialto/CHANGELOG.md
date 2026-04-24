# @mattbutlerengineering/rialto

## 0.1.12

### Patch Changes

- **TapeChart — layout fix.** Two long-standing CSS grid bugs (since component introduction in `d27300e`): `.gridBody` was a 2-col grid whose 25 direct children got auto-placed into alternating columns, producing a 2-rooms-per-row layout; `.dayHeader`'s template didn't reserve a column for the leading "Rooms" header, pushing the last day cell to wrap onto a second row. Fixed by switching `.gridBody` to `flex-direction: column` and prepending a `roomCol` track to `.dayHeader`'s grid template. Visible symptoms went away at 24 rooms × 14 days; smaller consumers may not have noticed.

## 0.1.11

### Patch Changes

- **MasterOverride — hold-to-engage (`requireHold`):** opt-in dead-man-switch mode that requires pressing and holding the switch for a threshold (default 1000ms, clamped to [250, 5000]ms) before it engages. Asymmetric by design — disengaging remains a single click. Works with pointer (`pointerdown`), keyboard (Enter or Space, ignoring OS key-repeat), and cancels cleanly on `pointerup`, `pointerleave`, `keyup`, or pointer release outside the element. A gold conic-gradient progress ring fills around the switch track during the hold (driven by a Framer `MotionValue` via CSS custom property, so 60fps visual updates cause zero React re-renders). Live region announces hold start ("Hold to arm {label}"), cancel ("Arming cancelled"), and success ("{label} engaged"); announcements self-clear via a snapshot pattern when `armed` or `on` subsequently change.
- **MasterOverride — `labelTransition="splitflap"`:** opt-in replacement of the crossfaded `idleLabel` / `activeLabel` spans with a single `SplitFlap` mechanical cell above the switch track. Cascades between values on toggle using the library's flagship Solari-style primitive. Length defaults to `max(idleLabel.length, activeLabel.length)`; override with the new `labelLength` prop.
- Both features are additive and opt-in — existing consumers see no behavioral or visual change.

## 0.1.10

### Patch Changes

- **New primitive — `Heading`:** dedicated semantic heading with decoupled `level` (1–6, drives the rendered `h{level}` tag) and `size` (1–6, visual override). Sizes 1–4 use the display font (Bricolage Grotesque) for page/section titles; sizes 5–6 switch to the sans font with medium weight for UI-chrome headings (Dialog, Drawer, Card, etc.) — matches the design system rule reserving the display font for hero/page titles. Mirrors `Text`'s `color` / `align` / `truncate` / `as` API for a consistent authoring surface.
- **Consumer refactors:** `PageHeader`, `Dialog`, `Drawer`, and `ErrorBoundary` now use `Heading` instead of hand-rolled `<h1>` / `<h2>` with bespoke `.title` styles. Each consumer's CSS is pared back to layout-only concerns (margin, color, line-height). Chalkboard intentionally stays on its chalk-script theme — routing it through Heading would strip everything Heading provides.
- **Fix — `MasterOverride`:** state labels (`STANDBY` / `ENGAGED`) were absolutely positioned inside the switch track and the lever clipped them across its travel. Labels now sit on the housing as siblings of the track, with `justify-content: space-between`. Lever travel bumped from 42% → 75% so it visually reaches the end-stops like a real hardware toggle. Asymmetric padding on `.switchBody` keeps the stacked column fitting the `sm` bezel.

## 0.1.9

### Patch Changes

- **Avatar visual refresh:** machined-aluminum gradient face with hairline bezel, recessed LED status dots that glow in their own hue and gently breathe on live states (online / busy / away), and engraved initials fallback via a two-pass text-shadow. All motion honors `prefers-reduced-motion`.
- **Avatar splitflap swap:** new `transition="fade" | "splitflap"` prop. With `"splitflap"`, changing `src` runs the image through a two-flap horizontal reveal that mirrors the library's `SplitFlap` aesthetic. Default `"fade"` preserves the legacy crossfade.
- **Avatar internals:** replaced the boolean `imgFailed` flag with a `failedSrc` derivation so a fresh URL is retried automatically (removes a cascading-render effect).

## 0.1.8

### Patch Changes

- **New component:** `TapeChart` — hospitality rack-chart component. Grid of day-cells per room with reservation bars overlaid, suited for front-desk occupancy views.
- **Bug fix:** `SplitFlap` back-face rendering — removed a redundant back-face `div` from each cell and corrected an earlier overcorrection. Animation now uses a single transformed face per digit.

## 0.1.7

### Patch Changes

- **Build:** Add `types` field + stub `.d.ts` to the `./styles` subpath export. Without it, consumer apps building under TypeScript bundler resolution failed with `TS2882: Cannot find module or type declarations for side-effect import of '@mattbutlerengineering/rialto/styles'` after the 0.1.6 multi-entry export changes activated stricter resolution.

## 0.1.6

### Patch Changes

- **Accessibility:** Remove `aria-disabled` from `readOnly` inputs (`TextArea`, `NumberInput`) — `readOnly` is sufficient on its own and the coexistence was an anti-pattern.
- **Accessibility:** `NumberInput` now sets `aria-invalid="true"` when in error state (mirrors `Input` behavior).
- **Tree-shaking:** Per-component subpath exports via multi-entry Vite build. Consumers importing `Button` from the root barrel now pull ~5.7 kB instead of 245 kB (-97.7%). Direct subpath imports (`@mattbutlerengineering/rialto/Button`) pull ~1.3 kB. Root barrel import still works unchanged.
- **Release machinery:** Wired up Changesets for automated version bumps and CHANGELOG generation — future releases run via `pnpm changeset` + `pnpm version-packages`.

## 0.1.5

### Patch Changes

- New components: `MasterOverride`, `SplitFlap`, `Chalkboard`, `SplitScreenExit`, `Ferrofluid`.
- Accessibility fixes for overlay components (focus management and ARIA on Dialog / Popover / Sheet).
- Post-`/simplify` refactor across the new components (token usage, prop API cleanup, reduced bespoke CSS).

> Releases prior to 0.1.5 were published manually and are not catalogued here.
> Future entries will be generated automatically by [Changesets](https://github.com/changesets/changesets).
