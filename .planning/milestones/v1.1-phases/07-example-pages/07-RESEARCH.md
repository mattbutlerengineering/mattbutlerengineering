# Phase 7: Example Pages - Research

**Researched:** 2026-03-22
**Domain:** rialto-web showcase app — React + Vite + React Router v6, CSS Modules, @mbe/rialto component library
**Confidence:** HIGH

## Summary

Phase 7 adds three new example pages to the existing `rialto-web` Vite/React app at `/rialto/examples/{dashboard,settings,form}`. The app already has a full-page demo pattern (`DemoLayout` at `/demos/*`) and a component-showcase pattern (`ShowcaseLayout` at `/components/*`). Example pages are a third pattern: they live under a new `/examples/*` route group, render inside the `ShowcaseLayout` shell (sidebar stays visible), and their primary purpose is to show realistic multi-component composition with all states simultaneously visible without JavaScript interaction.

The hardest requirements are EXMP-06 (copy-to-clipboard JSX) and EXMP-08 (multi-state static panels). Both are solved patterns in the codebase's neighborhood — clipboard via the browser Clipboard API, multi-state panels via rendering multiple independent "panels" as siblings on the same page. No new libraries are needed.

**Primary recommendation:** Create the three pages as new files under `apps/rialto-web/src/pages/examples/`, add a new `EXAMPLES` nav section to `nav-sections.ts`, add routes to `routes.tsx`, and build a shared `ExamplePageLayout` for the copy-to-clipboard chrome and annotation pattern.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| EXMP-01 | Dashboard example page with KPI cards, DataTable, Badge, and Stat in realistic combination | Stat, Table, Badge, Card, Stack all confirmed in @mbe/rialto; realistic hospitality domain data replaces Lorem ipsum |
| EXMP-02 | Settings page example with Form, Input, Select, Toggle, Button in sectioned layout | Input, Select, Toggle, Button, Divider, Stack confirmed; section grouping via Card + Divider pattern already used in Dashboard |
| EXMP-03 | Full form example with all validation states (default, focused, error, disabled, loading) | Input `error` prop + `disabled` prop confirmed; "loading" state means Button `loading` prop — render all variants as static rows simultaneously |
| EXMP-04 | All component states shown in context (not isolated) within example pages | Met by static panel approach — same layout rendered four ways on page load |
| EXMP-05 | Examples use realistic content and data shapes (not Lorem ipsum or test data) | Existing Dashboard uses F1 telemetry data; new examples should use hospitality/operations domain data matching the project's hospitality app |
| EXMP-06 | Each example page has a copy-to-clipboard button with the full page JSX | browser Clipboard API (`navigator.clipboard.writeText`); JSX source stored as a template string constant exported from the page file |
| EXMP-07 | Annotated composition patterns explain why components are combined | Inline annotation component (`<Annotation>`) or `<CompositionNote>` rendered adjacent to each panel — similar to the `Section` + caption pattern in existing component pages |
| EXMP-08 | Multi-state page flows showing empty → loading → populated for same layout | Three sibling `<Panel label="Empty">`, `<Panel label="Loading">`, `<Panel label="Populated">` rendered on load; no state machine needed |
</phase_requirements>

## Standard Stack

### Core (already in project — no new installs)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react | 18.x | Component rendering | Project standard |
| react-router-dom | 6.x | Routing — `lazy()` + `<Route>` | Already in use for all showcase pages |
| @mbe/rialto | workspace | All UI components | Project design system |
| vite | 5.x | Build + dev server | Project standard; base = `/rialto/` |
| CSS Modules | built-in | Per-page scoping | Project pattern for all pages |

### No New Packages Required

All requirements are met by existing dependencies:
- Clipboard: `navigator.clipboard.writeText()` — browser built-in (HIGH confidence)
- State panels: static JSX — no library needed
- Annotations: inline React component — no library needed

## Architecture Patterns

### Recommended Project Structure

```
apps/rialto-web/src/
├── pages/
│   └── examples/                        # NEW — Phase 7
│       ├── ExamplePageLayout.tsx         # Shared chrome: title, copy button, annotation
│       ├── ExamplePageLayout.module.css
│       ├── DashboardExamplePage.tsx      # EXMP-01
│       ├── DashboardExamplePage.module.css
│       ├── SettingsExamplePage.tsx       # EXMP-02
│       ├── SettingsExamplePage.module.css
│       ├── FormStatesExamplePage.tsx     # EXMP-03
│       └── FormStatesExamplePage.module.css
├── data/
│   └── nav-sections.ts                  # ADD Examples section
└── routes.tsx                           # ADD /examples/* routes under ShowcaseLayout
```

### Pattern 1: ExamplePageLayout — shared chrome

Every example page wraps its content in `ExamplePageLayout`, which renders the page title, description, copy-to-clipboard button, and an optional composition notes section.

```typescript
// apps/rialto-web/src/pages/examples/ExamplePageLayout.tsx
import { useState, type ReactNode } from "react";
import { Text, Button, Stack, Divider } from "@mbe/rialto";
import styles from "./ExamplePageLayout.module.css";

interface ExamplePageLayoutProps {
  name: string;
  description: string;
  /** Full JSX source string — copied verbatim to clipboard (EXMP-06) */
  sourceJsx: string;
  /** Composition notes explaining why components are combined (EXMP-07) */
  compositionNotes?: ReactNode;
  children: ReactNode;
}

export function ExamplePageLayout({
  name,
  description,
  sourceJsx,
  compositionNotes,
  children,
}: ExamplePageLayoutProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(sourceJsx);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Stack direction="row" align="center" justify="space-between">
          <div>
            <Text variant="display" as="h1">{name}</Text>
            <Text variant="body" color="secondary">{description}</Text>
          </div>
          <Button variant="secondary" size="sm" onClick={handleCopy}>
            {copied ? "Copied!" : "Copy JSX"}
          </Button>
        </Stack>
      </div>
      <Divider />
      {compositionNotes && (
        <div className={styles.notes}>{compositionNotes}</div>
      )}
      <div className={styles.content}>{children}</div>
    </div>
  );
}
```

### Pattern 2: Static multi-state panels (EXMP-08)

Multi-state flows are NOT implemented with React state (`useState`). They are rendered as three sibling panels on the same page, each hard-coded to its state. This matches the requirement: "visible without JavaScript interaction."

```typescript
// Inside DashboardExamplePage.tsx
function StatePanel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.statePanel}>
      <div className={styles.statePanelLabel}>
        <Text variant="caption" color="tertiary">{label}</Text>
      </div>
      {children}
    </div>
  );
}

// Page renders three sibling panels:
<div className={styles.statePanels}>
  <StatePanel label="Empty state">
    <EmptyState title="No reservations yet" description="..." />
  </StatePanel>

  <StatePanel label="Loading state">
    <Skeleton variant="card" width="100%" height={80} />
    <Skeleton variant="card" width="100%" height={80} />
  </StatePanel>

  <StatePanel label="Populated state">
    {/* Full realistic data grid */}
  </StatePanel>
</div>
```

### Pattern 3: Composition annotations (EXMP-07)

Annotations are rendered as labeled callout boxes adjacent to the component composition — not as tooltips (no interaction required). Use a simple `<CompositionNote>` component:

```typescript
function CompositionNote({ children }: { children: ReactNode }) {
  return (
    <aside className={styles.compositionNote} aria-label="Composition note">
      <Text variant="caption" color="secondary">{children}</Text>
    </aside>
  );
}
```

### Pattern 4: JSX source string (EXMP-06)

The JSX source for the copy button is stored as a template literal constant in the same file. It is the actual JSX of the example body — not the wrapper chrome. Keep it in sync manually (no AST extraction needed for v1.1 scope).

```typescript
// At top of DashboardExamplePage.tsx
export const DASHBOARD_EXAMPLE_JSX = `
import { Badge, Card, Stat, Table, Stack } from "@mbe/rialto";

export function DashboardExample() {
  return (
    // ... full JSX
  );
}
`.trim();
```

### Pattern 5: Route registration (matches existing lazy pattern)

```typescript
// In routes.tsx — add alongside existing lazy imports:
const DashboardExamplePage = lazy(() =>
  import("./pages/examples/DashboardExamplePage").then((m) => ({
    default: m.DashboardExamplePage,
  }))
);
// ... similarly for SettingsExamplePage, FormStatesExamplePage

// In ShowcaseRouter, inside the ShowcaseLayout <Route> group:
<Route path="/examples/dashboard" element={<DashboardExamplePage />} />
<Route path="/examples/settings" element={<SettingsExamplePage />} />
<Route path="/examples/form" element={<FormStatesExamplePage />} />
```

### Pattern 6: Nav section registration

```typescript
// In nav-sections.ts — add new section:
const EXAMPLES: NavSection = {
  label: "Examples",
  items: [
    { id: "example-dashboard", label: "Dashboard", path: "/examples/dashboard" },
    { id: "example-settings", label: "Settings", path: "/examples/settings" },
    { id: "example-form", label: "Form States", path: "/examples/form" },
  ],
};

export const NAV_SECTIONS: NavSection[] = [
  FORMS,
  DATA_DISPLAY,
  NAVIGATION,
  FEEDBACK,
  OVERLAYS,
  LAYOUT,
  TOKENS,
  EXAMPLES,   // append at end
];
```

### Anti-Patterns to Avoid

- **Using useState for multi-state panels:** The requirement is "visible without JavaScript interaction." State-driven tabs or toggles violate this. Render all panels as siblings.
- **Lorem ipsum or test data:** Requirement explicitly forbids it. Use hospitality domain data (guest names, reservation IDs, room types, check-in dates, amounts).
- **Interactive prop editor:** Explicitly out of scope per REQUIREMENTS.md.
- **Storybook patterns:** Out of scope per REQUIREMENTS.md.
- **Tooltip-only annotations:** Annotations must be visible without hover — render them as always-visible aside elements.
- **Hardcoded colors or spacing:** Use `var(--rialto-*)` tokens exclusively. Never `#hex` or raw `px` values.
- **Physical CSS properties:** Use `margin-inline-start` not `margin-left`, etc. — RTL requirement from CLAUDE.md.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Clipboard copy | Custom execCommand fallback | `navigator.clipboard.writeText()` | Supported in all modern browsers; async; no polyfill needed at this project's target |
| Loading state visuals | Custom shimmer CSS | `<Skeleton variant="card">` from @mbe/rialto | Already accessible, animated, token-aligned |
| Empty state visuals | Custom empty div | `<EmptyState>` from @mbe/rialto | Already handles icon + title + description pattern |
| Stats/KPIs | Custom metric display | `<Stat>` from @mbe/rialto | Has `label`, `value`, `delta`, `trend` props — exactly the KPI pattern |
| Data table | Custom HTML table | `<Table>` from @mbe/rialto | Has sorting, striping, custom cell render, density |
| Form layout | Custom fieldset CSS | `<Card variant="flat">` + `<Stack gap="md">` + `<Divider>` | Established section pattern in existing Dashboard demo |
| Page header | Custom heading div | `<PageHeader>` from @mbe/rialto | Has breadcrumbs, title, meta, and actions slots |

**Key insight:** All UI primitives are already in @mbe/rialto. Phase 7 is composition work, not component work. Never add a new Rialto component in this phase.

## Common Pitfalls

### Pitfall 1: Making multi-state panels interactive

**What goes wrong:** Developer uses `useState` with a tab or segmented control to switch between "empty", "loading", and "populated" views.
**Why it happens:** Interactive tabs feel natural for multi-state demos.
**How to avoid:** Re-read EXMP-08 — "visible without JavaScript interaction." Render all three panels as siblings, labeled with `<Text variant="caption">Empty state</Text>` etc.
**Warning signs:** If you reach for `useState` for the panel switcher, stop.

### Pitfall 2: JSX source string drifts from actual JSX

**What goes wrong:** The `DASHBOARD_EXAMPLE_JSX` constant is written once and then the actual component JSX is updated, but the string is not.
**Why it happens:** Two sources of truth diverge silently.
**How to avoid:** Keep the source string at the top of the file directly above the component. Add a comment: `// Keep in sync with component below`. The planner should treat these as paired artifacts.

### Pitfall 3: Hardcoded colors in example pages

**What goes wrong:** Developer writes `color: "#1a1918"` or `background: "#f5f3f0"` in CSS modules.
**Why it happens:** Example pages feel like "app code" not "library code" — but they still run inside RialtoProvider and must use tokens.
**How to avoid:** All CSS values must use `var(--rialto-*)`. The CLAUDE.md for rialto is explicit: "Never hardcode colors."

### Pitfall 4: Example pages use `DemoLayout` instead of `ShowcaseLayout`

**What goes wrong:** Routes are added under `<Route element={<DemoLayout />}>` — the full-page shell without sidebar.
**Why it happens:** Existing "demos" live under DemoLayout. Example pages sound like demos.
**How to avoid:** Example pages live under `ShowcaseLayout` (with sidebar) so they're discoverable from the component nav. The `/examples/*` routes go inside the existing `<Route element={<ShowcaseLayout ...>}>` group.

### Pitfall 5: Annotations hidden behind hover/click

**What goes wrong:** Composition notes rendered as `<Tooltip>` or hidden in a collapsible.
**Why it happens:** Tooltips feel "clean" and less cluttered.
**How to avoid:** Annotations must be always-visible. Use an `<aside>` element with `CompositionNote` styling — a muted callout box adjacent to the composition panel.

### Pitfall 6: navigator.clipboard unavailable in non-secure contexts

**What goes wrong:** Copy button silently fails on HTTP localhost or in test environments.
**Why it happens:** `navigator.clipboard` requires HTTPS or localhost.
**How to avoid:** Wrap in try/catch; the dev server runs on localhost so this is safe in development. Add `aria-live` feedback: the button label changes to "Copied!" for 2 seconds.

## Code Examples

### Realistic domain data for Settings page

```typescript
// Use hospitality operations domain — matches the project's hospitality app
const USER_PROFILE = {
  name: "Marcus Winters",
  email: "m.winters@grandlakehotel.com",
  role: "Operations Manager",
  timezone: "America/Chicago",
  notifications: { bookingAlerts: true, maintenanceAlerts: false, revenueReports: true },
};
```

### Realistic domain data for Dashboard page (EXMP-01)

```typescript
// KPI cards with Stat component
const KPI_DATA = [
  { label: "Rooms Occupied", value: "142", delta: "+8", trend: "up" as const },
  { label: "Avg Daily Rate", value: "$287", delta: "-$12", trend: "down" as const },
  { label: "RevPAR", value: "$204", delta: "+$6", trend: "up" as const },
  { label: "Guest Satisfaction", value: "4.7", delta: "+0.2", trend: "up" as const },
];

// DataTable rows
const RESERVATION_DATA = [
  { id: "RES-1041", guest: "Elena Marchetti", room: "Suite 402", checkIn: "Mar 22", nights: 3, status: "Confirmed" },
  { id: "RES-1042", guest: "David Okonkwo",   room: "Deluxe 218", checkIn: "Mar 22", nights: 1, status: "Checked In" },
  { id: "RES-1043", guest: "Sophie Laurent",  room: "Standard 115", checkIn: "Mar 23", nights: 2, status: "Pending" },
  { id: "RES-1044", guest: "James Nakamura",  room: "Suite 501", checkIn: "Mar 24", nights: 4, status: "Confirmed" },
];
```

### Realistic domain data for Form States page (EXMP-03)

```typescript
// Four Input variants rendered as siblings — no state, no interaction needed
<Stack gap="xl">
  {/* Default state */}
  <Input label="Guest Name" placeholder="Full name" />

  {/* Error state */}
  <Input label="Email Address" value="invalid-email" error hint="Enter a valid email address" readOnly />

  {/* Disabled state */}
  <Input label="Reservation ID" value="RES-1041" disabled disabledReason="Reservation IDs cannot be edited" />

  {/* Loading — Button shows loading state alongside Input */}
  <Stack direction="row" align="flex-end" gap="sm">
    <Input label="Promo Code" placeholder="SUMMER25" />
    <Button variant="secondary" size="md" loading>Verify</Button>
  </Stack>
</Stack>
```

### Copy-to-clipboard button with accessible feedback

```typescript
// Source: browser Clipboard API — no library needed
const [copied, setCopied] = useState(false);

async function handleCopy() {
  try {
    await navigator.clipboard.writeText(sourceJsx);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  } catch {
    // Clipboard unavailable — silently fail; button simply doesn't respond
  }
}

return (
  <Button variant="secondary" size="sm" onClick={handleCopy} aria-live="polite">
    {copied ? "Copied!" : "Copy JSX"}
  </Button>
);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `execCommand('copy')` | `navigator.clipboard.writeText()` | ~2020 (broad support) | Async, Promise-based, no selection manipulation needed |
| Storybook for component demos | Custom showcase (rialto-web) | Project decision | Already in place; Storybook explicitly out of scope |
| Interactive knobs for states | Static sibling panels | EXMP-08 requirement | All states always visible; no interaction required |

## Open Questions

1. **Button `loading` prop existence**
   - What we know: The requirements mention "loading state" for EXMP-03; `Button` has `variant`, `size`, `disabled` props confirmed from ButtonPage source
   - What's unclear: Whether `Button` has a `loading` prop — it was not visible in the ButtonPage props table read above
   - Recommendation: Check `Button.tsx` source before implementing EXMP-03. If no `loading` prop exists, represent loading state with a `Spinner` next to the Button instead.

2. **`ExamplePageLayout` vs reusing `ComponentPageLayout`**
   - What we know: `ComponentPageLayout` has `name` + `description` + `children`; no copy button or annotation slots
   - What's unclear: Whether to extend it or create a new layout
   - Recommendation: Create a new `ExamplePageLayout` — different responsibility, don't modify existing shared component

3. **Where to place annotation notes — inline or sidebar**
   - What we know: Requirement says "annotated composition notes explain why components are combined" — no layout specified
   - What's unclear: Whether notes appear as a sidebar panel or inline below each composition block
   - Recommendation: Inline below each composition panel (consistent with how `<Section>` + caption works in existing component pages); simpler, no layout change needed

## Sources

### Primary (HIGH confidence)
- Direct code read: `apps/rialto-web/src/routes.tsx` — full route structure
- Direct code read: `apps/rialto-web/src/layouts/ShowcaseLayout.tsx` — shell layout
- Direct code read: `apps/rialto-web/src/layouts/DemoLayout.tsx` — demo layout pattern
- Direct code read: `apps/rialto-web/src/data/nav-sections.ts` — nav section data structure
- Direct code read: `apps/rialto-web/src/pages/dashboard/Dashboard.tsx` — full-page composition reference
- Direct code read: `apps/rialto-web/src/pages/forms/ButtonPage.tsx` — showcase page pattern
- Direct code read: `apps/rialto-web/src/pages/components/ComponentPageLayout.tsx` — shared layout
- Direct code read: `apps/rialto-web/src/components/ShowcaseSidebar.tsx` — nav section rendering
- Direct code read: `packages/rialto/src/components/Stat/Stat.tsx` — Stat API
- Direct code read: `packages/rialto/src/components/Table/Table.tsx` — Table API (Column, TableProps)
- Direct code read: `packages/rialto/src/components/Input/Input.tsx` — Input API
- Direct code read: `packages/rialto/CLAUDE.md` — token rules, file conventions, RTL requirements
- Direct code read: `apps/rialto-web/vite.config.ts` — `base: "/rialto/"` confirmed
- Direct code read: `.planning/REQUIREMENTS.md` — EXMP-01 through EXMP-08

### Secondary (MEDIUM confidence)
- MDN: `navigator.clipboard.writeText()` — standard Clipboard API, requires secure context (HTTPS or localhost)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all from direct code reads; no new libraries needed
- Architecture patterns: HIGH — directly modeled on existing routes.tsx, ShowcaseSidebar, and DemoLayout patterns in the codebase
- Pitfalls: HIGH — derived from explicit requirement language and existing code conventions; one LOW item is the Button `loading` prop (needs verification)

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable codebase, no fast-moving external dependencies)
