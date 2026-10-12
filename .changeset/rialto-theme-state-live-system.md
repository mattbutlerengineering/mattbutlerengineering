---
"@mattbutlerengineering/rialto": minor
---

`useThemeState` now tracks the OS color scheme live: a stored `"system"` preference follows an OS dark-mode switch without a reload (previously it resolved once and never updated). The preference is held in a `useSyncExternalStore`-backed store, so every hook instance (and other browser tabs) share one value. Adds `THEME_STORAGE_KEY` so apps stop copying the `"mbe-theme-preference"` literal. `resolveTheme` is unchanged but remains a non-reactive snapshot; pass the raw preference to `RialtoProvider`'s `theme` prop instead.
