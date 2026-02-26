# RTL Bi-directional Support — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert all directional CSS to logical properties, add showcase RTL toggle, and add ESLint rule to prevent regressions.

**Architecture:** Mechanical CSS property swaps across 27 files (~114 properties), plus `[dir=rtl]` overrides for `transform-origin` (no logical keyword support) and `translateX` animations. Showcase gets a dir toggle button. ESLint `no-restricted-syntax` rule catches regressions.

**Tech Stack:** CSS logical properties, ESLint custom rules

**Design doc:** `docs/plans/2026-02-22-rtl-support-design.md`

---

### Task 1: Logical properties — feedback & form components

Convert margin, padding, positioning, border, and text-align in feedback and form component CSS files.

**Files to modify:**

- `src/components/Alert/Alert.module.css`
- `src/components/Banner/Banner.module.css`
- `src/components/Toast/Toast.module.css`
- `src/components/Input/Input.module.css`
- `src/components/TextArea/TextArea.module.css`
- `src/components/NumberInput/NumberInput.module.css`
- `src/components/Select/Select.module.css`
- `src/components/PinInput/PinInput.module.css`
- `src/components/Slider/Slider.module.css`
- `src/components/Tag/Tag.module.css`

**Step 1: Apply conversions**

For each file, use `replace_all: true` where the property appears multiple times, otherwise single replacements:

**Alert.module.css:**

- `border-left:` → `border-inline-start:` (replace_all)
- `border-left-color:` → `border-inline-start-color:` (replace_all)
- `margin-right: -4px` → `margin-inline-end: -4px`

**Banner.module.css:**

- `border-left:` → `border-inline-start:` (replace_all)
- `border-left-color:` → `border-inline-start-color:` (replace_all)

**Toast.module.css:**

- `border-left:` → `border-inline-start:` (replace_all)
- `padding-right: var(--rialto-space-xl)` → `padding-inline-end: var(--rialto-space-xl)`
- `padding-left: var(--rialto-space-lg)` → `padding-inline-start: var(--rialto-space-lg)`
- `right: var(--rialto-space-lg)` → `inset-inline-end: var(--rialto-space-lg)`
- `left: var(--rialto-space-sm)` → `inset-inline-start: var(--rialto-space-sm)` (replace_all)
- `right: var(--rialto-space-xs)` → `inset-inline-end: var(--rialto-space-xs)`
- `left: 0` → `inset-inline-start: 0`
- `right: var(--rialto-space-sm)` → `inset-inline-end: var(--rialto-space-sm)`

**Input.module.css:**

- `right: var(--rialto-space-xs)` → `inset-inline-end: var(--rialto-space-xs)`

**TextArea.module.css:**

- `right: var(--rialto-space-xs)` → `inset-inline-end: var(--rialto-space-xs)`
- `margin-left: auto` → `margin-inline-start: auto`

**NumberInput.module.css:**

- `border-right: none` → `border-inline-end: none`
- `border-left: none` → `border-inline-start: none`
- `border-left: 1px solid var(--rialto-border)` → `border-inline-start: 1px solid var(--rialto-border)`
- `border-right: 1px solid var(--rialto-border)` → `border-inline-end: 1px solid var(--rialto-border)`
- `margin-left: var(--rialto-space-2xs)` → `margin-inline-start: var(--rialto-space-2xs)`

**Select.module.css:**

- `left: 0` → `inset-inline-start: 0`
- `right: 0` → `inset-inline-end: 0`
- `text-align: left` → `text-align: start` (replace_all)

**PinInput.module.css:**

- `margin-left: var(--rialto-space-2xs)` → `margin-inline-start: var(--rialto-space-2xs)`

**Slider.module.css:**

- `left: 0` → `inset-inline-start: 0`

**Tag.module.css:**

- `margin-right: calc(-1 * var(--rialto-space-xs))` → `margin-inline-end: calc(-1 * var(--rialto-space-xs))`
- `margin-left: calc(-1 * var(--rialto-space-2xs))` → `margin-inline-start: calc(-1 * var(--rialto-space-2xs))`

**Step 2: Run lint + typecheck**

```bash
npm run lint && npx tsc --noEmit
```

Expected: 0 errors

**Step 3: Commit**

```bash
git add src/components/Alert/Alert.module.css src/components/Banner/Banner.module.css src/components/Toast/Toast.module.css src/components/Input/Input.module.css src/components/TextArea/TextArea.module.css src/components/NumberInput/NumberInput.module.css src/components/Select/Select.module.css src/components/PinInput/PinInput.module.css src/components/Slider/Slider.module.css src/components/Tag/Tag.module.css
git commit -m "refactor: convert feedback & form component CSS to logical properties"
```

---

### Task 2: Logical properties — navigation & overlay components

**Files to modify:**

- `src/components/Navbar/Navbar.module.css`
- `src/components/Sidebar/Sidebar.module.css`
- `src/components/NavigationMenu/NavigationMenu.module.css`
- `src/components/DropdownMenu/DropdownMenu.module.css`
- `src/components/ContextMenu/ContextMenu.module.css`
- `src/components/MegaMenu/MegaMenu.module.css`
- `src/components/Steps/Steps.module.css`
- `src/components/Drawer/Drawer.module.css`
- `src/components/Popover/Popover.module.css`
- `src/components/Tooltip/Tooltip.module.css`
- `src/components/HoverCard/HoverCard.module.css`

**Step 1: Apply conversions**

**Navbar.module.css:**

- `border-right: 1px solid var(--rialto-border)` → `border-inline-end: 1px solid var(--rialto-border)`
- `left: var(--rialto-space-sm)` → `inset-inline-start: var(--rialto-space-sm)`
- `padding-left: 32px` → `padding-inline-start: 32px`
- `padding-right: 60px` → `padding-inline-end: 60px`
- `right: var(--rialto-space-sm)` → `inset-inline-end: var(--rialto-space-sm)`
- `padding-right: var(--rialto-space-xs)` → `padding-inline-end: var(--rialto-space-xs)`
- `left: 0` → `inset-inline-start: 0`

**Sidebar.module.css:**

- `border-right: 1px solid var(--rialto-border)` → `border-inline-end: 1px solid var(--rialto-border)`
- `text-align: left` → `text-align: start`

**NavigationMenu.module.css:**

- `left: 0` → `inset-inline-start: 0`

**DropdownMenu.module.css:**

- `left: 0` → `inset-inline-start: 0`
- `left: auto` → `inset-inline-start: auto`
- `right: 0` → `inset-inline-end: 0`
- `text-align: left` → `text-align: start`
- `margin-left: auto` → `margin-inline-start: auto`

**ContextMenu.module.css:**

- `text-align: left` → `text-align: start`
- `margin-left: auto` → `margin-inline-start: auto`

**MegaMenu.module.css:**

- `left: 50%` → `inset-inline-start: 50%`

**Steps.module.css:**

- `left: calc(50% + 18px)` → `inset-inline-start: calc(50% + 18px)`
- `right: calc(-50% + 18px)` → `inset-inline-end: calc(-50% + 18px)`
- `left: 13px` → `inset-inline-start: 13px`
- `left: calc(50% + 15px)` → `inset-inline-start: calc(50% + 15px)`
- `right: calc(-50% + 15px)` → `inset-inline-end: calc(-50% + 15px)`
- `left: 10px` → `inset-inline-start: 10px`

**Drawer.module.css:**

- `right: 0` (line 29) → `inset-inline-end: 0`
- `border-left: 1px solid var(--rialto-border)` → `border-inline-start: 1px solid var(--rialto-border)`
- `left: 0` (line 42) → `inset-inline-start: 0`
- `border-right: 1px solid var(--rialto-border)` → `border-inline-end: 1px solid var(--rialto-border)`
- `left: 0` (line 54) → `inset-inline-start: 0`
- `right: 0` (line 55) → `inset-inline-end: 0`

Note: Drawer has both `left: 0` and `right: 0` in different contexts (`.right` variant at line 29, `.left` variant at line 42, `.full` variant at lines 54-55). Use unique surrounding context for each edit, not replace_all.

**Popover.module.css:**

- `left: 50%` → `inset-inline-start: 50%` (replace_all — appears in .top and .bottom variants)
- `right: calc(100% + 8px)` → `inset-inline-end: calc(100% + 8px)`
- `left: calc(100% + 8px)` → `inset-inline-start: calc(100% + 8px)`

**Tooltip.module.css:**

- `left: 50%` → `inset-inline-start: 50%` (replace_all)
- `right: calc(100% + 6px)` → `inset-inline-end: calc(100% + 6px)`
- `left: calc(100% + 6px)` → `inset-inline-start: calc(100% + 6px)`

**HoverCard.module.css:**

- `left: 50%` → `inset-inline-start: 50%` (replace_all)

**Step 2: Run lint + typecheck**

```bash
npm run lint && npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add src/components/Navbar/Navbar.module.css src/components/Sidebar/Sidebar.module.css src/components/NavigationMenu/NavigationMenu.module.css src/components/DropdownMenu/DropdownMenu.module.css src/components/ContextMenu/ContextMenu.module.css src/components/MegaMenu/MegaMenu.module.css src/components/Steps/Steps.module.css src/components/Drawer/Drawer.module.css src/components/Popover/Popover.module.css src/components/Tooltip/Tooltip.module.css src/components/HoverCard/HoverCard.module.css
git commit -m "refactor: convert navigation & overlay component CSS to logical properties"
```

---

### Task 3: Logical properties — data, layout, and page CSS

**Files to modify:**

- `src/components/Table/Table.module.css`
- `src/components/Timeline/Timeline.module.css`
- `src/components/Avatar/Avatar.module.css`
- `src/components/Collapsible/Collapsible.module.css`
- `src/components/Text/Text.module.css`
- `src/components/Tree/Tree.module.css`
- `src/components/Button/Button.module.css`
- `src/components/Progress/Progress.module.css`
- `src/showcase/App.module.css`
- `src/pages/drivers/DriverForm.module.css`
- `src/pages/drivers/DriverLayout.module.css`
- `src/pages/dashboard/Dashboard.module.css`
- `src/pages/teams/TeamCreate.module.css`

**Step 1: Apply conversions**

**Table.module.css:**

- `text-align: left` → `text-align: start`
- `text-align: right` → `text-align: end`
- `margin-left: var(--rialto-space-2xs)` → `margin-inline-start: var(--rialto-space-2xs)`

**Timeline.module.css:**

- `left: 50%` → `inset-inline-start: 50%`
- `text-align: right` → `text-align: end`
- `padding-right: var(--rialto-space-sm)` → `padding-inline-end: var(--rialto-space-sm)`
- `padding-left: var(--rialto-space-sm)` → `padding-inline-start: var(--rialto-space-sm)`

**Avatar.module.css:**

- `right: -1px` → `inset-inline-end: -1px` (replace_all)
- `right: 0` → `inset-inline-end: 0`
- `right: 1px` → `inset-inline-end: 1px`
- `margin-left: -8px` → `margin-inline-start: -8px`
- `margin-left: 0` → `margin-inline-start: 0`

**Collapsible.module.css:**

- `text-align: left` → `text-align: start`

**Text.module.css:**

- `text-align: left` → `text-align: start`
- `text-align: right` → `text-align: end`

**Tree.module.css:**

- `padding-right: var(--rialto-space-sm)` → `padding-inline-end: var(--rialto-space-sm)`
- `text-align: left` → `text-align: start`

**Button.module.css:**

- `right: 4px` → `inset-inline-end: 4px`

**Progress.module.css:**

- `left: 0` → `inset-inline-start: 0`

**App.module.css:**

- `left: 10%` → `inset-inline-start: 10%` (replace_all)
- `right: 10%` → `inset-inline-end: 10%` (replace_all)
- `text-align: right` → `text-align: end` (replace_all)
- `text-align: left` → `text-align: start` (replace_all)
- All other `left:` positioning → `inset-inline-start:` (check each for unique context)
- Note: App.module.css has ~11 `left:` positioning instances with different values. Use unique surrounding selectors/context for each edit.

**DriverForm.module.css:**

- `margin-left: auto` → `margin-inline-start: auto`

**DriverLayout.module.css:**

- `margin-left: auto` → `margin-inline-start: auto`

**Dashboard.module.css:**

- `margin-left: auto` → `margin-inline-start: auto`

**TeamCreate.module.css:**

- `margin-left: auto` → `margin-inline-start: auto`

**Step 2: Run lint + typecheck**

```bash
npm run lint && npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add src/components/Table/Table.module.css src/components/Timeline/Timeline.module.css src/components/Avatar/Avatar.module.css src/components/Collapsible/Collapsible.module.css src/components/Text/Text.module.css src/components/Tree/Tree.module.css src/components/Button/Button.module.css src/components/Progress/Progress.module.css src/showcase/App.module.css src/pages/drivers/DriverForm.module.css src/pages/drivers/DriverLayout.module.css src/pages/dashboard/Dashboard.module.css src/pages/teams/TeamCreate.module.css
git commit -m "refactor: convert data, layout, and page CSS to logical properties"
```

---

### Task 4: Special cases — transform-origin and translateX [dir=rtl] overrides

CSS `transform-origin` does NOT support logical keywords (`start`/`end`). These need `[dir=rtl]` selector overrides.

**Files to modify:**

- `src/components/Meter/Meter.module.css`
- `src/components/Progress/Progress.module.css`
- `src/components/Skeleton/Skeleton.module.css`
- `src/components/Toast/Toast.module.css`
- `src/components/Popover/Popover.module.css`
- `src/components/Tooltip/Tooltip.module.css`
- `src/components/DropdownMenu/DropdownMenu.module.css`
- `src/components/ContextMenu/ContextMenu.module.css`
- `src/components/NavigationMenu/NavigationMenu.module.css`

**Step 1: Add [dir=rtl] overrides for transform-origin**

After each selector that uses `transform-origin: left` or `transform-origin: right`, add a `[dir=rtl]` override. Example pattern:

```css
/* Existing */
.trigger {
  transform-origin: top left;
}

/* Add after */
[dir='rtl'] .trigger {
  transform-origin: top right;
}
```

Apply to these files:

**Meter.module.css:** `transform-origin: left` → add `[dir='rtl'] .fill { transform-origin: right; }`

**Progress.module.css:** `transform-origin: left` → add `[dir='rtl']` override with `transform-origin: right`

**Toast.module.css:** `transform-origin: left` → add `[dir='rtl']` override with `transform-origin: right`

**Popover.module.css:**

- `.right` variant: `transform-origin: center right` → add `[dir='rtl'] .right { transform-origin: center left; }`
- `.left` variant: `transform-origin: center left` → add `[dir='rtl'] .left { transform-origin: center right; }`

**Tooltip.module.css:**

- `.right` variant: `transform-origin: right center` → add `[dir='rtl']` with `left center`
- `.left` variant: `transform-origin: left center` → add `[dir='rtl']` with `right center`

**DropdownMenu.module.css:**

- `transform-origin: top left` → add `[dir='rtl']` with `top right`
- `transform-origin: top right` → add `[dir='rtl']` with `top left`

**ContextMenu.module.css:** `transform-origin: top left` → add `[dir='rtl']` with `top right`

**NavigationMenu.module.css:** `transform-origin: top left` → add `[dir='rtl']` with `top right`

**Step 2: Add [dir=rtl] overrides for translateX animations**

Check `Skeleton.module.css` and `Progress.module.css` for directional `translateX` in @keyframes. Add RTL keyframe variants and `[dir=rtl]` selector to swap animation-name.

**Skeleton.module.css** — shimmer animation:

```css
/* Add RTL keyframe */
@keyframes shimmer-rtl {
  to {
    transform: translateX(-100%);
  }
}

[dir='rtl'] .skeleton::after {
  animation-name: shimmer-rtl;
}
```

**Progress.module.css** — indeterminate animation:

```css
/* Add RTL keyframe */
@keyframes indeterminate-rtl {
  0% {
    transform: translateX(100%);
  }
  100% {
    transform: translateX(-350%);
  }
}

[dir='rtl'] .indeterminate .bar {
  animation-name: indeterminate-rtl;
}
```

(Verify exact class names and keyframe names by reading the files first.)

**Step 3: Run lint + typecheck + tests**

```bash
npm run lint && npx tsc --noEmit && npx vitest run
```

Expected: All pass (148 tests)

**Step 4: Commit**

```bash
git add src/components/Meter/Meter.module.css src/components/Progress/Progress.module.css src/components/Skeleton/Skeleton.module.css src/components/Toast/Toast.module.css src/components/Popover/Popover.module.css src/components/Tooltip/Tooltip.module.css src/components/DropdownMenu/DropdownMenu.module.css src/components/ContextMenu/ContextMenu.module.css src/components/NavigationMenu/NavigationMenu.module.css
git commit -m "refactor: add [dir=rtl] overrides for transform-origin and translateX animations"
```

---

### Task 5: Showcase RTL toggle, ESLint rule, and TODO

**Files to modify:**

- `src/showcase/App.tsx`
- `eslint.config.js` (or wherever ESLint config lives — check first)
- `TODO.md`

**Step 1: Add RTL toggle to showcase**

In `src/showcase/App.tsx`, find the floating controls section (near the dark mode toggle). Add a `dir` state variable and toggle button.

Add state:

```tsx
const [rtl, setRtl] = useState(false);
```

On the showcase root `<div>`, add:

```tsx
dir={rtl ? 'rtl' : undefined}
```

Add toggle button in the floating controls (near the dark mode button):

```tsx
<button
  className={styles.themeToggle}
  onClick={() => setRtl((v) => !v)}
  aria-label="Toggle text direction"
  title={rtl ? 'Switch to LTR' : 'Switch to RTL'}
>
  {rtl ? '⇄' : '⇆'}
</button>
```

Use simple arrow characters (⇄/⇆) or an SVG. Match the existing toggle button pattern (className, size, style).

**Step 2: Add ESLint rule**

Find the ESLint config file. Add a `no-restricted-syntax` rule (or stylelint equivalent) for CSS files. If ESLint doesn't lint CSS, add a note to CLAUDE.md instead about always using logical properties.

Check what linting tools are used for CSS first:

```bash
grep -r "stylelint\|postcss-logical" package.json
```

If no CSS linter exists, add a note to `CLAUDE.md` under the Token Usage Rules section:

```markdown
### Logical Properties (RTL Support)

- Always use CSS logical properties instead of directional ones
- `margin-left/right` → `margin-inline-start/end`
- `padding-left/right` → `padding-inline-start/end`
- `left/right` → `inset-inline-start/end`
- `border-left/right` → `border-inline-start/end`
- `text-align: left/right` → `text-align: start/end`
```

**Step 3: Update TODO.md**

In the Priority 3 table, replace the RTL row:

```
| ~~RTL / bi-directional support~~  | Medium | Medium | ✅ All CSS converted to logical properties, [dir=rtl] overrides for transforms, showcase toggle |
```

**Step 4: Run full verification**

```bash
npm run lint && npx tsc --noEmit && npx vitest run && npm run build
```

Expected: All pass

**Step 5: Commit**

```bash
git add src/showcase/App.tsx TODO.md CLAUDE.md
git commit -m "feat: add RTL showcase toggle, update docs and TODO"
```
