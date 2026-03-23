---
phase: 08-ai-developer-experience
plan: 01
subsystem: ui
tags: [rialto, registry, typescript-compiler-api, ci, json]

# Dependency graph
requires: []
provides:
  - packages/rialto/registry.json with 90 components, each with importPath, props, slots, characterLimits
  - packages/rialto/scripts/generate-registry.ts script using TypeScript Compiler API
  - apps/rialto-web/public/registry.json static copy served at /rialto/registry.json
  - CI drift check that fails build if registry.json diverges from generated output
affects: [08-02, 08-03, 08-04, 08-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Registry generation: TypeScript Compiler API to extract component metadata into committed JSON"
    - "CI drift check: build:registry + git diff --exit-code to detect stale committed artifacts"
    - "Prebuild hook: apps/rialto-web prebuild copies packages/rialto/registry.json to public/"

key-files:
  created:
    - packages/rialto/scripts/generate-registry.ts
    - packages/rialto/registry.json
    - apps/rialto-web/.gitignore
  modified:
    - packages/rialto/package.json
    - apps/rialto-web/package.json
    - .github/workflows/ci.yml

key-decisions:
  - "Registry output to packages/rialto/registry.json (package root, committed) not dist/ (gitignored)"
  - "importPath always '@mbe/rialto' — all components barrel-exported from single entry point"
  - "apps/rialto-web/public/registry.json is a build artifact excluded from git via .gitignore"
  - "CI drift check placed in 'build' job after 'Build all packages' step — registry must match source after build"

patterns-established:
  - "Committed generated artifacts (registry.json) validated in CI with git diff --exit-code"
  - "Prebuild scripts copy cross-package artifacts before static site builds"

requirements-completed: [AIDX-01, AIDX-06]

# Metrics
duration: 2min
completed: 2026-03-23
---

# Phase 8 Plan 1: Component Registry Generation Summary

**TypeScript Compiler API registry pipeline generating 90-component registry.json with importPath metadata, CI drift detection, and static serving from rialto-web public directory**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-23T02:03:48Z
- **Completed:** 2026-03-23T02:05:51Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Created `generate-registry.ts` script adapting `generate-manifest.ts` pattern with `importPath: "@mbe/rialto"` added to every component entry
- Generated `packages/rialto/registry.json` with 90 components, version, generatedAt, props, slots, and characterLimits — committed as source of truth
- Added CI "Check registry.json is up to date" step using `git diff --exit-code` to catch stale committed registries
- Configured `apps/rialto-web` prebuild to copy registry.json into public/ before each build, serving it as static JSON at `/rialto/registry.json`

## Task Commits

Each task was committed atomically:

1. **Task 1: Create generate-registry.ts and build:registry script** - `6496751` (feat)
2. **Task 2: Serve registry from rialto-web and add CI drift check** - `f214c97` (feat)

## Files Created/Modified

- `packages/rialto/scripts/generate-registry.ts` - Registry generation script, TypeScript Compiler API extracts components + adds importPath
- `packages/rialto/registry.json` - Committed registry artifact with 90 components
- `packages/rialto/package.json` - Added `build:registry` script
- `apps/rialto-web/package.json` - Added `prebuild` script copying registry.json to public/
- `apps/rialto-web/.gitignore` - Created, excludes `public/registry.json` as build artifact
- `.github/workflows/ci.yml` - Added "Check registry.json is up to date" drift check step in build job

## Decisions Made

- Registry output goes to `packages/rialto/registry.json` (package root, committed) not `dist/` (gitignored) — so it persists as a source of truth across clean builds
- `importPath` is always `"@mbe/rialto"` since all components barrel-export from a single entry point — no per-component import paths needed
- `apps/rialto-web/public/registry.json` is excluded from git via `.gitignore` — generated at build time from the canonical copy in `packages/rialto/`
- CI drift check runs after "Build all packages" in the build job — ensures the check uses the same environment as the build

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `packages/rialto/registry.json` is committed and ready for Phase 8 Plan 2 (llms.txt generation)
- Static serving at `/rialto/registry.json` is configured for rialto-web production builds
- CI will enforce registry stays current with any future component additions

## Self-Check: PASSED

All created files verified present. Both task commits found (6496751, f214c97).

---
*Phase: 08-ai-developer-experience*
*Completed: 2026-03-23*
