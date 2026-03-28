---
phase: 16-persistence-and-refinement
plan: "03"
subsystem: apps/gen
tags: [shareable-permalinks, refinement-mode, react-router, clipboard-api, gen-playground]
dependency_graph:
  requires: ["16-01", "16-02"]
  provides: ["shareable-permalink-page", "refinement-mode-ui"]
  affects: ["apps/gen"]
tech_stack:
  added: []
  patterns:
    - "Auth bypass pattern for public routes (isSharedSpec check before auth gate)"
    - "Refinement via spec-context embedding in /api/gen/ui prompt (reuses JSONL pipeline)"
    - "Clipboard API with window.prompt fallback for Share button"
    - "useState initial value computed from route param to avoid synchronous setState in effect"
key_files:
  created:
    - apps/gen/src/pages/SharedSpecPage.tsx
    - apps/gen/src/pages/SharedSpecPage.module.css
  modified:
    - apps/gen/src/main.tsx
    - apps/gen/src/App.tsx
    - apps/gen/src/components/PreviewPane.tsx
    - apps/gen/src/components/PreviewPane.module.css
    - apps/gen/src/components/PromptBar.tsx
    - apps/gen/src/pages/PlaygroundPage.tsx
decisions:
  - "[16-03]: Refinement uses /api/gen/ui (not /api/gen/chat) — embeds existing spec as JSON context in prompt, reuses JSONL streaming pipeline without new response format parsing"
  - "[16-03]: isSharedSpec check placed after isCallback check and before !isAuthenticated — unauthenticated users reach SharedSpecPage directly via <Outlet />"
  - "[16-03]: useState initial value for loadState/errorMessage computed from id param presence — avoids synchronous setState inside useEffect body (lint rule react-hooks/set-state-in-effect)"
  - "[16-03]: Share button shows 'Copied!' for 2 seconds via local copiedId state, then reverts — window.prompt fallback when clipboard API unavailable"
  - "[16-03]: actionBar in PreviewPane only shown when activeSpecId !== null AND not streaming — prevents Share/Refine buttons appearing during live generation"
metrics:
  duration_seconds: 226
  completed_date: "2026-03-28"
  tasks_completed: 2
  files_created: 2
  files_modified: 6
---

# Phase 16 Plan 03: Shareable Permalinks and Refinement Mode Summary

Shareable permalink page and iterative refinement mode for the Gen Playground, using spec-context embedding in /api/gen/ui.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | SharedSpecPage and permalink routing with auth bypass | b310341 | SharedSpecPage.tsx, SharedSpecPage.module.css, main.tsx, App.tsx |
| 2 | Share button, refinement mode, and PlaygroundPage chat wiring | dfbd87e | PreviewPane.tsx, PreviewPane.module.css, PromptBar.tsx, PlaygroundPage.tsx |

## What Was Built

**SharedSpecPage** (`/gen/s/:id`): Read-only public page that fetches a spec by ID from `/api/gen/specs/:id` with no auth header. Shows loading, 404/error, and success states. Success state renders the original prompt as a heading and the spec via `JSONUIProvider`/`Renderer`. Footer links back to Gen Playground. Auth gate bypassed in `App.tsx` via `isSharedSpec` check for `/gen/s/` paths.

**Share button**: Appears in `PreviewPane`'s action bar when `activeSpecId` is set and not streaming. Copies `${origin}/gen/s/${id}` to clipboard with 2-second "Copied!" feedback. Falls back to `window.prompt` if Clipboard API is unavailable.

**Refinement mode**: `PromptBar` accepts a `mode` prop (`"generate" | "refine"`). In refine mode: placeholder changes to "Refine this UI...", submit button shows "Refine", and a "New" button exits back to generate mode. `PlaygroundPage` constructs a refinement prompt that embeds the current spec as JSON context before the user's instruction, then sends to `/api/gen/ui` — the same JSONL streaming pipeline handles the response. Refined spec auto-saves as a new entry.

## Decisions Made

1. **Refinement via /api/gen/ui (not /api/gen/chat)**: The chat endpoint returns AI SDK UI message stream format, which differs from the flat JSONL patches that `useGenStream` parses. Embedding spec context in the prompt and sending to `/api/gen/ui` reuses the existing streaming pipeline without new response format handling.

2. **Auth bypass placement**: `isSharedSpec` check placed after `isCallback` but before `!isAuthenticated` — unauthenticated users reach `SharedSpecPage` via `<Outlet />` without triggering the login prompt.

3. **useState initialization from route param**: `loadState` and `errorMessage` initialized from `id` presence at declaration time to avoid synchronous `setState` calls inside `useEffect` body (ESLint `react-hooks/set-state-in-effect` rule).

4. **actionBar visibility**: Only shown when `activeSpecId !== null && !isStreaming` — prevents Share/Refine buttons from appearing during live generation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TextVariant "heading" not valid in Rialto**
- **Found during:** Task 1 (TypeScript check)
- **Issue:** Plan specified `Text variant="heading"` but Rialto's `TextVariant` only includes `"body" | "caption" | "detail" | "label" | "display"`
- **Fix:** Changed to `variant="display"` for both occurrences in SharedSpecPage
- **Files modified:** apps/gen/src/pages/SharedSpecPage.tsx
- **Commit:** b310341

**2. [Rule 1 - Bug] Synchronous setState in useEffect**
- **Found during:** Task 1 (lint check)
- **Issue:** `setLoadState("error")` called synchronously inside effect body for `!id` guard — violates `react-hooks/set-state-in-effect` lint rule
- **Fix:** Computed initial `loadState` and `errorMessage` from `id` param at useState declaration; guard in effect returns early without setState
- **Files modified:** apps/gen/src/pages/SharedSpecPage.tsx
- **Commit:** dfbd87e

## Pre-existing Issues (Not Introduced)

- `rialto-catalog` typecheck fails due to missing `.module.css` type stubs in rialto source — pre-existing, unrelated to this plan

## Self-Check: PASSED

Files created/modified:
- FOUND: apps/gen/src/pages/SharedSpecPage.tsx
- FOUND: apps/gen/src/pages/SharedSpecPage.module.css
- FOUND: apps/gen/src/main.tsx (modified)
- FOUND: apps/gen/src/App.tsx (modified)
- FOUND: apps/gen/src/components/PreviewPane.tsx (modified)
- FOUND: apps/gen/src/components/PreviewPane.module.css (modified)
- FOUND: apps/gen/src/components/PromptBar.tsx (modified)
- FOUND: apps/gen/src/pages/PlaygroundPage.tsx (modified)

Commits verified:
- FOUND: b310341 feat(16-03): SharedSpecPage and permalink routing with auth bypass
- FOUND: dfbd87e feat(16-03): Share button, refinement mode, and PlaygroundPage chat wiring
