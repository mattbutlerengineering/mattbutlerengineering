---
phase: quick
plan: 1
subsystem: rialto, rialto-web, marketing
tags: [design-system, theme-toggle, component-library, dark-mode]
dependency_graph:
  requires: []
  provides: [ThemeToggle exported from @mbe/rialto]
  affects: [apps/rialto-web, apps/marketing]
tech_stack:
  added: []
  patterns: [React.forwardRef, CSS Modules composes, barrel re-export]
key_files:
  created:
    - packages/rialto/src/components/ThemeToggle/ThemeToggle.tsx
    - packages/rialto/src/components/ThemeToggle/ThemeToggle.module.css
    - packages/rialto/src/components/ThemeToggle/index.ts
  modified:
    - packages/rialto/src/components/index.ts
    - apps/rialto-web/src/layouts/ShowcaseLayout.tsx
    - apps/marketing/src/components/Navbar.tsx
  deleted:
    - apps/rialto-web/src/components/ThemeToggle.tsx
    - apps/rialto-web/src/components/ThemeToggle.module.css
decisions:
  - ThemeToggle uses React.forwardRef pattern per Rialto component authoring conventions
  - CSS module uses composes: focusRing from surfaces.module.css (focusRing class confirmed present) instead of inline box-shadow
metrics:
  duration: ~2 min
  completed: 2026-03-23
---

# Quick Task 1: Update Light and Dark Mode Button Summary

**One-liner:** ThemeToggle sun/moon icon button moved into @mbe/rialto package, replacing emoji Toggle switch in marketing Navbar and local file in rialto-web.

## What Was Done

Moved the `ThemeToggle` component from `apps/rialto-web/src/components/` into the shared Rialto design system package so all apps use the same consistent icon button for light/dark mode toggling.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Move ThemeToggle into Rialto package | 59db539 | ThemeToggle.tsx, ThemeToggle.module.css, index.ts, components/index.ts |
| 2 | Update rialto-web and marketing to use shared ThemeToggle | b944459 | ShowcaseLayout.tsx, Navbar.tsx, deleted local ThemeToggle files |

## Verification Results

- `pnpm typecheck` — passes (zero errors)
- `pnpm lint` — passes (zero new errors; pre-existing warnings in rialto-web nav-sections data file unrelated to this change)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

Files created:
- packages/rialto/src/components/ThemeToggle/ThemeToggle.tsx — FOUND
- packages/rialto/src/components/ThemeToggle/ThemeToggle.module.css — FOUND
- packages/rialto/src/components/ThemeToggle/index.ts — FOUND

Commits:
- 59db539 feat(quick-1): add ThemeToggle to Rialto package — FOUND
- b944459 feat(quick-1): update rialto-web and marketing to use shared ThemeToggle — FOUND
