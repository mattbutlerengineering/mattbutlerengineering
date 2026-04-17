# Rialto → Figma: Migration Plan

> Comprehensive plan for extracting the Rialto design system (69 React components + design tokens) into a full Figma component library with automated token sync.

## Context

Rialto is a 69-component React design system built from scratch with CSS Modules + Framer Motion. Design tokens are defined as CSS custom properties with JSON schemas already in [DTCG format](https://tr.designtokens.org/format/) (`$value`/`$type`/`$description`). The goal is a full Figma component library with automated token sync — tokens automated, components built systematically with visual references.

The system has unique characteristics that make this non-trivial:
- **Vibe system** (3 presets: default/transacting/presenting) that overrides spacing, radius, and weight tokens
- **Surface materials** (aluminum, glass, recessed) that require manual Figma craft
- **Spring physics animations** (Framer Motion) that can only be documented, not represented
- **Light/dark themes** via `data-theme` attribute on the root element

### Approach: Figma MCP Server (Direct Push from Claude Code)

**Primary approach:** Use the Figma MCP server's `use_figma` tool to programmatically create Variables, Components, Styles, and Variants directly in a Figma file from Claude Code. The token extraction script (`scripts/generate-figma-tokens.ts`) provides the organized data; the MCP server pushes it.

**Fallback approach:** DTCG JSON + Tokens Studio plugin import (the `figma-tokens.json` output works as a standalone import if MCP is unavailable).

**Why MCP wins:** No intermediary tool (Tokens Studio) needed. Variables, Styles, and even Component frames can be created directly. The `generate_figma_design` tool can also capture the running showcase page as editable Figma frames for visual reference.

---

## Phase 1: Token Extraction Script (code work, ~3-5 days)

### 1a. Build `scripts/generate-figma-tokens.ts`

Reads all token sources and outputs a unified `figma-tokens.json` in DTCG format structured for [Tokens Studio](https://tokens.studio/) import.

**Input sources:**

| Source file | Format | Status |
|---|---|---|
| `src/tokens/colors.json` | DTCG JSON | Already compatible |
| `src/tokens/typography.json` | DTCG JSON | Already compatible |
| `src/tokens/spacing.json` | DTCG JSON | Already compatible |
| `src/tokens/radius.css` | CSS custom properties | Needs extraction → DTCG |
| `src/tokens/shadows.css` | CSS custom properties | Needs extraction → DTCG (includes easing, duration, z-index) |
| `src/tokens/colors.css` | CSS `[data-theme="dark"]` block | Needs dark theme extraction |
| `src/providers/vibes.ts` | TypeScript object | Needs vibe override extraction |

**Output structure** (`figma-tokens.json`):

```json
{
  "rialto/light": {
    "color": {
      "surface": { "default": { "$value": "#f8f6f3", "$type": "color" } },
      "text": { "primary": { "$value": "#1a1918", "$type": "color" } },
      "accent": { "default": { "$value": "#b0841e", "$type": "color" } }
    }
  },
  "rialto/dark": {
    "color": {
      "surface": { "default": { "$value": "#1e1c1a", "$type": "color" } },
      "text": { "primary": { "$value": "rgb(253 252 250 / 0.92)", "$type": "color" } },
      "accent": { "default": { "$value": "#d4a23a", "$type": "color" } }
    }
  },
  "rialto/default": {
    "spacing": { "sm": { "$value": "12px", "$type": "dimension" } },
    "radius": { "default": { "$value": "6px", "$type": "dimension" } },
    "font": { "weight": { "medium": { "$value": 500, "$type": "fontWeight" } } }
  },
  "rialto/transacting": {
    "spacing": { "sm": { "$value": "10px" }, "md": { "$value": "14px" } },
    "radius": { "default": { "$value": "4px" }, "soft": { "$value": "8px" } },
    "font": { "weight": { "medium": { "$value": 600 } } }
  },
  "rialto/presenting": {
    "spacing": { "md": { "$value": "20px" }, "lg": { "$value": "32px" } },
    "radius": { "default": { "$value": "8px" }, "soft": { "$value": "14px" } },
    "font": { "size": { "sm": { "$value": "0.9375rem" } } }
  }
}
```

Top-level keys become **Tokens Studio sets** → **Figma Variable modes**.

### 1b. Add npm script

```json
{
  "scripts": {
    "figma-tokens": "tsx scripts/generate-figma-tokens.ts"
  }
}
```

### 1c. CI validation (optional)

Add a check that `figma-tokens.json` is in sync with source token files — warns on PR if tokens changed but `figma-tokens.json` wasn't regenerated.

**Files to create:**
- `packages/rialto/scripts/generate-figma-tokens.ts`
- `packages/rialto/figma-tokens.json` (generated output, committed)

**Files to modify:**
- `packages/rialto/package.json` (add `figma-tokens` script)

---

## Phase 2: Component Showcase Page (code work, ~2-3 days)

Build a lightweight Vite page that renders every component in every variant/size/state for visual reference while building Figma components. No Storybook — just a static reference page.

### 2a. Showcase page structure

Use `packages/rialto/src/showcase/` (directory exists but is empty). Read `dist/manifest.json` to drive systematic variant rendering.

**For each component, render:**
- All `variant` values (primary/secondary/ghost, etc.)
- All `size` values (sm/md/lg)
- Key states: default, hover (documented), focus, disabled, loading
- Light and dark theme side-by-side
- All three vibes (default, transacting, presenting)

### 2b. Screenshot automation (optional)

Playwright script to capture each component section as a PNG for offline Figma reference.

**Files to create:**
- `packages/rialto/src/showcase/App.tsx`
- `packages/rialto/src/showcase/index.html`
- `packages/rialto/src/showcase/main.tsx`
- `packages/rialto/src/showcase/sections/` (one file per component tier)

---

## Phase 3: Figma Setup (manual, in Figma)

### 3a. Variable collections

| Collection | Modes | Source |
|---|---|---|
| Colors | Light, Dark | `rialto/light`, `rialto/dark` token sets |
| Spacing | Default, Transacting, Presenting | `rialto/default` + vibe overrides |
| Radius | Default, Transacting, Presenting | same |
| Typography | Default, Transacting, Presenting | same |

A designer can switch any frame between Light/Dark and Default/Transacting/Presenting vibes, and all child components adapt — mirroring exactly how the CSS cascade works in code.

### 3b. Text Styles (~15)

Composed from typography variables: each combination of size × weight that's actually used in components.

### 3c. Effect Styles (~14)

| Style | Light value | Dark value |
|---|---|---|
| Shadow/xs | `0 1px 2px rgb(26 25 24 / 0.05)` | `0 1px 2px rgb(0 0 0 / 0.15)` |
| Shadow/sm | `0 1px 2px ... 0 4px 12px ...` | heavier opacity |
| Shadow/md | `0 2px 4px ... 0 8px 24px ...` | heavier opacity |
| Shadow/lg | 3-layer shadow | heavier opacity |
| Shadow/pressed | inset shadow | inset, darker |
| Shadow/focus | gold glow ring | gold glow (brighter) |
| Shadow/glass | frosted + inner shine | darker backdrop |
| Shadow/ambient | warm gold halo | brighter gold |
| Shadow/luminous | elevation + warm bloom | warm bloom on dark |

**Note:** Shadows cannot be Figma Variables — they must be Effect Styles. Create light and dark variants of each.

### 3d. Surface material library components

These are CSS material recipes (`src/styles/surfaces.module.css`) that need manual Figma translation:

| Material | CSS technique | Figma equivalent |
|---|---|---|
| `.aluminum` | Linear gradient | Linear fill (surface-elevated → surface) |
| `.aluminumPolished` | Gradient + shadow | Linear fill + Effect Style |
| `.glass` | `backdrop-filter: blur` + translucent | Background blur effect + translucent fill + inner shadow shine |
| `.recessed` | Inset shadow + darker bg | Inner shadow Effect Style + recessed surface fill |
| `.focusRing` | Gold glow | Gold outer glow Effect Style |
| `.darkSurface` | Deep charcoal + token overrides | Dark fill frame that overrides child color mode |
| `.atmosphere` | Radial gold gradient orbs | Radial gradient overlay layers |
| `.grain` | SVG noise filter | Noise texture fill (Figma noise plugin) |
| `.shimmer` | CSS animation | Cannot animate; document as annotation |

---

## Phase 4: Component Library Build (manual, in Figma, ~5-7 weeks)

### Build order (by dependency tier)

**Tier 1 — Foundation primitives (12 components, ~1-2 weeks):**
Text, Button, Input, Badge, Toggle, Checkbox, Select, TextArea, NumberInput, Divider, Stack, Avatar

**Tier 2 — Containers & feedback (15 components, ~1-2 weeks):**
Card, Dialog, Drawer, Toast, Alert, Banner, Popover, Tooltip, DropdownMenu, ContextMenu, Tabs, SegmentedControl, Progress, Skeleton, Meter

**Tier 3 — Composite (15 components, ~2 weeks):**
Table, Accordion, Breadcrumb, Pagination, Steps, Timeline, Tree, DataList, CommandPalette, HoverCard, Collapsible, PinInput, InputGroup, Autocomplete, Slider

**Tier 4 — Layout & specialty (12 components, ~1 week):**
Navbar, NavigationMenu, Sidebar, GlobalNav, Footer, PageHeader, Hero, AppBar, EmptyState, ConfirmDialog, ScrollArea, AspectRatio

**Tier 5 — Domain-specific (15 components, ~1 week):**
ThemeToggle, FlipDot, GenCopilot, CopilotPreview, CopilotPromptBar, ImageUpload, Kbd, Stat, Tag, DisabledTooltip, ErrorBoundary, plus remaining

### Per-component process

1. **Read the spec** (`specs/{name}.spec.md` — 20 of 69 components have specs) for anatomy, states, tokens used, and accessibility notes
2. **Read the manifest** (`dist/manifest.json`) for the complete props interface including types and defaults
3. **Read the CSS Module** (`src/components/{Name}/{Name}.module.css`) for exact styling — this is the source of truth for how tokens combine
4. **Reference the showcase page** for visual accuracy across themes and vibes
5. **Build the Figma Component Set** with variant properties matching the React API
6. **Apply Figma Variables** for all token references (no hardcoded values in Figma)

### Variant property mapping

| React prop | Figma property type | Example |
|---|---|---|
| `variant` | Variant property | primary / secondary / ghost |
| `size` | Variant property | sm / md / lg |
| `disabled` | Boolean property | true / false |
| `isLoading` | Boolean property | true / false |
| State (interaction) | Variant property "State" | default / hover / pressed / focus / disabled |

---

## Phase 5: Sync Pipeline (code + Figma config, ~2-3 days)

### 5a. Token sync — Tokens Studio GitHub sync

Configure Tokens Studio to read from `packages/rialto/figma-tokens.json` in the GitHub repo.

**Workflow:**
```
Developer changes token CSS/JSON
  → runs `pnpm figma-tokens`
  → commits updated figma-tokens.json
  → Tokens Studio picks up change via GitHub sync
  → Figma Variables update automatically
```

### 5b. Component sync — Figma Code Connect

Add `.figma.tsx` files alongside each component that map Figma component instances to React code. This surfaces the real React API in Figma's Dev Mode inspect panel.

```
src/components/Button/
├── Button.tsx
├── Button.module.css
├── Button.figma.tsx    ← Code Connect mapping
└── index.ts
```

Example Code Connect file:
```tsx
import figma from "@figma/code-connect"
import { Button } from "./Button"

figma.connect(Button, "https://figma.com/...", {
  props: {
    variant: figma.enum("Variant", {
      Primary: "primary",
      Secondary: "secondary",
      Ghost: "ghost",
    }),
    size: figma.enum("Size", { Small: "sm", Medium: "md", Large: "lg" }),
    disabled: figma.boolean("Disabled"),
  },
  example: (props) => (
    <Button variant={props.variant} size={props.size} disabled={props.disabled}>
      Label
    </Button>
  ),
})
```

Publish with `npx figma connect publish`.

**Dependency:** `@figma/code-connect` dev dependency.

### 5c. Visual regression (optional)

Use the showcase page (Phase 2) as a visual baseline. Run Playwright screenshot comparisons on PR to detect unintended visual changes.

### 5d. Component drift audit

Script that reads `dist/manifest.json` and queries the Figma REST API to compare component lists. Run monthly or on-demand to flag missing or outdated Figma components.

---

## Sync Strategy Summary

| Layer | Sync method | Direction | Automation |
|---|---|---|---|
| **Tokens** | Tokens Studio + GitHub | Code → Figma | Fully automated |
| **Component API** | Figma Code Connect | Code → Figma | Semi-automated (write `.figma.tsx` once) |
| **Component visuals** | Spec files + showcase page | Shared contract | Manual, guided by specs |
| **Drift detection** | Manifest audit + visual regression | Code ↔ Figma | Automated checks |

---

## Verification Checklist

- [ ] **Token accuracy**: Spot-check 10 token values in Figma against source CSS — they must match exactly
- [ ] **Mode switching**: Switch a frame between Light/Dark and Default/Transacting/Presenting — all child components should adapt
- [ ] **Component fidelity**: Compare Figma components against the showcase page side-by-side for visual parity
- [ ] **Round-trip test**: Change a token value in code, regenerate `figma-tokens.json`, sync to Figma, verify the change propagates
- [ ] **Code Connect**: Verify that inspecting a Figma component in Dev Mode shows the correct React import and props

---

## Key Files Reference

| File | Role |
|---|---|
| `src/tokens/colors.json` | DTCG color tokens (light theme) |
| `src/tokens/colors.css` | Light + dark theme CSS custom properties |
| `src/tokens/typography.json` | DTCG font family, weight, size, line-height tokens |
| `src/tokens/spacing.json` | DTCG spacing scale (4px base, 9 steps) |
| `src/tokens/radius.css` | Border radius tokens (5 values) |
| `src/tokens/shadows.css` | Shadows, easing, duration, z-index (all light + dark) |
| `src/providers/vibes.ts` | Vibe preset override definitions (default/transacting/presenting) |
| `src/styles/surfaces.module.css` | Surface material recipes (aluminum, glass, recessed) |
| `dist/manifest.json` | Component registry with full props/types for all 69 components |
| `specs/*.spec.md` | 20 component specification files (anatomy, states, tokens, a11y) |

---

## Tooling Decisions

| Tool | Purpose | Why |
|---|---|---|
| **Tokens Studio for Figma** | Token import + GitHub sync | Native DTCG support, Variable mode mapping, free tier sufficient |
| **Figma Code Connect** | Component API bridging | First-party Figma tool, surfaces React code in Dev Mode |
| **tsx** (script runner) | Run token extraction script | Already in monorepo toolchain |
| **Playwright** (optional) | Screenshot automation | Already a project dependency |

### Why NOT these alternatives:
- **Style Dictionary**: More complex setup for the same result; Tokens Studio plugin is simpler for a single design system
- **Storybook**: Overkill for visual reference; a simple showcase page is faster and lighter
- **Figma Plugin API for components**: Programmatically generating 69 components with correct auto-layout is extraordinarily brittle; manual Figma craft yields better quality
