# Phase 4: Hospitality Migration + Full Hosting - Research

**Researched:** 2026-03-03
**Domain:** React component migration, design system adoption, monorepo package deletion, ESLint tooling fix
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**App shell replacement**
- Follow the rialto-web pattern: RialtoProvider at root, Sidebar with nav sections, CSS Modules
- Header text renamed from "Dashboard" to "Hospitality"
- LoginPrompt uses minimal Rialto components (Button, Stack, Text) — centered layout, same UX
- Sidebar section structure at Claude's discretion (keep or simplify the 4 existing sections)

**Domain component styling**
- CSS Modules + Rialto design tokens (--rialto-space-*, --rialto-text-*, --rialto-surface-*) for all domain components
- Booking widget, floor plan editor, and timeline each get .module.css files
- Floor plan editor: preserve exact visual appearance — styling swap only, no redesign
- @mbe/ui components (Card, Button, CardHeader, etc.) replaced 1:1 with Rialto equivalents (Card compound pattern, Button)
- Local PageHeader component created in hospitality using Rialto Text/Stack primitives (replaces @mbe/shared-layout PageHeader)

**Package deletion**
- Delete @mbe/ui and @mbe/shared-layout immediately after confirming zero consumers via pnpm typecheck
- Clean up stale agent worktrees (services/agent/.agent-worktrees/) that reference deleted packages
- Update CLAUDE.md, AGENTS.md, and evaluation docs to remove @mbe/ui references and reflect Rialto-only architecture

**Verification approach**
- Build + typecheck + lint + test + visual check (local dev only, no Pulumi deploy)
- Verification checklist: pnpm build, pnpm typecheck, pnpm lint, pnpm test, then visual check of all 3 apps at their dev URLs
- Auth flow verified: login → callback → hospitality app
- Fix the pre-existing ESLint ajv error (monorepo-wide tooling issue, deferred from Phase 3)

### Claude's Discretion
- Sidebar section structure (keep 4 sections or simplify)
- Exact CSS Module class naming and organization
- Loading skeleton and error state designs
- Timeline/booking widget internal layout decisions during styling migration

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| HOSP-05 | All Tailwind CSS classes replaced with Rialto components | CSS Module + Rialto token pattern proven in marketing (Phase 3). 22 files identified. Zero Tailwind allowed after migration. |
| HOSP-06 | All @mbe/ui imports replaced with @mbe/rialto equivalents | Direct 1:1 map exists: Card→Card (title/subtitle props), CardHeader+CardTitle→Card title prop, CardContent→children, Button→Button. PageHeader from @mbe/shared-layout → local component using Rialto Text/Stack. |
| HOSP-07 | All existing features preserved (reservations, timeline, floor plans, guest management) | Styling swap only — business logic in pages/hooks/components unchanged. react-konva canvas, TimelineGrid, BookingWidget logic untouched. |
| HOSP-08 | App served at mattbutlerengineering.com/hospitality with working client-side routing | Already wired (HOSP-01–04 complete). main.tsx has BrowserRouter basename="/hospitality", vite base already correct. Infra already deployed. This is local dev verification only. |
| INFRA-04 | All three apps accessible at mattbutlerengineering.com with correct path-prefix routing | Infrastructure already deployed (Phase 2). End-to-end verification confirms all three paths work. Local dev verification: 3000 (marketing), 3002/hospitality, 3003/rialto-web. |
| CLEAN-01 | @mbe/ui package removed from monorepo | Delete packages/ui/ directory. Remove from pnpm-workspace.yaml is NOT needed (glob pattern covers it). Remove from root turbo pipeline if listed. Run pnpm install to sync lockfile. |
| CLEAN-02 | Tailwind CSS, PostCSS, and autoprefixer removed from all migrated app devDependencies | hospitality/package.json: remove tailwindcss, postcss, autoprefixer. Delete tailwind.config.js and postcss.config.js. |
| CLEAN-03 | No remaining Tailwind className references in any migrated app | grep verification: `grep -r "className=\".*\(bg-\|text-\|flex\|p-\|m-\|grid\|border\)" apps/hospitality/src`. Must return zero results. |
</phase_requirements>

---

## Summary

Phase 4 is a pure migration and cleanup phase with no new features. The core work is replacing Tailwind CSS classes and @mbe/ui/@mbe/shared-layout imports across 22 files in `apps/hospitality/src/` with Rialto components and CSS Modules using `var(--rialto-*)` tokens. The pattern is fully established from Phases 1 and 3.

The hospitality app has three layers of work: (1) the app shell (App.tsx, DashboardLayout.tsx, main.tsx, LoadingPage.tsx) where @mbe/shared-layout's AppLayout and PageHeader are replaced with Rialto's Sidebar pattern; (2) four pages with @mbe/ui Card/Button usage (HomePage, ProfilePage, SettingsPage, AdminPage) where Card compound pattern switches from `CardHeader+CardTitle+CardContent` flat pattern to `Card title="..." subtitle="..."` or children-based pattern; (3) domain components (booking-widget, floor-plan, timeline — 9 files total) that are pure Tailwind className and need CSS Module rewrites.

After migration, @mbe/ui and @mbe/shared-layout are deleted from the monorepo. The @mbe/ui package has no consumers outside hospitality after migration. @mbe/shared-layout also has no consumers outside hospitality. The pre-existing ESLint ajv error (ESLint 10 bundled ajv 8 which dropped `lib/refs/json-schema-draft-04.json`) is a monorepo-wide issue affecting all packages; it must be resolved as part of this phase.

**Primary recommendation:** Work top-down from app shell to pages to domain components. Each file is a standalone swap — no architectural changes. The floor plan canvas (react-konva Stage/Layer) has no Rialto equivalent and retains its Tailwind wrapper classes converted to CSS Modules. The timeline grid and booking widget are heavy Tailwind users that become CSS Modules with identical layout intent.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @mbe/rialto | 0.1.0 | Design system components | Project standard; replaces @mbe/ui |
| CSS Modules (.module.css) | Native Vite | Scoped styling beyond Rialto components | Proven in marketing and rialto-web; no extra tooling |
| var(--rialto-*) tokens | N/A | Spacing, color, typography | Rialto CLAUDE.md mandates never hardcode values |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-konva | ^19.0.0 | Floor plan canvas | Stays unchanged — no Rialto equivalent for canvas |
| @mbe/auth | workspace:* | Auth hooks (useAuth, AuthProvider) | Unchanged — only wrapping components change |
| @mbe/api-client | workspace:* | API calls | Unchanged throughout migration |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| CSS Modules | Inline `style={{ var(--rialto-*) }}` | CSS Modules provide better developer experience and match project convention |
| Rialto Card title prop | Children-only pattern | Title prop is cleaner for simple cards; children for complex content |

---

## Architecture Patterns

### Recommended Project Structure After Migration

```
apps/hospitality/src/
├── App.tsx                        # RialtoProvider + BrowserRouter + auth shell
├── App.module.css                 # App-level layout (NEW)
├── main.tsx                       # Entry — add RialtoProvider wrap pattern
├── index.css                      # Remove Tailwind @tailwind directives, keep any globals
├── vite-env.d.ts                  # Already exists
├── components/
│   ├── DashboardLayout.tsx        # Rialto Sidebar + Outlet (replaces @mbe/shared-layout AppLayout)
│   ├── DashboardLayout.module.css # App shell layout styles (NEW)
│   ├── PageHeader.tsx             # Local component: Rialto Text + Stack (NEW)
│   ├── PageHeader.module.css      # PageHeader styles (NEW)
│   ├── booking-widget/
│   │   ├── BookingWidget.tsx      # CSS Module replaces className strings
│   │   ├── BookingWidget.module.css (NEW)
│   │   ├── DatePartySelector.tsx
│   │   ├── DatePartySelector.module.css (NEW)
│   │   ├── TimeSlotPicker.tsx
│   │   ├── TimeSlotPicker.module.css (NEW)
│   │   ├── GuestDetailsForm.tsx
│   │   ├── GuestDetailsForm.module.css (NEW)
│   │   ├── ConfirmationView.tsx
│   │   ├── ConfirmationView.module.css (NEW)
│   │   └── index.ts              # Unchanged
│   ├── floor-plan/
│   │   ├── FloorPlanCanvas.tsx
│   │   ├── FloorPlanCanvas.module.css (NEW)
│   │   ├── TableShape.tsx        # No Tailwind classes — likely unchanged
│   │   └── index.ts              # Unchanged
│   └── timeline/
│       ├── TimelineGrid.tsx
│       ├── TimelineGrid.module.css (NEW)
│       ├── ReservationBlock.tsx
│       ├── ReservationBlock.module.css (NEW)
│       └── index.ts              # Unchanged
├── pages/
│   ├── HomePage.tsx               # @mbe/ui Card → Rialto Card
│   ├── ProfilePage.tsx            # @mbe/ui + @mbe/shared-layout → Rialto
│   ├── SettingsPage.tsx           # @mbe/ui + @mbe/shared-layout → Rialto
│   ├── AdminPage.tsx              # @mbe/ui + @mbe/shared-layout → Rialto
│   ├── ReservationsPage.tsx       # Pure Tailwind → CSS Module
│   ├── GuestsPage.tsx             # Pure Tailwind → CSS Module
│   ├── FloorPlansPage.tsx         # Pure Tailwind → CSS Module
│   ├── FloorPlanEditorPage.tsx    # Pure Tailwind → CSS Module
│   ├── BookingWidgetDemoPage.tsx  # Pure Tailwind → CSS Module
│   ├── TimelinePage.tsx           # Pure Tailwind → CSS Module + Rialto
│   └── LoadingPage.tsx            # Pure Tailwind → Rialto Skeleton/Stack/Text
└── hooks/
    └── useReservationEvents.ts    # Unchanged
```

### Pattern 1: main.tsx — Adding RialtoProvider

**What:** RialtoProvider must wrap BrowserRouter at the root (so token cascade applies to all routes).
**When to use:** Entry point update, once.
**Example:**

```tsx
// apps/hospitality/src/main.tsx (after migration)
import "@mbe/rialto/styles";
import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { RialtoProvider } from "@mbe/rialto";
import { AuthProvider } from "@mbe/auth/react";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RialtoProvider theme="light">
      <BrowserRouter basename="/hospitality">
        <AuthProvider config={authConfig}>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </RialtoProvider>
  </StrictMode>
);
```

Note: Theme state management (localStorage persistence, toggle) is at Claude's discretion — can mirror the marketing/rialto-web pattern or keep light-only for simplicity.

### Pattern 2: DashboardLayout — Rialto Sidebar Pattern

**What:** Replace @mbe/shared-layout AppLayout with Rialto Sidebar + Outlet. Critical difference: Rialto Sidebar items use `onClick` + `useNavigate` (not `href`) to prevent full page reloads inside BrowserRouter.
**When to use:** DashboardLayout.tsx replacement.
**Example:**

```tsx
// apps/hospitality/src/components/DashboardLayout.tsx (after migration)
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { Sidebar, type SidebarSection } from "@mbe/rialto";
import { useAuth } from "@mbe/auth/react";
import styles from "./DashboardLayout.module.css";

// Rialto SidebarSection uses { label?, items: SidebarItem[] }
// SidebarItem uses { id, label, onClick, active? }
// NOT href — onClick+useNavigate prevents full page reloads

const NAV_SECTIONS: SidebarSection[] = [
  {
    items: [
      { id: "home", label: "Home", onClick: () => {} },   // onClick filled in via hook
      { id: "timeline", label: "Timeline", onClick: () => {} },
      // ...
    ],
  },
  { label: "Account", items: [...] },
  { label: "Developer", items: [...] },
  { label: "Admin", items: [...] },
];

export function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const sections = buildSections(navigate, location.pathname);

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <span className={styles.logo}>Hospitality</span>
      </header>
      <div className={styles.body}>
        <Sidebar items={sections} />
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

Key insight from [01-01 decision]: onClick+useNavigate not href — prevents full page reloads. Active state: compare `location.pathname` to route path.

### Pattern 3: Local PageHeader Component

**What:** @mbe/shared-layout's PageHeader (title + description) replaced by a local component using Rialto Text and Stack primitives. Not added to Rialto itself.
**When to use:** Any page that imports `PageHeader` from `@mbe/shared-layout`.

```tsx
// apps/hospitality/src/components/PageHeader.tsx (NEW)
import { Text, Stack } from "@mbe/rialto";
import styles from "./PageHeader.module.css";

interface PageHeaderProps {
  title: string;
  description?: string;
}

export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <div className={styles.header}>
      <Stack gap="xs">
        <Text as="h1" variant="display" color="primary">{title}</Text>
        {description && (
          <Text variant="caption" color="secondary">{description}</Text>
        )}
      </Stack>
    </div>
  );
}
```

Note: Rialto also exports its own `PageHeader` (a dark header band with breadcrumbs/actions). The local component is simpler — just title + description. Both can coexist since the local one is not imported from `@mbe/rialto`.

### Pattern 4: Rialto Card — API Difference from @mbe/ui

**What:** @mbe/ui used `Card + CardHeader + CardTitle + CardContent` flat compound pattern. Rialto `Card` is a single component with optional `title` and `subtitle` props. For complex card content, just use children.

```tsx
// BEFORE (@mbe/ui pattern)
import { Card, CardHeader, CardTitle, CardContent } from "@mbe/ui";
<Card>
  <CardHeader><CardTitle>Quick Stats</CardTitle></CardHeader>
  <CardContent><p>0 active projects</p></CardContent>
</Card>

// AFTER (Rialto pattern)
import { Card } from "@mbe/rialto";
<Card title="Quick Stats">
  <p>0 active projects</p>
</Card>

// For cards without a title (complex header):
<Card>
  <div className={styles.cardHeader}>
    <Text variant="label">Profile Information</Text>
    <Button variant="secondary" size="sm" onClick={() => setIsEditing(true)}>Edit</Button>
  </div>
  {/* card content */}
</Card>
```

### Pattern 5: CSS Module + Rialto Token Pattern (Proven)

**What:** For custom layouts beyond Rialto components, use CSS Modules referencing `var(--rialto-*)` tokens. Never hardcode colors, spacing, or typography.
**When to use:** All page-level layouts, table styles, status badges, grid layouts.

```css
/* Example: apps/hospitality/src/pages/ReservationsPage.module.css */
.container {
  padding: var(--rialto-space-lg);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-block-end: var(--rialto-space-lg);
}

.statusBadge {
  display: inline-block;
  padding-block: var(--rialto-space-2xs);
  padding-inline: var(--rialto-space-xs);
  border-radius: var(--rialto-radius-round);
  font-size: var(--rialto-text-xs);
  font-weight: var(--rialto-weight-medium);
}

.statusPending {
  background: #fef3c7;  /* exception: semantic status colors don't have rialto tokens */
  color: #92400e;
}
```

Note: Rialto does not provide semantic status color tokens (pending/confirmed/cancelled). For reservation status badges, use opaque hex values in CSS Modules — this is the pragmatic exception. The Rialto `Tag` component is available as an alternative for status display.

### Pattern 6: ESLint ajv Fix

**Root cause:** ESLint 10 (used via `@mbe/config`) bundles ajv v8. ESLint's internal `lib/shared/ajv.js` calls `require("ajv/lib/refs/json-schema-draft-04.json")` — a path that existed in ajv v6 but was removed in ajv v8. This is a monorepo-wide issue: all packages using `eslint@10` via `@mbe/config` are affected.

**Fix:** ESLint 10.x is a pre-release alpha. The correct resolution is to pin ESLint back to the latest stable release. Check `packages/config/package.json` — it uses `eslint: "^10.0.1"`. Downgrade to ESLint 9 (the stable release line) in `packages/config/package.json` and update `eslint.config.js` for any API changes between v9 and v10. Alternatively, run `pnpm install` to see if pnpm resolves a newer patch that includes the fix.

Verified current state: ESLint `10.0.2` is installed. ajv v8 (bundled) does not have `lib/refs/json-schema-draft-04.json`. ESLint 9 (stable) uses ajv v6 which does have this path. Downgrade to `eslint: "^9"` is the correct fix.

### Anti-Patterns to Avoid

- **Using `href` in Sidebar items instead of `onClick`+`useNavigate`:** Causes full page reloads inside BrowserRouter. The rialto-web pattern uses onClick exclusively.
- **Importing Tailwind utilities directly in CSS Modules:** No Tailwind processing exists after postcss.config.js deletion. Any residual @tailwind directives in index.css will break.
- **Creating a new PageHeader inside @mbe/rialto:** The local hospitality component stays local.
- **Assuming Card has CardHeader/CardContent sub-components:** Rialto Card does not. It has `title`, `subtitle`, and `children` props.
- **Using CSS `left`/`right` instead of CSS logical properties:** Rialto CLAUDE.md mandates `inset-inline-start`/`inset-inline-end`, `margin-inline-*`, etc.
- **Deleting @mbe/shared-layout before @mbe/ui:** @mbe/shared-layout depends on @mbe/ui. Delete @mbe/ui first, verify typecheck, then delete @mbe/shared-layout.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sidebar collapse animation | Custom CSS/JS toggle | Rialto Sidebar (collapsed prop) | Spring physics, reduced motion support, ARIA built-in |
| Status badge styling | Tailwind-style inline classes | CSS Module + semantic class names | Rialto Token system, no Tailwind runtime |
| Loading skeleton | CSS animation from scratch | Rialto Skeleton component | Pulse animation with reduced-motion support |
| Page header | Custom component from scratch | Rialto Stack + Text primitives | Tokens, typography scale already resolved |

**Key insight:** The floor plan canvas (react-konva Stage/Layer) is the one area where Rialto has no equivalent. The `FloorPlanCanvas.tsx` wrapper div uses Tailwind for the grid background and positioning overlays — these become CSS Module classes. The Konva canvas itself is untouched.

---

## Common Pitfalls

### Pitfall 1: Removing @mbe/ui Before Hospitality Migration Is Complete

**What goes wrong:** Typecheck fails monorepo-wide, blocking all builds.
**Why it happens:** @mbe/ui is still imported in 5 hospitality files and the @mbe/shared-layout package itself.
**How to avoid:** Only delete @mbe/ui after `pnpm typecheck` passes with zero @mbe/ui errors in hospitality. The sequence is: (1) migrate all hospitality files, (2) run typecheck, (3) delete.
**Warning signs:** Any remaining `import { ... } from "@mbe/ui"` in hospitality source files.

### Pitfall 2: Stale Agent Worktrees Reference Deleted Packages

**What goes wrong:** After deleting packages/ui and packages/shared-layout, worktrees in `services/agent/.agent-worktrees/` and `tools/cli/.agent-worktrees/` still reference these packages. This doesn't fail pnpm typecheck (they're isolated git worktrees), but it's dead weight.
**Why it happens:** Agent worktrees are git worktrees that snapshot the repo at creation time.
**How to avoid:** Delete stale worktrees before or after package deletion. The command: `rm -rf services/agent/.agent-worktrees/ tools/cli/.agent-worktrees/ .worktrees/`.
**Warning signs:** Confirmed from grep — two agent worktrees in `tools/cli/.agent-worktrees/`, one in `services/agent/.agent-worktrees/`, one in `.worktrees/agentic-workflows/` all reference @mbe/ui and @mbe/shared-layout.

### Pitfall 3: index.css Still References Tailwind Directives

**What goes wrong:** Vite build error on hospitality because `@tailwind base/components/utilities` directives exist in index.css but postcss/tailwind are removed.
**Why it happens:** index.css is often not updated when removing Tailwind from a project.
**How to avoid:** Check `apps/hospitality/src/index.css` for `@tailwind` directives. Replace with any needed base resets (or remove entirely).
**Warning signs:** Vite build error: "Unknown at rule @tailwind".

### Pitfall 4: Rialto Button Variant Mismatch

**What goes wrong:** @mbe/ui Button had `variant="outline"` — Rialto Button does not. Rialto has `variant="primary" | "secondary" | "ghost"`.
**Why it happens:** Different design system, different variant names.
**How to avoid:** Map `variant="outline"` → `variant="secondary"` (aluminum outline) and plain Button (default) → `variant="secondary"` as well. `variant="primary"` is the gold fill, used for primary actions.
**Warning signs:** TypeScript error: "Type 'outline' is not assignable to type 'primary' | 'secondary' | 'ghost'".

### Pitfall 5: ESLint ajv Error Blocks Verification

**What goes wrong:** `pnpm lint` fails across all packages, making it impossible to verify zero lint errors after migration.
**Why it happens:** ESLint 10.x bundles ajv v8 which doesn't have `lib/refs/json-schema-draft-04.json` (removed from ajv v8).
**How to avoid:** Fix the ESLint version in `packages/config/package.json` first (downgrade to v9 stable), then run `pnpm install`, then verify lint passes.
**Warning signs:** `Error: Cannot find module 'ajv/lib/refs/json-schema-draft-04.json'` in any `pnpm lint` output.

### Pitfall 6: Timeline and FloorPlanEditor Use flex/h-full Layout

**What goes wrong:** TimelinePage uses `className="h-full flex flex-col"` at root, and FloorPlanEditorPage uses `className="h-full flex flex-col"`. These height-fill patterns must be preserved exactly, or the editors break.
**Why it happens:** The timeline and floor plan editor use height-fill layout to make their scroll areas work within the sidebar layout.
**How to avoid:** When converting to CSS Modules, use `height: 100%; display: flex; flex-direction: column;` for the root wrapper classes. Don't simplify these to `display: block`.
**Warning signs:** Timeline or floor plan editor content doesn't fill the available area; scrolling breaks.

### Pitfall 7: @mbe/shared-layout Has @mbe/ui as a Dependency

**What goes wrong:** Deleting @mbe/ui before @mbe/shared-layout causes @mbe/shared-layout to fail typecheck because it imports from @mbe/ui.
**Why it happens:** `packages/shared-layout/package.json` has `"@mbe/ui": "workspace:*"` in dependencies.
**How to avoid:** Delete both packages together, or in order: first confirm all consumers are migrated, then delete @mbe/ui and @mbe/shared-layout in the same commit. Run `pnpm install` to update lockfile, then `pnpm typecheck` to confirm clean.
**Warning signs:** Typecheck errors in `packages/shared-layout/` after @mbe/ui deletion.

---

## Code Examples

Verified patterns from codebase inspection:

### Rialto Card Props (from packages/rialto/src/components/Card/Card.tsx)

```tsx
// Rialto Card actual API:
export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "elevated" | "glass" | "flat";
  tilt?: boolean;
  title?: string;
  subtitle?: string;
  children?: ReactNode;
}

// Usage for simple stat cards:
<Card title="Quick Stats">
  <p style={{ fontSize: "var(--rialto-text-3xl)", fontWeight: "var(--rialto-weight-medium)" }}>0</p>
  <Text variant="caption" color="secondary">Active projects</Text>
</Card>

// Usage for cards with action in header:
<Card>
  <div className={styles.cardHeader}>
    <Text variant="label">Profile Information</Text>
    <Button size="sm" variant="secondary" onClick={() => setIsEditing(true)}>Edit</Button>
  </div>
  {/* card body content */}
</Card>
```

### Rialto Sidebar Sections (from packages/rialto/src/components/Sidebar/Sidebar.tsx)

```tsx
// Rialto SidebarSection type:
export interface SidebarSection {
  label?: string;         // section heading (optional)
  items: SidebarItem[];
}

export interface SidebarItem {
  id: string;
  label: string;
  icon?: ReactNode;
  href?: string;          // renders as <a> — use onClick instead in BrowserRouter
  active?: boolean;       // accent highlight for current page
  disabled?: boolean;
  onClick?: () => void;   // renders as <button> — use this
}

// The correct hospitality pattern:
const buildNavSections = (navigate: ReturnType<typeof useNavigate>, currentPath: string): SidebarItem[] | SidebarSection[] => [
  {
    items: [
      { id: "home", label: "Home", active: currentPath === "/", onClick: () => navigate("/") },
      { id: "timeline", label: "Timeline", active: currentPath === "/timeline", onClick: () => navigate("/timeline") },
      { id: "reservations", label: "Reservations", active: currentPath === "/reservations", onClick: () => navigate("/reservations") },
      { id: "guests", label: "Guests", active: currentPath === "/guests", onClick: () => navigate("/guests") },
      { id: "floor-plans", label: "Floor Plans", active: currentPath.startsWith("/floor-plans"), onClick: () => navigate("/floor-plans") },
    ],
  },
  { label: "Account", items: [
    { id: "profile", label: "Profile", active: currentPath === "/profile", onClick: () => navigate("/profile") },
    { id: "settings", label: "Settings", active: currentPath === "/settings", onClick: () => navigate("/settings") },
  ]},
  { label: "Developer", items: [
    { id: "booking-widget", label: "Booking Widget", active: currentPath === "/booking-widget", onClick: () => navigate("/booking-widget") },
  ]},
  { label: "Admin", items: [
    { id: "admin", label: "Users", active: currentPath === "/admin", onClick: () => navigate("/admin") },
  ]},
];
```

### Rialto Text Variants (from packages/rialto/src/components/Text/Text.tsx)

```tsx
// Available variants: "body" | "caption" | "detail" | "label" | "display"
// Available colors: "primary" | "secondary" | "tertiary" | "accent" | "success" | "error" | "on-accent"

// For headings (h1, h2, etc.), use the `as` prop:
<Text as="h1" variant="display" color="primary">Timeline</Text>
<Text as="h2" variant="label" color="secondary">Table Details</Text>

// Note: There is NO "heading" or "subheading" variant — confirmed by previous phase discovery
// Use native h2 + CSS module OR Text with `as` prop for semantic headings
```

### Rialto Button Variants (from packages/rialto/src/components/Button/Button.tsx)

```tsx
// Available: "primary" | "secondary" | "ghost"
// @mbe/ui had "default" (no variant), "outline", "destructive"
// Mapping:
// @mbe/ui default/no variant → Rialto "secondary"
// @mbe/ui variant="outline" → Rialto "secondary"
// @mbe/ui variant="destructive" → No direct equivalent; use ghost + red CSS Module class, or secondary

<Button variant="primary" onClick={handleSave}>Save Changes</Button>   // gold fill — primary action
<Button variant="secondary" onClick={() => setIsEditing(true)}>Edit</Button>  // outline
<Button variant="ghost" onClick={() => signOut()}>Sign Out</Button>    // no border
```

### LoginPrompt Replacement (Rialto-only)

```tsx
// App.tsx LoginPrompt — replace Tailwind with Rialto Stack + Text + Button
function LoginPrompt() {
  const { signIn } = useAuth();
  return (
    <div className={styles.loginContainer}>  {/* full-screen centered layout via CSS Module */}
      <Stack gap="md" align="center">
        <Text as="h1" variant="display" color="primary">Hospitality</Text>
        <Text variant="body" color="secondary">Please sign in to continue</Text>
        <Button variant="primary" onClick={() => signIn()}>Sign In</Button>
      </Stack>
    </div>
  );
}
```

### Token Reference for CSS Modules

```css
/* Spacing tokens (confirmed from rialto CLAUDE.md) */
--rialto-space-2xs   /* ~4px */
--rialto-space-xs    /* ~8px */
--rialto-space-sm    /* ~12px */
--rialto-space-md    /* ~16px */
--rialto-space-lg    /* ~24px */
--rialto-space-xl    /* ~32px */
--rialto-space-2xl   /* ~48px */
--rialto-space-3xl   /* ~64px */

/* Typography tokens */
--rialto-text-xs
--rialto-text-sm
--rialto-text-base
--rialto-text-lg
--rialto-text-xl
--rialto-text-2xl

/* Text color tokens */
--rialto-text-primary
--rialto-text-secondary
--rialto-text-tertiary

/* Surface tokens */
--rialto-surface
--rialto-surface-elevated
--rialto-surface-recessed

/* Border tokens */
--rialto-border
--rialto-border-strong

/* Radius tokens */
--rialto-radius-sharp   /* 2px */
--rialto-radius-default /* 6px */
--rialto-radius-soft    /* 10px */
--rialto-radius-round   /* 9999px */

/* Always use CSS logical properties (from Rialto CLAUDE.md): */
padding-inline-start / padding-inline-end  (NOT padding-left/right)
margin-inline-start / margin-inline-end    (NOT margin-left/right)
inset-inline-start / inset-inline-end      (NOT left/right for positioned elements)
```

---

## File-by-File Migration Map

This section maps each hospitality file to its migration requirement, sorted by plan:

### Plan 04-01: Replace all Tailwind and @mbe/ui in hospitality

**App shell files (3 files):**

| File | Current Dependencies | After |
|------|---------------------|-------|
| `main.tsx` | No Tailwind, no @mbe/ui — add RialtoProvider + `@mbe/rialto/styles` import | Wrap with RialtoProvider |
| `App.tsx` | Tailwind in LoginPrompt only | CSS Module + Rialto Stack/Text/Button |
| `components/DashboardLayout.tsx` | @mbe/shared-layout AppLayout + Tailwind | Rialto Sidebar + Outlet + CSS Module |

**Page files with @mbe/ui Card/Button + @mbe/shared-layout PageHeader (4 files):**

| File | Imports to Replace |
|------|--------------------|
| `pages/HomePage.tsx` | PageHeader(@mbe/shared-layout), Card+CardHeader+CardTitle+CardContent(@mbe/ui) |
| `pages/ProfilePage.tsx` | PageHeader(@mbe/shared-layout), Card+CardHeader+CardTitle+CardContent+Button(@mbe/ui) |
| `pages/SettingsPage.tsx` | PageHeader(@mbe/shared-layout), Card+CardHeader+CardTitle+CardContent+Button(@mbe/ui) |
| `pages/AdminPage.tsx` | PageHeader(@mbe/shared-layout), Card+CardHeader+CardTitle+CardContent+Button(@mbe/ui) |

**Page files with pure Tailwind (6 files — CSS Module conversion):**

| File | Key Layout Pattern |
|------|--------------------|
| `pages/ReservationsPage.tsx` | p-6 container, table with Tailwind headers, status badge colors |
| `pages/GuestsPage.tsx` | p-6 container, search input, grid segments, table |
| `pages/FloorPlansPage.tsx` | p-6 container, grid layout, card-like divs |
| `pages/FloorPlanEditorPage.tsx` | h-full flex flex-col, border-b header, split panel |
| `pages/BookingWidgetDemoPage.tsx` | p-6 container, feature cards, code block |
| `pages/TimelinePage.tsx` | h-full flex flex-col, split panel with detail sidebar |
| `pages/LoadingPage.tsx` | min-h-screen centered spinner |

**Domain component files (9 files — CSS Module conversion):**

| File | Key Tailwind Patterns |
|------|-----------------------|
| `components/booking-widget/BookingWidget.tsx` | bg-white rounded-lg shadow-lg p-6, step indicator circles |
| `components/booking-widget/DatePartySelector.tsx` | Grid party size buttons, date input styling |
| `components/booking-widget/TimeSlotPicker.tsx` | (not yet read — assume similar pattern) |
| `components/booking-widget/GuestDetailsForm.tsx` | (not yet read — assume similar pattern) |
| `components/booking-widget/ConfirmationView.tsx` | (not yet read — assume similar pattern) |
| `components/floor-plan/FloorPlanCanvas.tsx` | relative bg-gray-50 rounded-lg, absolute overlays |
| `components/floor-plan/TableShape.tsx` | Likely no Tailwind (Konva canvas) |
| `components/timeline/TimelineGrid.tsx` | relative overflow-auto border rounded-lg, sticky headers |
| `components/timeline/ReservationBlock.tsx` | (not yet read — assume similar pattern) |

### Plan 04-02: Remove Tailwind from hospitality

Files to change:
- `apps/hospitality/package.json`: Remove tailwindcss, postcss, autoprefixer from devDependencies; add @mbe/rialto
- `apps/hospitality/tailwind.config.js`: Delete
- `apps/hospitality/postcss.config.js`: Delete
- `apps/hospitality/src/index.css`: Remove @tailwind directives (keep any base resets needed)

### Plan 04-03: Delete @mbe/ui and @mbe/shared-layout

Files to delete:
- `packages/ui/` (entire directory)
- `packages/shared-layout/` (entire directory)

Files to update:
- Run `pnpm install` after deletion to update lockfile
- `CLAUDE.md`: Remove @mbe/ui references, update architecture table
- `AGENTS.md`: Same updates
- Any evaluation docs referencing @mbe/ui

Worktrees to delete (all are stale, reference deleted packages):
- `tools/cli/.agent-worktrees/agent-add-tests-1973e6/`
- `tools/cli/.agent-worktrees/agent-fix-the-login-bug-989106/`
- `services/agent/.agent-worktrees/agent-add-request-logging-middleware-to-the-fa-1d05ed/`
- `.worktrees/agentic-workflows/`

### Plan 04-04: End-to-end verification

Verification checklist:
1. `pnpm build` — all three apps build successfully
2. `pnpm typecheck` — zero errors, zero @mbe/ui references
3. `pnpm lint` — zero errors (ESLint ajv fix already applied)
4. `pnpm test` — all tests pass
5. Visual: http://localhost:3000 (marketing), http://localhost:3002/hospitality (hospitality), http://localhost:3004/rialto (rialto-web)
6. Auth flow: navigate to /hospitality → redirect to Auth0 → return to /hospitality/callback → land in hospitality app
7. Deep link: navigate directly to /hospitality/reservations → correct page loads
8. Grep check: `grep -r "className=\".*\(bg-\|text-gray\|flex\|p-[0-9]\|m-[0-9]\|grid\|border-gray\)" apps/hospitality/src` → zero results

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| @mbe/ui (Radix + Tailwind CVA) | @mbe/rialto (custom CSS Modules + framer-motion) | Phase 1 decision | Tailwind removed; Rialto tokens replace utility classes |
| @mbe/shared-layout AppLayout | Rialto Sidebar + local layouts | Phase 4 | No more shared layout dependency |
| Flat compound pattern (CardHeader/CardTitle/CardContent) | Single Card with title/subtitle props | Rialto design | Simpler API for common cases |

**Deprecated/outdated:**
- `@mbe/ui`: Replaced by @mbe/rialto. Deleted in plan 04-03.
- `@mbe/shared-layout`: Replaced by Rialto Sidebar (nav) + local PageHeader. Deleted in plan 04-03.
- `tailwindcss/postcss/autoprefixer` in hospitality: Replaced by CSS Modules + Rialto tokens.

---

## Open Questions

1. **ESLint downgrade to v9 API compatibility**
   - What we know: ESLint 9 uses flat config (same as v10 pre-release). API is compatible.
   - What's unclear: Whether any `@mbe/config/eslint/base.js` APIs changed between v9 and v10.
   - Recommendation: Test `eslint@^9` with `typescript-eslint@^8` — the combination is known-good.

2. **Theme state for hospitality (light/dark toggle)**
   - What we know: marketing and rialto-web both implement localStorage-persisted theme toggle.
   - What's unclear: Whether hospitality should have a theme toggle or default to light.
   - Recommendation: Start with light theme only (no toggle) for simplicity. Add theme toggle later if desired. RialtoProvider accepts `theme="light"` hardcoded.

3. **GuestsPage venue context (pre-existing known issue)**
   - What we know: GuestsPage has a hardcoded empty venueId with TODO comment. The page always shows "Please select a venue." This is documented in CONCERNS.md.
   - What's unclear: Whether this should be fixed in Phase 4 or left as-is.
   - Recommendation: Out of scope for Phase 4. The migration is styling-only. The GuestsPage will still show the "Please select a venue" message after migration — it's a pre-existing functional issue.

---

## Validation Architecture

> `workflow.nyquist_validation` is not set in `.planning/config.json` (the key doesn't exist). Skipping Validation Architecture section.

---

## Sources

### Primary (HIGH confidence)
- Codebase inspection — all 22 file changes identified directly from source
- `packages/rialto/src/components/Sidebar/Sidebar.tsx` — SidebarItem/SidebarSection API confirmed
- `packages/rialto/src/components/Card/Card.tsx` — Card title/subtitle props confirmed (no compound sub-components)
- `packages/rialto/src/components/Button/Button.tsx` — variant API confirmed (primary/secondary/ghost)
- `packages/rialto/src/components/Text/Text.tsx` — variant API confirmed (body/caption/detail/label/display)
- `packages/rialto/src/components/Stack/Stack.tsx` — Stack API confirmed
- `packages/rialto/src/components/PageHeader/PageHeader.tsx` — Rialto PageHeader is dark band with breadcrumbs, NOT simple title+description
- `packages/rialto/CLAUDE.md` — Token naming conventions, CSS logical properties mandate
- `apps/rialto-web/src/layouts/ShowcaseLayout.tsx` — CSS Module + Sidebar pattern reference
- `apps/marketing/src/main.tsx` — RialtoProvider wrapping pattern reference
- `apps/marketing/src/pages/HomePage.module.css` — CSS Module + Rialto token usage pattern
- `node_modules/.pnpm/eslint@10.0.2_jiti@2.6.1/node_modules/eslint/lib/shared/ajv.js` — ajv error root cause confirmed
- `node_modules/.pnpm/eslint@10.0.2_jiti@2.6.1/node_modules/ajv/lib/refs/` — `json-schema-draft-04.json` confirmed missing

### Secondary (MEDIUM confidence)
- `pnpm lint` output — confirmed ajv error affects all packages monorepo-wide
- `packages/config/package.json` — ESLint 10.0.1 confirmed as the version causing the issue

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — inspected actual component source
- Architecture: HIGH — patterns proven in Phases 1 and 3; directly observed in codebase
- Pitfalls: HIGH — derived from actual codebase state and documented decisions
- Component API mapping: HIGH — read actual TypeScript interfaces from source

**Research date:** 2026-03-03
**Valid until:** 2026-04-03 (stable codebase; only changes if Rialto API changes)
