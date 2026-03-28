---
phase: 14-playground-app
plan: 01
subsystem: ui
tags: [react, vite, auth0, json-render, streaming, hooks, theme, typescript]

requires:
  - phase: 13-ai-generation-endpoint
    provides: Agent API at /api/gen/ui that useGenStream will connect to

provides:
  - apps/gen workspace package (@mbe/gen) with Vite SPA scaffold
  - Auth gate (login prompt for unauthenticated, Outlet for authenticated)
  - ThemeProvider with localStorage persistence for light/dark theme
  - useGenStream hook with Auth0 Bearer token injection and JSONL streaming
  - HistoryEntry shared type for prompt history
  - createBrowserRouter with /gen basename, callback route, placeholder index

affects:
  - 14-02 (playground UI — all components consume useGenStream and ThemeContext)
  - 14-03 (edge router needs /gen* Service Binding when Worker is deployed)

tech-stack:
  added:
    - "@json-render/react@0.15.0 (useUIStream mirror with auth injection)"
    - "@mbe/rialto-catalog (workspace dep for Plan 02 registry)"
  patterns:
    - "ThemeProvider > ThemedApp bridge pattern for controlled RialtoProvider theme"
    - "FlatElement type derived from Parameters<typeof flatToTree>[0][number] (avoids direct @json-render/core dep)"
    - "Stable callback refs (onCompleteRef, onErrorRef) in custom hooks to avoid send re-creation"
    - "AbortController in ref for stop-during-streaming with partial spec preservation"

key-files:
  created:
    - apps/gen/package.json
    - apps/gen/vite.config.ts
    - apps/gen/wrangler.toml
    - apps/gen/tsconfig.json
    - apps/gen/tsconfig.node.json
    - apps/gen/index.html
    - apps/gen/src/main.tsx
    - apps/gen/src/App.tsx
    - apps/gen/src/App.module.css
    - apps/gen/src/vite-env.d.ts
    - apps/gen/src/index.css
    - apps/gen/src/contexts/ThemeContext.tsx
    - apps/gen/src/hooks/useGenStream.ts
    - apps/gen/src/types.ts
  modified:
    - pnpm-lock.yaml

key-decisions:
  - "FlatElement derived from Parameters<typeof flatToTree>[0][number] — avoids direct dependency on @json-render/core which is not in apps/gen package.json"
  - "ThemedApp bridge component pattern — ThemeProvider must be ancestor of RialtoProvider; bridge reads useTheme() and passes controlled theme prop"
  - "useGenStream uses AbortController for stop() — AbortError is caught silently (no error state), preserving whatever partial spec has been built"

patterns-established:
  - "Auth gate pattern: App.tsx checks isLoading/error/isCallback/isAuthenticated before rendering Outlet — same as hospitality"
  - "main.tsx structure: StrictMode > ThemeProvider > ThemedApp > RialtoProvider > AuthProvider > RouterProvider"
  - "Streaming hook: JSONL line accumulation + flatToTree after each line for progressive spec rendering"

requirements-completed: [PLAY-01, PLAY-06]

duration: 18min
completed: 2026-03-28
---

# Phase 14 Plan 01: Playground App Scaffold Summary

**Vite SPA at `/gen` with Auth0 auth gate, localStorage-persisted theme toggle, and `useGenStream` hook that injects Auth0 Bearer tokens into JSONL streaming requests to `/api/gen/ui`**

## Performance

- **Duration:** 18 min
- **Started:** 2026-03-28T15:29:00Z
- **Completed:** 2026-03-28T15:47:02Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments

- `@mbe/gen` workspace package builds successfully (`pnpm build --filter=@mbe/gen --only`) and type-checks clean
- Auth gate shows "Gen Playground" login prompt for unauthenticated users; authenticated users see Outlet
- `useGenStream` hook exports `{ spec, isStreaming, error, usage, rawLines, send, clear, stop }` with Auth0 Bearer token injection and JSONL+flatToTree progressive spec assembly

## Task Commits

1. **Task 1: Scaffold apps/gen Vite SPA with auth and theme** - `a9b9e93` (feat)
2. **Task 2: Create useGenStream custom streaming hook** - `5e29c5c` (feat)

## Files Created/Modified

- `apps/gen/package.json` - @mbe/gen manifest with @json-render/react, @mbe/auth, @mbe/rialto, @mbe/rialto-catalog deps
- `apps/gen/vite.config.ts` - base /gen/, port 3005, /api proxy to localhost:3003
- `apps/gen/wrangler.toml` - mattbutlerengineering-gen Workers Static Assets
- `apps/gen/tsconfig.json` - extends @mbe/config/typescript/react, @/* paths
- `apps/gen/tsconfig.node.json` - extends @mbe/config/typescript/node, includes vite.config.ts
- `apps/gen/index.html` - Standard SPA root with title "Gen | MBE"
- `apps/gen/src/main.tsx` - StrictMode > ThemeProvider > ThemedApp > RialtoProvider > AuthProvider > RouterProvider
- `apps/gen/src/App.tsx` - Auth gate with loading/error/unauthenticated states, CallbackRedirect
- `apps/gen/src/App.module.css` - Login container flex centering
- `apps/gen/src/index.css` - Minimal global styles (box-sizing reset, font-family inherit)
- `apps/gen/src/vite-env.d.ts` - VITE_AUTH_* env var declarations
- `apps/gen/src/contexts/ThemeContext.tsx` - ThemeProvider + useTheme hook with localStorage key mbe-gen-theme
- `apps/gen/src/hooks/useGenStream.ts` - Custom streaming hook with Auth0 injection and AbortController stop()
- `apps/gen/src/types.ts` - HistoryEntry interface importing Spec from @json-render/react
- `pnpm-lock.yaml` - Updated after pnpm install

## Decisions Made

- **FlatElement type derivation:** `@json-render/core` is a transitive dependency not listed in apps/gen's package.json, so `FlatElement` cannot be imported directly. Derived type via `Parameters<typeof flatToTree>[0][number]` — structurally equivalent and avoids phantom dependency.
- **ThemedApp bridge pattern:** `ThemeProvider` must be an ancestor of `RialtoProvider` to pass the controlled `theme` prop. A `ThemedApp` component reads `useTheme()` and renders `RialtoProvider` with the live theme value.
- **AbortError handling in useGenStream:** When `stop()` is called, `AbortError` is caught silently (no error state set). The partial spec accumulated so far is preserved so the user can see whatever rendered before stopping.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] FlatElement cannot be imported from @json-render/react**
- **Found during:** Task 2 (useGenStream hook typecheck)
- **Issue:** `FlatElement` is used internally by `@json-render/react` but not re-exported in its public API. TypeScript error: "Module '@json-render/react' declares 'FlatElement' locally, but it is not exported."
- **Fix:** Derived the type using `Parameters<typeof flatToTree>[0][number]` — structurally identical and requires no additional imports
- **Files modified:** `apps/gen/src/hooks/useGenStream.ts`
- **Verification:** `npx tsc --noEmit` passes cleanly with no errors
- **Committed in:** `5e29c5c` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - type resolution)
**Impact on plan:** Essential fix for type correctness. No scope creep.

## Issues Encountered

- **@mbe/rialto-catalog build failure (pre-existing, out of scope):** The turbo pipeline for `build` and `typecheck` tasks fails when run with full dependency chain because `@mbe/rialto-catalog:build` has a pre-existing CSS module type declaration error. Verified `@mbe/gen` itself builds and type-checks cleanly by running `--only` flag (build) and `npx tsc --noEmit` directly (typecheck). Logged to deferred items.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02 (playground UI components) can begin immediately — `useGenStream` and `ThemeContext` are the critical dependencies
- `ThemedApp` bridge in `main.tsx` is a placeholder for the three-column layout that Plan 02 will replace
- The `/gen*` edge router Service Binding (commented in Pulumi from Phase 13) needs to be activated when the gen Worker deploys (Plan 03)

## Self-Check: PASSED

- apps/gen/src/hooks/useGenStream.ts — FOUND
- apps/gen/src/contexts/ThemeContext.tsx — FOUND
- apps/gen/src/main.tsx — FOUND
- apps/gen/src/App.tsx — FOUND
- apps/gen/src/types.ts — FOUND
- .planning/phases/14-playground-app/14-01-SUMMARY.md — FOUND
- Commit a9b9e93 (Task 1) — FOUND
- Commit 5e29c5c (Task 2) — FOUND

---
*Phase: 14-playground-app*
*Completed: 2026-03-28*
