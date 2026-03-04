# Phase 4: Hospitality Migration + Full Hosting - Context

**Gathered:** 2026-03-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Migrate the hospitality app from Tailwind/@mbe/ui/@mbe/shared-layout to Rialto-only. After migration, delete @mbe/ui and @mbe/shared-layout from the monorepo. Verify all three apps (marketing, rialto-web, hospitality) build and run correctly. Fix the pre-existing ESLint ajv error. No new features — pure migration and cleanup.

</domain>

<decisions>
## Implementation Decisions

### App shell replacement
- Follow the rialto-web pattern: RialtoProvider at root, Sidebar with nav sections, CSS Modules
- Header text renamed from "Dashboard" to "Hospitality"
- LoginPrompt uses minimal Rialto components (Button, Stack, Text) — centered layout, same UX
- Sidebar section structure at Claude's discretion (keep or simplify the 4 existing sections)

### Domain component styling
- CSS Modules + Rialto design tokens (--rialto-space-*, --rialto-text-*, --rialto-surface-*) for all domain components
- Booking widget, floor plan editor, and timeline each get .module.css files
- Floor plan editor: preserve exact visual appearance — styling swap only, no redesign
- @mbe/ui components (Card, Button, CardHeader, etc.) replaced 1:1 with Rialto equivalents (Card compound pattern, Button)
- Local PageHeader component created in hospitality using Rialto Text/Stack primitives (replaces @mbe/shared-layout PageHeader)

### Package deletion
- Delete @mbe/ui and @mbe/shared-layout immediately after confirming zero consumers via pnpm typecheck
- Clean up stale agent worktrees (services/agent/.agent-worktrees/) that reference deleted packages
- Update CLAUDE.md, AGENTS.md, and evaluation docs to remove @mbe/ui references and reflect Rialto-only architecture

### Verification approach
- Build + typecheck + lint + test + visual check (local dev only, no Pulumi deploy)
- Verification checklist: pnpm build, pnpm typecheck, pnpm lint, pnpm test, then visual check of all 3 apps at their dev URLs
- Auth flow verified: login → callback → hospitality app
- Fix the pre-existing ESLint ajv error (monorepo-wide tooling issue, deferred from Phase 3)

### Claude's Discretion
- Sidebar section structure (keep 4 sections or simplify)
- Exact CSS Module class naming and organization
- Loading skeleton and error state designs
- Timeline/booking widget internal layout decisions during styling migration

</decisions>

<specifics>
## Specific Ideas

- Rialto Card uses compound component pattern (`<Card><Card.Header>...</Card.Header><Card.Body>...</Card.Body></Card>`) — not the @mbe/ui flat component pattern
- PageHeader is a simple local component, not added to Rialto itself
- The rialto-web migration (Phase 1) established the pattern — follow it consistently

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `@mbe/rialto`: Card, Button, Text, Stack, Sidebar, RialtoProvider, Tag, Footer, Divider — all available for hospitality
- Phase 1 rialto-web app shell pattern: RialtoProvider → BrowserRouter → Sidebar + main content area
- CSS Modules with Rialto tokens: proven pattern in marketing (Phase 3) and rialto-web (Phase 1)

### Established Patterns
- Sidebar with NAV_SECTIONS data structure → auto-generates nav items (rialto-web pattern)
- `useAuth()` hook from `@mbe/auth/react` — unchanged, just wrapping components change
- CSS Module + `var(--rialto-*)` token usage for custom styling beyond Rialto components

### Integration Points
- `main.tsx`: Wrap with RialtoProvider at root (above BrowserRouter)
- `DashboardLayout.tsx`: Replace @mbe/shared-layout AppLayout with Rialto Sidebar + Outlet pattern
- 4 page files: Replace @mbe/ui Card/Button imports with @mbe/rialto equivalents
- `package.json`: Remove @mbe/ui, @mbe/shared-layout, tailwindcss, postcss, autoprefixer; add @mbe/rialto
- `tailwind.config.js`, `postcss.config.js`: Delete

### Files requiring changes (22 files with Tailwind classes)
- App shell: App.tsx, DashboardLayout.tsx, main.tsx
- Pages: HomePage, ProfilePage, SettingsPage, AdminPage, ReservationsPage, GuestsPage, FloorPlansPage, FloorPlanEditorPage, BookingWidgetDemoPage, TimelinePage, LoadingPage
- Domain components: booking-widget (6 files), floor-plan (3 files), timeline (3 files)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-hospitality-migration-full-hosting*
*Context gathered: 2026-03-03*
