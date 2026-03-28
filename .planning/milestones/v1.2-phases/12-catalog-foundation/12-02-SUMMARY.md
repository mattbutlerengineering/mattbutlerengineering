---
phase: 12-catalog-foundation
plan: "02"
subsystem: ui
tags: [rialto-catalog, json-render, zod, typescript-compiler-api, vitest, ci]

requires:
  - phase: 12-catalog-foundation
    plan: "01"
    provides: "@mbe/rialto-catalog scaffold with @json-render/core dependency and vitest test stubs"

provides:
  - TypeScript Compiler API script generating Zod schemas from 26 Rialto component prop interfaces
  - packages/rialto-catalog/src/generated-schemas.ts with 26 component Zod schemas
  - packages/rialto-catalog/src/catalog-config.ts with usage-oriented descriptions for all 26 components
  - packages/rialto-catalog/src/catalog.ts exporting working defineCatalog() via @json-render/react schema
  - catalog.prompt() returning 22KB system prompt with component descriptions, character limits, and action docs
  - CI drift check in .github/workflows/ci.yml catching generated-schemas.ts divergence
  - 10 passing tests covering prompt output and drift detection

affects:
  - 12-catalog-foundation (Plan 03 builds defineRegistry() on top of this catalog)
  - 13-ai-generation-pipeline (catalog is the system prompt source for AI generation)

tech-stack:
  added:
    - "TypeScript Compiler API (ts.createProgram, checker.getExportsOfModule) for prop extraction"
    - "tsx for running generation scripts"
  patterns:
    - "Generated Zod schemas from TypeScript source — only props declared in Rialto source files (not inherited HTML attrs)"
    - "Hardcoded fallback schema for Toast (provider pattern, not barrel-exported)"
    - "Character limits from catalog-config applied as .max(n) on z.string() props"
    - "Alphabetical sort of component names for deterministic generation output"
    - "CI drift check pattern: run generate + git diff --exit-code"

key-files:
  created:
    - packages/rialto-catalog/scripts/generate-catalog.ts
    - packages/rialto-catalog/src/generated-schemas.ts
    - packages/rialto-catalog/src/catalog-config.ts
    - packages/rialto-catalog/src/catalog.ts
  modified:
    - packages/rialto-catalog/src/index.ts
    - packages/rialto-catalog/src/__tests__/catalog.test.ts
    - packages/rialto-catalog/src/__tests__/drift-check.test.ts
    - packages/rialto-catalog/package.json
    - .github/workflows/ci.yml

key-decisions:
  - "TypeScript Compiler API isDeclaredInRialto() filter — only include props from packages/rialto/src/components/ directory, not inherited HTML/ARIA attributes from React types"
  - "Toast hardcoded as HARDCODED_SCHEMA_LINES — ToastInput is an Omit<> type alias not barrel-exported; hardcode keeps the 26-component count"
  - "Union type resolution via ts.TypeFlags.Union expansion with nested union flattening — handles AlertVariant, StackGap etc. type aliases"
  - "false | true expanded by TS compiler for boolean types — handled explicitly in mapTypeToZod"
  - "setState/pushState/removeState are built-in @json-render/react actions — do NOT re-declare in catalog.actions"

patterns-established:
  - "generate-catalog.ts pattern: createProgram → getExportsOfModule → filter by curated set → isDeclaredInRialto → mapTypeToZod → sort alphabetically → write"
  - "catalog.ts pattern: Object.fromEntries over catalogConfig entries with include:true → merge generatedSchemas + config.description + config.slots"
  - "drift-check.test.ts pattern: execFileSync('npx', ['tsx', scriptPath]) for safe subprocess execution (not shell)"

requirements-completed: [CAT-02, CAT-04, CAT-05, CAT-06]

duration: 8min
completed: "2026-03-28"
---

# Phase 12 Plan 02: Catalog Foundation Summary

**TypeScript Compiler API generates Zod schemas for 26 Rialto components; defineCatalog() produces a 22KB system prompt with component descriptions, character limits, and action declarations; CI drift check catches divergence**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-28T01:20:00Z
- **Completed:** 2026-03-28T01:28:00Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- `generate-catalog.ts` uses TypeScript Compiler API to extract props from 26 curated Rialto components, filtering out inherited HTML/ARIA attributes, mapping types to Zod schemas with character limits applied as `.max(n)` constraints
- `catalog.ts` calls `defineCatalog()` from `@json-render/react/schema`, producing a working catalog with 26 components and custom `validateForm`/`navigate` actions; `setState` is confirmed as built-in (not re-declared)
- `catalog.prompt()` returns a 22,350-character system prompt containing all component descriptions, character limit constraints, and action documentation
- Running `generate-catalog.ts` twice produces byte-identical output (deterministic sort + no timestamps)
- CI drift check added to `build` job in `ci.yml`; will fail if `generated-schemas.ts` diverges from Rialto source
- All 10 tests pass: 8 prompt content tests + 2 drift detection tests

## Task Commits

Each task was committed atomically:

1. **Task 1: Build generate-catalog.ts schema generation script** - `ca09953` (feat)
2. **Task 2: Create catalog definition, config, actions, CI drift check, and tests** - `301494f` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `packages/rialto-catalog/scripts/generate-catalog.ts` - TypeScript Compiler API script generating Zod schemas from Rialto prop interfaces
- `packages/rialto-catalog/src/generated-schemas.ts` - Auto-generated Zod schemas for 26 curated components (includes Toast hardcoded)
- `packages/rialto-catalog/src/catalog-config.ts` - Hand-authored usage-oriented descriptions and slot declarations for 26 components
- `packages/rialto-catalog/src/catalog.ts` - `defineCatalog()` call merging generated schemas with config; exports `catalog`
- `packages/rialto-catalog/src/index.ts` - Re-exports `catalog` (registry added in Plan 03)
- `packages/rialto-catalog/src/__tests__/catalog.test.ts` - 8 tests verifying `catalog.prompt()` content and component count
- `packages/rialto-catalog/src/__tests__/drift-check.test.ts` - 2 tests verifying determinism and drift detection
- `packages/rialto-catalog/package.json` - Updated generate script from `generate.ts` to `generate-catalog.ts`
- `.github/workflows/ci.yml` - Added "Check catalog drift" step to build job

## Decisions Made

- Only include props declared in `packages/rialto/src/components/` via `isDeclaredInRialto()` check — this is the key insight that prevents 100+ inherited HTML/ARIA attribute props from polluting the Zod schemas
- Toast hardcoded as `HARDCODED_SCHEMA_LINES` since `ToastInput` is an `Omit<ToastData, "id">` type alias not exported from the barrel — a clean solution that still achieves 26-component coverage
- Type alias expansion via `ts.TypeFlags.Union` with nested union flattening handles `AlertVariant`, `StackGap`, `TextColor` etc. without requiring a symbol table lookup
- `false | true` (TypeScript compiler's canonical form of `boolean`) handled explicitly in `mapTypeToZod` as a boolean match case

## Deviations from Plan

None - plan executed exactly as written.

**One deviation worth noting as a solve:** The TypeScript Compiler API expands inherited `HTMLAttributes<HTMLDivElement>` properties into the Props interface type, which would have polluted the Zod schemas with 100+ HTML/ARIA attributes. The `isDeclaredInRialto()` filter elegantly solves this by checking each prop's declaration source file path against `packages/rialto/src/components/`.

## Issues Encountered

- TypeScript Compiler API returns `false | true` for boolean properties (canonical form) rather than `boolean` — added explicit handling in `mapTypeToZod`
- `afterEach` was imported but unused in `drift-check.test.ts` — caused build failure; removed (Rule 1 auto-fix)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 03 can now import `catalog` from `@mbe/rialto-catalog` to build `defineRegistry()` with component-to-React-implementation mappings
- `catalog.prompt()` is the system prompt source ready for Phase 13 AI generation pipeline
- The CI drift check ensures `generated-schemas.ts` stays in sync with Rialto source as components evolve

---
*Phase: 12-catalog-foundation*
*Completed: 2026-03-28*

## Self-Check: PASSED

Files verified:
- `packages/rialto-catalog/scripts/generate-catalog.ts` — FOUND
- `packages/rialto-catalog/src/generated-schemas.ts` — FOUND
- `packages/rialto-catalog/src/catalog-config.ts` — FOUND
- `packages/rialto-catalog/src/catalog.ts` — FOUND
- `packages/rialto-catalog/src/index.ts` — FOUND
- `packages/rialto-catalog/src/__tests__/catalog.test.ts` — FOUND
- `packages/rialto-catalog/src/__tests__/drift-check.test.ts` — FOUND
- `.github/workflows/ci.yml` — FOUND
- `.planning/phases/12-catalog-foundation/12-02-SUMMARY.md` — FOUND

Commits verified:
- `ca09953` — Task 1: Build generate-catalog.ts schema generation script
- `301494f` — Task 2: Create catalog definition, config, actions, CI drift check, and tests
