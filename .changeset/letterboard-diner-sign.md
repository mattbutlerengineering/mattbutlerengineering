---
"@mattbutlerengineering/rialto": minor
---

**New component `Letterboard`** — a vintage diner letterboard that renders text as individual moulded letter pieces slotted into the ridges of a recessed plate, each piece independently ink (black) or accent (red). Takes `lines`, where a row is either a plain string (all ink) or a list of `{ text, accent }` runs, plus `size` (`sm`/`md`/`lg`) and `align` (`start`/`center`/`end`). Purely presentational and motionless — a letterboard only changes when somebody's hands change it.

Accessible text is not the tiles: the plate is `aria-hidden`, and the sign's words are rendered separately as ordinary visually-hidden paragraphs (one per row, author casing preserved), with accent runs marked `<strong>` so the red never carries meaning on its own. Every colour resolves to an existing base token — the letter pieces sit on `--rialto-surface` with `--rialto-text-primary` / `--rialto-error` glyphs, the pair already measured at WCAG AA in both themes.
