---
phase: 12-catalog-foundation
plan: "01"
subsystem: ui
tags: [zod, zod-v4, workspace-catalog, json-render, rialto-catalog, vitest, pnpm]

requires: []
provides:
  - Zod v4 pinned in pnpm workspace catalog (zod@^4.3.6)
  - All 4 Zod-dependent packages using catalog: protocol
  - packages/rialto-catalog scaffolded as private workspace package
  - Test stubs for catalog prompt and drift-check behaviors
affects:
  - 12-catalog-foundation (Plans 02 and 03 build on rialto-catalog scaffold)
  - 13-ai-generation-pipeline (uses @json-render/core at Zod v4)

tech-stack:
  added:
    - "zod@^4.3.6 via pnpm workspace catalog"
    - "@json-render/core@^0.15.0"
    - "@json-render/react@^0.15.0"
    - "@mbe/rialto-catalog (new package)"
  patterns:
    - "pnpm catalog: protocol for shared dependency version pinning"
    - "Zod v4 top-level validators: z.url() instead of z.string().url()"

key-files:
  created:
    - packages/rialto-catalog/package.json
    - packages/rialto-catalog/tsconfig.json
    - packages/rialto-catalog/vitest.config.ts
    - packages/rialto-catalog/src/index.ts
    - packages/rialto-catalog/src/__tests__/catalog.test.ts
    - packages/rialto-catalog/src/__tests__/drift-check.test.ts
  modified:
    - pnpm-workspace.yaml
    - packages/agent-core/package.json
    - packages/agent-core/src/pr-creator.ts
    - services/users/package.json
    - services/agent/package.json
    - services/reservations/package.json
    - pnpm-lock.yaml

key-decisions:
  - "Zod v4 enforced via pnpm workspace catalog — single source of truth for version across all workspace packages"
  - "z.url() used instead of deprecated z.string().url() in Zod v4 (only breaking change found)"
  - "rialto-catalog tsconfig extends @mbe/config/typescript/base with jsx: react-jsx added for React component support"
  - "@types/node pinned to ^25.3.0 (newer than other packages) to match plan spec"

patterns-established:
  - "workspace catalog: pattern — add version to pnpm-workspace.yaml catalog section, reference with 'catalog:' in package.json"
  - "Placeholder test stubs use it.todo() — all pending, no skipped or failing tests at scaffold stage"

requirements-completed: [CAT-01]

duration: 3min
completed: "2026-03-28"
---

# Phase 12 Plan 01: Catalog Foundation Summary

**Zod v3-to-v4 upgrade enforced via pnpm workspace catalog across 4 packages, with @mbe/rialto-catalog scaffolded including @json-render/core dependency and vitest test stubs**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-28T01:13:38Z
- **Completed:** 2026-03-28T01:16:47Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments

- Pinned `zod@^4.3.6` in `pnpm-workspace.yaml` catalog section; all 4 Zod-dependent workspace packages now use `"zod": "catalog:"`
- Fixed the only Zod v4 deprecation: `z.string().url()` → `z.url()` in `packages/agent-core/src/pr-creator.ts`
- Scaffolded `packages/rialto-catalog` as a private workspace package with `@json-render/core`, `@json-render/react`, `@mbe/rialto`, and vitest test stubs (7 todo tests)
- All existing tests pass with zero regressions (`pnpm build`, `pnpm typecheck`, `pnpm test` all green)

## Task Commits

Each task was committed atomically:

1. **Task 1: Upgrade Zod v4 monorepo-wide and fix deprecations** - `529be03` (feat)
2. **Task 2: Scaffold packages/rialto-catalog with test infrastructure** - `8ae298f` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `pnpm-workspace.yaml` - Added `catalog:` section pinning `zod: "^4.3.6"`
- `packages/agent-core/package.json` - Changed zod to `"catalog:"`
- `packages/agent-core/src/pr-creator.ts` - Fixed `z.string().url()` → `z.url()`
- `services/users/package.json` - Changed zod to `"catalog:"`
- `services/agent/package.json` - Changed zod to `"catalog:"`
- `services/reservations/package.json` - Changed zod to `"catalog:"`
- `packages/rialto-catalog/package.json` - New package: `@mbe/rialto-catalog@0.1.0`
- `packages/rialto-catalog/tsconfig.json` - Extends `@mbe/config/typescript/base`, adds jsx
- `packages/rialto-catalog/vitest.config.ts` - Standard vitest config with globals
- `packages/rialto-catalog/src/index.ts` - Placeholder (Plans 02 and 03 populate)
- `packages/rialto-catalog/src/__tests__/catalog.test.ts` - 6 todo stubs for catalog.prompt()
- `packages/rialto-catalog/src/__tests__/drift-check.test.ts` - 1 todo stub for determinism

## Decisions Made

- Used pnpm workspace catalog protocol (`catalog:`) as the single source of truth for Zod version — enforces consistency without per-package overrides
- `z.url()` is the correct Zod v4 replacement for the deprecated `z.string().url()` — only one occurrence found in the codebase
- `@mbe/rialto-catalog` tsconfig uses `noEmit: true` for now (no compiled output until Plans 02 and 03 add real implementation)
- Lighthouse's transitive `chromium-bidi → zod@3.x` dependency is expected and does not affect workspace packages

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The `@types/node@^25.3.0` spec in the plan (newer than the `^22.0.0` used in other packages) resolved without conflict. The turbo warning about no output files for `@mbe/rialto-catalog#build` is expected given `noEmit: true` in the current tsconfig — this will be resolved when Plans 02/03 add real build output.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plans 02 and 03 can now import `@json-render/core` and `zod` (catalog:) from the `@mbe/rialto-catalog` package
- The 7 todo test stubs in `src/__tests__/` define expected behaviors for Plan 02 (catalog.prompt()) and Plan 03 (drift-check)
- Workspace is clean: `pnpm build`, `pnpm typecheck`, and `pnpm test` all pass

---
*Phase: 12-catalog-foundation*
*Completed: 2026-03-28*

## Self-Check: PASSED

Files verified:
- `packages/rialto-catalog/package.json` — FOUND
- `packages/rialto-catalog/src/__tests__/catalog.test.ts` — FOUND
- `packages/rialto-catalog/src/__tests__/drift-check.test.ts` — FOUND
- `packages/rialto-catalog/src/index.ts` — FOUND
- `packages/rialto-catalog/tsconfig.json` — FOUND
- `packages/rialto-catalog/vitest.config.ts` — FOUND
- `pnpm-workspace.yaml` — FOUND (catalog: section added)

Commits verified:
- `529be03` — Task 1: Upgrade Zod v4 monorepo-wide
- `8ae298f` — Task 2: Scaffold packages/rialto-catalog
