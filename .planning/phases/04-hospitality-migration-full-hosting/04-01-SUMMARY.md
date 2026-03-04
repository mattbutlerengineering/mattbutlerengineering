---
phase: 04-hospitality-migration-full-hosting
plan: "01"
subsystem: hospitality-app
tags: [rialto, migration, ui, hospitality, css-modules]
dependency_graph:
  requires: []
  provides:
    - hospitality-app uses RialtoProvider at root
    - hospitality-app shell rendered with Rialto Sidebar
    - local PageHeader component for all pages
    - HomePage, ProfilePage, SettingsPage, AdminPage migrated to Rialto
  affects:
    - apps/hospitality — all migrated files
tech_stack:
  added:
    - "@mbe/rialto workspace:*"
  patterns:
    - Rialto Sidebar with onClick+useNavigate (no href) for SPA navigation
    - CSS Modules using var(--rialto-*) tokens throughout
    - RialtoProvider above BrowserRouter at root
    - Local PageHeader component wrapping Rialto Text+Stack
    - Card title prop pattern replacing @mbe/ui compound Card pattern
key_files:
  created:
    - apps/hospitality/src/App.module.css
    - apps/hospitality/src/components/DashboardLayout.module.css
    - apps/hospitality/src/components/PageHeader.tsx
    - apps/hospitality/src/components/PageHeader.module.css
    - apps/hospitality/src/pages/LoadingPage.module.css
    - apps/hospitality/src/pages/HomePage.module.css
    - apps/hospitality/src/pages/ProfilePage.module.css
    - apps/hospitality/src/pages/SettingsPage.module.css
    - apps/hospitality/src/pages/AdminPage.module.css
  modified:
    - apps/hospitality/package.json
    - apps/hospitality/src/main.tsx
    - apps/hospitality/src/App.tsx
    - apps/hospitality/src/components/DashboardLayout.tsx
    - apps/hospitality/src/pages/LoadingPage.tsx
    - apps/hospitality/src/pages/HomePage.tsx
    - apps/hospitality/src/pages/ProfilePage.tsx
    - apps/hospitality/src/pages/SettingsPage.tsx
    - apps/hospitality/src/pages/AdminPage.tsx
decisions:
  - RialtoProvider wraps BrowserRouter at root to ensure CSS token cascade applies to all routes
  - DashboardLayout uses onClick+useNavigate not href — prevents full page reloads inside BrowserRouter
  - @mbe/rialto added to hospitality package.json as workspace dependency
  - Local PageHeader component created in components/ — wraps Rialto Text+Stack per plan spec
  - Card title prop pattern used for simple cards; children-only pattern with cardHeader styles for cards needing action buttons
metrics:
  duration: "4 min"
  completed: "2026-03-04"
  tasks_completed: 2
  files_modified: 9
  files_created: 9
requirements-completed: [HOSP-06]
---

# Phase 4 Plan 1: Hospitality App Shell and Pages — Rialto Migration Summary

**One-liner:** Hospitality app shell migrated to Rialto Sidebar+RialtoProvider, and all @mbe/ui/@mbe/shared-layout pages replaced with Rialto Card/Button/Text + CSS Modules.

## What Was Built

### Task 1: App Shell Migration

**main.tsx** — Added `@mbe/rialto/styles` as the first import and `RialtoProvider theme="light"` wrapping BrowserRouter. This ensures Rialto CSS custom properties cascade to all routes.

**App.tsx** — Replaced Tailwind-based `LoginPrompt` with Rialto `Stack/Text/Button` components and a CSS Module (`.loginContainer`) for the centered layout.

**DashboardLayout.tsx** — Replaced `AppLayout` from `@mbe/shared-layout` with a Rialto `Sidebar` component. Navigation sections use `onClick` + `useNavigate` (not `href`) to prevent full page reloads inside BrowserRouter. Sign Out is appended to the Account section items. Active state computed from `useLocation().pathname`.

**PageHeader.tsx** (new) — Local component using Rialto `Text` (variant="display") + `Stack` (gap="xs") with a CSS Module for margin-block-end spacing.

**LoadingPage.tsx** — Replaced Tailwind min-h-screen + spinner with Rialto `Text/Stack` + CSS Module container.

### Task 2: Page Migrations

**HomePage.tsx** — Three stat cards using Rialto `Card title` prop pattern, `Text/Stack` for card content, CSS Module for responsive 3-column grid.

**ProfilePage.tsx** — Profile information card with edit/save toggle. Cards with action buttons use children-only pattern with `styles.cardHeader` for the flex row. Form inputs styled with CSS Module classes using Rialto border/focus tokens. Account details grid uses 2-column CSS Module layout with verification status badges.

**SettingsPage.tsx** — Appearance/Notifications/Account cards. Theme select and checkbox inputs styled with CSS Module classes. Error/success banners using color-mix() with Rialto surface tokens.

**AdminPage.tsx** — User management table with CSS Module table styling. Card header with total count. Verified/unverified status badges. Pagination row with Previous/Next buttons.

## Verification Results

1. `pnpm typecheck` (hospitality app) — **zero errors**
2. `grep @mbe/ui|@mbe/shared-layout` across all 8 migrated files — **zero results**
3. `grep Tailwind className strings` across all 8 migrated files — **zero results**

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

All files created/modified verified to exist on disk.
Commits af79dfb and b2b6805 verified in git log.
