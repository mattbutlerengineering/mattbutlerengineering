# Floor-plan canvas visual refresh: audit and proposal

Issue: #7708. This is a proposal. It changes no code; the work is filed as child issues (#7843, #7844, #7845, #7846, #7847), none of them `ready` until the Owner picks.

Goal: make the floor-plan canvas read more like a real dining room and be more pleasant to use, without breaking the size budget, memoization, keyboard editing or contrast.

## Method and limits

Every finding cites the code at `apps/hospitality/src/components/floor-plan/` on `main` at 4fd739807. Contrast ratios were computed from the token values in `packages/rialto/src/tokens/colors.css` and the fallback tables in `TableShape.tsx` (WCAG relative luminance).

**Screenshots are not included.** The editor sits behind Auth0 and needs a venue with a saved plan, and the worker that wrote this had no credentials, so no 1280px or 375px captures exist. The mobile findings below are derived from the code (the stage scale `width / planWidth` in `FloorPlanCanvas.tsx:135-152`), not observed. The first step of whichever child issue is picked up should capture 1280px and 375px light and dark screenshots into its PR. Never commit macOS captures as visual baselines.

The mockups under `docs/plans/assets/2026-10-floor-plan-visual-refresh/` are hand-drawn SVGs. Their colours are the resolved token values, not live tokens.

## 1. Audit against `.claude/rules/ui-quality.md`

| #   | Area               | Finding                                                                                                                                                                                                                                                                                                                             | Where                                                                                                                               | Rule it touches                                                       |
| --- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1   | Table labels       | Label colour is a literal `#ffffff`. Contrast on the status fill: light `reserved-soon` 3.41:1, `inactive` 2.48:1; dark `available` 2.55:1, `reserved-soon` 2.33:1, `needs-bussing` 2.37:1, `seated` 3.52:1. The 10px cover range is at 0.8 opacity, worse again.                                                                   | `TableShape.tsx:18,179-199`                                                                                                         | `accessibility/axe-serious` (`color-contrast`)                        |
| 2   | Table labels       | Labels are children of the rotated group, so a table at 180 degrees shows them upside down. Width is fixed at 40, so a long table number wraps or clips with no ellipsis.                                                                                                                                                           | `TableShape.tsx:161,179-199`                                                                                                        | legibility                                                            |
| 3   | Table and seat art | Art ignores the stored footprint. `RoundTableArt`/`SlabTableArt` and `seatPlacements` read `SHAPE_DEFAULTS` while the keyboard clamp reads `shapeMetadata.width/height`. A template long table stored 140 wide is drawn 80 wide, with chairs bunched, and the overlay hit area (also `SHAPE_DEFAULTS`) can disagree with the clamp. | `FurnitureArt.tsx:63,106`; `floor-plan-geometry.ts` `seatPlacements`; `FloorPlanCanvas.tsx:217-218`; `TableSelectionOverlay.tsx:38` | correctness, "show the real product"                                  |
| 4   | Seat art           | One chair size (16x13) for every party; a 2-top and a 12-top look alike. Chair tones are theme-blind browns: dark-theme frame is 1.81:1 and cushion 2.34:1 against `--rialto-surface-recessed`, so chairs nearly vanish in dark mode.                                                                                               | `FurnitureArt.tsx:39-40`; `furniture-tokens.ts:34-37`                                                                               | `accessibility` (non-text contrast)                                   |
| 5   | Shadows            | One hard 2-unit offset at `rgba(0,0,0,0.12)`. Invisible on the dark floor; chairs have none. The only soft shadow is the transient drag shadow.                                                                                                                                                                                     | `furniture-tokens.ts:34`; `FurnitureArt.tsx:36,66-71,115-123`; `TableShape.tsx:141-149`                                             | `agent-built/gray-card-border` (use the shadow tiers for grouping)    |
| 6   | Status             | Status is colour only. `reserved-soon` vs `needs-bussing` is 1.51:1 in light and 1.02:1 in dark. No legend on the canvas.                                                                                                                                                                                                           | `table-status.ts:21-26`; `FloorPlanCanvas.tsx:272-290`                                                                              | `accessibility` (colour as the only cue)                              |
| 7   | Walls and windows  | Walls are `lineCap="butt"` bars, so corners leave a notch. A window is the same bar dashed at 0.6 opacity and reads as a guide line. There is no door.                                                                                                                                                                              | `WallShape.tsx:42-52`                                                                                                               | realism                                                               |
| 8   | Sections           | Dashed 1px border plus 0.18 tint. Name plate is anchored top-left (`zone.x + 8`, `zone.y + 6`) with no collision handling, so a table in that corner sits under it. Textures work (five PNGs, 40 kB total) and the plate keeps AA contrast by design (`section-label-theme.ts`); this is the strongest part of the canvas.          | `SectionZone.tsx:75-99`                                                                                                             | none; keep                                                            |
| 9   | Grid               | Full-strength `--rialto-border` 1px line every 20 units, drawn as the wrapper background, so it is hidden under textured sections and loud on bare floor. It is applied when `readOnly` too. At 375px (scale about 0.47) cells are about 9px.                                                                                       | `FloorPlanCanvas.tsx:37-41,261-264`                                                                                                 | `agent-built/gray-card-border`                                        |
| 10  | Selection overlay  | Good: transparent native buttons coincide with tables, `focus-visible` uses `--rialto-accent`, selected stroke is the accent at 3px. Gap: seats are not part of the selected state, and the button footprint is `SHAPE_DEFAULTS` (see 3).                                                                                           | `TableSelectionOverlay.tsx`, `.module.css`; `TableShape.tsx:176-177`                                                                | none; keep                                                            |
| 11  | Empty state        | Two lines of `--rialto-text-tertiary` text centred on the grid, no action. Adequate but quiet.                                                                                                                                                                                                                                      | `FloorPlanCanvas.tsx:343-351`; `.module.css` `.emptyState*`                                                                         | out of scope for this refresh                                         |
| 12  | Dark mode          | Tokens resolve correctly and re-resolve on `data-theme` flips, but each `TableShape` installs its own `MutationObserver` (N observers for N tables) and all the furniture art tones (4, 5) are theme-blind. Walls use `--rialto-text-secondary` and track the theme.                                                                | `TableShape.tsx:96-108`; `furniture-tokens.ts`                                                                                      | `agent-built/unrequested-dark-theme` (dark must follow, not be fixed) |
| 13  | Mobile (375px)     | Derived, not observed: text is drawn inside the scaled stage, so 14px/10px labels render near 6.6px/4.7px; the wrapper name and zoom overlays (DOM) are fine.                                                                                                                                                                       | `FloorPlanCanvas.tsx:292-299`; `TableShape.tsx:179-199`                                                                             | mobile UX criterion in `apps/hospitality/CLAUDE.md`                   |

Things that are already right and must not regress: the `memo` on `TableShape` and `WallShape` (`TableShape.tsx:205`, `WallShape.tsx:63`, stable `handleWallSelect` at `FloorPlanCanvas.tsx:181`), focus-scoped keyboard handling (`FloorPlanCanvas.tsx:193-245`), the section label plate, and the URL-referenced textures.

## 2. Proposed changes

Costs are estimates. Chunk budgets (from `apps/hospitality/package.json`): Floor Plan Editor 6 kB, Floor Plan Shared 9 kB. Measure with `pnpm size:check` in each PR before trusting an estimate.

### Change 1: labels on a plate, upright, readable (#7843)

Mockup: `assets/2026-10-floor-plan-visual-refresh/01-labels.svg`.

- Draw the number and cover range on a small opaque plate: `--rialto-surface` fill, `--rialto-text-primary` ink, resolved the way `section-label-theme.ts` already does and re-resolved on `data-theme`.
- Counter-rotate the plate; size it to the text; divide the font size by the stage scale with a floor so mobile labels stay readable.
- Tokens: `--rialto-surface`, `--rialto-text-primary`, `--rialto-radius-default` (corner radius, resolved).
- Cost: small. About 0.3 kB brotli in the editor chunk (one theme helper and a `Label`/`Tag`, already imported for sections). No extra Konva nodes beyond one Tag per table. Render cost unchanged because the plate is part of the memoized `TableShape`.
- Fixes audit 1, 2, 13.

### Change 2: status legend and non-colour glyphs (#7844)

Mockup: `02-legend.svg`.

- A legend strip under the canvas (DOM) listing four statuses and Inactive, plus a small glyph per status on the table: check (available), clock (reserved-soon), lines (needs-bussing), filled dot (seated).
- Tokens: existing status tokens (`--rialto-success`, `--rialto-accent`, `--rialto-warning`, `--rialto-error`), `--rialto-surface`, `--rialto-shadow-xs`, `--rialto-space-xs`, `--rialto-text-sm`. Accent stays reserved for selection and the reserved-soon status that it already carries; no new use.
- Cost: medium. About 0.5 kB for glyph paths plus catalog strings in four locales. The legend is a DOM element outside the Konva tree, so it adds no canvas re-render cost.
- Fixes audit 6.

### Change 3: soft contact shadows and theme-aware chair tones (#7845)

Mockup: `03-shadows.svg`.

- Replace the 2-unit offset with a blurred contact shadow under tables and chairs; key the shadow tone and chair tones light and dark.
- Tokens: the shadow tone follows the `--rialto-shadow-*` colour family (`rgb(26 25 24 / x)` light, `rgb(0 0 0 / x)` dark; `shadows.css`), resolved at render time since canvas cannot read `var()`. The chair tones remain furniture-material literals per `furniture-tokens.ts`, now keyed by theme and still covered by `furniture-assets.test.ts`.
- Cost: medium and the riskiest for performance. Konva shadow blur is expensive per node. Mitigation: blur only the shadow node, or `cache()` the static furniture group so drags re-rasterise only the dragged table. Needs a drag frame-time measurement. Size: about 0.2 kB.
- Fixes audit 4 (dark contrast), 5, 12.

### Change 4: room shell (#7846)

Mockup: `04-room-shell.svg`.

- Wall corners closed (`lineCap="square"` or mitre), window drawn as glass between two jamb ticks, grid lowered to roughly 35 percent strength, hidden when read-only and below a minimum on-screen cell size, a plan-level default floor material under all sections, solid hairline section borders.
- Tokens: `--rialto-text-secondary` (walls, unchanged), `--rialto-border` mixed down via `color-mix`, the five existing floor textures, section colour. No new colour.
- Cost: medium. About 0.3 kB of code. The plan-level floor material may need a `layoutJson` field; if it does, state the schema change in the PR and follow `/idea-to-prod:prisma-migrations` only if a column is added (it is JSON today, so probably not). Grid change is CSS only. Walls remain memoized.
- Fixes audit 7, 9; refines 8.

### Change 5: table art and chairs follow footprint and party size (#7847)

Mockup: `05-seats.svg`. This is partly a bug fix.

- Thread `shapeMetadata.width/height` (falling back to `SHAPE_DEFAULTS`) through `TableArt`, `seatPlacements` and the overlay. Scale chair size gently with party size and spread chairs along the real edges.
- Tokens: none (geometry only).
- Cost: small to medium. Roughly neutral on size (removes a constant lookup, adds a size argument). `seatPlacements` is pure and fully unit-testable. `TableShape` props do not change, so memoization is unaffected.
- Fixes audit 3, 4 (scale).

### Suggested order

5 first (correctness, unblocks accurate label placement), then 1, 2, 4, 3 last because it carries the performance risk. Changes 1 and 2 can share a plate; if both are picked, build 1 first and let 2 reuse it.

### Considered and not proposed

- Per-section floor material: already shipped (`SectionZone`, `SectionMaterialPicker`, `useFloorTextures`).
- Gradient or glow furniture, or a permanent dark canvas: banned by `agent-built/gradient-background` and `agent-built/unrequested-dark-theme`.
- Replacing Konva shapes with the SVG assets: rejected by the code's own comment, because a raster cannot take the live status colour and the editor chunk cannot absorb inline SVG.

## 3. Constraints

- **Size budget (#7274).** `.size-limit` entries in `apps/hospitality/package.json`: Floor Plan Editor lazy chunk 6 kB, Floor Plan Shared 9 kB. Each child runs `pnpm size:check` and reports the delta. No new PNGs (textures stay URL-referenced; `floor-textures.test.ts` fails on a `.png` import).
- **Re-render cost (#7275).** `TableShape` and `WallShape` stay `memo`; callbacks keep stable identity; new per-table work (plates, glyphs, shadows) lives inside the memoized component so one SSE delta still re-renders one table. Prefer one shared theme subscription to N observers if a child touches that code, but that cleanup is separate from this refresh.
- **Keyboard editing (#6387).** Arrow nudge, Delete and the Tab-reachable overlay buttons are unchanged. Change 5 makes the overlay footprint and the clamp agree with the art, which helps rather than risks it.
- **Brand vibe.** Speakeasy/royal through Rialto tokens, never at the cost of contrast. Gold stays `--rialto-accent` for focus, selection and the existing reserved-soon status; no decorative gold. Every new text/background pair needs 4.5:1, every new graphic 3:1, verified in tests that read `packages/rialto/src/tokens/colors.css`.
- **Canvas exception.** Canvas fills cannot use `var(--rialto-*)`; resolve at render time via `getComputedStyle` and keep light/dark keyed fallbacks plus a drift-guard test, as `apps/hospitality/CLAUDE.md` requires.
- **Motion.** No new animation. The drag shadow stays the single transient effect and honours reduced motion via `useMotionPreset()`.
- **i18n.** New visible strings go through `useTranslation` and all four catalogs (`pnpm check:i18n-catalogs`).
- **Visual baselines.** Linux-runner only; regenerate with `visual-baseline-regen.yml`, never from macOS.

## 4. Child issues

| Change                                              | Issue | State                         |
| --------------------------------------------------- | ----- | ----------------------------- |
| 1. Labels on a plate, upright, AA contrast          | #7843 | filed, awaiting Owner `ready` |
| 2. Status legend and glyphs                         | #7844 | filed, awaiting Owner `ready` |
| 3. Soft shadows and theme-aware chair tones         | #7845 | filed, awaiting Owner `ready` |
| 4. Room shell (corners, window, grid, plan floor)   | #7846 | filed, awaiting Owner `ready` |
| 5. Table art and chairs follow footprint/party size | #7847 | filed, awaiting Owner `ready` |

The issue asks for children for approved changes only; all five were filed unlabelled by the delegating session so the Owner can approve by promotion. Close the ones not picked.

Related: #7588 (list page text overflow, tracked separately).
