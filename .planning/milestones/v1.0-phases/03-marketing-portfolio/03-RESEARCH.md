# Phase 3: Marketing Portfolio - Research

**Researched:** 2026-02-28
**Domain:** React SPA portfolio page, Rialto component composition, Tailwind removal
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Visual identity & tone**
- Polished but bold — refined with personality, not corporate or minimal
- Neon.tech hero as a design reference: large tight-tracked typography, clear CTAs, clean visual hierarchy
- Claude's discretion: dark vs light mode default, accent color palette, whether to include a theme toggle

**Content & narrative**
- Hero title/role: "Engineering Leader"
- About section focuses on builder mindset & philosophy — ownership, quality, automation, the "one-person dev team" approach
- Text only — no photo or avatar
- The "this site IS the project" meta-narrative is told as a project card, not a standalone section

**Page structure & navigation**
- Single scrolling page — all sections visible on one page load
- Claude's discretion: section ordering, sticky vs minimal navbar, hero CTA actions (scroll-to-section vs external links)

**Project showcase**
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

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PORT-01 | Hero section with name, role, and brief tagline | Rialto `Hero` component confirmed — supports `eyebrow`, `title` (ReactNode), `subtitle`, `actions`; 85vh default; fade-up animation built in |
| PORT-02 | About section with 3-5 sentences on focus and background | Composed from `Stack`, `Text`, `Divider` — no dedicated About component needed; CSS Module section pattern from rialto-web applies |
| PORT-03 | Projects showcase with 3-5 curated project cards (title, tech stack, description, link) | Rialto `Card` (elevated/glass/flat variants), `Tag` for tech stack labels, `Button` for live links; responsive grid via CSS |
| PORT-04 | Social and contact links (GitHub, LinkedIn, email) | Rialto `Footer` (minimal or rich variant) handles icon links; or compose with `Stack`+`Text`+external `<a>` tags |
| PORT-05 | "This site IS the project" narrative as a project card | Implemented as one of the project cards in PORT-03's grid — same Card component, distinctive content |
| PORT-06 | Live links to rialto-web showcase and hospitality app | `<a href="/rialto">` and `<a href="/hospitality">` — plain anchor tags to other SPA roots, not React Router `<Link>` |
| PORT-07 | All styling uses Rialto components exclusively — no Tailwind, no @mbe/ui | Remove `tailwindcss`, `postcss`, `autoprefixer` from devDependencies; delete `tailwind.config.js`, `postcss.config.js`; replace `index.css` with `@mbe/rialto/styles` import; remove `@mbe/ui` dep |
| PORT-08 | App served at mattbutlerengineering.com/ with working client-side routing | Marketing already owns `/` catch-all in Pulumi ingress (complete from Phase 2); no `base` path in vite.config.ts (correct); BrowserRouter without basename (correct) |
</phase_requirements>

## Summary

Phase 3 is primarily a content and styling transformation of the existing `apps/marketing` React app. The current app is a 2-file placeholder using Tailwind CSS and `@mbe/ui` imports. The goal is to replace it entirely with a Rialto-only single-page portfolio.

The Rialto design system already provides every component needed: `Hero` (built-in fade animation, eyebrow/title/subtitle/actions slots), `Card` (elevated/glass/flat variants with optional tilt), `Stack` (flexbox layout primitive), `Text` (typography scale), `Footer`, `Button`, `Tag`, `Badge`, and `Divider`. The `RialtoProvider` must wrap the app at root — mirroring the pattern established in `apps/rialto-web/src/main.tsx`. CSS tokens (`@mbe/rialto/styles`) must be imported before any component renders.

Infrastructure is already complete from Phase 2: the marketing app owns the `/` catch-all in Pulumi ingress with `catchallDocument` configured. The `vite.config.ts` correctly has no `base` path set and `BrowserRouter` has no `basename`. The only infrastructure task for this phase is verifying the build deploys correctly. The Tailwind removal (devDependencies, config files, `index.css` rewrite) is the main technical cleanup work.

**Primary recommendation:** Rewrite `apps/marketing/src/` in place. Add `RialtoProvider` + `ToastProvider` at root, compose page sections with Rialto primitives in a single `HomePage.tsx`, remove all Tailwind artifacts, and verify with `grep -r "className" src/` returning only Rialto CSS Module classNames (not Tailwind utility strings).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@mbe/rialto` | workspace:* | All UI components and CSS tokens | Project's single design system — all apps migrate to this |
| React | 19.0.0 | Already installed | No change needed |
| react-router-dom | 7.1.0 | Already installed, BrowserRouter at root | No change needed |
| framer-motion | peer dep of rialto | Powers Hero fade-up, Card tilt, Button press | Already installed transitively |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@mbe/rialto/styles` | — | CSS import that loads all token CSS | Import once in `main.tsx` or `global.css` before any Rialto component renders |
| `RialtoProvider` | from @mbe/rialto | Sets `data-theme` attribute, vibe overrides | Must wrap the entire app at root |
| CSS Modules (`.module.css`) | Vite built-in | Page-level layout that Rialto tokens don't cover (section max-width, grid) | Use for structural layout only; never for colors, spacing, radius — use `--rialto-*` tokens |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Rialto `Hero` component | Custom `<section>` with CSS | Hero component already has correct animation, token usage, responsive breakpoints — use it |
| Rialto `Card` | Custom div | Card has tilt effect, surface variants, proper tokens — no reason to hand-roll |
| Rialto `Footer` | Custom footer | Footer has minimal and rich variants; use minimal for simple contact links |
| CSS Modules for layout | Inline styles | CSS Modules are the established pattern in this codebase for structural/layout-only styles |

**Installation:**
```bash
# No new packages needed — only REMOVE devDependencies:
cd apps/marketing
pnpm remove tailwindcss postcss autoprefixer
# And remove @mbe/ui from dependencies:
pnpm remove @mbe/ui
# Add rialto:
pnpm add @mbe/rialto@workspace:*
```

## Architecture Patterns

### Recommended Project Structure
```
apps/marketing/src/
├── main.tsx              # RialtoProvider wraps BrowserRouter (root, same pattern as rialto-web)
├── App.tsx               # Routes — single route "/" → HomePage
├── global.css            # @import "@mbe/rialto/styles"; body font/bg token assignments; Google Fonts
├── pages/
│   └── HomePage.tsx      # Single scrolling page; all sections as components
├── components/
│   ├── HeroSection.tsx       # Wraps Rialto Hero, provides content
│   ├── AboutSection.tsx      # Stack + Text composition
│   ├── ProjectsSection.tsx   # Responsive grid of ProjectCard components
│   ├── ProjectCard.tsx       # Rialto Card + Tag + Button for one project
│   └── ContactSection.tsx    # Stack + social link anchors (or use Footer)
└── pages/
    └── HomePage.module.css   # Section widths, grid layout — token-only values
```

### Pattern 1: RialtoProvider at Root (CRITICAL)

**What:** `RialtoProvider` must be the outermost wrapper, outside `BrowserRouter`. Sets `data-theme` attribute for token cascade. `ToastProvider` inside if toasts used.

**When to use:** Always — same pattern as `apps/rialto-web/src/main.tsx`.

**Example:**
```typescript
// Source: apps/rialto-web/src/main.tsx (established project pattern)
function Root() {
  const [theme, setTheme] = useState<"light" | "dark">(getInitialTheme);

  useEffect(() => {
    localStorage.setItem("rialto-theme", theme);
  }, [theme]);

  return (
    <RialtoProvider theme={theme}>
      <BrowserRouter>
        {/* no basename — marketing is at root */}
        <App />
      </BrowserRouter>
    </RialtoProvider>
  );
}
```

### Pattern 2: CSS Import Order (CRITICAL)

**What:** Rialto styles must load before any component renders. Import `@mbe/rialto/styles` (which imports `tokens/index.css` and `styles/reset.css`) in `global.css` or `main.tsx`.

**Example:**
```typescript
// main.tsx
import "@mbe/rialto/styles";
import "./global.css";
```

```css
/* global.css */
@import url("https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500&display=swap");

body {
  font-family: var(--rialto-font-sans);
  font-size: var(--rialto-text-base);
  background-color: var(--rialto-surface);
  color: var(--rialto-text-primary);
}
```

### Pattern 3: Hero Section Composition

**What:** Rialto `Hero` takes `eyebrow`, `title` (ReactNode for accent span), `subtitle`, `actions`. Built-in fade-up stagger animation, gold divider, responsive typography (`4xl` → `3xl` → `2xl`).

**Example:**
```tsx
// Source: packages/rialto/src/components/Hero/Hero.tsx
<Hero
  eyebrow="Engineering Leader"
  title={<>Building things that <span className="accent">matter</span></>}
  subtitle="One-person dev team. Full-stack, full-stack of infrastructure, full ownership."
  actions={
    <Stack direction="row" gap="sm">
      <Button variant="primary" size="lg" onClick={() => scrollTo("projects")}>
        See my work
      </Button>
      <Button variant="secondary" size="lg" onClick={() => scrollTo("about")}>
        About me
      </Button>
    </Stack>
  }
/>
```

Note: `className="accent"` inside `title` applies `color: var(--rialto-accent)` + `font-style: italic` via Hero's CSS module global selector (`.title :global(.accent)`).

### Pattern 4: Project Card Composition

**What:** Rialto `Card` (elevated variant) with title, tech stack `Tag`s, description `Text`, and a `Button` linking to the live app.

**Example:**
```tsx
// Source: packages/rialto/src/components/Card/Card.tsx, Tag/Tag.tsx
<Card variant="elevated" tilt>
  <Stack gap="md">
    <Text variant="display" as="h3">{project.title}</Text>
    <Stack direction="row" gap="xs" wrap>
      {project.tags.map(tag => <Tag key={tag}>{tag}</Tag>)}
    </Stack>
    <Text variant="body" color="secondary">{project.description}</Text>
    <Button variant="secondary" size="sm" onClick={() => window.open(project.href, "_blank")}>
      View live
    </Button>
  </Stack>
</Card>
```

### Pattern 5: Cross-App Links (Non-Router)

**What:** Links to `/rialto` and `/hospitality` are cross-app links to separate SPA roots. Must NOT use React Router `<Link>` (which would try to match within marketing's router). Use plain `<a>` tags.

**Example:**
```tsx
// Correct: plain anchor for cross-SPA navigation
<a href="/rialto">View Rialto Showcase</a>
<a href="/hospitality">Open Hospitality App</a>

// Wrong: would fail — /rialto is not a route in marketing's BrowserRouter
<Link to="/rialto">...</Link>
```

### Pattern 6: Section Layout with CSS Modules

**What:** Use CSS Modules for structural layout only (max-width container, grid columns, section padding). All visual values (colors, spacing, radius, shadows) must use `--rialto-*` tokens.

**Example:**
```css
/* HomePage.module.css */
.section {
  padding: var(--rialto-space-4xl) var(--rialto-space-lg);
  max-width: 1080px;
  margin-inline: auto;
}

.projectGrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--rialto-space-lg);
}
```

### Pattern 7: Theme Initialization (localStorage)

**What:** Match the rialto-web pattern for theme persistence — read `localStorage.getItem("rialto-theme")` on mount, fall back to `prefers-color-scheme`. This prevents flash of wrong theme.

**Example:**
```typescript
// Source: apps/rialto-web/src/main.tsx (exact pattern)
function getInitialTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  const saved = localStorage.getItem("rialto-theme");
  if (saved === "dark" || saved === "light") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
```

### Anti-Patterns to Avoid

- **`<Link>` for cross-app navigation:** `/rialto` and `/hospitality` are separate SPAs; React Router `<Link>` will not trigger a full navigation between them. Use `<a href>` instead.
- **Tailwind utilities in `className`:** After removal, any `className="text-gray-600 py-20"` pattern must be replaced with Rialto CSS Module + token values.
- **`@mbe/ui` imports after removal:** `Button`, `Card`, etc. from `@mbe/ui` have different APIs than Rialto. Replace with `@mbe/rialto` imports.
- **Hardcoded colors/spacing in CSS:** Never `color: #6b6660` directly — use `var(--rialto-text-secondary)`.
- **`RialtoProvider` inside `BrowserRouter`:** Documented gotcha in the codebase. Provider must be outermost.
- **`base` path in vite.config.ts:** Marketing is at root `/`. Do NOT add a `base` config. This is correct already.
- **`basename` on `BrowserRouter`:** No basename for marketing (unlike hospitality at `/hospitality`). Already correct.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Hero fade-up animation | Custom CSS keyframes / JS scroll reveal | Rialto `Hero` component | Already has framer-motion stagger, reduced-motion support, token-correct styling |
| Card tilt effect | Custom mouse tracking | `Card tilt` prop | Built into Card via `useTilt` hook |
| Theme persistence | Custom localStorage wrapper | Pattern from rialto-web `getInitialTheme()` | 5-line pattern already proven; adding complexity adds bugs |
| Tech stack badges | Custom pill spans | Rialto `Tag` component | Has proper token-based variants, hover/selected states, dismissible support |
| Social icon SVGs | Hand-crafted SVGs inline | Use simple text links or SVG from Rialto icon set | No need for bespoke icons for GitHub/LinkedIn/email |
| Scroll-to-section | Custom scroll utility | Native `element.scrollIntoView({ behavior: "smooth" })` | Built into browsers; no library needed |
| Dark mode toggle | Custom context | `useState` + `RialtoProvider theme` prop | Same 3-line pattern as rialto-web |

**Key insight:** Every visual primitive needed (Hero, Card, Tag, Button, Stack, Text, Footer, Divider, Badge) already exists in Rialto. This phase is primarily content authoring + Tailwind removal, not component building.

## Common Pitfalls

### Pitfall 1: Tailwind `className` strings surviving after removal
**What goes wrong:** Build passes (Tailwind is removed from PostCSS pipeline) but classNames like `"py-20 text-gray-600"` still exist in JSX — they just have no effect. Grep check is the only way to catch this.
**Why it happens:** Removing Tailwind from devDependencies doesn't fail on unused class strings — it silently stops generating the CSS.
**How to avoid:** After every component rewrite, run `grep -r "className" src/` and verify all results are either Rialto CSS Module references (`styles.foo`) or explicitly allowed wrapper strings. The phase success criterion requires `grep` to return zero Tailwind utility matches.
**Warning signs:** Any `className` value that looks like `"text-*"`, `"bg-*"`, `"flex"`, `"py-*"`, `"px-*"`, `"gap-*"` (without `styles.` prefix) is a Tailwind remnant.

### Pitfall 2: @mbe/rialto/styles not imported before component render
**What goes wrong:** Components render without CSS custom properties defined — surfaces are transparent, text is invisible, spacing tokens resolve to `unset`.
**Why it happens:** Rialto components reference `var(--rialto-*)` tokens that only exist after `@mbe/rialto/styles` is imported.
**How to avoid:** Import `@mbe/rialto/styles` as the very first import in `main.tsx` (before `./global.css`).
**Warning signs:** Blank white page with invisible text or no styling at all.

### Pitfall 3: `@mbe/ui` API differences from `@mbe/rialto`
**What goes wrong:** Copying old component usage and swapping the import path compiles but renders incorrectly — `@mbe/ui`'s `Card`, `Button`, etc. have different prop APIs than Rialto's.
**Why it happens:** `@mbe/ui` uses shadcn/radix patterns (`CardHeader`, `CardTitle`, `CardContent` as children) while Rialto `Card` uses `title` / `subtitle` props + `children` for body.
**How to avoid:** Treat it as a full rewrite, not a find-and-replace. Re-read each Rialto component's props interface from `packages/rialto/src/components/`.
**Warning signs:** TypeScript errors on prop names that "should work".

### Pitfall 4: Forgetting to remove PostCSS / Tailwind config files
**What goes wrong:** `package.json` has Tailwind removed but `postcss.config.js` and `tailwind.config.js` remain. Vite may try to process them and emit warnings, or future `pnpm add tailwindcss` will silently re-enable it.
**Why it happens:** Removing npm packages doesn't clean up config files.
**How to avoid:** Delete `postcss.config.js`, `tailwind.config.js` and all `@tailwind` directives in CSS files as part of the cleanup task.
**Warning signs:** `pnpm build` emits PostCSS plugin warnings.

### Pitfall 5: Scroll-to-section IDs missing
**What goes wrong:** Hero CTA buttons use `scrollIntoView()` but target elements lack matching `id` attributes — buttons do nothing.
**Why it happens:** Easy to forget to add `id="projects"` etc. to section wrapper elements.
**How to avoid:** Add `id` attributes to each section in `HomePage.tsx` and verify by clicking CTAs in dev mode.
**Warning signs:** CTA buttons don't scroll anywhere.

### Pitfall 6: `accent` className on Hero title requires literal string "accent"
**What goes wrong:** Using a CSS Module class or a different className for the accent span in `title` doesn't apply the gold color.
**Why it happens:** The Hero CSS Module uses `.title :global(.accent)` — it expects the literal global class `accent` (not a scoped module class).
**How to avoid:** Use exactly `<span className="accent">word</span>` inside the `title` prop — no module reference.
**Warning signs:** The italic gold accent text appears in unstyled black.

## Code Examples

Verified patterns from official sources (codebase inspection):

### Full main.tsx Pattern
```typescript
// Source: apps/rialto-web/src/main.tsx (established project pattern)
import { StrictMode, useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@mbe/rialto/styles";
import "./global.css";
import { RialtoProvider } from "@mbe/rialto";
import { App } from "./App";

function getInitialTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  const saved = localStorage.getItem("rialto-theme");
  if (saved === "dark" || saved === "light") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function Root() {
  const [theme, setTheme] = useState<"light" | "dark">(getInitialTheme);

  useEffect(() => {
    localStorage.setItem("rialto-theme", theme);
  }, [theme]);

  return (
    <RialtoProvider theme={theme}>
      <BrowserRouter>
        {/* marketing: no basename — owns root "/" */}
        <App theme={theme} onThemeToggle={() => setTheme(t => t === "dark" ? "light" : "dark")} />
      </BrowserRouter>
    </RialtoProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
```

### global.css Pattern
```css
/* Source: apps/rialto-web/src/global.css (established project pattern) */
@import url("https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300;1,9..40,400&display=swap");

body {
  font-family: var(--rialto-font-sans);
  font-size: var(--rialto-text-base);
  font-weight: var(--rialto-weight-regular);
  line-height: var(--rialto-leading-normal);
  color: var(--rialto-text-primary);
  background-color: var(--rialto-surface);
}

::selection {
  background-color: var(--rialto-accent-muted);
  color: var(--rialto-text-primary);
}
```

### Tailwind Removal Checklist
```bash
# From apps/marketing directory:
pnpm remove tailwindcss postcss autoprefixer @mbe/ui
rm tailwind.config.js postcss.config.js

# Replace @tailwind directives in index.css by importing rialto styles in main.tsx instead
# Delete or empty src/index.css (or repurpose as global.css)

# Verification:
grep -r "tailwind" src/          # should return 0 results
grep -r "@mbe/ui" src/           # should return 0 results
grep -r "className=\"text-" src/ # should return 0 results (spot-check)
```

### Neon-Style Hero Typography
```tsx
// Large tight-tracked display, matching the neon.com reference:
// - Eyebrow: small all-caps label (handled by Hero component's .eyebrow class)
// - Title: --rialto-text-4xl (69px), font-weight 300, tracking: --rialto-tracking-tight (-0.02em)
// - This is built into the Hero component — no override needed
<Hero
  eyebrow="Engineering Leader"
  title={<>One-person team. <span className="accent">Full ownership.</span></>}
  subtitle="I design, build, ship, and operate — from component library to Kubernetes ingress."
  minHeight="90vh"
  actions={
    <Stack direction="row" gap="sm" justify="center">
      <Button variant="primary" size="lg">See my work</Button>
      <Button variant="ghost" size="lg">About me</Button>
    </Stack>
  }
/>
```

### Project Card with Tech Tags
```tsx
// Source: packages/rialto/src/components/Card/Card.tsx, Tag/Tag.tsx
interface Project {
  title: string;
  description: string;
  tags: string[];
  href: string;
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <Card variant="elevated" tilt className={styles.projectCard}>
      <Stack gap="md">
        <Text variant="display" as="h3" color="primary">{project.title}</Text>
        <Stack direction="row" gap="xs" wrap>
          {project.tags.map(tag => <Tag key={tag}>{tag}</Tag>)}
        </Stack>
        <Text variant="body" color="secondary">{project.description}</Text>
        <a href={project.href} target="_blank" rel="noopener noreferrer">
          <Button variant="secondary" size="sm">View live</Button>
        </a>
      </Stack>
    </Card>
  );
}
```

### Section CSS Module Pattern
```css
/* pages/HomePage.module.css — structural layout ONLY, all values via tokens */
.section {
  padding: var(--rialto-space-4xl) var(--rialto-space-lg);
}

.sectionInner {
  max-width: 1080px;
  margin-inline: auto;
}

.projectGrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--rialto-space-lg);
  margin-block-start: var(--rialto-space-2xl);
}

@media (max-width: 640px) {
  .projectGrid {
    grid-template-columns: 1fr;
  }
}
```

## Discretion Recommendations

Based on research into Rialto's design language and the neon.com reference:

**Dark mode default:** YES — Rialto's dark theme (warm charcoal `#1e1c1a` surfaces, no pure black) aligns with the bold/premium aesthetic requested. Dark default matches neon.com. Include a theme toggle so visitors can switch.

**Section ordering:** Hero → Projects → About → Contact — leads with the work, then the person. Mirrors the neon.com structure (product first, explanation second).

**Navbar:** Minimal — a thin top bar with name/logo on left and theme toggle on right. No sticky behavior needed for a single-page scroll. Keep it lightweight; the hero is the primary impression.

**Hero CTAs:** Scroll-to-section ("See my work" → scrolls to Projects, "About me" → scrolls to About). Keep visitor on-page.

**Project cards:** Rich — title, 2-4 tech Tags, 2-sentence description, "View live" button. Tilt effect enabled for interactivity. Text-only (no screenshots) keeps load fast and focus on engineering story.

**Accent color:** Use the existing Rialto gold (`--rialto-accent: #c4922a`) — it IS the design language. Do not introduce a custom palette.

**Footer:** `Footer` minimal variant with copyright + GitHub/LinkedIn/email links inline.

## Project Content (Planner Reference)

Projects to feature (from CONTEXT.md decisions):

| Card | Title | Tags | Live Link |
|------|-------|------|-----------|
| 1 | Rialto Design System | React, TypeScript, Vite, Framer Motion | `/rialto` |
| 2 | Hospitality App | React, Auth0, Fastify, PostgreSQL | `/hospitality` |
| 3 | Agent System | Claude API, SSE, Fastify | (no public link — describe only) |
| 4 | MBE CLI | Node.js, TypeScript, pnpm | (no public link — describe only) |
| 5 | This site (meta card) | Turborepo, Pulumi, Rialto, DigitalOcean | (self-referential; link to `/rialto`) |

Cards 3 and 4 have no live link — omit the "View live" button or disable it, or consider showing only the cards with live links (1, 2, 5) to honor "Live app links only" decision from CONTEXT.md. Planner should decide based on the 3+ requirement in PORT-03.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@mbe/ui` (shadcn-style primitives) | `@mbe/rialto` (project design system) | Phase 1-3 migration | All components now from single source of truth |
| Tailwind utility classes | CSS Modules + `--rialto-*` custom properties | Phase 1 pattern established | Eliminates Tailwind build dependency, enforces token system |
| `create-react-app` patterns | Vite + React 19 + ESM | Already current | No change |

**Deprecated/outdated in this codebase:**
- `@mbe/ui`: Scheduled for deletion in Phase 4. In Phase 3, just remove it from marketing's deps.
- `@tailwind base/components/utilities` in `index.css`: Replace with `@mbe/rialto/styles` import in `main.tsx`.
- `tailwind.config.js`, `postcss.config.js`: Delete after removal.

## Open Questions

1. **Agent System and MBE CLI live links**
   - What we know: CONTEXT.md says "Live app links only — no GitHub repo links on cards"
   - What's unclear: Agent system runs on port 3003 (internal); CLI has no web UI. These have no public live link.
   - Recommendation: Planner should either (a) include only the 3 cards with live links (Rialto, Hospitality, meta site) meeting the "3+" minimum in PORT-03, or (b) include Agent/CLI cards without a link button and add a brief note. Option (a) is cleaner.

2. **Theme toggle inclusion**
   - What we know: Claude's discretion. Rialto supports full dark/light switching.
   - What's unclear: Is the toggle worth the navbar space on a portfolio?
   - Recommendation: Include — it demonstrates Rialto's theme system as a portfolio feature, which reinforces the "this site IS the project" narrative.

3. **Rialto-web Phase 1, Plan 03 completion**
   - What we know: STATE.md shows plans 01-01, 01-02, 01-03 complete (3/3). But ROADMAP.md shows `01-03-PLAN.md` unchecked. Possible state inconsistency.
   - What's unclear: Is Tailwind actually removed from `apps/rialto-web`? Is the `/rialto` Pulumi ingress rule live?
   - Recommendation: Planner should include a verification step for Phase 1 completion before or as part of Phase 3 work, since PORT-06 requires `/rialto` to be a live navigable link.

## Validation Architecture

Note: `workflow.nyquist_validation` is not present in `.planning/config.json`. Skipping formal validation architecture section — no test infrastructure exists in `apps/marketing` and rialto-web (the reference app) has no unit test setup either. The phase's success criteria are all verifiable manually or via `grep` commands.

**Manual verification commands (planner should include in task verification steps):**

```bash
# Tailwind removal verification
grep -r "className=\"" apps/marketing/src/ | grep -v "styles\." | grep -v "className=\"accent\""
# Expected: 0 matches (or only legitimate non-Tailwind classNames)

grep -r "@tailwind" apps/marketing/src/
# Expected: 0 matches

grep -r "@mbe/ui" apps/marketing/src/
# Expected: 0 matches

# Build verification
cd apps/marketing && pnpm build
# Expected: exits 0, produces dist/

# TypeScript verification
cd apps/marketing && pnpm typecheck
# Expected: exits 0, no errors

# Rialto lint check
pnpm lint
# Expected: exits 0
```

## Sources

### Primary (HIGH confidence)
- `packages/rialto/src/components/Hero/Hero.tsx` — Hero props API and animation behavior (direct codebase read)
- `packages/rialto/src/components/Card/Card.tsx` — Card variants and tilt prop (direct codebase read)
- `packages/rialto/src/components/Stack/Stack.tsx` — Stack gap/align/justify API (direct codebase read)
- `packages/rialto/src/components/Button/Button.tsx` — Button variant/size API (direct codebase read)
- `packages/rialto/src/components/Tag/Tag.tsx` — Tag variant/selected API (direct codebase read)
- `packages/rialto/src/components/Footer/Footer.tsx` — Footer minimal/rich variants (direct codebase read)
- `packages/rialto/src/components/Text/Text.tsx` — Text variant/color/as API (direct codebase read)
- `packages/rialto/src/components/Navbar/Navbar.tsx` — Navbar sidebar-style API (direct codebase read)
- `packages/rialto/src/tokens/colors.css` — Complete token palette including dark theme (direct codebase read)
- `packages/rialto/src/tokens/typography.css` — Type scale tokens (direct codebase read)
- `packages/rialto/src/tokens/spacing.css` — Spacing scale (direct codebase read)
- `packages/rialto/src/providers/RialtoProvider.tsx` — Provider API and data-theme mechanism (direct codebase read)
- `apps/rialto-web/src/main.tsx` — Established integration pattern for RialtoProvider + BrowserRouter (direct codebase read)
- `apps/rialto-web/src/global.css` — Google Fonts + body token assignment pattern (direct codebase read)
- `apps/marketing/src/` — Current app state: Tailwind + @mbe/ui, placeholder content (direct codebase read)
- `apps/marketing/package.json` — Current deps including tailwindcss/postcss/autoprefixer to remove (direct codebase read)
- `packages/rialto/CLAUDE.md` — Rialto authoring guidelines, token rules, motion rules (direct codebase read)
- `packages/rialto/llms.txt` — Component catalog and selection guide (direct codebase read)

### Secondary (MEDIUM confidence)
- neon.com (WebFetch) — Hero design reference: dark background, bold sans-serif headline, minimal CTAs, generous whitespace. Consistent with Rialto's dark theme aesthetic.

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All libraries are already in the monorepo; APIs verified from source
- Architecture: HIGH — Patterns directly copied from proven rialto-web integration
- Pitfalls: HIGH — Derived from actual code state (Tailwind classes in source, @mbe/ui imports) and Rialto CLAUDE.md documented rules
- Content recommendations: MEDIUM — Based on CONTEXT.md decisions + design reference; planner has final discretion

**Research date:** 2026-02-28
**Valid until:** 2026-03-28 (stable — Rialto is internal; no external API drift risk)
