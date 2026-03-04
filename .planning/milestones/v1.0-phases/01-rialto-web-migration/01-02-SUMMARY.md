---
phase: 01-rialto-web-migration
plan: "02"
subsystem: rialto-web
tags: [design-system, showcase, react, component-pages, routing]
dependency_graph:
  requires: ["01-01"]
  provides: ["component-showcase-pages", "rialto-web-routing"]
  affects: ["apps/rialto-web"]
tech_stack:
  added: []
  patterns:
    - ComponentPageLayout shared template with Section sub-component
    - PropsTable using generic Rialto Table<T> component
    - Lazy-loaded per-component showcase pages via React.lazy + Suspense
    - Each page: Variants → Features → Usage Example → Playground → Props → Accessibility
key_files:
  created:
    - apps/rialto-web/src/pages/components/ComponentPageLayout.tsx
    - apps/rialto-web/src/pages/components/ComponentPageLayout.module.css
    - apps/rialto-web/src/pages/components/PropsTable.tsx
    - apps/rialto-web/src/pages/forms/ButtonPage.tsx
    - apps/rialto-web/src/pages/forms/InputPage.tsx
    - apps/rialto-web/src/pages/forms/TextAreaPage.tsx
    - apps/rialto-web/src/pages/forms/NumberInputPage.tsx
    - apps/rialto-web/src/pages/forms/CheckboxRadioPage.tsx
    - apps/rialto-web/src/pages/forms/TogglePage.tsx
    - apps/rialto-web/src/pages/forms/SliderPage.tsx
    - apps/rialto-web/src/pages/forms/SelectPage.tsx
    - apps/rialto-web/src/pages/forms/PinInputPage.tsx
    - apps/rialto-web/src/pages/forms/SegmentedControlPage.tsx
    - apps/rialto-web/src/pages/data/CardPage.tsx
    - apps/rialto-web/src/pages/data/TablePage.tsx
    - apps/rialto-web/src/pages/data/BadgePage.tsx
    - apps/rialto-web/src/pages/data/TagPage.tsx
    - apps/rialto-web/src/pages/data/AvatarPage.tsx
    - apps/rialto-web/src/pages/data/StatPage.tsx
    - apps/rialto-web/src/pages/data/DataListPage.tsx
    - apps/rialto-web/src/pages/data/MeterPage.tsx
    - apps/rialto-web/src/pages/data/TimelinePage.tsx
    - apps/rialto-web/src/pages/data/TreePage.tsx
    - apps/rialto-web/src/pages/data/KbdPage.tsx
    - apps/rialto-web/src/pages/navigation/TabsPage.tsx
    - apps/rialto-web/src/pages/navigation/BreadcrumbPage.tsx
    - apps/rialto-web/src/pages/navigation/StepsPage.tsx
    - apps/rialto-web/src/pages/navigation/PaginationPage.tsx
    - apps/rialto-web/src/pages/navigation/NavigationMenuPage.tsx
    - apps/rialto-web/src/pages/navigation/SidebarPage.tsx
    - apps/rialto-web/src/pages/navigation/NavbarPage.tsx
    - apps/rialto-web/src/pages/feedback/ToastPage.tsx
    - apps/rialto-web/src/pages/feedback/AlertPage.tsx
    - apps/rialto-web/src/pages/feedback/BannerPage.tsx
    - apps/rialto-web/src/pages/feedback/ProgressPage.tsx
    - apps/rialto-web/src/pages/feedback/SpinnerPage.tsx
    - apps/rialto-web/src/pages/feedback/SkeletonPage.tsx
    - apps/rialto-web/src/pages/feedback/EmptyStatePage.tsx
    - apps/rialto-web/src/pages/overlays/DialogPage.tsx
    - apps/rialto-web/src/pages/overlays/ConfirmDialogPage.tsx
    - apps/rialto-web/src/pages/overlays/DrawerPage.tsx
    - apps/rialto-web/src/pages/overlays/CommandPalettePage.tsx
    - apps/rialto-web/src/pages/overlays/TooltipPage.tsx
    - apps/rialto-web/src/pages/overlays/PopoverPage.tsx
    - apps/rialto-web/src/pages/overlays/HoverCardPage.tsx
    - apps/rialto-web/src/pages/overlays/DropdownMenuPage.tsx
    - apps/rialto-web/src/pages/overlays/ContextMenuPage.tsx
    - apps/rialto-web/src/pages/layout/DividerPage.tsx
    - apps/rialto-web/src/pages/layout/TextPage.tsx
    - apps/rialto-web/src/pages/layout/StackPage.tsx
    - apps/rialto-web/src/pages/layout/CollapsiblePage.tsx
    - apps/rialto-web/src/pages/layout/AccordionPage.tsx
    - apps/rialto-web/src/pages/layout/AspectRatioPage.tsx
    - apps/rialto-web/src/pages/layout/ScrollAreaPage.tsx
  modified:
    - apps/rialto-web/src/routes.tsx
  deleted:
    - apps/rialto-web/src/showcase/App.tsx
    - apps/rialto-web/src/showcase/App.module.css
decisions:
  - "TimelinePage created under pages/data/ (matching data display category) but routes.tsx maps /components/timeline (Layout section) to it — file location and nav section need not match"
  - "SpinnerPage created as standalone page (separate nav route /components/spinner) even though Progress page also demos Spinner — keeps nav routes 1:1 with pages"
  - "Token pages (motion, typography, color, etc.) kept as inline stubs — full token reference pages deferred to future plan"
  - "Banner does not have 'success' variant (only info/warning/error/accent) — fixed prop documentation and demo to match actual API"
  - "Tabs prop is 'defaultTab' not 'defaultActiveId' — fixed at type-check time"
metrics:
  duration_minutes: 95
  completed_date: "2026-02-28"
  tasks_completed: 2
  tasks_total: 2
  files_created: 52
  files_modified: 1
  files_deleted: 2
---

# Phase 01 Plan 02: Component Showcase Pages Summary

**One-liner:** Extracted 43 per-component showcase pages from a 3,974-line monolithic App.tsx into individually routed, lazily-loaded pages using a shared ComponentPageLayout template.

## What Was Built

### Shared Infrastructure

- **ComponentPageLayout** (`pages/components/ComponentPageLayout.tsx`): Reusable page wrapper with standardized header (name + description) and `Section` sub-component. CSS Module uses only `var(--rialto-*)` tokens.
- **PropsTable** (`pages/components/PropsTable.tsx`): API documentation table using Rialto's generic `Table<T>` component. Displays name, type, default, and description columns.

### Component Pages Created (43 total)

| Category | Pages | Count |
|----------|-------|-------|
| Forms | Button, Input, TextArea, NumberInput, CheckboxRadio, Toggle, Slider, Select, PinInput, SegmentedControl | 10 |
| Data Display | Card, Table, Badge, Tag, Avatar, Stat, DataList, Meter, Timeline, Tree, Kbd | 11 |
| Navigation | Tabs, Breadcrumb, Steps, Pagination, NavigationMenu, Sidebar, Navbar | 7 |
| Feedback | Toast, Alert, Banner, Progress, Spinner, Skeleton, EmptyState | 7 |
| Overlays | Dialog, ConfirmDialog, Drawer, CommandPalette, Tooltip, Popover, HoverCard, DropdownMenu, ContextMenu | 9 |
| Layout | Divider, Text, Stack, Collapsible, Accordion, AspectRatio, ScrollArea | 7 |

### Page Structure

Each page follows this locked structure:
1. **Variants** — All visual variants side by side
2. **Features/States** — Additional states (dismissible, disabled, etc.)
3. **Usage Example** — Realistic motorsport/engineering context demo
4. **Interactive Playground** — Local state controls for key props
5. **Props Table** — Full API documentation
6. **Accessibility** — Role, keyboard, ARIA notes

### Routes

`routes.tsx` rewritten to lazy-import all 43 component pages individually. Token pages (motion, typography, color, spacing, radius, shadows, surfaces, icon-vocabulary) kept as inline "coming soon" stubs.

### Deletions

`apps/rialto-web/src/showcase/App.tsx` (3,974 lines) and `App.module.css` (1,129 lines) deleted — all content migrated to individual pages.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Banner 'success' variant does not exist**
- **Found during:** Task 2 TypeScript check
- **Issue:** BannerPage.tsx used `variant="success"` but Banner only accepts `"info" | "warning" | "error" | "accent"`
- **Fix:** Changed to `variant="info"` and corrected PropsTable type documentation
- **Commit:** e8b1ec5

**2. [Rule 1 - Bug] Alert children prop is required**
- **Found during:** Task 2 TypeScript check
- **Issue:** `<Alert variant="info" title="No body text" />` missing required `children` prop
- **Fix:** Added empty children `{""}`
- **Commit:** e8b1ec5

**3. [Rule 1 - Bug] Divider spacing='loose' is not a valid value**
- **Found during:** Task 2 TypeScript check
- **Issue:** DividerPage used `spacing="loose"` but type is `"compact" | "default" | "spacious"`
- **Fix:** Changed to `spacing="spacious"` throughout including PropsTable documentation
- **Commit:** e8b1ec5

**4. [Rule 1 - Bug] Tabs prop 'defaultActiveId' does not exist**
- **Found during:** Task 2 TypeScript check
- **Issue:** TabsPage used `defaultActiveId="overview"` but actual prop is `defaultTab`
- **Fix:** Changed to `defaultTab="overview"` and updated PropsTable
- **Commit:** e8b1ec5

**5. [Rule 2 - Bug] Unused imports causing TS6133 errors**
- **Found during:** Task 2 TypeScript check
- **Issue:** DropdownMenuPage, HoverCardPage, TooltipPage imported Stack/Text but never used them
- **Fix:** Removed unused imports
- **Commit:** e8b1ec5

**6. [Rule 2 - Design] PropsTable `PropDef` interface missing index signature**
- **Found during:** Task 1 TypeScript check
- **Issue:** `Table<T>` requires `T extends Record<string, unknown>` but `PropDef` didn't satisfy constraint
- **Fix:** Added `[key: string]: unknown` index signature to `PropDef`
- **Commit:** 63db09d

## Self-Check: PASSED

Files verified to exist:
- ComponentPageLayout: FOUND
- 10 Forms pages: FOUND
- 11 Data pages: FOUND
- 7 Navigation pages: FOUND
- 7 Feedback pages: FOUND
- 9 Overlays pages: FOUND
- 7 Layout pages: FOUND
- routes.tsx updated: FOUND
- App.tsx deleted: CONFIRMED

Commits verified:
- 63db09d: FOUND (Task 1 — shared infrastructure + Forms + Data pages)
- e8b1ec5: FOUND (Task 2 — Navigation + Feedback + Overlays + Layout + routes)

Build: pnpm --filter @mbe/rialto-web build — PASSED (no errors)
TypeScript: pnpm --filter @mbe/rialto-web exec tsc --noEmit — PASSED (no errors)
