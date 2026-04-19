# @mattbutlerengineering/rialto

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
