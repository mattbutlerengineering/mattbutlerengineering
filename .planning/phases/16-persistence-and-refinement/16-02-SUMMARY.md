---
phase: 16-persistence-and-refinement
plan: "02"
subsystem: gen-app
tags: [react, hooks, persistence, favorites, replay, optimistic-updates]
dependency_graph:
  requires: [stored-spec-api]
  provides: [specs-api-hook, history-panel-v2, playground-autosave]
  affects: [apps/gen]
tech_stack:
  added: []
  patterns: [optimistic-updates, stale-closure-avoidance, local-accumulator]
key_files:
  created:
    - apps/gen/src/hooks/useSpecsApi.ts
  modified:
    - apps/gen/src/types.ts
    - apps/gen/src/hooks/useGenStream.ts
    - apps/gen/src/components/HistoryPanel.tsx
    - apps/gen/src/components/HistoryPanel.module.css
    - apps/gen/src/pages/PlaygroundPage.tsx
decisions:
  - "[16-02]: useSpecsApi deleteSpec captures previous specs in closure before optimistic removal — enables correct revert on error"
  - "[16-02]: accumulatedRawLines local array in useGenStream send() avoids stale React state closure — rawLines passed to onComplete from local variable not useState"
  - "[16-02]: PlaygroundPage no longer needs rawLinesRef — rawLines now flow from useGenStream onComplete second argument directly to saveSpec"
  - "[16-02]: HistoryPanel filter tabs use plain buttons with CSS not Rialto Tabs — Rialto Tabs component does not exist"
metrics:
  duration: "3 min"
  completed: "2026-03-28"
  tasks_completed: 2
  files_changed: 6
---

# Phase 16 Plan 02: Frontend Persistence and History Summary

Database-backed history panel with auto-save, star favorites, replay, and favorites filter — replacing the in-memory history that was lost on page refresh.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | StoredSpec type, useSpecsApi hook, useGenStream rawLines extension | e54409e | types.ts, useSpecsApi.ts, useGenStream.ts |
| 2 | HistoryPanel migration and PlaygroundPage wiring | b9e97c2 | HistoryPanel.tsx, HistoryPanel.module.css, PlaygroundPage.tsx |

## What Was Built

**StoredSpec type** (`apps/gen/src/types.ts`): Added alongside the existing `HistoryEntry` interface to match the API response shape from Plan 01 — `id, userId, prompt, spec (unknown), rawLines, isFavorite, createdAt, updatedAt`.

**useSpecsApi hook** (`apps/gen/src/hooks/useSpecsApi.ts`): Full CRUD hook wrapping `/api/gen/specs` endpoints with auth. Features:
- `authFetch` helper using `useAuth()` Bearer token, wrapped in `useCallback([accessToken])`
- `fetchSpecs()`: GET with loading state, sets specs from response
- `saveSpec()`: POST then prepends returned spec to local array (immutable)
- `toggleFavorite()`: Optimistic isFavorite flip, reverts on network error
- `deleteSpec()`: Optimistic removal, reverts previous state on error
- `useEffect` auto-fetch on mount

**useGenStream extension** (`apps/gen/src/hooks/useGenStream.ts`):
- `onComplete` callback extended to `(spec: Spec, rawLines: string[]) => void`
- `accumulatedRawLines: string[]` local variable inside `send()` collects lines alongside React state updates
- Passed to `onCompleteRef.current?.(finalSpec, accumulatedRawLines)` — avoids stale closure on React state

**HistoryPanel v2** (`apps/gen/src/components/HistoryPanel.tsx`): Fully replaced props interface. New features:
- Filter tabs ("All" / "Favorites") using plain `<button>` elements with CSS active state
- Per-entry star button (★ filled / ☆ outline) calls `onToggleFavorite` with `stopPropagation()`
- Per-entry "Replay" text button calls `onReplay` with `stopPropagation()`
- Loading state: shows "Loading..." when `isLoading && entries.length === 0`
- Empty state varies: "No favorites yet" vs "No history yet" based on filter

**PlaygroundPage refactor** (`apps/gen/src/pages/PlaygroundPage.tsx`):
- Removed `useState<HistoryEntry[]>` and `rawLinesRef`
- Calls `useSpecsApi()` for specs list and CRUD operations
- `onComplete(completedSpec, completedRawLines)` calls `saveSpec()` and sets `activeId` from returned spec id
- `handleReplay(id)`: finds spec in array, re-submits prompt via `send()`
- `handleToggleFavorite(id)`: delegates to `toggleFavorite()` from useSpecsApi
- Display logic reads from `specs.find(s => s.id === activeId)` casting `spec` as `Spec`
- Added `filter` state and wires all new HistoryPanel props

## Verification Results

- `cd apps/gen && npx tsc --noEmit` — no type errors
- `cd apps/gen && pnpm build` — builds successfully (673 kB bundle)
- `cd apps/gen && pnpm lint` — 0 errors, 2 pre-existing warnings in unrelated files

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- FOUND: apps/gen/src/hooks/useSpecsApi.ts
- FOUND: apps/gen/src/types.ts (StoredSpec exported)
- FOUND: apps/gen/src/hooks/useGenStream.ts (rawLines second arg)
- FOUND: apps/gen/src/components/HistoryPanel.tsx (StoredSpec props)
- FOUND: apps/gen/src/pages/PlaygroundPage.tsx (useSpecsApi wired)
- FOUND: commit e54409e (Task 1)
- FOUND: commit b9e97c2 (Task 2)
