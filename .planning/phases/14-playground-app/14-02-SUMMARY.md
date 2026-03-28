---
phase: 14-playground-app
plan: 02
subsystem: ui
tags: [react, vite, css-modules, json-render, streaming, layout, history, theme, typescript]

requires:
  - phase: 14-playground-app
    plan: 01
    provides: useGenStream hook, ThemeContext, HistoryEntry type, apps/gen scaffold

provides:
  - Three-column playground layout (HistoryPanel | PreviewPane | JsonInspector)
  - AppShell with AppBar, ThemeToggle, Avatar, sign-out
  - PromptBar with Generate/Stop toggle, Enter-to-submit
  - History panel with truncated prompts and relative timestamps
  - PreviewPane with JSONUIProvider, TTFT pulse animation, error Alert+retry
  - JsonInspector with safe React-based syntax highlighting, auto-scroll, copy button
  - PlaygroundPage wiring all state: streaming + history + display mode switching

affects:
  - 14-03 (edge router Worker deploy — gen app is now complete)

tech-stack:
  added: []
  patterns:
    - "CSS Grid three-column layout with minmax() column sizing"
    - "useRef(true) autoScroll flag in JsonInspector — avoids re-renders on scroll position checks"
    - "useEffect rawLinesRef sync — avoids ref-during-render lint error while keeping onComplete stale-free"
    - "History review mode vs live streaming mode via displaySpec/displayRawLines computed from activeEntry"
    - "Stop button via secondary variant + CSS data-stop override (Rialto has no danger variant)"

key-files:
  created:
    - apps/gen/src/components/AppShell.tsx
    - apps/gen/src/components/AppShell.module.css
    - apps/gen/src/components/HistoryPanel.tsx
    - apps/gen/src/components/HistoryPanel.module.css
    - apps/gen/src/components/PreviewPane.tsx
    - apps/gen/src/components/PreviewPane.module.css
    - apps/gen/src/components/JsonInspector.tsx
    - apps/gen/src/components/JsonInspector.module.css
    - apps/gen/src/components/PromptBar.tsx
    - apps/gen/src/components/PromptBar.module.css
    - apps/gen/src/pages/PlaygroundPage.tsx
    - apps/gen/src/pages/PlaygroundPage.module.css
    - apps/gen/src/utils/relative-time.ts
    - apps/gen/eslint.config.js
  modified:
    - apps/gen/src/main.tsx

key-decisions:
  - "Rialto Button has no danger variant — Stop button uses secondary variant with CSS [data-stop] selector override for error color"
  - "handlers from defineRegistry is a factory function, not a plain record — omitted from JSONUIProvider (playground is render-only, no form state actions needed)"
  - "rawLinesRef sync moved to useEffect (no-dependency) — avoids react-hooks/refs lint error while preserving stale-closure safety for onComplete callback"

patterns-established:
  - "PlaygroundPage display mode: isStreaming=true → live spec/rawLines; activeEntry && !isStreaming → cached entry.spec/entry.rawLines"
  - "JSON syntax highlighting: React elements via regex tokenizer, no innerHTML — safe XSS-free approach"
  - "Auto-scroll log viewer: useRef<boolean> flag updated in onScroll, consumed in useEffect on rawLines.length changes"

requirements-completed: [PLAY-02, PLAY-03, PLAY-04, PLAY-05, PLAY-06, PLAY-07]

duration: 6min
completed: 2026-03-28
---

# Phase 14 Plan 02: Playground UI Summary

**Three-column Vite SPA playground with streaming PreviewPane, JSON inspector with auto-scroll, prompt history panel, and AppShell — all wired to useGenStream and ThemeContext from Plan 01**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-28T15:51:17Z
- **Completed:** 2026-03-28T15:57:17Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments

- `@mbe/gen` builds and type-checks cleanly — `pnpm build --filter=@mbe/gen` succeeds
- Three-column CSS Grid layout (20% history | 50% preview | 30% inspector) renders below AppBar with PromptBar at bottom
- `AppShell` wraps the entire layout with `AppBar` using Rialto `ThemeToggle`, `Avatar`, and sign-out button
- `HistoryPanel` shows truncated prompts with relative timestamps; active entry highlighted with `--rialto-accent` left border
- `PreviewPane` wraps `Renderer` in `JSONUIProvider`, shows TTFT pulse animation, error `Alert` with retry, and empty state
- `JsonInspector` provides CSS syntax highlighting (React elements, no innerHTML), auto-scroll with manual-scroll pause, and copy button
- `PromptBar` toggles between Generate (primary) and Stop (secondary+CSS) based on `isStreaming`
- `PlaygroundPage` owns all state: streaming, 50-entry capped history, active entry for history review mode
- History entries cached on `onComplete` — clicking an entry replays `spec` and `rawLines` without re-generation
- Sign-out clears history state before redirecting (PLAY-05 requirement)

## Task Commits

1. **Task 1: AppShell, HistoryPanel, PreviewPane, JsonInspector, PromptBar components** - `ee4ad1f`
2. **Task 2: Wire PlaygroundPage with streaming, history, and routing** - `d779e3a`

## Files Created/Modified

- `apps/gen/src/components/AppShell.tsx` — AppBar with ThemeToggle, Avatar, sign-out; wraps layout content
- `apps/gen/src/components/AppShell.module.css` — full-viewport flex shell, flex-column content area
- `apps/gen/src/components/HistoryPanel.tsx` — scrollable history list with active accent border
- `apps/gen/src/components/HistoryPanel.module.css` — 20% width, border-inline-end separator
- `apps/gen/src/components/PreviewPane.tsx` — JSONUIProvider + Renderer with TTFT pulse, error, empty states
- `apps/gen/src/components/PreviewPane.module.css` — flex-grow center column, CSS keyframe pulse animation
- `apps/gen/src/components/JsonInspector.tsx` — syntax-highlighted JSONL viewer, auto-scroll, copy
- `apps/gen/src/components/JsonInspector.module.css` — 30% width, monospace, surface-sunken background
- `apps/gen/src/components/PromptBar.tsx` — textarea with Enter-submit, Generate/Stop toggle
- `apps/gen/src/components/PromptBar.module.css` — border-block-start bar, focused textarea ring
- `apps/gen/src/pages/PlaygroundPage.tsx` — main page owning all state, wiring all components
- `apps/gen/src/pages/PlaygroundPage.module.css` — CSS Grid three-column layout
- `apps/gen/src/utils/relative-time.ts` — `Intl.RelativeTimeFormat` relative time helper
- `apps/gen/eslint.config.js` — missing ESLint config (auto-fixed Rule 3)
- `apps/gen/src/main.tsx` — replaced placeholder `<div>Playground</div>` with `<PlaygroundPage />`

## Decisions Made

- **Rialto Button danger variant missing:** The `Button` component only supports `"primary" | "secondary" | "ghost"` — no `"danger"`. Used `secondary` variant with a `button[data-stop]` CSS selector in PromptBar.module.css to apply error color tokens on the Stop state.
- **handlers factory function:** `defineRegistry` returns `handlers` as `(getSetState, getState) => Record<...>` — a factory that requires state getter refs, not a plain record. Since the playground renders AI-generated UI without form submissions, `handlers` was omitted from `JSONUIProvider`.
- **rawLinesRef in useEffect:** Plan called for `rawLinesRef.current = rawLines` during render (stale-closure safety pattern). ESLint `react-hooks/refs` rule blocks render-time ref mutation. Replaced with a no-dependency `useEffect` which runs after every render — functionally equivalent for the onComplete callback use case.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Rialto Button has no "danger" variant**
- **Found during:** Task 1 typecheck (TS2322)
- **Issue:** Plan specified `variant="danger"` for Stop button; `ButtonProps.variant` is `"primary" | "secondary" | "ghost"` only
- **Fix:** Changed to `variant="secondary"` with `data-stop` attribute; added CSS override in `PromptBar.module.css` for error color
- **Files modified:** `PromptBar.tsx`, `PromptBar.module.css`
- **Committed in:** `ee4ad1f`

**2. [Rule 1 - Bug] handlers from rialto-catalog is a factory function, not a record**
- **Found during:** Task 1 typecheck (TS2322)
- **Issue:** Plan said to pass `handlers` from rialto-catalog to `JSONUIProvider`, but `handlers` is `(getSetState, getState) => Record<...>` — not assignable to `Record<string, (params) => unknown>`
- **Fix:** Omit `handlers` from `JSONUIProvider` — playground is display-only, no actions needed
- **Files modified:** `PreviewPane.tsx`
- **Committed in:** `ee4ad1f`

**3. [Rule 3 - Blocking] Missing eslint.config.js in apps/gen**
- **Found during:** Task 2 lint verification
- **Issue:** `pnpm lint` failed — ESLint v9 requires `eslint.config.js`, none existed in apps/gen
- **Fix:** Created `eslint.config.js` extending `@mbe/config/eslint/react` (same as hospitality)
- **Files modified:** `apps/gen/eslint.config.js`
- **Committed in:** `d779e3a`

**4. [Rule 1 - Bug] ref-during-render lint error in PlaygroundPage**
- **Found during:** Task 2 lint (`react-hooks/refs`)
- **Issue:** `rawLinesRef.current = rawLines` during render triggers lint error
- **Fix:** Moved to `useEffect(() => { rawLinesRef.current = rawLines; })` — same semantic, runs after render
- **Files modified:** `apps/gen/src/pages/PlaygroundPage.tsx`
- **Committed in:** `d779e3a`

**5. [Rule 1 - Bug] Redundant role="list" on ul**
- **Found during:** Task 2 lint (`jsx-a11y/no-redundant-roles`)
- **Fix:** Removed `role="list"` from `<ul>` in HistoryPanel
- **Files modified:** `apps/gen/src/components/HistoryPanel.tsx`
- **Committed in:** `d779e3a`

**6. [Rule 1 - Bug] Unnecessary escape in JsonInspector regex**
- **Found during:** Task 2 lint (`no-useless-escape`)
- **Issue:** `\[` inside character class does not need escaping
- **Fix:** Changed `[{}\[\],:]` to `[{}[\],:]`
- **Files modified:** `apps/gen/src/components/JsonInspector.tsx`
- **Committed in:** `d779e3a`

---

**Total deviations:** 6 auto-fixed (Rules 1 and 3)
**Impact on plan:** All fixes were correctness/compatibility issues. No scope change.

## Self-Check: PASSED

- apps/gen/src/components/AppShell.tsx — FOUND
- apps/gen/src/components/HistoryPanel.tsx — FOUND
- apps/gen/src/components/PreviewPane.tsx — FOUND
- apps/gen/src/components/JsonInspector.tsx — FOUND
- apps/gen/src/components/PromptBar.tsx — FOUND
- apps/gen/src/pages/PlaygroundPage.tsx — FOUND
- apps/gen/src/utils/relative-time.ts — FOUND
- apps/gen/eslint.config.js — FOUND
- Commit ee4ad1f (Task 1) — FOUND
- Commit d779e3a (Task 2) — FOUND
- .planning/phases/14-playground-app/14-02-SUMMARY.md — FOUND

---
*Phase: 14-playground-app*
*Completed: 2026-03-28*
