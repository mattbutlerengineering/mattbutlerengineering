---
phase: 04-hospitality-migration-full-hosting
plan: 03
subsystem: ui
tags: [react, css-modules, rialto, tailwind-removal, hospitality, konva]

# Dependency graph
requires:
  - phase: 04-hospitality-migration-full-hosting
    provides: "04-01 (app shell Rialto migration), 04-02 (simpler pages CSS Modules)"

provides:
  - "booking-widget components fully on CSS Modules + Rialto tokens"
  - "floor-plan canvas wrapper on CSS Modules (Konva canvas untouched)"
  - "timeline grid with sticky headers on CSS Modules"
  - "reservation blocks with status-specific hex colors in CSS Modules"

affects:
  - 04-hospitality-migration-full-hosting
  - future-tailwind-removal

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CSS logical properties throughout (padding-inline, inset-inline-start, border-inline-start)"
    - "Status/semantic colors use hex values — no Rialto tokens (per plan spec)"
    - "Inline styles retained only for dynamically-calculated px values (left, width, height)"
    - "Konva canvas components (Stage, Layer, Group, Rect, Circle, Text) receive no className"

key-files:
  created:
    - apps/hospitality/src/components/booking-widget/BookingWidget.module.css
    - apps/hospitality/src/components/booking-widget/DatePartySelector.module.css
    - apps/hospitality/src/components/booking-widget/TimeSlotPicker.module.css
    - apps/hospitality/src/components/booking-widget/GuestDetailsForm.module.css
    - apps/hospitality/src/components/booking-widget/ConfirmationView.module.css
    - apps/hospitality/src/components/floor-plan/FloorPlanCanvas.module.css
    - apps/hospitality/src/components/timeline/TimelineGrid.module.css
    - apps/hospitality/src/components/timeline/ReservationBlock.module.css
  modified:
    - apps/hospitality/src/components/booking-widget/BookingWidget.tsx
    - apps/hospitality/src/components/booking-widget/DatePartySelector.tsx
    - apps/hospitality/src/components/booking-widget/TimeSlotPicker.tsx
    - apps/hospitality/src/components/booking-widget/GuestDetailsForm.tsx
    - apps/hospitality/src/components/booking-widget/ConfirmationView.tsx
    - apps/hospitality/src/components/floor-plan/FloorPlanCanvas.tsx
    - apps/hospitality/src/components/timeline/TimelineGrid.tsx
    - apps/hospitality/src/components/timeline/ReservationBlock.tsx

key-decisions:
  - "TableShape.tsx has no Tailwind classes (react-konva canvas only) — left unchanged per plan spec"
  - "ReservationBlock status colors use hex (PENDING=#fef3c7, CONFIRMED=#dbeafe, CANCELLED=#f3f4f6, COMPLETED=#dcfce7, NO_SHOW=#fee2e2)"
  - "STEPS array extracted as constant in BookingWidget for clean step-index calculations"
  - "Dynamic positioning (left, width, height) kept as inline styles — only static classes converted"

patterns-established:
  - "STATUS_CLASS record maps ReservationStatus → CSS Module class names (replaces STATUS_COLORS Tailwind strings)"
  - "Multi-class joining: [styles.base, condition ? styles.active : ''].join(' ')"

requirements-completed: [HOSP-05, HOSP-07]

# Metrics
duration: 4min
completed: 2026-03-04
---

# Phase 4 Plan 3: Domain Components CSS Modules Migration Summary

**9 booking-widget, floor-plan, and timeline components migrated from Tailwind to CSS Modules with Rialto design tokens — zero Tailwind className strings remain in domain component layer**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-04T05:03:55Z
- **Completed:** 2026-03-04T05:07:55Z
- **Tasks:** 2
- **Files modified:** 16 (8 new CSS Module files + 8 updated TSX files)

## Accomplishments

- All 5 booking-widget components (BookingWidget, DatePartySelector, TimeSlotPicker, GuestDetailsForm, ConfirmationView) converted to CSS Modules with Rialto tokens
- FloorPlanCanvas DOM wrapper migrated to CSS Modules while Konva Stage/Layer canvas remains completely untouched
- TimelineGrid sticky header layout and scroll behavior preserved exactly in CSS Module form using logical properties
- ReservationBlock status colors (PENDING/CONFIRMED/CANCELLED/COMPLETED/NO_SHOW) converted to status-specific CSS classes using hex values per plan spec

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate booking-widget components to CSS Modules** - `0be39bd` (feat)
2. **Task 2: Migrate floor-plan and timeline components to CSS Modules** - `b849363` (feat)

## Files Created/Modified

**Created:**
- `apps/hospitality/src/components/booking-widget/BookingWidget.module.css` - Widget container, step indicator, connector styles
- `apps/hospitality/src/components/booking-widget/DatePartySelector.module.css` - Date input, party size grid, primary button
- `apps/hospitality/src/components/booking-widget/TimeSlotPicker.module.css` - Slot grid, loading spinner, period labels, error/empty states
- `apps/hospitality/src/components/booking-widget/GuestDetailsForm.module.css` - Form fields, labels, summary card, hold timer
- `apps/hospitality/src/components/booking-widget/ConfirmationView.module.css` - Success icon, details card, secondary button
- `apps/hospitality/src/components/floor-plan/FloorPlanCanvas.module.css` - Canvas wrapper with grid background, overlay positioning
- `apps/hospitality/src/components/timeline/TimelineGrid.module.css` - Grid layout with sticky headers and hour columns
- `apps/hospitality/src/components/timeline/ReservationBlock.module.css` - Block container with 5 status-specific color classes

**Modified:**
- `apps/hospitality/src/components/booking-widget/BookingWidget.tsx` - CSS Module import + step indicator refactor
- `apps/hospitality/src/components/booking-widget/DatePartySelector.tsx` - CSS Module import, all className replaced
- `apps/hospitality/src/components/booking-widget/TimeSlotPicker.tsx` - CSS Module import, all className replaced
- `apps/hospitality/src/components/booking-widget/GuestDetailsForm.tsx` - CSS Module import, all className replaced
- `apps/hospitality/src/components/booking-widget/ConfirmationView.tsx` - CSS Module import, all className replaced
- `apps/hospitality/src/components/floor-plan/FloorPlanCanvas.tsx` - CSS Module import, DOM wrapper migrated
- `apps/hospitality/src/components/timeline/TimelineGrid.tsx` - CSS Module import, all className replaced
- `apps/hospitality/src/components/timeline/ReservationBlock.tsx` - STATUS_COLORS → STATUS_CLASS mapping with CSS Module classes

## Decisions Made

- **TableShape.tsx left unchanged:** Pure react-konva component — inspected file and confirmed zero Tailwind className strings (canvas API only), per plan instruction to inspect first
- **ReservationBlock STATUS_COLORS refactored:** Original used `{ bg, border, text }` string objects for dynamic class composition. Replaced with `STATUS_CLASS` record mapping status → single CSS Module class name, moving all status styling into the `.statusX` CSS rules
- **STEPS array extracted as constant in BookingWidget:** Avoids repeating the `["date-party", "time-slot", "guest-details"]` inline array for step-index calculations
- **Dynamic pixel values kept as inline styles:** `left`, `width`, `height` values computed at runtime from `HOUR_WIDTH`, `ROW_HEIGHT`, `TABLE_COLUMN_WIDTH` remain as `style={}` props — only static Tailwind classes were converted to CSS Modules

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All domain components in the hospitality app now use CSS Modules with Rialto tokens
- Zero Tailwind className strings remain in booking-widget, floor-plan, or timeline component files
- TypeScript compiles cleanly (zero errors)
- All business logic, canvas operations, scroll behavior, and event handlers preserved exactly
- Phase 04 domain component migration is complete — remaining phase work can proceed to infrastructure/hosting tasks

## Self-Check: PASSED

- All 8 CSS Module files: FOUND
- SUMMARY.md: FOUND
- Commit `0be39bd` (Task 1): FOUND
- Commit `b849363` (Task 2): FOUND
- TypeScript: zero errors
- Tailwind grep: zero matches

---
*Phase: 04-hospitality-migration-full-hosting*
*Completed: 2026-03-04*
