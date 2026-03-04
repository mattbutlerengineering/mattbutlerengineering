---
phase: 04-hospitality-migration-full-hosting
plan: "04"
subsystem: ui
tags: [tailwind, eslint, ajv, rialto, cleanup, monorepo]

# Dependency graph
requires:
  - phase: 04-01
    provides: hospitality app using Rialto components
  - phase: 04-02
    provides: all hospitality pages migrated to CSS Modules
  - phase: 04-03
    provides: hospitality components migrated to CSS Modules
provides:
  - Monorepo with zero @mbe/ui or @mbe/shared-layout packages
  - Hospitality app with no Tailwind dependencies
  - ESLint working correctly (ajv error resolved by fixing pnpm override)
  - CLAUDE.md updated to reflect Rialto-only architecture
affects: [future-phases, all-packages]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ESLint v9 flat config with ajv v6 resolution (remove blanket ajv overrides in pnpm)"
    - "Rialto-only design system — @mbe/ui and @mbe/shared-layout retired"

key-files:
  created: []
  modified:
    - apps/hospitality/package.json
    - apps/hospitality/src/index.css
    - packages/config/package.json
    - package.json
    - CLAUDE.md
  deleted:
    - apps/hospitality/tailwind.config.js
    - apps/hospitality/postcss.config.js
    - packages/ui/ (entire package)
    - packages/shared-layout/ (entire package)

key-decisions:
  - "Removed blanket `ajv: >=8.18.0` pnpm override — it was force-upgrading ajv for @eslint/eslintrc which requires ajv ^6, causing the missingRefs/defaultMeta error"
  - "Downgraded ESLint from ^10.0.1 (pre-release) to ^9.0.0 (maintenance stable) in packages/config"
  - "Used git worktree remove --force for stale worktrees rather than rm -rf to keep git metadata clean"
  - "@mbe/ui and @mbe/shared-layout are now fully retired — Rialto is the sole design system"

patterns-established:
  - "Do not add blanket pnpm overrides for ajv — ESLint requires ajv v6 specifically"

requirements-completed: [CLEAN-01, CLEAN-02, CLEAN-03]

# Metrics
duration: 8min
completed: 2026-03-04
---

# Phase 4 Plan 04: Cleanup — Remove Tailwind, @mbe/ui, @mbe/shared-layout Summary

**Tailwind and legacy packages fully removed from hospitality — @mbe/ui and @mbe/shared-layout packages deleted, ESLint ajv error resolved by removing a bad pnpm override, Rialto is now the sole design system**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-04T05:12:08Z
- **Completed:** 2026-03-04T05:20:12Z
- **Tasks:** 2
- **Files modified:** 7 modified, 2 deleted (config files), 18 deleted (packages)

## Accomplishments
- Removed tailwindcss, postcss, autoprefixer, @mbe/ui, @mbe/shared-layout from hospitality package.json
- Deleted tailwind.config.js and postcss.config.js from hospitality
- Removed all `@tailwind` directives from index.css, replaced with minimal CSS reset
- Deleted packages/ui/ and packages/shared-layout/ directories entirely
- Removed all 4 stale git worktrees (agentic-workflows + 3 agent session worktrees)
- Fixed the monorepo-wide ESLint ajv error by removing the `ajv: >=8.18.0` pnpm override
- Updated CLAUDE.md to reflect Rialto-only architecture (removed "being replaced by rialto" language)

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove Tailwind from hospitality + fix ESLint ajv error** - `39e10a4` (chore)
2. **Task 2: Delete @mbe/ui and @mbe/shared-layout packages + clean up worktrees + update docs** - `6ce6c07` (chore)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified
- `apps/hospitality/package.json` - Removed @mbe/ui, @mbe/shared-layout, tailwindcss, postcss, autoprefixer; kept @mbe/rialto
- `apps/hospitality/src/index.css` - Removed @tailwind directives; added minimal box-sizing reset; kept :root CSS vars and body styles
- `apps/hospitality/tailwind.config.js` - DELETED
- `apps/hospitality/postcss.config.js` - DELETED
- `packages/config/package.json` - Downgraded eslint from ^10.0.1 to ^9.0.0, @eslint/js to ^9, @eslint/compat to ^1, eslint-config-prettier to ^9
- `package.json` - Removed `"ajv": ">=8.18.0"` from pnpm.overrides
- `CLAUDE.md` - Removed `ui/` entry from Directory Layout, removed "being replaced by rialto" language
- `packages/ui/` - DELETED (entire package: 8 source files)
- `packages/shared-layout/` - DELETED (entire package: 7 source files)
- `pnpm-lock.yaml` - Updated after dependency changes

## Decisions Made
- **Root cause of ajv error:** The `"ajv": ">=8.18.0"` pnpm override in root `package.json` was force-upgrading ajv for ALL packages — including `@eslint/eslintrc` which specifically requires `ajv@^6.x`. ESLint v9 and v10 both use `@eslint/eslintrc` which needs ajv v6 internally. Removing the override lets pnpm resolve `ajv@6.14.0` for `@eslint/eslintrc` correctly. This was a pre-existing bug introduced by a security-motivated override that didn't account for the ajv v6 requirement.
- **Worktree cleanup:** Used `git worktree remove --force` + `git worktree prune` to properly clean git's internal worktree registry, not just `rm -rf`. This prevents ghost entries in `.git/worktrees/`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed root cause of ESLint ajv error (not just ESLint version)**
- **Found during:** Task 1 (Remove Tailwind from hospitality + fix ESLint ajv error)
- **Issue:** Downgrading ESLint from v10 to v9 alone did not fix the ajv error. Both v9 and v10 use `@eslint/eslintrc@3.x` which requires `ajv@^6`. The blanket `"ajv": ">=8.18.0"` pnpm override in root `package.json` was forcing `ajv@8.18.0` for `@eslint/eslintrc`, which is incompatible (v8 removed `missingRefs` option and `._opts.defaultMeta` used by eslintrc's ajv wrapper).
- **Fix:** Removed `"ajv": ">=8.18.0"` from `pnpm.overrides` in root `package.json`. This allows pnpm to resolve `ajv@6.14.0` for `@eslint/eslintrc` as required.
- **Files modified:** `package.json`, `pnpm-lock.yaml`
- **Verification:** `pnpm lint` runs without the "NOT SUPPORTED: option missingRefs" / "TypeError: Cannot set properties of undefined (setting 'defaultMeta')" errors. All lint failures remaining are pre-existing code issues (accessibility errors, unused vars), not the ajv crash.
- **Committed in:** `39e10a4` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Auto-fix identified root cause rather than symptom. ESLint now works correctly across the entire monorepo.

## Issues Encountered
- The ESLint fix required more investigation than expected — the ESLint version downgrade alone was insufficient. The real fix was removing the conflicting pnpm ajv override. Total extra investigation time: ~3 minutes.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Plan 04-04 is the 4th of 5 plans in Phase 04
- The monorepo now has zero legacy UI packages — Rialto is the sole design system
- All hospitality source files use CSS Modules + Rialto tokens (Plans 04-01 through 04-03)
- ESLint works correctly monorepo-wide
- Ready for Plan 04-05: Pulumi hosting configuration for the migrated hospitality app

---
*Phase: 04-hospitality-migration-full-hosting*
*Completed: 2026-03-04*
