# Phase 1: Rialto-Web Migration - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Migrate the rialto-web showcase app to use Rialto components exclusively (remove Tailwind), ensure all 55+ components are visible with interactive demos, add a light/dark theme switcher, and serve the app at /rialto with working client-side routing. No new Rialto components are added — this showcases what exists.

</domain>

<decisions>
## Implementation Decisions

### Component Organization
- Sidebar navigation with collapsible functional categories (Forms, Layout, Navigation, Feedback, Data Display, Overlays, etc.)
- Each component gets its own dedicated page (click "Button" in sidebar → full Button page)
- Categories organized by function (how Radix/Shadcn does it)
- Overview landing page with quick stats (component count, token count), category previews, and getting started info

### Theme Switching
- Light + Dark mode only (no custom vibes in v1)
- Sun/moon toggle icon in the header/navbar — always accessible
- Theme choice persists in localStorage across visits
- First visit detects OS preference via `prefers-color-scheme`; after manual toggle, saved preference takes precedence

### Component Demos
- Each component page shows: all visual variants (sizes, colors), all states (hover, disabled, loading, error), AND real-world usage examples (e.g., Button in a form, Card in a grid)
- Interactive props playground — knobs/controls to change props live and see the result
- Pre-built static examples showing key patterns alongside the playground
- Full props/API table per component: prop name, type, default value, description
- Dedicated accessibility section per component: ARIA attributes, keyboard navigation, screen reader behavior

### Page Layout & Feel
- Rich & polished visual personality — not minimal, the showcase should feel branded and intentional
- "Eat your own cooking" — use Rialto's own Navbar, Sidebar, Footer, and other components to build the showcase itself
- Subtle animations only — page transitions and interactive effects should not distract from the components
- Footer with cross-links to marketing site (mattbutlerengineering.com), hospitality app (/hospitality), and GitHub repo

### Claude's Discretion
- Exact category groupings for the 55+ components
- Component page layout structure and spacing
- Props playground implementation approach
- Sidebar collapse/expand behavior on mobile
- Loading states and error boundaries

</decisions>

<specifics>
## Specific Ideas

- The showcase should prove Rialto works in production by using Rialto components to build itself
- Overview page gives visitors a quick sense of the library's scope before diving into individual components
- Each component page should feel comprehensive enough that a developer could use it as their primary reference

</specifics>

<deferred>
## Deferred Ideas

- Code snippets with syntax highlighting — v2 (RIALTO-V2-01)
- Icon search and browser — v2 (RIALTO-V2-02)
- Token visualization (colors, spacing, typography) — v2 (RIALTO-V2-03)
- Custom vibes/themes beyond light+dark — future enhancement

</deferred>

---

*Phase: 01-rialto-web-migration*
*Context gathered: 2026-02-27*
