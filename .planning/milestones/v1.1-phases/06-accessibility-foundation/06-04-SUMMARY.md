---
phase: 06-accessibility-foundation
plan: 04
subsystem: ui
tags: [react, accessibility, aria-live, aria-hidden, screen-reader, wcag, rialto]

requires:
  - phase: 06-accessibility-foundation-02
    provides: axe-core WCAG 2.1 AA coverage for all 58 components

provides:
  - Split aria-live regions in Toast (polite for info/success/accent/default, assertive for error)
  - Spinner role=status with aria-live=polite
  - Skeleton components aria-hidden=true (visual-only)
  - Alert roles verified (role=alert for error/warning, role=status for info/success)

affects: [06-accessibility-foundation, rialto-components, screen-reader-testing]

tech-stack:
  added: []
  patterns:
    - "aria-live split by severity: always-mount both polite and assertive regions in Toast"
    - "Skeleton bones are aria-hidden; SkeletonGroup provides the semantic status wrapper"
    - "Spinner role=status + aria-live=polite for loading announcements"
    - "Alert uses implicit live semantics from role=alert/role=status — no explicit aria-live needed"

key-files:
  created: []
  modified:
    - packages/rialto/src/components/Toast/Toast.tsx
    - packages/rialto/src/components/Progress/Progress.tsx
    - packages/rialto/src/components/Skeleton/Skeleton.tsx

key-decisions:
  - "Toast error variant routes to assertive region; info/success/accent/default route to polite — ToastVariant has no 'warning', only 'error'"
  - "Both aria-live regions always mounted in DOM (never conditionally rendered) — screen readers register live regions at page load"
  - "Skeleton aria-hidden=true replaces role=status/aria-label since individual bones are visual-only; SkeletonGroup remains the semantic container"
  - "Alert unchanged — role=alert and role=status carry implicit aria-live semantics; explicit aria-live not needed"

patterns-established:
  - "aria-live split pattern: create two always-mounted divs, filter content by severity to each"
  - "Visual-only loading placeholders use aria-hidden=true, not role=status"

requirements-completed: [A11Y-06]

duration: 2min
completed: 2026-03-23
---

# Phase 6 Plan 4: Dynamic Content Screen Reader Announcements Summary

**Split Toast into polite/assertive aria-live regions, added aria-live to Spinner, and made Skeleton aria-hidden; all 188 tests pass**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-23T00:19:12Z
- **Completed:** 2026-03-23T00:20:45Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Toast now routes error toasts to `aria-live="assertive"` and all others to `aria-live="polite"` via two always-mounted regions — first announcement is never missed
- Spinner has `aria-live="polite"` added to its existing `role="status"` wrapper so loading state is announced when spinner appears
- Skeleton components changed from `role="status" aria-label="Loading"` to `aria-hidden="true"` since they are visual-only placeholders — SkeletonGroup remains the semantic status container
- Alert roles verified correct (`role="alert"` for error/warning, `role="status"` for info/success) — no changes needed

## Task Commits

1. **Task 1: Toast split aria-live regions** - `1c96839` (feat)
2. **Task 2: Spinner/Skeleton/Alert ARIA** - `253c380` (feat)

## Files Created/Modified

- `packages/rialto/src/components/Toast/Toast.tsx` - Split single aria-live region into two always-mounted regions filtered by variant severity
- `packages/rialto/src/components/Progress/Progress.tsx` - Added `aria-live="polite"` to Spinner wrapper
- `packages/rialto/src/components/Skeleton/Skeleton.tsx` - Replaced `role="status" aria-label="Loading"` with `aria-hidden="true"` on both single and multi-line variants

## Decisions Made

- Toast variant `"error"` is the only variant routed to the assertive region (there is no `"warning"` variant in `ToastVariant`). All other variants (default, success, accent) go to polite.
- Both aria-live regions are always in the DOM — not conditionally rendered based on whether content exists. This is required because screen readers register live regions at mount; if added dynamically they miss the first announcement.
- Skeleton `aria-hidden="true"` is the correct pattern for pure visual loading placeholders. The `SkeletonGroup` wrapper retains `role="status" aria-label="Loading content" aria-busy="true"` for semantic announcement.
- Alert already had correct roles; `role="alert"` implies `aria-live="assertive"` and `role="status"` implies `aria-live="polite"` — no explicit `aria-live` needed.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Dynamic content announcement patterns established for Toast, Spinner, Progress, Skeleton, Alert
- Ready for 06-05 (remaining accessibility work in phase 6)
- All 188 component tests passing

---
*Phase: 06-accessibility-foundation*
*Completed: 2026-03-23*
