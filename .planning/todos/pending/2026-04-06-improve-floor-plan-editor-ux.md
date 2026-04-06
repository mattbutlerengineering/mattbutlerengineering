---
created: 2026-04-06T00:11:27.330Z
title: Improve floor plan editor UX
area: ui
files:
  - apps/hospitality/src/components/floor-plan/FloorPlanCanvas.tsx
  - apps/hospitality/src/components/floor-plan/FloorPlanEditor.tsx
  - apps/hospitality/src/pages/FloorPlanPage.tsx
  - services/reservations/src/services/floor-plan.ts
  - services/reservations/src/routes/floor-plans.ts
---

## Problem

The floor plan editor in the hospitality app needs UX improvements. It uses Konva/react-konva for canvas rendering, but the current implementation has gaps in interaction design, visual feedback, and editing capabilities that could make table layout management smoother and more intuitive for restaurant operators.

Potential areas for improvement:
- Drag-and-drop table positioning and snapping
- Visual feedback during table placement (guides, grid, alignment)
- Undo/redo for layout changes
- Table grouping and bulk operations
- Zoom/pan controls for large floor plans
- Mobile/touch support for on-site editing
- Real-time preview of table status overlays on the layout
- Better visual distinction between table shapes/sizes/capacities

## Solution

TBD — needs design exploration and user feedback. Consider:
- Snap-to-grid with configurable grid size
- Ghost preview during drag operations
- Keyboard shortcuts for common operations (delete, duplicate, rotate)
- Mini-map for navigation on large floor plans
- Integration with real-time reservation status (occupied/available/dirty overlay)
