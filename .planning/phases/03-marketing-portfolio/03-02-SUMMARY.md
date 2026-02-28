---
phase: 03-marketing-portfolio
plan: "02"
subsystem: ui
tags: [tailwind, postcss, rialto, marketing, dependency-cleanup]

# Dependency graph
requires:
  - phase: 03-01
    provides: Rialto-based marketing portfolio app built in Plan 01, which replaced all @mbe/ui and Tailwind usage in source files
provides:
  - Clean marketing app with @mbe/rialto as sole styling dependency — no Tailwind, PostCSS, or @mbe/ui remaining
  - postcss.config.js and tailwind.config.js deleted
  - Human-verified: portfolio renders correctly in dev mode with all sections, theme toggle, scroll CTAs, and responsive layout
affects:
  - 04-ui-package-deletion (can now safely remove @mbe/ui from monorepo — marketing is clean)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Rialto-only styling: marketing app now uses only @mbe/rialto — no Tailwind, no @mbe/ui, no PostCSS pipeline"

key-files:
  created: []
  modified:
    - apps/marketing/package.json

key-decisions:
  - "Pre-existing ESLint ajv error (Cannot find module 'ajv/lib/refs/json-schema-draft-04.json') affects ALL packages monorepo-wide — out of scope for this plan, deferred to deferred-items.md"

patterns-established: []

requirements-completed:
  - PORT-07
  - PORT-08

# Metrics
duration: 10min
completed: 2026-02-28
---

# Phase 03 Plan 02: Dependency Cleanup Summary

**Tailwind, PostCSS, @mbe/ui, and @mbe/auth removed from marketing app — @mbe/rialto is now the sole styling dependency, verified visually in dev mode**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-02-28T21:00:00Z
- **Completed:** 2026-02-28T21:10:00Z
- **Tasks:** 2 (1 auto + 1 checkpoint:human-verify)
- **Files modified:** 1 (package.json); 2 deleted (postcss.config.js, tailwind.config.js)

## Accomplishments

- Removed tailwindcss, postcss, autoprefixer from devDependencies in apps/marketing/package.json
- Removed @mbe/ui and @mbe/auth from dependencies (both leftover — Plan 01 already replaced usage in source)
- Added @mbe/rialto as workspace dependency
- Deleted postcss.config.js and tailwind.config.js config files
- pnpm build and pnpm typecheck both pass cleanly
- Human visual verification approved: Hero, Projects, About, Contact sections all render correctly; theme toggle, scroll CTAs, live links, and responsive layout all working

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove Tailwind/PostCSS/@mbe/ui deps** - `1b12614` (chore)
2. **Task 2: Visual verification checkpoint** - approved by user (no code changes; checkpoint gate only)

## Files Created/Modified

- `apps/marketing/package.json` - Removed tailwindcss/postcss/autoprefixer/\@mbe/ui/\@mbe/auth; added \@mbe/rialto workspace dependency
- `apps/marketing/postcss.config.js` - DELETED
- `apps/marketing/tailwind.config.js` - DELETED
- `.planning/phases/03-marketing-portfolio/deferred-items.md` - Created during Task 1 to document pre-existing ESLint ajv issue

## Decisions Made

- Pre-existing ESLint `ajv/lib/refs/json-schema-draft-04.json` error affects all packages monorepo-wide and is not caused by this plan's changes — documented in deferred-items.md and excluded from scope

## Deviations from Plan

None — plan executed exactly as written. The lint check was deferred due to a pre-existing infrastructure issue (documented in deferred-items.md), which is out of scope per deviation rules.

## Issues Encountered

- `pnpm lint` fails with `Cannot find module 'ajv/lib/refs/json-schema-draft-04.json'` across ALL packages in the monorepo — confirmed pre-existing, unrelated to this plan's dependency changes. Build and typecheck both pass. Logged to `deferred-items.md`.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Marketing app is now fully Rialto-only for styling
- Phase 04 (ui-package-deletion) can safely remove @mbe/ui from the monorepo — all three apps (rialto-web, marketing, hospitality) should now be migrated
- No blockers for Phase 04

---
*Phase: 03-marketing-portfolio*
*Completed: 2026-02-28*
