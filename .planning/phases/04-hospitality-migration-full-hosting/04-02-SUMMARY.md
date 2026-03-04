---
phase: 04-hospitality-migration-full-hosting
plan: 02
subsystem: apps/hospitality
tags: [css-modules, rialto-tokens, tailwind-removal, hospitality-pages]
dependency_graph:
  requires: []
  provides:
    - "CSS Module styling for all 6 Tailwind-only hospitality page files"
    - "ReservationsPage, GuestsPage, FloorPlansPage migrated to CSS Modules"
    - "FloorPlanEditorPage, BookingWidgetDemoPage, TimelinePage migrated to CSS Modules"
  affects:
    - apps/hospitality/src/pages/
tech_stack:
  added: []
  patterns:
    - "CSS Modules with var(--rialto-*) tokens"
    - "CSS logical properties (padding-inline, margin-block, border-inline-start)"
    - "Semantic hex values for status badges (no Rialto status tokens)"
key_files:
  created:
    - apps/hospitality/src/pages/ReservationsPage.module.css
    - apps/hospitality/src/pages/GuestsPage.module.css
    - apps/hospitality/src/pages/FloorPlansPage.module.css
    - apps/hospitality/src/pages/FloorPlanEditorPage.module.css
    - apps/hospitality/src/pages/BookingWidgetDemoPage.module.css
    - apps/hospitality/src/pages/TimelinePage.module.css
  modified:
    - apps/hospitality/src/pages/ReservationsPage.tsx
    - apps/hospitality/src/pages/GuestsPage.tsx
    - apps/hospitality/src/pages/FloorPlansPage.tsx
    - apps/hospitality/src/pages/FloorPlanEditorPage.tsx
    - apps/hospitality/src/pages/BookingWidgetDemoPage.tsx
    - apps/hospitality/src/pages/TimelinePage.tsx
decisions:
  - "CSS logical properties used throughout: padding-inline, margin-block-end, border-inline-start for i18n/RTL readiness"
  - "Status badges use opaque hex values (#dcfce7/#166534 for CONFIRMED, etc.) — Rialto has no semantic status color tokens"
  - "h-full flex layouts preserved exactly in FloorPlanEditorPage and TimelinePage via .root { height:100%; display:flex; flex-direction:column }"
  - "STATUS_COLORS Record<ReservationStatus,string> replaced with STATUS_BADGE_CLASS mapping to CSS Module class references"
  - "getStatusBadgeClass() helper function introduced in TimelinePage for inline status-to-class mapping"
metrics:
  duration: "5 minutes"
  completed: "2026-03-03"
  tasks_completed: 2
  files_created: 6
  files_modified: 6
---

# Phase 04 Plan 02: Tailwind-only Pages — CSS Modules Migration Summary

CSS Modules migration of all 6 pure-Tailwind hospitality pages using var(--rialto-*) tokens, eliminating every Tailwind utility className string from ReservationsPage, GuestsPage, FloorPlansPage, FloorPlanEditorPage, BookingWidgetDemoPage, and TimelinePage.

## What Was Built

Migrated 6 hospitality page files from Tailwind utility classes to CSS Modules with Rialto design tokens:

**Task 1 — Simpler pages (bf9b280):**
- ReservationsPage: table with status badges, date picker, spinner, error/empty states
- GuestsPage: search input, segment card grid, guest table with tags
- FloorPlansPage: card grid with floor plan preview thumbnails

**Task 2 — Complex layout pages (a250300):**
- FloorPlanEditorPage: full-height flex layout, toolbar, canvas area, table details sidebar
- BookingWidgetDemoPage: venue input, widget preview frame, embed code block, features grid
- TimelinePage: full-height flex layout, date navigation, stats row, SSE live indicator, reservation detail sidebar

## Decisions Made

- CSS logical properties used throughout for i18n/RTL readiness (padding-inline, margin-block-end, border-inline-start)
- Status badges use opaque hex values — Rialto has no semantic status color tokens (PENDING, CONFIRMED, CANCELLED, etc.)
- Critical h-full flex layouts preserved exactly via `.root { height: 100%; display: flex; flex-direction: column; }`
- STATUS_COLORS Record replaced with CSS Module class mapping (STATUS_BADGE_CLASS) to eliminate inline Tailwind string composition
- getStatusBadgeClass() helper introduced in TimelinePage for clean conditional class selection

## Verification Results

1. `npx tsc --noEmit -p apps/hospitality/tsconfig.json` — PASS (zero errors)
2. Tailwind className grep across all 6 page files — PASS (zero matches)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

Files created/exist:
- FOUND: apps/hospitality/src/pages/ReservationsPage.module.css
- FOUND: apps/hospitality/src/pages/GuestsPage.module.css
- FOUND: apps/hospitality/src/pages/FloorPlansPage.module.css
- FOUND: apps/hospitality/src/pages/FloorPlanEditorPage.module.css
- FOUND: apps/hospitality/src/pages/BookingWidgetDemoPage.module.css
- FOUND: apps/hospitality/src/pages/TimelinePage.module.css

Commits:
- FOUND: bf9b280 (Task 1 — simpler pages)
- FOUND: a250300 (Task 2 — complex layout pages)

## Self-Check: PASSED
