---
phase: 06-accessibility-foundation
plan: 02
subsystem: rialto/accessibility
tags: [accessibility, axe-core, wcag, testing, components]
dependency_graph:
  requires: []
  provides: [axe-core-coverage-all-58-components]
  affects: [packages/rialto/src/components/accessibility.test.tsx]
tech_stack:
  added: []
  patterns: [axe-core-container-scan, axe-core-body-scan, fireEvent-open-portals, cloneElement-aria-injection]
key_files:
  created: []
  modified:
    - packages/rialto/src/components/accessibility.test.tsx
    - packages/rialto/src/components/CommandPalette/CommandPalette.tsx
    - packages/rialto/src/components/DropdownMenu/DropdownMenu.tsx
    - packages/rialto/src/components/HoverCard/HoverCard.tsx
    - packages/rialto/src/components/Popover/Popover.tsx
decisions:
  - Disable region rule on document.body scans — isolated test content lacks page-level landmarks; this is not a component responsibility
  - Use cloneElement to inject aria-haspopup/aria-expanded onto trigger elements in DropdownMenu and Popover — eliminates nested-interactive violation from wrapper div with role="button"
  - Stub scrollIntoView in test helpers — jsdom limitation, not related to axe violations
metrics:
  duration: 9 min
  completed_date: "2026-03-23"
  tasks_completed: 2
  files_modified: 5
---

# Phase 6 Plan 2: Axe-Core Coverage for All 58 Component Directories Summary

Closed the axe-core coverage gap: added WCAG 2.1 AA assertions for all 18 previously untested component directories, bringing total accessibility test count to 63. Fixed 4 real accessibility bugs discovered during authoring.

## What Was Built

18 new axe-core test cases added to `accessibility.test.tsx`, split by rendering pattern:

**Non-portal (scanned via container):** AppBar, AspectRatio, DisabledTooltip, Footer (minimal + rich), Hero, InputGroup, PageHeader, ScrollArea, Skeleton

**Portal/overlay (opened via events, scanned via document.body):** CommandPalette, Drawer, ConfirmDialog, DropdownMenu, Popover, Tooltip, ContextMenu, HoverCard, Autocomplete

All 63 accessibility tests pass. Full Rialto suite (188 tests) passes.

## Decisions Made

1. **Disable `region` rule on document.body scans** — axe's `region` rule requires all page content be inside landmark regions. This fires in isolated tests because bare component output lacks surrounding `<main>`, `<header>`, etc. This is a test harness concern, not a component defect.

2. **Use `cloneElement` for ARIA injection on trigger elements** — DropdownMenu and Popover previously wrapped triggers in `<div role="button" aria-haspopup="..." aria-expanded="...">`, which violates axe's `nested-interactive` rule (a `role="button"` div containing a native `<button>`). Fix: remove `role`/`tabIndex` from wrapper div, inject `aria-haspopup` and `aria-expanded` onto the trigger element via `cloneElement`.

3. **Stub `scrollIntoView` in test file** — jsdom does not implement `scrollIntoView`; CommandPalette calls it on scroll-to-active-item. Stubbing avoids a thrown TypeError without affecting test fidelity.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing ARIA] CommandPalette: search input and listbox missing accessible names**
- **Found during:** Task 1 (non-portal tests) / Task 2 (portal tests)
- **Issue:** The `<input type="text">` in CommandPalette had no `aria-label`, only a `placeholder`. The `<div role="listbox">` had no `aria-label`. Both are required by axe `aria-input-field-name` and ARIA spec.
- **Fix:** Added `aria-label="Search commands"` to the input; added `aria-label="Command results"` to the listbox div.
- **Files modified:** `packages/rialto/src/components/CommandPalette/CommandPalette.tsx`
- **Commit:** f7c5024

**2. [Rule 1 - Bug] DropdownMenu: nested-interactive ARIA violation from role="button" wrapper**
- **Found during:** Task 2
- **Issue:** Trigger wrapper rendered as `<div role="button" tabIndex={0}>` containing the consumer-provided trigger element (typically a `<button>`). Axe rule `nested-interactive` prohibits focusable descendants inside interactive widgets.
- **Fix:** Removed `role="button"` and `tabIndex={0}` from wrapper div. Injected `aria-haspopup="menu"` and `aria-expanded` onto the trigger element via `cloneElement`.
- **Files modified:** `packages/rialto/src/components/DropdownMenu/DropdownMenu.tsx`
- **Commit:** f7c5024

**3. [Rule 2 - Missing ARIA] Popover: dialog panel missing accessible name + same nested-interactive violation as DropdownMenu**
- **Found during:** Task 2
- **Issue 1:** `<motion.div role="dialog">` panel had no `aria-label` when `title` prop is omitted, violating `aria-dialog-name` rule.
- **Issue 2:** Same `role="button"` wrapper nested-interactive bug as DropdownMenu.
- **Fix:** Added `aria-label={title ?? "Popover"}` to dialog panel. Removed `role="button"` from wrapper; injected `aria-haspopup="dialog"` and `aria-expanded` via `cloneElement`.
- **Files modified:** `packages/rialto/src/components/Popover/Popover.tsx`
- **Commit:** f7c5024

**4. [Rule 2 - Missing ARIA] HoverCard: dialog panel missing accessible name**
- **Found during:** Task 2
- **Issue:** `<motion.div role="dialog">` hover panel had no `aria-label`, violating `aria-dialog-name` rule.
- **Fix:** Added `aria-label="Preview"` to the panel. (A more complete solution would let consumers pass a custom label; deferred to future plan.)
- **Files modified:** `packages/rialto/src/components/HoverCard/HoverCard.tsx`
- **Commit:** f7c5024

## Self-Check: PASSED

Files exist:
- FOUND: packages/rialto/src/components/accessibility.test.tsx
- FOUND: packages/rialto/src/components/CommandPalette/CommandPalette.tsx
- FOUND: packages/rialto/src/components/DropdownMenu/DropdownMenu.tsx
- FOUND: packages/rialto/src/components/HoverCard/HoverCard.tsx
- FOUND: packages/rialto/src/components/Popover/Popover.tsx

Commits exist:
- FOUND: f7c5024 (feat(06-02): add axe-core WCAG 2.1 AA tests for all 18 missing component directories)

Test results: 63/63 passed (accessibility.test.tsx), 188/188 passed (full suite)
