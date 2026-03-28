---
phase: 12-catalog-foundation
plan: "03"
subsystem: ui
tags: [rialto-catalog, json-render, registry, react, vitest, jsdom, testing-library]

requires:
  - phase: 12-catalog-foundation
    plan: "02"
    provides: "catalog.ts with defineCatalog() over 26 Rialto components"

provides:
  - packages/rialto-catalog/src/registry.tsx with defineRegistry() mapping 25 Rialto components to json-render
  - packages/rialto-catalog/src/index.ts re-exporting both catalog and registry
  - packages/rialto-catalog/src/__tests__/registry.test.tsx with 10 tests (structural, client-safety, render)
  - jsdom test environment configured for React component rendering in rialto-catalog

affects:
  - 13-ai-generation-pipeline (registry is the client-side renderer for AI-generated specs)
  - Any React app that imports @mbe/rialto-catalog to render JSON specs

tech-stack:
  added:
    - "@testing-library/react ^16.3.2 — React render tests"
    - "@vitejs/plugin-react ^5.1.4 — TSX transform in vitest"
    - "react-dom ^19.2.4 — required for @testing-library/react"
    - "jsdom vitest environment — browser-like DOM for component tests"
  patterns:
    - "defineRegistry() with any-typed render functions — avoids fighting catalog generic types; Zod schemas provide runtime safety"
    - "JSONUIProvider wrapper in tests — required for state/action/visibility contexts used by Renderer"
    - "Toast excluded from registry with comment — useToast() hook pattern incompatible with declarative JSON spec rendering"
    - "Event forwarding via emit() — Button uses emit('press'), Toggle/Checkbox emit('change'), Dialog emits('close'), Alert/Banner emit('dismiss')"
    - "AppBar uses named slots (logo, actions) not children — discovered from source inspection"
    - "DOM lib added to tsconfig — registry.tsx is a browser-side file; tests use DOM APIs"

key-files:
  created:
    - packages/rialto-catalog/src/registry.tsx
    - packages/rialto-catalog/src/__tests__/registry.test.tsx
  modified:
    - packages/rialto-catalog/src/index.ts
    - packages/rialto-catalog/package.json
    - packages/rialto-catalog/vitest.config.ts
    - packages/rialto-catalog/tsconfig.json
    - pnpm-lock.yaml

key-decisions:
  - "Use any-typed context parameters in registry render functions — TypeScript cannot infer specific prop types through catalog's generic signature; Zod schemas in the catalog provide runtime validation"
  - "Toast excluded from registry with comment — useToast() hook cannot be used in a declarative component render function; AI specs should use navigate/validateForm actions instead"
  - "DOM lib added to rialto-catalog tsconfig — registry.tsx is a browser-side file (window.location), test file uses DOM APIs; previously missing because base tsconfig uses lib: ['ES2022']"
  - "AppBar uses logo/actions named slots not children — discovered from source inspection of AppBarProps"
  - "Tabs uses tabs prop (Tab[]) and defaultTab not items/defaultValue — both aliases accepted in registry to be resilient to AI output variation"

duration: 8min
completed: "2026-03-28"
---

# Phase 12 Plan 03: Registry Summary

**defineRegistry() maps 25 curated Rialto components to json-render with event forwarding, named-slot handling, and 10 passing tests including React render integration tests via jsdom**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-28T01:31:45Z
- **Completed:** 2026-03-28T01:39:00Z
- **Tasks:** 1
- **Files modified:** 7

## Accomplishments

- `registry.tsx` calls `defineRegistry(catalog, { components: { ... } })` covering all 26 curated catalog components except Toast
- Each of the 25 render functions bridges AI-generated JSON spec props to typed Rialto component props with proper event forwarding
- `index.ts` now exports `registry`, `handlers`, and `executeAction` alongside `catalog`
- `registry.test.tsx` includes 10 tests: 4 structural (key presence, count), 2 client-safety (no @json-render/core, no zod), 4 render tests using `JSONUIProvider + Renderer`
- Vitest environment upgraded to jsdom with `@vitejs/plugin-react` for TSX transform
- All 20 tests pass (8 catalog, 10 registry, 2 drift-check)

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement defineRegistry() and tests** — `4b6357e` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `packages/rialto-catalog/src/registry.tsx` — defineRegistry() with 25 component render functions; actions for validateForm and navigate
- `packages/rialto-catalog/src/__tests__/registry.test.tsx` — 10 tests: structural, client-safety, and 4 React render tests via JSONUIProvider
- `packages/rialto-catalog/src/index.ts` — exports registry, handlers, executeAction alongside catalog
- `packages/rialto-catalog/package.json` — added @testing-library/react, @vitejs/plugin-react, react-dom, @types/react-dom devDeps
- `packages/rialto-catalog/vitest.config.ts` — jsdom environment + react plugin
- `packages/rialto-catalog/tsconfig.json` — added DOM lib for browser-side registry file
- `pnpm-lock.yaml` — updated for new devDependencies

## Decisions Made

- `any`-typed context parameters in render functions: TypeScript cannot infer specific component prop shapes through the catalog's generic signature. Using `any` is the correct tradeoff — runtime correctness is guaranteed by the Zod schemas already in the catalog.
- Toast excluded: useToast() is a provider hook pattern and cannot be rendered declaratively from a JSON spec. Documented prominently with a comment in registry.tsx.
- DOM lib added to tsconfig: The tsconfig base only included `ES2022`, but registry.tsx uses `window.location` (browser-side) and tests use DOM APIs. Adding DOM lib is correct since the entire rialto-catalog package targets browser consumption.
- AppBar uses `logo` and `actions` named slots (not `children`) — discovered from source inspection; adapted accordingly.
- Accept both `tabs`/`items` and `defaultTab`/`defaultValue` in the Tabs renderer for resilience to AI output variation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] Added DOM lib to tsconfig**
- **Found during:** Typecheck after writing registry.tsx and test file
- **Issue:** Base tsconfig uses `lib: ["ES2022"]` which lacks DOM types; registry.tsx uses `window.location` and tests use `.textContent`/`.querySelector`
- **Fix:** Added `"lib": ["ES2022", "DOM"]` to rialto-catalog tsconfig.json
- **Files modified:** `packages/rialto-catalog/tsconfig.json`
- **Commit:** 4b6357e (included in task commit)

**2. [Rule 1 - Bug] AppBar children → named slots**
- **Found during:** Typecheck — `Property 'children' does not exist on type AppBarProps`
- **Issue:** AppBar uses `logo` and `actions` named slots, not generic children
- **Fix:** Updated AppBar renderer to pass `logo` and `actions` props instead of `children`
- **Files modified:** `packages/rialto-catalog/src/registry.tsx`
- **Commit:** 4b6357e (included in task commit)

**3. [Rule 2 - Missing] Added jsdom + @testing-library/react for render tests**
- **Found during:** Task execution — render tests require DOM environment
- **Issue:** Default vitest config had no environment; `@testing-library/react` was not a devDependency
- **Fix:** Updated vitest config to jsdom + react plugin; added @testing-library/react, @vitejs/plugin-react, react-dom devDeps; installed via pnpm
- **Files modified:** `vitest.config.ts`, `package.json`, `pnpm-lock.yaml`
- **Commit:** 4b6357e (included in task commit)

### Pre-existing Issues (Deferred)

- `pnpm build` for `@mbe/rialto-catalog` was already failing before this plan due to the Rialto package's source files (`packages/rialto/src/`) lacking DOM lib in their tsconfig and having framer-motion type mismatches. This is pre-existing and out of scope for this plan.
- The plan's verification step `pnpm build && pnpm typecheck` was adapted to confirm (a) rialto-catalog's own `src/` files have no TypeScript errors (confirmed via `pnpm typecheck` filtering for `src/` prefixed errors — zero found) and (b) all 20 tests pass.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 13 can now import `registry` from `@mbe/rialto-catalog` and use it with `<Renderer>` / `<JSONUIProvider>` to render AI-generated specs as Rialto components
- `catalog.prompt()` is the system prompt source (from Plan 02)
- `registry` is the client-side bridge that renders the AI output
- The catalog/registry split is complete: catalog stays server-side (Node.js), registry ships to the browser

---
*Phase: 12-catalog-foundation*
*Completed: 2026-03-28*

## Self-Check: PASSED

Files verified:
- `packages/rialto-catalog/src/registry.tsx` — FOUND
- `packages/rialto-catalog/src/index.ts` — FOUND
- `packages/rialto-catalog/src/__tests__/registry.test.tsx` — FOUND
- `.planning/phases/12-catalog-foundation/12-03-SUMMARY.md` — FOUND

Commits verified:
- `4b6357e` — feat(12-03): defineRegistry() mapping 25 Rialto components to json-render
