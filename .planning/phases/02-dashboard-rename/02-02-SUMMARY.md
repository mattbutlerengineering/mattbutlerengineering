---
phase: 02-dashboard-rename
plan: 02
subsystem: docs
tags: [rename, documentation, hospitality, dashboard]

# Dependency graph
requires:
  - phase: 02-01
    provides: "dashboard→hospitality rename completed in code, IaC, and Pulumi"
provides:
  - "All documentation references updated from dashboard to hospitality"
  - "CLAUDE.md is authoritative source with hospitality naming"
  - "Evaluations, plans, codebase docs, and skill files all reference apps/hospitality"
affects: [03-hospitality-rialto, 04-cleanup]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - CLAUDE.md
    - docs/ARCHITECTURE.md
    - docs/NEXT_STEPS.md
    - docs/evaluations/2026-02-26-auth-providers.md
    - docs/evaluations/2026-02-26-monorepo-tooling.md
    - docs/evaluations/2026-02-26-analytics-feature-flags.md
    - docs/evaluations/2026-02-26-frontend-meta-frameworks.md
    - docs/plans/2026-01-22-platform-design.md
    - docs/plans/2026-02-25-rialto-monorepo-integration.md
    - .planning/codebase/ARCHITECTURE.md
    - .planning/codebase/STRUCTURE.md
    - .planning/codebase/STACK.md
    - .planning/codebase/CONCERNS.md
    - .claude/skills/auth-package/SKILL.md

key-decisions:
  - "Auth skill example redirectUri uses port 3002 (the actual dev port) not 5173 — updated to http://localhost:3002/hospitality/callback"
  - "Generic uses of the word 'dashboard' (Auth0 dashboard, Playwright dashboard, admin dashboard) were not changed — only app-specific references"

patterns-established:
  - "Context-sensitivity rule: Only rename app-specific references (apps/dashboard, @mbe/dashboard, /dashboard path); leave generic 'dashboard' term unchanged"

requirements-completed: [HOSP-01, HOSP-03, INFRA-01, INFRA-03]

# Metrics
duration: 4min
completed: 2026-02-28
---

# Phase 2 Plan 02: Documentation Update for Dashboard→Hospitality Rename Summary

**All 14 documentation files updated to replace app-specific dashboard references with hospitality, keeping CLAUDE.md as the authoritative project reference**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-28T18:15:36Z
- **Completed:** 2026-02-28T18:20:16Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments

- CLAUDE.md URL convention table, dev ports comment, directory layout, and access points all reference hospitality
- All 5 evaluation docs and 2 plan docs updated with hospitality naming throughout
- All 4 codebase analysis docs (.planning/codebase/) reflect the renamed directory structure
- Auth skill SKILL.md example now uses `/hospitality/callback` with correct port 3002

## Task Commits

Each task was committed atomically:

1. **Task 1: Update primary project docs** - `5a66cb4` (docs)
2. **Task 2: Update evaluations, plans, codebase docs, and skill files** - `df52308` (docs)

**Plan metadata:** TBD (docs: complete plan)

## Files Created/Modified

- `CLAUDE.md` - URL table, dev port, directory layout, access points
- `docs/ARCHITECTURE.md` - ASCII diagram, Mermaid diagram, component table, auth flow, URLs
- `docs/NEXT_STEPS.md` - App list, production URLs, infrastructure overview
- `docs/evaluations/2026-02-26-auth-providers.md` - apps/dashboard/src/main.tsx reference
- `docs/evaluations/2026-02-26-monorepo-tooling.md` - @mbe/dashboard in dependency graph
- `docs/evaluations/2026-02-26-analytics-feature-flags.md` - "dashboard app" implementation step
- `docs/evaluations/2026-02-26-frontend-meta-frameworks.md` - apps/dashboard/ references and BrowserRouter base
- `docs/plans/2026-01-22-platform-design.md` - /dashboard path, cd command, checklist item
- `docs/plans/2026-02-25-rialto-monorepo-integration.md` - package.json path, filter name, dev URL
- `.planning/codebase/ARCHITECTURE.md` - Location, entry point, reservation flow
- `.planning/codebase/STRUCTURE.md` - Directory listing, entry points
- `.planning/codebase/STACK.md` - React/RR dependencies list, Konva description
- `.planning/codebase/CONCERNS.md` - GuestsPage file references
- `.claude/skills/auth-package/SKILL.md` - VITE_AUTH_REDIRECT_URI example

## Decisions Made

- Auth skill SKILL.md redirect URI updated to `http://localhost:3002/hospitality/callback` — uses actual hospitality dev port (3002) rather than Vite default (5173), matching the real app configuration
- Generic uses of "dashboard" (Auth0 dashboard, Playwright dashboard, "CLI/dashboard displays results") were intentionally left unchanged per the context-sensitivity rule

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 2 is now fully complete — all code and documentation reference hospitality
- Phase 3 (hospitality Rialto migration) can proceed with clean, consistent naming throughout all docs
- No blockers

## Self-Check: PASSED

- CLAUDE.md: exists, contains apps/hospitality
- docs/ARCHITECTURE.md: exists, no stale apps/dashboard references
- 02-02-SUMMARY.md: created
- .claude/skills/auth-package/SKILL.md: exists, uses /hospitality/callback
- Commit 5a66cb4: verified in git log
- Commit df52308: verified in git log

---
*Phase: 02-dashboard-rename*
*Completed: 2026-02-28*
