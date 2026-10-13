---
"@mattbutlerengineering/rialto": minor
---

`RialtoProvider` can now own theme persistence. Pass `persistTheme` and it reads the stored preference (one `THEME_STORAGE_KEY`, shared across tabs), follows the OS color scheme live while the preference is `"system"`, and exposes `{ preference, theme, setTheme, toggleTheme }` to descendants through the new `useTheme()` hook. Apps no longer need to call `useThemeState()` themselves and pass the result in. `useThemeState` stays exported.
