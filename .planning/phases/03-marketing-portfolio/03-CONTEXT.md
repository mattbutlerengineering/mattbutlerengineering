# Phase 3: Marketing Portfolio - Context

**Gathered:** 2026-02-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Transform the marketing site from a generic agency placeholder into a complete engineering portfolio built entirely with Rialto components. Single scrolling page with Hero, About, Projects, and Contact sections. Served at the root path (`/`). No Tailwind, no `@mbe/ui`.

</domain>

<decisions>
## Implementation Decisions

### Visual identity & tone
- Polished but bold — refined with personality, not corporate or minimal
- Neon.tech hero as a design reference: large tight-tracked typography, clear CTAs, clean visual hierarchy
- Claude's discretion: dark vs light mode default, accent color palette, whether to include a theme toggle

### Content & narrative
- Hero title/role: "Engineering Leader"
- About section focuses on builder mindset & philosophy — ownership, quality, automation, the "one-person dev team" approach
- Text only — no photo or avatar
- The "this site IS the project" meta-narrative is told as a project card, not a standalone section

### Page structure & navigation
- Single scrolling page — all sections visible on one page load
- Claude's discretion: section ordering, sticky vs minimal navbar, hero CTA actions (scroll-to-section vs external links)

### Project showcase
- Feature real monorepo projects: Rialto design system, Hospitality app, Agent system, MBE CLI, plus the site itself (as the meta "this IS the project" card)
- Live app links only — no GitHub repo links on cards
- Claude's discretion: card detail level (rich vs minimal), visual treatment (screenshots, icons, or text-only), grid layout

### Claude's Discretion
- Dark mode vs light mode default
- Accent color palette
- Theme toggle inclusion
- Section ordering (Hero → About → Projects → Contact, or Hero → Projects → About → Contact)
- Navbar style (sticky, minimal, or none)
- Hero CTA button actions
- Project card detail level and visual treatment
- Typography and spacing details
- Footer design
- Mobile layout and scroll behavior

</decisions>

<specifics>
## Specific Ideas

- "I really like this hero that neon.tech uses" — large typography, tight tracking, rounded CTA buttons, clean hierarchy
- Mix of polished/professional and bold/expressive — refined but with personality
- Title is "Engineering Leader" (not "Full-Stack Engineer" or "Software Engineer")
- Builder mindset & philosophy is the core narrative, not technical depth or impact metrics

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- Rialto components ready for this phase: `Hero`, `Card`, `Navbar`, `Footer`, `Stack`, `Text`, `Badge`, `Tag`, `Divider`, `Button`, `Avatar` (55+ components total)
- Rialto theme system with vibe switcher — supports dark/light mode natively
- CSS custom properties: `--rialto-*` tokens for colors, spacing, typography

### Established Patterns
- React + Vite frontend app structure: `main.tsx` → `App.tsx` → routes → pages
- React Router for client-side routing (BrowserRouter)
- CSS Modules with `var()` tokens for Rialto-styled components
- Component naming: PascalCase files, `ComponentNameProps` interfaces

### Integration Points
- `apps/marketing/` — existing app directory, will be rewritten in place
- Root path `/` — marketing owns the catch-all route in Pulumi ingress
- Links to `/rialto` (showcase) and `/hospitality` (hospitality app) must work
- No `base` path in vite.config.ts (marketing is at root, unlike other apps)
- Dev port: 3000

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-marketing-portfolio*
*Context gathered: 2026-02-28*
