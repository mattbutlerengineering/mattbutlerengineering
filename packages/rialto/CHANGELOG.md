# @mattbutlerengineering/rialto

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
