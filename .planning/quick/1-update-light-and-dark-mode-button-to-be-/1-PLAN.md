---
phase: quick
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/rialto/src/components/ThemeToggle/ThemeToggle.tsx
  - packages/rialto/src/components/ThemeToggle/ThemeToggle.module.css
  - packages/rialto/src/components/ThemeToggle/index.ts
  - packages/rialto/src/components/index.ts
  - apps/rialto-web/src/components/ThemeToggle.tsx
  - apps/rialto-web/src/components/ThemeToggle.module.css
  - apps/rialto-web/src/layouts/ShowcaseLayout.tsx
  - apps/marketing/src/components/Navbar.tsx
autonomous: true
requirements: []

must_haves:
  truths:
    - "ThemeToggle is exported from @mbe/rialto barrel"
    - "rialto-web uses shared ThemeToggle from @mbe/rialto, not local copy"
    - "marketing uses shared ThemeToggle icon button, not Toggle switch with emoji"
  artifacts:
    - path: "packages/rialto/src/components/ThemeToggle/ThemeToggle.tsx"
      provides: "Shared ThemeToggle component"
      exports: ["ThemeToggle", "ThemeToggleProps"]
    - path: "packages/rialto/src/components/ThemeToggle/ThemeToggle.module.css"
      provides: "ThemeToggle styles using Rialto tokens"
    - path: "packages/rialto/src/components/ThemeToggle/index.ts"
      provides: "Barrel export for ThemeToggle"
  key_links:
    - from: "packages/rialto/src/components/index.ts"
      to: "packages/rialto/src/components/ThemeToggle/index.ts"
      via: "barrel re-export"
      pattern: 'export \* from "./ThemeToggle"'
    - from: "apps/rialto-web/src/layouts/ShowcaseLayout.tsx"
      to: "@mbe/rialto"
      via: "named import"
      pattern: 'import.*ThemeToggle.*from "@mbe/rialto"'
    - from: "apps/marketing/src/components/Navbar.tsx"
      to: "@mbe/rialto"
      via: "named import"
      pattern: 'import.*ThemeToggle.*from "@mbe/rialto"'
---

<objective>
Move the rialto-web ThemeToggle component into the Rialto design system as a shared component, then update rialto-web and marketing to consume it from `@mbe/rialto`.

Purpose: Consistent light/dark mode toggle (sun/moon icon button) across all apps instead of the marketing site using a Toggle switch with emoji.
Output: ThemeToggle exported from `@mbe/rialto`, both consumer apps updated.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/rialto/CLAUDE.md
@packages/rialto/src/components/index.ts

<interfaces>
<!-- Existing ThemeToggle from rialto-web (source of truth for the move) -->

From apps/rialto-web/src/components/ThemeToggle.tsx:
```typescript
export interface ThemeToggleProps {
  theme: "light" | "dark";
  onToggle: () => void;
}
export function ThemeToggle({ theme, onToggle }: ThemeToggleProps): JSX.Element;
```

From apps/rialto-web/src/components/ThemeToggle.module.css:
```css
.button { /* 36px icon button, uses --rialto-surface-elevated, --rialto-border, --rialto-radius-default, --rialto-text-secondary */ }
.button:hover { /* --rialto-text-primary, --rialto-surface, --rialto-border-strong */ }
.button:focus-visible { /* --rialto-shadow-focus */ }
.button:active { /* --rialto-shadow-pressed, --rialto-text-primary */ }
```

From packages/rialto/src/components/AppBar/index.ts (pattern for barrel export):
```typescript
export { AppBar, type AppBarProps } from "./AppBar";
```

From apps/rialto-web/src/layouts/ShowcaseLayout.tsx (current import to update):
```typescript
import { ThemeToggle } from "../components/ThemeToggle";
```

From apps/marketing/src/components/Navbar.tsx (current Toggle usage to replace):
```typescript
import { Toggle, AppBar } from "@mbe/rialto";
// Uses <Toggle label={theme === "dark" ? "sun emoji" : "moon emoji"} checked={...} onCheckedChange={...} />
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Move ThemeToggle into Rialto package</name>
  <files>
    packages/rialto/src/components/ThemeToggle/ThemeToggle.tsx
    packages/rialto/src/components/ThemeToggle/ThemeToggle.module.css
    packages/rialto/src/components/ThemeToggle/index.ts
    packages/rialto/src/components/index.ts
  </files>
  <action>
    Create `packages/rialto/src/components/ThemeToggle/` directory with three files:

    1. **ThemeToggle.tsx** — Copy from `apps/rialto-web/src/components/ThemeToggle.tsx` with one change: use `React.forwardRef` pattern per Rialto component authoring conventions. The component is a button showing a sun SVG icon (in dark mode) or moon SVG icon (in light mode). Props: `theme: "light" | "dark"` and `onToggle: () => void`. Keep `displayName`, `aria-label`, and all SVG markup exactly as-is.

    2. **ThemeToggle.module.css** — Copy verbatim from `apps/rialto-web/src/components/ThemeToggle.module.css`. It already uses Rialto tokens correctly (`--rialto-surface-elevated`, `--rialto-border`, `--rialto-radius-default`, `--rialto-text-secondary`, `--rialto-shadow-focus`, `--rialto-shadow-pressed`). Add `composes: focusRing from "../../styles/surfaces.module.css"` for the focus-visible state instead of the inline box-shadow rule, per Rialto convention (check if focusRing composable exists first — if not, keep the inline `--rialto-shadow-focus` approach).

    3. **index.ts** — Barrel export following AppBar pattern:
       ```typescript
       export { ThemeToggle, type ThemeToggleProps } from "./ThemeToggle";
       ```

    4. **Update `packages/rialto/src/components/index.ts`** — Add `export * from "./ThemeToggle";` in alphabetical position (after Toggle, before Tooltip).
  </action>
  <verify>cd packages/rialto && pnpm typecheck</verify>
  <done>ThemeToggle is exported from @mbe/rialto with proper types, CSS module, and barrel export.</done>
</task>

<task type="auto">
  <name>Task 2: Update rialto-web and marketing to use shared ThemeToggle</name>
  <files>
    apps/rialto-web/src/layouts/ShowcaseLayout.tsx
    apps/rialto-web/src/components/ThemeToggle.tsx
    apps/rialto-web/src/components/ThemeToggle.module.css
    apps/marketing/src/components/Navbar.tsx
  </files>
  <action>
    1. **Update `apps/rialto-web/src/layouts/ShowcaseLayout.tsx`** — Change import from `import { ThemeToggle } from "../components/ThemeToggle"` to `import { ThemeToggle } from "@mbe/rialto"`. The JSX usage (`<ThemeToggle theme={theme} onToggle={onThemeToggle} />`) stays identical.

    2. **Delete** `apps/rialto-web/src/components/ThemeToggle.tsx` and `apps/rialto-web/src/components/ThemeToggle.module.css` — These are now consumed from the shared package. Before deleting, grep the rialto-web app to confirm no other files import from these local paths. If other files do import them, update those imports to `@mbe/rialto` as well.

    3. **Update `apps/marketing/src/components/Navbar.tsx`** — Replace the `Toggle` import with `ThemeToggle` from `@mbe/rialto`. Change the import line from `import { Toggle, AppBar } from "@mbe/rialto"` to `import { AppBar, ThemeToggle } from "@mbe/rialto"`. Replace the `<Toggle label={...} checked={...} onCheckedChange={onThemeToggle} aria-label={...} />` with `<ThemeToggle theme={theme} onToggle={onThemeToggle} />`. The `theme` and `onThemeToggle` props are already available from the `NavbarProps` interface (`theme` and `onThemeToggle`). Note: the prop name is `onThemeToggle` in NavbarProps but the ThemeToggle component expects `onToggle` — pass it as `onToggle={onThemeToggle}`.
  </action>
  <verify>pnpm typecheck && pnpm lint</verify>
  <done>rialto-web imports ThemeToggle from @mbe/rialto (local files deleted). Marketing Navbar uses ThemeToggle icon button instead of Toggle switch with emoji. Both apps typecheck cleanly.</done>
</task>

</tasks>

<verification>
1. `pnpm typecheck` — All packages and apps pass type checking
2. `pnpm lint` — No lint errors introduced
3. `pnpm build` — Full build succeeds
4. Visual: rialto-web showcase shows same sun/moon icon toggle in header
5. Visual: marketing site shows sun/moon icon toggle instead of emoji switch
</verification>

<success_criteria>
- ThemeToggle component exists in `packages/rialto/src/components/ThemeToggle/` with proper file structure
- ThemeToggle is exported from `@mbe/rialto` barrel
- rialto-web has NO local ThemeToggle files; imports from `@mbe/rialto`
- marketing Navbar uses `<ThemeToggle>` icon button, not `<Toggle>` switch with emoji
- `pnpm typecheck` and `pnpm lint` pass across the monorepo
</success_criteria>

<output>
After completion, create `.planning/quick/1-update-light-and-dark-mode-button-to-be-/1-SUMMARY.md`
</output>
