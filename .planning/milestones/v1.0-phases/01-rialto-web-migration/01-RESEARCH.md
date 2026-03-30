# Phase 1: Rialto-Web Migration - Research

**Researched:** 2026-02-28
**Domain:** React/Vite SPA restructuring, design-system-first architecture, path-prefix SPA routing
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Component Organization**
- Sidebar navigation with collapsible functional categories (Forms, Layout, Navigation, Feedback, Data Display, Overlays, etc.)
- Each component gets its own dedicated page (click "Button" in sidebar → full Button page)
- Categories organized by function (how Radix/Shadcn does it)
- Overview landing page with quick stats (component count, token count), category previews, and getting started info

**Theme Switching**
- Light + Dark mode only (no custom vibes in v1)
- Sun/moon toggle icon in the header/navbar — always accessible
- Theme choice persists in localStorage across visits
- First visit detects OS preference via `prefers-color-scheme`; after manual toggle, saved preference takes precedence

**Component Demos**
- Each component page shows: all visual variants (sizes, colors), all states (hover, disabled, loading, error), AND real-world usage examples (e.g., Button in a form, Card in a grid)
- Interactive props playground — knobs/controls to change props live and see the result
- Pre-built static examples showing key patterns alongside the playground
- Full props/API table per component: prop name, type, default value, description
- Dedicated accessibility section per component: ARIA attributes, keyboard navigation, screen reader behavior

**Page Layout and Feel**
- Rich and polished visual personality — not minimal, the showcase should feel branded and intentional
- "Eat your own cooking" — use Rialto's own Navbar, Sidebar, Footer, and other components to build the showcase itself
- Subtle animations only — page transitions and interactive effects should not distract from the components
- Footer with cross-links to marketing site (mattbutlerengineering.com), hospitality app (/hospitality), and GitHub repo

### Claude's Discretion
- Exact category groupings for the 55+ components
- Component page layout structure and spacing
- Props playground implementation approach
- Sidebar collapse/expand behavior on mobile
- Loading states and error boundaries

### Deferred Ideas (OUT OF SCOPE)
- Code snippets with syntax highlighting — v2 (RIALTO-V2-01)
- Icon search and browser — v2 (RIALTO-V2-02)
- Token visualization (colors, spacing, typography) — v2 (RIALTO-V2-03)
- Custom vibes/themes beyond light+dark — future enhancement
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| RIALTO-01 | All 55 Rialto components are visible with interactive states in the showcase app | Component inventory complete; routing architecture defined |
| RIALTO-02 | RialtoProvider wraps the app with theme context | RialtoProvider API documented; theme prop usage pattern clear |
| RIALTO-03 | Theme/vibe switcher allows toggling between themes | localStorage persistence pattern; OS detection via useDeviceContext |
| RIALTO-04 | All Tailwind CSS removed — Rialto-only styling throughout | Tailwind was never installed in rialto-web; only 2 stray className strings remain |
| RIALTO-05 | App served at mattbutlerengineering.com/rialto with working client-side routing | Vite base already set to /rialto/; Pulumi ingress rule missing for /rialto — must be added |
</phase_requirements>

---

## Summary

The rialto-web app already has excellent bones. It is a React 19 + Vite 7 + React Router 7 SPA with `base: "/rialto/"` set in vite.config.ts, `BrowserRouter basename="/rialto"` in main.tsx, and Rialto styles imported via `@mbe/rialto/styles`. Tailwind was **never installed** in rialto-web — it exists only in apps/marketing and apps/dashboard. There are exactly two stray Tailwind-style className strings to fix: `className="w-full"` on a Button in App.tsx and `className="accent"` on a span in LayoutDemo.tsx.

The structural work is the real task. The current App.tsx (3,974 lines) is a monolithic single-page scrolling showcase. The locked decisions call for a sidebar-nav architecture with per-component dedicated pages. This is a full restructure of the app's routing and layout — not a simple find-and-replace. The existing content (all 55+ component demos) is already written; it must be migrated into the new per-page structure.

The Pulumi ingress rules in infrastructure/pulumi/index.ts currently route `/dashboard` and `/` only — there is no `/rialto` rule. Without it, `mattbutlerengineering.com/rialto/*` will fall through to the marketing site catch-all. Adding the ingress rule is required for RIALTO-05 but is also touched by Phase 2 (which adds `/hospitality`). Plan 01-03 must add the `/rialto` rule.

**Primary recommendation:** Treat this as a routing/architecture restructure. The demo content exists. The job is to split the 3,974-line App.tsx into a sidebar-nav shell + 55+ individual component route pages, add the Pulumi ingress rule, and remove the 2 stray Tailwind classNames.

---

## Standard Stack

### Core (already installed — no additions needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@mbe/rialto` | workspace:* | Design system — all components, tokens, styles | This IS the subject of the showcase |
| `react` | 19.2.4 | UI library | Project standard |
| `react-router-dom` | 7.13.0 | Client-side routing | Already wired with correct basename |
| `framer-motion` | 12.34.0 | Animation | Rialto peer dep; used in App.tsx already |
| `vite` | 7.3.1 | Build + dev server | Project standard |
| `vite-plugin-pwa` | ^1.2.0 | PWA manifest | Already configured with /rialto scope |

### No new dependencies needed

All required libraries are already installed. This phase is pure restructuring — no `npm install` commands.

**Installation:**
```bash
# Nothing to install — all deps are present
```

---

## Architecture Patterns

### Current State (what exists)

```
apps/rialto-web/src/
├── main.tsx              # Entry: BrowserRouter basename="/rialto", @mbe/rialto/styles, ToastProvider
├── global.css            # Body font/color defaults using Rialto tokens; Google Font imports
├── showcase/
│   ├── App.tsx           # 3,974-line monolithic scrolling showcase (MUST BE REPLACED)
│   └── App.module.css    # 1,129-line CSS modules file — already Rialto-token-only
├── layouts/
│   ├── DemoLayout.tsx    # RialtoProvider wrapper + FloatingControls (theme/vibe/RTL toggles)
│   └── DemoLayout.module.css
└── pages/               # Existing demo pages — keep as-is, they are already Rialto-only
    ├── auth/            # SignIn, SignUp using Rialto components + CSS modules
    ├── dashboard/       # Dashboard using Rialto components + CSS modules
    ├── drivers/         # CRUD demo pages
    ├── teams/           # TeamCreate
    ├── layouts/         # LayoutDemo
    └── visual-test/     # VisualTest
```

### Target State (what to build)

```
apps/rialto-web/src/
├── main.tsx              # UPDATED: Add RialtoProvider at root; update routes for new structure
├── global.css            # KEEP: no changes needed
├── layouts/
│   └── ShowcaseLayout.tsx  # NEW: Rialto Navbar + Sidebar + Outlet + theme toggle in header
├── components/
│   └── ThemeToggle.tsx     # NEW: Sun/moon toggle that persists to localStorage
├── pages/
│   ├── OverviewPage.tsx    # NEW: Landing with stats, category previews, getting started
│   ├── forms/             # NEW: ButtonPage, InputPage, SelectPage, etc.
│   ├── data/              # NEW: CardPage, TablePage, BadgePage, etc.
│   ├── navigation/        # NEW: TabsPage, BreadcrumbPage, SidebarPage, etc.
│   ├── feedback/          # NEW: AlertPage, ToastPage, ProgressPage, etc.
│   ├── overlays/          # NEW: DialogPage, DrawerPage, TooltipPage, etc.
│   ├── layout/            # NEW: StackPage, TextPage, DividerPage, etc.
│   └── demos/             # KEEP: Existing full-page demos (auth, dashboard, drivers, etc.)
└── routes.tsx             # NEW: Route definitions extracted from main.tsx
```

### Pattern 1: RialtoProvider Placement

**What:** RialtoProvider must wrap the entire app at the root, not per-route. Theme state lives here.

**When to use:** Always — single provider at the top.

```typescript
// Source: packages/rialto/src/providers/RialtoProvider.tsx
// main.tsx — correct placement
import { RialtoProvider } from "@mbe/rialto";
import "@mbe/rialto/styles";   // tokens/reset CSS — must come before app CSS
import "./global.css";          // body defaults using --rialto-* tokens

// Theme state hoisted to root so Navbar toggle can affect entire tree
function Root() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("rialto-theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    localStorage.setItem("rialto-theme", theme);
  }, [theme]);

  return (
    <RialtoProvider theme={theme}>
      <BrowserRouter basename="/rialto">
        <ToastProvider>
          {/* routes */}
        </ToastProvider>
      </BrowserRouter>
    </RialtoProvider>
  );
}
```

**Key insight:** RialtoProvider renders a `<div data-theme={resolvedTheme}>` that gates CSS token cascading. Everything inside it gets correct light/dark tokens. The `theme` prop accepts `"light" | "dark" | "system"`. For v1, pass `"light"` or `"dark"` directly (no `"system"` — user controls it manually after first visit).

### Pattern 2: ShowcaseLayout with Rialto Sidebar + Navbar

**What:** The app shell built entirely from Rialto's own Sidebar and Navbar components.

**When to use:** All component showcase routes — not the demo pages (which have their own layouts).

```typescript
// Source: packages/rialto/src/components/Sidebar/Sidebar.tsx
// packages/rialto/src/components/Navbar/Navbar.tsx
import { Navbar, Sidebar, type SidebarSection } from "@mbe/rialto";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

const NAV_SECTIONS: SidebarSection[] = [
  {
    label: "Forms",
    items: [
      { id: "button",   label: "Button",   href: "/components/button" },
      { id: "input",    label: "Input",    href: "/components/input" },
      // ... etc
    ],
  },
  // ... other categories
];

export function ShowcaseLayout({ theme, onThemeToggle }) {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  // Mark active item based on current route
  const sections = NAV_SECTIONS.map(section => ({
    ...section,
    items: section.items.map(item => ({
      ...item,
      active: location.pathname === item.href,
    })),
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
      <Navbar
        logo={<span>Rialto</span>}
        links={[]}
        actions={<ThemeToggle theme={theme} onToggle={onThemeToggle} />}
      />
      <div style={{ display: "flex", flex: 1 }}>
        <Sidebar
          sections={sections}
          collapsed={collapsed}
          onCollapse={() => setCollapsed(v => !v)}
        />
        <main style={{ flex: 1, overflowY: "auto" }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

### Pattern 3: Per-Component Page Structure

**What:** Each component gets its own route and page file.

**When to use:** All 55+ components.

```typescript
// src/pages/forms/ButtonPage.tsx
import { Button, Stack, Text } from "@mbe/rialto";

export function ButtonPage() {
  return (
    <div>
      {/* 1. Variants section */}
      {/* 2. States section (disabled, loading) */}
      {/* 3. Real-world usage example */}
      {/* 4. Interactive playground (Claude's discretion) */}
      {/* 5. Props/API table */}
      {/* 6. Accessibility section */}
    </div>
  );
}
```

### Pattern 4: Theme Toggle (localStorage Persistence)

**What:** Sun/moon button in Navbar that reads OS preference on first visit, then persists manual choice.

```typescript
// src/components/ThemeToggle.tsx
// Pattern already exists in DemoLayout.tsx — extract and simplify
export function ThemeToggle({ theme, onToggle }: { theme: "light" | "dark"; onToggle: () => void }) {
  return (
    <button onClick={onToggle} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
      {/* Sun icon for dark mode (click to go light), moon for light mode */}
    </button>
  );
}
```

**Initialization (first visit → OS preference, subsequent → localStorage):**
```typescript
const [theme, setTheme] = useState<"light" | "dark">(() => {
  if (typeof window === "undefined") return "light";
  const saved = localStorage.getItem("rialto-theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
});
```

### Pattern 5: Path-Prefix Routing (Vite + React Router + Pulumi)

**What:** Three-way alignment between Vite build output, client-side router, and CDN/platform ingress.

**Already correct in rialto-web:**
- `vite.config.ts`: `base: "/rialto/"` — all asset URLs prefixed
- `main.tsx`: `BrowserRouter basename="/rialto"` — all Link hrefs relative to /rialto
- PWA: `scope: "/rialto/"`, `navigateFallback: "/rialto/index.html"` — SW intercepts correctly

**Missing — must add in Plan 01-03:**
```typescript
// infrastructure/pulumi/index.ts — add BEFORE the "/" catch-all rule
{
  match: { path: { prefix: "/rialto" } },
  component: {
    name: "rialto-web",
    preservePathPrefix: false,  // Strip /rialto before serving static files
  },
},
```

**New static site entry:**
```typescript
{
  name: "rialto-web",
  github: { repo: "mattbutlerengineering/mattbutlerengineering", branch: "main", deployOnPush: true },
  sourceDir: "/",
  buildCommand: "pnpm build --filter=@mbe/rialto-web",
  outputDir: "apps/rialto-web/dist",
  catchallDocument: "index.html",   // SPA fallback — returns index.html for any sub-path
},
```

### Anti-Patterns to Avoid

- **RialtoProvider per-route:** Wrapping individual routes in RialtoProvider creates isolated theme contexts. Theme changes in one won't propagate to another. Put it at the root, outside BrowserRouter.
- **Importing Tailwind anywhere:** rialto-web has no tailwind.config.js, no postcss.config.js. Do not add them. `className="w-full"` does nothing (no Tailwind processing) — but it must still be removed to pass the RIALTO-04 grep check.
- **Duplicating global.css content:** `@mbe/rialto/styles` imports tokens + reset. `global.css` adds only body font defaults. Do not re-declare reset rules or token imports in component files.
- **Using `dir` attribute at wrong scope:** The RTL toggle in the current app sets `dir` on the RialtoProvider's inner div. For v1, drop RTL controls from the new showcase — they exist in the demo pages for Rialto lib testing, not in the public-facing showcase.
- **Missing catchallDocument:** Without `catchallDocument: "index.html"` in the DigitalOcean static site config, direct navigation to `/rialto/components/button` will 404 (the platform serves a 404 instead of letting React Router handle it).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Theme toggle persistence | Custom localStorage hook | Plain `useState` + `useEffect` + `localStorage.getItem/setItem` | Simple enough; pattern already exists in DemoLayout.tsx |
| Sidebar navigation | Custom nav component | Rialto `Sidebar` component | Already supports sections, collapsed state, active items, spring animation |
| Top navigation bar | Custom header | Rialto `Navbar` component | Already supports logo, links, actions slot, dark mode-aware |
| Page loading fallback | Custom spinner wrapper | Rialto `Spinner` inside `Suspense` | `<Spinner size="lg" label="Loading…" />` — pattern already in main.tsx |
| Section separators | Custom divider element | Rialto `Divider` component | Theme-aware, spacing variants |
| Props API table | Custom table component | Rialto `Table` component | Already generic `Table<T>` with sorting |
| Toast notifications | Custom notification system | Rialto `useToast` + `ToastProvider` | Already wired in main.tsx |
| SPA 404 fallback | Custom nginx/server config | `catchallDocument: "index.html"` in Pulumi static site spec | DigitalOcean App Platform handles this natively |

**Key insight:** The "eat your own cooking" constraint is both a design decision and a testing strategy. Using Rialto's Sidebar and Navbar to build the showcase app proves they work in a real app — any layout bug surfaces immediately.

---

## Common Pitfalls

### Pitfall 1: Tailwind className String Does Nothing — But Still Fails the Grep

**What goes wrong:** `className="w-full"` on Button in App.tsx line 1991 has zero visual effect (no Tailwind is installed in rialto-web). But RIALTO-04 success criterion is "grep returns zero matches for Tailwind classes." A naked `w-full` string will trigger the grep.

**Why it happens:** The class was likely added by habit or copy-paste. Since Tailwind isn't installed, no processing happens.

**How to avoid:** Replace with a CSS module class or an inline style. For a full-width button, use a wrapper `div` with `style={{ width: "100%" }}` or create a `.fullWidth` class in the component's CSS module. Do not add `w-full` to any CSS module name.

**Warning signs:** Any `className="[a-z]"` usage that doesn't reference `styles.something` or `clsx(styles.something)`.

### Pitfall 2: Pulumi `/rialto` Rule Missing = Silent Production Failure

**What goes wrong:** The app builds and serves perfectly on localhost. But `mattbutlerengineering.com/rialto` 404s because the Pulumi ingress has no rule for `/rialto`. The marketing site catch-all intercepts it.

**Why it happens:** Vite `base` and React Router `basename` control the *client side*. The *server/CDN* must also route `/rialto/*` to the correct static site and then fall back to `index.html` for sub-paths.

**How to avoid:** Add the `/rialto` ingress rule and a `rialto-web` static site entry in `infrastructure/pulumi/index.ts` in Plan 01-03. Verify `preservePathPrefix: false` is set (same pattern as the existing `dashboard` rule).

**Warning signs:** Direct navigation to `mattbutlerengineering.com/rialto/components/button` shows the marketing site. Or the page loads but assets 404 (wrong base path in build).

### Pitfall 3: RialtoProvider Outside BrowserRouter = Theme Context Lost on Navigation

**What goes wrong:** If RialtoProvider is inside BrowserRouter but outside the route tree, theme changes work. But if it's placed per-route (inside individual `<Route element={…}>`), each route gets a fresh provider instance with its own state — theme resets on every navigation.

**Why it happens:** React context is scoped to the subtree it wraps. Route transitions unmount and remount components.

**How to avoid:** RialtoProvider must be the outermost wrapper, before BrowserRouter or wrapping BrowserRouter. The current DemoLayout.tsx puts RialtoProvider inside the route tree — this works for isolated demo pages but the new ShowcaseLayout must be outside.

### Pitfall 4: `@mbe/rialto/styles` Must Be Imported Once, First

**What goes wrong:** Importing `@mbe/rialto/styles` multiple times (e.g., in both main.tsx and a component file) doesn't cause errors but can cause subtle cascade issues if Vite deduplication puts them in different chunks.

**Why it happens:** CSS import order matters. Token CSS must load before component CSS (which references the tokens).

**How to avoid:** Import `@mbe/rialto/styles` once, at the top of `main.tsx`, before `./global.css`. Never import it again in any other file.

### Pitfall 5: Monolithic App.tsx Split Loses Existing Demo State

**What goes wrong:** The existing App.tsx has 30+ `useState` hooks managing demo interactions (dialog open/close, toggle states, pagination pages, etc.). When splitting into per-component pages, these states belong *per page*, not at the root.

**Why it happens:** Monolithic approach co-locates all state. Extracted pages need their own local state.

**How to avoid:** Each component page file manages its own demo state locally. No shared state needed between pages (theme state is the only shared state, managed at root via RialtoProvider).

### Pitfall 6: Sidebar `active` Item Must Track Route

**What goes wrong:** Rialto's Sidebar accepts an `active` boolean per item. If not wired to React Router's current location, no item appears selected.

**Why it happens:** Sidebar has no router awareness — it's a presentational component.

**How to avoid:** In ShowcaseLayout, use React Router's `useLocation()` to compare `location.pathname` against each item's `href`. Mark `active: true` for the matching item.

```typescript
// Source: packages/rialto/src/components/Sidebar/Sidebar.tsx
// SidebarItem.active — boolean, sets accent highlight
const activeId = location.pathname.split("/").pop();
items.map(item => ({ ...item, active: item.id === activeId }))
```

---

## Code Examples

### RialtoProvider at Root with Theme Persistence

```typescript
// Source: packages/rialto/src/providers/RialtoProvider.tsx
// props: vibe, theme ("light" | "dark" | "system"), children
// renders: <div data-theme={resolvedTheme} style={vibeOverrides}>

// main.tsx — correct root pattern
import { StrictMode, useState, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { RialtoProvider, ToastProvider, Spinner } from "@mbe/rialto";
import "@mbe/rialto/styles";
import "./global.css";

function Root() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    const saved = localStorage.getItem("rialto-theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    localStorage.setItem("rialto-theme", theme);
  }, [theme]);

  return (
    <RialtoProvider theme={theme}>
      <BrowserRouter basename="/rialto">
        <ToastProvider>
          <ShowcaseRouter theme={theme} onThemeToggle={() => setTheme(t => t === "dark" ? "light" : "dark")} />
        </ToastProvider>
      </BrowserRouter>
    </RialtoProvider>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Root /></StrictMode>);
```

### Removing the Two Stray Tailwind classNames

```typescript
// BEFORE (App.tsx line ~1991):
<Button variant="ghost" size="sm" className="w-full">
  Sign Out
</Button>

// AFTER — inline style for width, no className:
<Button variant="ghost" size="sm" style={{ width: "100%" }}>
  Sign Out
</Button>

// BEFORE (LayoutDemo.tsx line 51):
Build pages with <span className="accent">precision</span>

// AFTER — use Rialto Text with color prop, or inline style:
Build pages with <span style={{ color: "var(--rialto-accent)" }}>precision</span>
```

### Sidebar Navigation with Active Route Tracking

```typescript
// Source: packages/rialto/src/components/Sidebar/Sidebar.tsx
import { Sidebar, type SidebarSection } from "@mbe/rialto";
import { useLocation } from "react-router-dom";

const BASE_SECTIONS: SidebarSection[] = [
  {
    label: "Forms",
    items: [
      { id: "button",   label: "Button",   href: "/components/button" },
      { id: "input",    label: "Input",    href: "/components/input" },
      // ... rest of form components
    ],
  },
  // ... other sections
];

export function ShowcaseSidebar({ collapsed, onCollapse }) {
  const location = useLocation();

  const sections = BASE_SECTIONS.map(section => ({
    ...section,
    items: section.items.map(item => ({
      ...item,
      active: location.pathname === item.href,
    })),
  }));

  return (
    <Sidebar
      sections={sections}
      collapsed={collapsed}
      onCollapse={onCollapse}
    />
  );
}
```

### Pulumi Ingress Rule for /rialto

```typescript
// Source: infrastructure/pulumi/index.ts
// Add this rule BEFORE the "/" catch-all, AFTER the "/dashboard" rule:
{
  match: {
    path: { prefix: "/rialto" },
  },
  component: {
    name: "rialto-web",
    preservePathPrefix: false,
  },
},

// Add this static site entry alongside "dashboard" and "marketing":
{
  name: "rialto-web",
  github: {
    repo: "mattbutlerengineering/mattbutlerengineering",
    branch: "main",
    deployOnPush: true,
  },
  sourceDir: "/",
  buildCommand: "pnpm build --filter=@mbe/rialto-web",
  outputDir: "apps/rialto-web/dist",
  catchallDocument: "index.html",
},
```

### Lazy-Loading Component Pages

```typescript
// main.tsx or routes.tsx — mirrors the existing lazy pattern in main.tsx
const ButtonPage = lazy(() => import("./pages/forms/ButtonPage").then(m => ({ default: m.ButtonPage })));
const InputPage  = lazy(() => import("./pages/forms/InputPage").then(m  => ({ default: m.InputPage })));

// In Routes:
<Route path="/components/button" element={<Suspense fallback={pageLoading}><ButtonPage /></Suspense>} />
```

### Component Inventory (all 55+ to showcase)

From `packages/rialto/llms.txt` and `packages/rialto/src/components/`:

| Category | Components |
|----------|-----------|
| Forms | Input, TextArea, NumberInput, Checkbox, Radio, RadioGroup, Toggle, Select, SegmentedControl, Slider, PinInput, Button (11) |
| Data Display | Card, Table, Badge, Tag, AnimatedTag, TagGroup, Avatar, AvatarGroup, Stat, DataList, Meter, Timeline, Tree, Kbd, DisabledTooltip (15) |
| Navigation | Tabs, Breadcrumb, Steps, Pagination, SegmentedControl, NavigationMenu, Sidebar, Navbar (8) |
| Feedback | Toast, Alert, Banner, Progress, Spinner, Skeleton, SkeletonGroup, EmptyState (8) |
| Overlays | Dialog, ConfirmDialog, Drawer, Popover, Tooltip, HoverCard, CommandPalette, DropdownMenu, ContextMenu (9) |
| Layout | Stack, Text, Divider, Collapsible, Accordion, AspectRatio, ScrollArea (7) |
| Layout (page-level) | Hero, Footer, PageHeader (3) |
| Icons | iconCategories, getIconsByCategory (token/utility) |

Total interactive components: ~61 (some share a page, e.g., Radio + RadioGroup, Tag + TagGroup + AnimatedTag)

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single scrolling showcase page | Per-component route pages with sidebar nav | This migration | Scales to 55+ components without UX degradation |
| Floating control panel for theme | Theme toggle in Navbar | This migration | Always accessible, matches standard app patterns |
| Tailwind for any layout | Rialto tokens + CSS Modules | Never installed in rialto-web | No migration needed — just fix 2 stray strings |
| RialtoProvider per layout | RialtoProvider at root | This migration | Theme context survives all route transitions |

**Deprecated/outdated in rialto-web after this phase:**
- `showcase/App.tsx` (monolithic) → replaced by `ShowcaseLayout.tsx` + per-page components
- `layouts/DemoLayout.tsx` FloatingControls exported function → theme toggle moves to Navbar; DemoLayout remains only for demo pages (auth, dashboard, etc.)
- The `activeVibe` state in App.tsx — vibes are dropped from v1 per locked decisions

---

## Open Questions

1. **Where does the existing visual-test page live?**
   - What we know: `/visual-test` route exists in main.tsx; it's a regression testing page for Rialto component rendering
   - What's unclear: Is this kept in the new structure or dropped?
   - Recommendation: Keep it as a hidden/unlisted route (`/visual-test`) — not in Sidebar navigation, but reachable by URL. It serves Rialto library development purposes.

2. **Does Sidebar component support `href` for React Router Links?**
   - What we know: Sidebar renders `<a href>` when `href` prop is set on a SidebarItem. React Router doesn't intercept native anchors by default unless the router's base matches.
   - What's unclear: Whether `<a href="/components/button">` inside `BrowserRouter basename="/rialto"` navigates correctly vs. causing a full page reload.
   - Recommendation: Check if Sidebar uses `<Link>` internally or plain `<a>`. If plain `<a>`, items with `href` will cause full-page reloads. May need to render Sidebar items as `<Link>` via a render prop or use `onClick` + `useNavigate` instead of `href`.

3. **Ingress ordering: /rialto before or after /dashboard?**
   - What we know: Pulumi ingress rules are matched first-match-wins; more specific prefixes first.
   - What's unclear: Whether `/rialto` and `/dashboard` order matters relative to each other (they're non-overlapping prefixes).
   - Recommendation: Add `/rialto` rule between the existing `/dashboard` rule and the `/` catch-all — consistent with the document comment "most-specific-first."

4. **preservePathPrefix behavior on DigitalOcean App Platform**
   - What we know: The existing `/dashboard` rule uses `preservePathPrefix: false`. STATE.md flags verifying this behavior in staging as a pre-Phase-1 concern.
   - What's unclear: Whether `preservePathPrefix: false` strips `/rialto` before serving static files (so the CDN serves `/index.html` instead of `/rialto/index.html`).
   - Recommendation: The Vite build already embeds `/rialto/` as the asset base. With `preservePathPrefix: false`, the CDN strips the prefix and serves `dist/` directly. Asset URLs in the built HTML already include `/rialto/` — so the stripping is transparent to the browser. This matches the pattern used for `/dashboard`. Proceed with `preservePathPrefix: false`.

---

## Sources

### Primary (HIGH confidence)

- `packages/rialto/src/providers/RialtoProvider.tsx` — RialtoProvider props API verified from source
- `packages/rialto/src/providers/vibes.ts` — VibeName type, vibes registry
- `packages/rialto/src/providers/useDeviceContext.ts` — OS color scheme detection via matchMedia
- `packages/rialto/src/components/Sidebar/Sidebar.tsx` — SidebarItem, SidebarSection interfaces
- `packages/rialto/src/components/Button/Button.tsx` — ButtonProps including className pass-through
- `packages/rialto/src/lib-entry.ts` — All exports; @mbe/rialto/styles import path
- `packages/rialto/src/styles-entry.css` — What @mbe/rialto/styles includes (tokens + reset)
- `apps/rialto-web/src/main.tsx` — Current routing structure, basename, imports
- `apps/rialto-web/src/showcase/App.tsx` — Current monolithic showcase (3,974 lines)
- `apps/rialto-web/src/layouts/DemoLayout.tsx` — Existing RialtoProvider + theme toggle pattern
- `apps/rialto-web/vite.config.ts` — `base: "/rialto/"`, PWA scope confirmed
- `infrastructure/pulumi/index.ts` — Current ingress rules; /rialto rule confirmed absent
- `packages/rialto/llms.txt` — Complete component catalog with props

### Secondary (MEDIUM confidence)

- DigitalOcean App Platform docs (inferred from existing `preservePathPrefix: false` pattern on /dashboard — same config must work for /rialto)
- CSS Modules `composes` pattern for surface recipes — documented in `packages/rialto/CLAUDE.md`

### Tertiary (LOW confidence)

- Sidebar `href` vs React Router `Link` behavior — open question #2 above; needs empirical verification

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified from package.json files directly; no new deps needed
- Architecture: HIGH — current structure fully read; target structure derived from locked decisions
- Tailwind status: HIGH — confirmed zero Tailwind config in rialto-web; exactly 2 stray className strings identified by line number
- Routing (Vite + RR): HIGH — vite.config.ts and main.tsx both confirmed correct for /rialto path
- Pulumi ingress: HIGH — /rialto rule confirmed absent; pattern to add is identical to existing /dashboard rule
- Pitfalls: HIGH — derived from reading actual source, not assumptions

**Research date:** 2026-02-28
**Valid until:** 2026-03-28 (stable libraries; Rialto is internal — changes tracked in-repo)
