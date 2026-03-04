---
phase: 01-rialto-web-migration
plan: "01"
subsystem: ui
tags: [react, vite, react-router-dom, rialto, design-system, theme, sidebar]

# Dependency graph
requires: []
provides:
  - RialtoProvider at root of rialto-web with light/dark theme state persisted to localStorage
  - ShowcaseLayout app shell with Sidebar navigation (55+ components across 7 categories) and top header bar
  - ThemeToggle component with sun/moon SVG icons
  - Centralized route definitions (routes.tsx) with ShowcaseLayout for component pages, DemoLayout for demo pages
  - OverviewPage landing page with hero, stats (component count/categories/tokens), category preview cards, and getting started section
  - nav-sections.ts as single source of truth for sidebar navigation and route generation
  - All existing demo pages preserved under /demos/* prefix (from old /login, /dashboard, etc.)
affects:
  - 01-02 (component pages plug into ShowcaseLayout via Outlet, use NAV_SECTIONS routes)
  - 01-03 (builds on established structure)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - RialtoProvider wraps BrowserRouter (outside it) so CSS token cascade applies to all routes
    - Sidebar navigation uses onClick + useNavigate instead of href to prevent full page reloads inside BrowserRouter
    - Theme state initialized from localStorage then OS preference; persisted on change
    - Sidebar collapsed state persisted to localStorage; defaults collapsed on mobile (<768px)
    - Route generation via NAV_SECTIONS.flatMap() — adding a nav item automatically creates a route

key-files:
  created:
    - apps/rialto-web/src/data/nav-sections.ts
    - apps/rialto-web/src/components/ThemeToggle.tsx
    - apps/rialto-web/src/components/ThemeToggle.module.css
    - apps/rialto-web/src/routes.tsx
    - apps/rialto-web/src/layouts/ShowcaseLayout.tsx
    - apps/rialto-web/src/layouts/ShowcaseLayout.module.css
    - apps/rialto-web/src/pages/OverviewPage.tsx
    - apps/rialto-web/src/pages/OverviewPage.module.css
  modified:
    - apps/rialto-web/src/main.tsx

key-decisions:
  - "Sidebar uses onClick+useNavigate not href — prevents full page reloads inside BrowserRouter"
  - "RialtoProvider wraps BrowserRouter at root, not inside it — ensures CSS token cascade applies to all routes"
  - "Demo pages moved to /demos/* prefix — avoids route conflicts with new /components/* routes"
  - "PlaceholderPage in routes.tsx for component pages — navigation works immediately, Plan 02 replaces with real content"
  - "ESLint ajv error is pre-existing repo-wide issue, not caused by this plan — typecheck and build both pass cleanly"

patterns-established:
  - "Pattern 1: NAV_SECTIONS as source-of-truth — import into both ShowcaseLayout (sidebar) and routes.tsx (route generation)"
  - "Pattern 2: Sidebar navigation via onClick+useNavigate (no href) to stay client-side inside BrowserRouter"
  - "Pattern 3: Theme state in Root component of main.tsx, passed down as props to ShowcaseRouter and ShowcaseLayout"

requirements-completed: [RIALTO-02, RIALTO-03]

# Metrics
duration: 6min
completed: 2026-02-28
---

# Phase 1 Plan 01: Showcase App Shell Summary

**ShowcaseLayout with Sidebar navigation (55+ components/7 categories), RialtoProvider at root with localStorage theme persistence, OverviewPage with stats and category previews, centralized route definitions with placeholder component pages**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-28T15:26:55Z
- **Completed:** 2026-02-28T15:32:11Z
- **Tasks:** 2
- **Files modified:** 9 (1 modified, 8 created)

## Accomplishments
- Created nav-sections.ts with 55 components organized into 7 functional categories — single source of truth for sidebar and route generation
- Built ShowcaseLayout app shell with sticky header (logo + ThemeToggle + GitHub link), animated Sidebar using onClick+useNavigate for client-side navigation, and Rialto Footer
- Built OverviewPage with hero, stats row (component count, category count, token count), category preview cards with keyboard navigation, and getting started code block
- Updated main.tsx: RialtoProvider wraps BrowserRouter (outside it), theme state persisted to localStorage and initialized from OS preference
- Moved all demo pages to /demos/* prefix; created centralized routes.tsx with ShowcaseRouter component; existing demos still work

## Task Commits

Each task was committed atomically:

1. **Task 1: Create nav data, ThemeToggle, and route definitions** - `d989f63` (feat)
2. **Task 2: Create ShowcaseLayout, OverviewPage, and update main.tsx** - `0472c71` (feat)

**Plan metadata:** (see final commit below)

## Files Created/Modified
- `apps/rialto-web/src/data/nav-sections.ts` - NAV_SECTIONS (7 categories, 55 components), COMPONENT_COUNT, DEMO_PAGES exports
- `apps/rialto-web/src/components/ThemeToggle.tsx` - Sun/moon icon button accepting theme+onToggle props
- `apps/rialto-web/src/components/ThemeToggle.module.css` - Button styling with Rialto tokens, hover/focus/active states
- `apps/rialto-web/src/routes.tsx` - ShowcaseRouter with ShowcaseLayout wrapping component routes and DemoLayout wrapping demo routes
- `apps/rialto-web/src/layouts/ShowcaseLayout.tsx` - App shell: sticky header, Sidebar with client-side nav, Outlet, Footer
- `apps/rialto-web/src/layouts/ShowcaseLayout.module.css` - CSS Grid layout, sticky header, responsive sidebar
- `apps/rialto-web/src/pages/OverviewPage.tsx` - Landing page with hero, Stat components, category Card grid, getting started
- `apps/rialto-web/src/pages/OverviewPage.module.css` - Responsive grid layout, hero, stats, code block styles
- `apps/rialto-web/src/main.tsx` - Root with RialtoProvider+BrowserRouter+ToastProvider+ShowcaseRouter; theme state management

## Decisions Made
- **Sidebar nav uses onClick+useNavigate not href** — Sidebar renders `<a href>` when href is passed, causing full page reloads inside BrowserRouter. Using onClick avoids this entirely.
- **RialtoProvider outside BrowserRouter** — ensures the CSS token cascade (light/dark data-theme attribute) applies to all routes including demos
- **Demo pages moved to /demos/* prefix** — prevents route conflicts between old paths (/login, /dashboard) and new /components/* routes
- **PlaceholderPage for component routes** — allows immediate navigation to work; Plan 02 replaces placeholder content with real component demos
- **ESLint pre-existing issue documented, not fixed** — `ajv/lib/refs/json-schema-draft-04.json` missing is a repo-wide issue across multiple packages, not introduced by this plan; typecheck and build pass cleanly

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Text component props in PlaceholderPage**
- **Found during:** Task 1 (typecheck verification)
- **Issue:** Plan specified `<Text size="xl" weight="medium">` but Rialto Text component uses `variant` not `size`/`weight` props
- **Fix:** Changed to `<Text variant="display">` and `<Text variant="caption">` matching actual TextProps interface
- **Files modified:** apps/rialto-web/src/routes.tsx
- **Verification:** `pnpm --filter @mbe/rialto-web exec tsc --noEmit` passes cleanly
- **Committed in:** d989f63 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug: wrong component prop names)
**Impact on plan:** Minor correction to match actual Rialto API. No scope creep.

## Issues Encountered
- Pre-existing ESLint error (`ajv/lib/refs/json-schema-draft-04.json` missing) affects lint across multiple packages in the monorepo. Not caused by this plan. Typecheck and build pass cleanly. Logged for deferred fix.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- App shell is complete and builds cleanly — Plan 02 can plug component page content into ShowcaseLayout via Outlet
- All 55+ component routes exist as PlaceholderPage — Plan 02 replaces these with real component demos extracted from App.tsx
- NAV_SECTIONS is the source of truth — adding a nav item in nav-sections.ts automatically creates a route

---
*Phase: 01-rialto-web-migration*
*Completed: 2026-02-28*
