---
phase: 06-accessibility-foundation
plan: 01
subsystem: ui
tags: [rialto, accessibility, wcag, contrast, vitest, design-tokens]

# Dependency graph
requires: []
provides:
  - WCAG AA contrast test suite for all Rialto color token pairs (light + dark)
  - Fixed light theme token values: text-tertiary, warning, success, text-on-accent, accent
  - Fixed dark theme text-tertiary opacity
  - Warning token added to colors.json (was CSS-only)
affects:
  - 06-02-axe-foundation
  - 06-03-focus-management
  - 06-04-dialog-focus
  - 06-05-keyboard-navigation
  - all future rialto plans referencing color tokens

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Programmatic WCAG AA contrast verification via pure TS utility functions (sRGB linearization, relative luminance, contrast ratio, alpha blending)
    - JSON-backed token assertions — test imports colors.json directly for live contract testing
    - Dark theme opacity tokens verified via blendAlpha() against both surface values

key-files:
  created:
    - packages/rialto/src/test/token-contrast.test.ts
  modified:
    - packages/rialto/src/tokens/colors.css
    - packages/rialto/src/tokens/colors.json

key-decisions:
  - "Use dark text (#1a1918) on accent backgrounds — 6.26:1 vs 2.73:1 for white; reverses text-on-accent convention but is required for WCAG AA"
  - "Darken accent from #c4922a to #b0841e — lightest value achieving 3:1 UI control threshold, minimal visual drift"
  - "Dark theme text-tertiary opacity raised 0.38 -> 0.50 — research miscalculated; test revealed real 3.49:1 failure"
  - "Add warning token to colors.json — was CSS-only, now properly tracked in JSON token source"

patterns-established:
  - "Token contrast test: pure utility functions, no DOM, no axe-core dependency"
  - "Light theme values sourced from colors.json; dark theme constants hardcoded in test with sync comment"

requirements-completed: [A11Y-01, A11Y-10]

# Metrics
duration: 4min
completed: 2026-03-23
---

# Phase 6 Plan 01: Token Contrast Baseline Summary

**WCAG AA token contrast test suite with pure TS utilities, plus fixes to 6 failing color token pairs (5 light theme + 1 dark theme opacity) preserving warm palette character**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-23T00:00:33Z
- **Completed:** 2026-03-23T00:04:55Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Programmatic WCAG AA contrast test suite (21 tests) — the only reliable CI contrast check since axe-core cannot resolve CSS custom properties in jsdom
- Fixed all 5 known failing light theme pairs: text-tertiary, warning, success, text-on-accent, accent
- Discovered and fixed dark theme text-tertiary (opacity 0.38 was 3.49:1, raised to 0.50 for 5.07:1)
- Added warning token to colors.json (was previously CSS-only, breaking JSON/CSS sync)
- All 169 Rialto tests pass with no regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Create token-contrast.test.ts with WCAG AA assertions** - `ecbf19e` (test)
2. **Task 2: Fix failing light theme token values and make tests green** - `3c6dfaf` (feat)

## Files Created/Modified

- `packages/rialto/src/test/token-contrast.test.ts` - 21-test WCAG AA contrast suite with sRGB/luminance/contrastRatio/blendAlpha utilities
- `packages/rialto/src/tokens/colors.css` - Fixed text-tertiary, warning, success, text-on-accent, accent, accent-hover, accent-muted, accent-glow, dark text-tertiary opacity
- `packages/rialto/src/tokens/colors.json` - Synced all light theme value changes; added warning token

## Decisions Made

- **Dark text on accent**: Changed `--rialto-text-on-accent` from `#fdfcfa` (white) to `#1a1918` (dark) in light theme. White on #c4922a gold gives only 2.73:1; dark text gives 6.26:1. The dark theme already had `#1a1918`, making light theme consistent. Primary button text is now dark on gold.
- **Accent value**: Darkened from `#c4922a` to `#b0841e` — the lightest value that clears the 3:1 UI control threshold (achieves 3.16:1). Hover updated proportionally to `#c0942e`.
- **Warm palette preserved**: All fixes stayed within warm hue family. text-tertiary `#747070` (warm gray-brown), warning `#8a6820` (warm amber), success `#5e6a2e` (olive). No cool/blue shifts introduced.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Dark theme text-tertiary opacity 0.38 fails 4.5:1**
- **Found during:** Task 1 (running tests in RED state — 7 failures instead of expected 5)
- **Issue:** Research noted dark theme passed, but actual contrast computation showed text-tertiary at 0.38 opacity over #1e1c1a gives blended #73716f at only 3.49:1 on surface (3.37:1 on elevated). Both fail 4.5:1.
- **Fix:** Raised opacity from 0.38 to 0.50 in colors.css dark theme block. At 0.50 opacity: 5.07:1 on surface, 4.79:1 on elevated — both pass.
- **Files modified:** `packages/rialto/src/tokens/colors.css` (dark theme `--rialto-text-tertiary`)
- **Verification:** 21/21 contrast tests pass including dark tertiary on both surface and surface-elevated
- **Committed in:** `3c6dfaf` (Task 2 commit)

**2. [Rule 2 - Missing Critical] Warning token absent from colors.json**
- **Found during:** Task 1 (writing test that needed to import warning from colors.json)
- **Issue:** `--rialto-warning` existed in colors.css but had no corresponding entry in colors.json. This breaks the JSON-as-single-source-of-truth pattern and means any tool consuming colors.json would miss the warning token.
- **Fix:** Added `color.semantic.warning` object to colors.json with `default` (#8a6820) and `muted` values matching colors.css.
- **Files modified:** `packages/rialto/src/tokens/colors.json`
- **Verification:** Test imports `colors.color.semantic.warning.default.$value` successfully; JSON/CSS in sync
- **Committed in:** `3c6dfaf` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both fixes essential for correctness. Dark tertiary fix required by the plan's own test criteria. Warning JSON addition restores token source consistency. No scope creep.

## Issues Encountered

None beyond the deviations documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Clean token baseline established — all WCAG AA contrast pairs verified by programmatic test
- colors.json and colors.css are now in sync (warning token added)
- Ready for 06-02 (axe foundation) which depends on clean token values
- Note for future plans: text-on-accent is now dark (#1a1918) not white — components that previously assumed white text on gold buttons will need visual review

---
## Self-Check: PASSED

- token-contrast.test.ts: FOUND
- colors.css: FOUND
- colors.json: FOUND
- 06-01-SUMMARY.md: FOUND
- Commit ecbf19e (test - RED state): FOUND
- Commit 3c6dfaf (feat - GREEN state + token fixes): FOUND
- Commit 16c7fa6 (docs - metadata): FOUND

---
*Phase: 06-accessibility-foundation*
*Completed: 2026-03-23*
