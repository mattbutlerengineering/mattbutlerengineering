---
phase: 06-accessibility-foundation
plan: "03"
subsystem: rialto
tags: [accessibility, focus-management, keyboard, wcag, a11y]
dependency_graph:
  requires: [06-02]
  provides: [focus-return-on-close, focus-trap-drawer, focus-trap-commandpalette]
  affects: [packages/rialto]
tech_stack:
  added: []
  patterns: [triggerRef-focus-return, requestAnimationFrame-focus-restore, focus-trap-tab-wrap]
key_files:
  created: []
  modified:
    - packages/rialto/src/components/Dialog/Dialog.tsx
    - packages/rialto/src/components/Drawer/Drawer.tsx
    - packages/rialto/src/components/CommandPalette/CommandPalette.tsx
    - packages/rialto/src/components/DropdownMenu/DropdownMenu.tsx
    - packages/rialto/src/components/Popover/Popover.tsx
    - packages/rialto/src/components/ContextMenu/ContextMenu.tsx
    - packages/rialto/src/components/accessibility.test.tsx
decisions:
  - "Use vi.useFakeTimers + vi.runAllTimers in focus-return tests — jsdom rAF is backed by setTimeout and does not auto-advance without fake timers"
  - "Declare triggerRef focus-return effect BEFORE focus-trap effect in all components — React runs effects in declaration order, so activeElement is captured before trap moves focus inside"
  - "ContextMenu focus-return captures document.activeElement on open (right-click trigger has no keyboard focus by default) — restores whatever was focused before the menu appeared"
metrics:
  duration: "4 min"
  completed: "2026-03-23"
  tasks_completed: 2
  files_modified: 7
requirements-completed: [A11Y-05, A11Y-08]
---

# Phase 6 Plan 03: Focus-Return-on-Close for All Overlay Components Summary

**One-liner:** triggerRef focus-return pattern added to all 7 overlay components; Drawer and CommandPalette gain Tab focus traps; 3 unit tests verify behavior with fake timer rAF flushing.

## What Was Built

Added focus-return-on-close to all 7 overlay components (Dialog, Drawer, ConfirmDialog, DropdownMenu, CommandPalette, Popover, ContextMenu) and added Tab focus traps to Drawer and CommandPalette. Written unit tests verify the focus-return behavior for Dialog, Drawer, and CommandPalette.

### Pattern Applied

All components received the same `triggerRef` pattern:

```typescript
const triggerRef = useRef<Element | null>(null);

// Declared BEFORE any focus-trap or input-focus effects
useEffect(() => {
  if (open) {
    triggerRef.current = document.activeElement;
  } else {
    requestAnimationFrame(() => {
      (triggerRef.current as HTMLElement | null)?.focus();
      triggerRef.current = null;
    });
  }
}, [open]);
```

The `requestAnimationFrame` defers the focus restore until after AnimatePresence has processed the exit, preventing race conditions with unmounting DOM.

### Component-by-Component Changes

| Component | Focus Return | Focus Trap | Notes |
|-----------|-------------|-----------|-------|
| Dialog | Added | Already had | triggerRef declared before existing trap |
| Drawer | Added | Added | Also added panelRef + ref-merge for trap |
| CommandPalette | Added | Added | Declared before existing input-focus rAF |
| ConfirmDialog | Inherited | Inherited | Wraps Dialog — no changes needed |
| DropdownMenu | Added | No (not modal) | Internal `open` state |
| Popover | Added | No (not modal) | Internal `open` state |
| ContextMenu | Added | No (not modal) | Captures last focused element before right-click |

### Unit Tests Added

Added a `describe("Focus management — return-to-trigger on close")` block in `accessibility.test.tsx` with 3 tests:

1. **Dialog returns focus to trigger on close** — button → open dialog → close → assert focus returns
2. **Drawer returns focus to trigger on close** — button → open drawer → close → assert focus returns
3. **CommandPalette returns focus to trigger on close** — button → open palette → close → assert focus returns

Tests use `vi.useFakeTimers()` + `vi.runAllTimers()` to synchronously flush `requestAnimationFrame` callbacks (which jsdom backs with `setTimeout`).

## Decisions Made

1. **Fake timers for rAF flushing** — jsdom's `requestAnimationFrame` is backed by `setTimeout`. Using `vi.useFakeTimers()` + `vi.runAllTimers()` ensures rAF callbacks run synchronously in tests. A plain `setTimeout(0)` await is not reliable because the ordering of task queue entries is indeterminate when both the rAF and the test await are `setTimeout(0)`.

2. **Effect declaration order matters** — The focus-return `useEffect` is declared BEFORE the focus-trap `useEffect` in all components. React runs effects in declaration order within a component. This ensures `document.activeElement` (the trigger) is captured before the trap moves focus to the first focusable element inside the overlay.

3. **ContextMenu uses last-focused-element** — Right-click menus have no keyboard trigger element. Capturing `document.activeElement` on open restores focus to whatever element was focused before the context menu appeared — this is the correct A11Y behavior (WCAG 2.1 SC 2.4.3).

4. **No focus trap on DropdownMenu, Popover, ContextMenu** — These are non-modal overlays. WCAG A11Y-05 requires no keyboard traps, but also specifies that focus trapping is only appropriate for modal dialogs. Users should be able to Tab out of dropdown menus and popovers.

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

- `pnpm test` — 191 tests pass (6 test files, up from 188)
- 3 new focus-return unit tests all pass
- All existing axe-core WCAG 2.1 AA tests still pass
- Drawer Tab focus trap verified by structural review (panelRef + keyboard event listener)
- CommandPalette Tab focus trap verified by structural review

## Self-Check: PASSED

Files verified to exist:
- packages/rialto/src/components/Dialog/Dialog.tsx — contains `triggerRef`
- packages/rialto/src/components/Drawer/Drawer.tsx — contains `triggerRef`, `panelRef`, focus trap
- packages/rialto/src/components/CommandPalette/CommandPalette.tsx — contains `triggerRef`, `panelRef`, focus trap
- packages/rialto/src/components/DropdownMenu/DropdownMenu.tsx — contains `triggerRef`
- packages/rialto/src/components/Popover/Popover.tsx — contains `triggerRef`
- packages/rialto/src/components/ContextMenu/ContextMenu.tsx — contains `triggerRef`
- packages/rialto/src/components/accessibility.test.tsx — contains `Focus management` describe block

Commits verified:
- 189c30e — feat(06-03): add focus-return and focus traps to Dialog, Drawer, CommandPalette
- b607711 — feat(06-03): add focus-return to DropdownMenu, Popover, ContextMenu; add focus-return unit tests
