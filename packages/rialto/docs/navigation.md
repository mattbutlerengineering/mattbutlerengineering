# Navigation Components

Components for moving between views and locations.

## Quick Reference {#quick-reference}

| Need                  | Component          |
| --------------------- | ------------------ |
| Switch between panels | `Tabs`             |
| Path trail            | `Breadcrumb`       |
| Multi-step progress   | `Steps`            |
| Page navigation       | `Pagination`       |
| View toggles          | `SegmentedControl` |
| Dropdown links        | `NavigationMenu`   |
| App sidebar           | `Sidebar`          |
| Hierarchical data     | `Tree`             |

---

## Tabs {#tabs}

Switch between related panels of content.

### When to Use {#tabs-when-to-use}

- Switching between views within the same context
- When panels share related data
- When users need to compare content

### When NOT to Use {#tabs-when-not-to-use}

- Navigation between pages → Use `Breadcrumb` or `Sidebar`
- Single view → No need for tabs

### Props {#tabs-props}

| Prop       | Type     | Required | Default | Description     |
| ---------- | -------- | -------- | ------- | --------------- |
| `tabs`     | `Tab[]`  | Yes      | -       | Tab definitions |
| `activeId` | `string` | No       | -       | Active tab ID   |

### States {#tabs-states}

| State    | Description                  |
| -------- | ---------------------------- |
| Default  | Tab button, no indicator     |
| Hover    | Subtle background            |
| Focus    | Gold focus ring              |
| Active   | Gold indicator slides to tab |
| Disabled | 45% opacity, not selectable  |

### Accessibility {#tabs-accessibility}

- Arrow keys navigate between tabs (LTR: left/right, RTL: right/left)
- Tab key moves focus into active panel
- Home/End navigate to first/last tab
- `aria-selected`, `aria-controls`, `role="tablist"`

### WCAG Conformance {#tabs-wcag-conformance}

| Criterion                    | Level | How                                                                                                                         |
| ---------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships | A     | `role="tablist"` on container, `role="tab"` on each tab, `role="tabpanel"` on content panels, `aria-selected` on active tab |
| 2.1.1 Keyboard               | A     | Arrow keys move between tabs, Enter/Space activates, Home/End jump to first/last                                            |
| 2.4.3 Focus Order            | A     | Tab key moves from active tab into its associated panel, logical left-to-right order                                        |
| 2.4.7 Focus Visible          | AA    | Gold focus ring (`--rialto-shadow-focus`) on focused tab                                                                    |
| 2.4.8 Location               | AAA   | Active tab indicator (gold bar) communicates current position within the tablist                                            |

### Common Mistakes {#tabs-common-mistakes}

| Mistake                                 | Impact                                                                 | Fix                                                                                             |
| --------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Using tabs for page-level navigation    | Screen readers expect tabs to switch panels, not navigate to new pages | Use links or `NavigationMenu` for page navigation; reserve tabs for in-page panel switching     |
| Missing arrow key support between tabs  | Keyboard users cannot move between tabs efficiently                    | Implement left/right arrow key handling within the `role="tablist"` container                   |
| No `aria-controls` linking tab to panel | Assistive tech cannot associate a tab with its content                 | Add `aria-controls="panel-id"` on each `role="tab"` and matching `id` on each `role="tabpanel"` |

### Visual Design {#tabs-visual-design}

- **Indicator**: 2px gold bar (`--rialto-accent`)
- **Tab**: `--rialto-text-secondary`, switches to primary on active
- **Padding**: `--rialto-space-sm` horizontal, `--rialto-space-xs` vertical
- **Radius**: `--rialto-radius-default`

### Animation {#tabs-animation}

- Indicator: spring physics, overshoots and settles
- Content: crossfade on switch
- Respects `prefers-reduced-motion`

### Responsiveness {#tabs-responsiveness}

- Horizontal scroll on overflow
- Stacks vertically on mobile (<640px) — consider Tabs variant

### Related {#tabs-related}

- `SegmentedControl` — For mutually exclusive views
- `Steps` — For sequential progress

### Example {#tabs-example}

```tsx
<Tabs
  tabs={[
    { id: "profile", label: "Profile", content: <ProfilePanel /> },
    { id: "settings", label: "Settings", content: <SettingsPanel /> },
  ]}
/>
```

---

## Breadcrumb {#breadcrumb}

Navigation trail showing the current location.

### When to Use {#breadcrumb-when-to-use}

- Showing path to current location
- Deep navigation structures
- When users may navigate back

### When NOT to Use {#breadcrumb-when-not-to-use}

- Single-level navigation → Use `Sidebar`
- Flat pages → Not needed

### Props {#breadcrumb-props}

| Prop       | Type               | Required | Default | Description        |
| ---------- | ------------------ | -------- | ------- | ------------------ |
| `items`    | `BreadcrumbItem[]` | Yes      | -       | Navigation items   |
| `maxItems` | `number`           | No       | -       | Collapse threshold |

### States {#breadcrumb-states}

| State         | Description                          |
| ------------- | ------------------------------------ |
| Default       | Links with separator chevrons        |
| Hover (links) | Gold color on links                  |
| Current       | Medium weight, no link, no separator |

### Accessibility {#breadcrumb-accessibility}

- `aria-label="Breadcrumb"`
- `aria-current="page"` for current location
- Separators hidden from screen readers

### WCAG Conformance {#breadcrumb-wcag-conformance}

| Criterion                    | Level | How                                                                                            |
| ---------------------------- | ----- | ---------------------------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships | A     | `<nav aria-label="Breadcrumb">` wrapping an ordered list; semantic `<ol>` conveys sequence     |
| 2.1.1 Keyboard               | A     | All breadcrumb links are standard `<a>` elements, natively keyboard accessible                 |
| 2.4.3 Focus Order            | A     | Links follow the logical path order from root to current page                                  |
| 2.4.7 Focus Visible          | AA    | Gold focus ring (`--rialto-shadow-focus`) on focused breadcrumb links                          |
| 2.4.8 Location               | AAA   | Breadcrumb trail inherently communicates the user's current location within the site hierarchy |

### Common Mistakes {#breadcrumb-common-mistakes}

| Mistake                                           | Impact                                                                       | Fix                                                                  |
| ------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Missing `aria-current="page"` on the current item | Screen readers cannot distinguish the current page from other links          | Add `aria-current="page"` to the last breadcrumb item                |
| Separator characters visible to screen readers    | Screen readers announce "slash" or "chevron" between each item               | Hide separators with `aria-hidden="true"` or use CSS pseudo-elements |
| Using `<div>` instead of `<nav>` and `<ol>`       | Assistive tech cannot identify the element as navigation or infer item order | Wrap in `<nav aria-label="Breadcrumb">` containing an `<ol>`         |

### Visual Design {#breadcrumb-visual-design}

- **Separator**: Chevron or slash, `--rialto-text-tertiary`
- **Link**: `--rialto-text-secondary`, gold on hover
- **Current**: `--rialto-text-primary`, medium weight

### Animation {#breadcrumb-animation}

- Hover: color transition 150ms

### Responsiveness {#breadcrumb-responsiveness}

- `maxItems` collapses deep paths with ellipsis
- "1 of 4" shown in collapsed state

### Related {#breadcrumb-related}

- `Sidebar` — Main navigation
- `Tabs` — In-page switching

### Example {#breadcrumb-example}

```tsx
<Breadcrumb
  items={[
    { label: "Home", href: "/" },
    { label: "Products", href: "/products" },
    { label: "Current Page" },
  ]}
/>
```

---

## Steps {#steps}

Multi-step progress indicator.

### When to Use {#steps-when-to-use}

- Wizards and forms
- Sequential processes
- Progress tracking

### When NOT to Use {#steps-when-not-to-use}

- Unrelated sections → Use `Tabs`
- Simple progress → Use `Progress`

### Props {#steps-props}

| Prop          | Type                         | Required | Default        | Description      |
| ------------- | ---------------------------- | -------- | -------------- | ---------------- |
| `steps`       | `Step[]`                     | Yes      | -              | Step definitions |
| `currentStep` | `number`                     | Yes      | -              | Current index    |
| `orientation` | `'horizontal' \| 'vertical'` | No       | `'horizontal'` | Layout           |
| `compact`     | `boolean`                    | No       | `false`        | Compact mode     |
| `onStepClick` | `(step: number) => void`     | No       | -              | Click handler    |

### States {#steps-states}

| State     | Description                     |
| --------- | ------------------------------- |
| Completed | Gold filled circle, checkmark   |
| Current   | Gold ring (focus), pulsing glow |
| Upcoming  | Grey circle, disabled           |

### Accessibility {#steps-accessibility}

- Keyboard: Arrow keys between steps
- Enter/Space selects step (if clickable)
- `aria-current="step"` for current
- `aria-label` per step: "Step 1: Complete", "Step 2: In progress"

### WCAG Conformance {#steps-wcag-conformance}

| Criterion                    | Level | How                                                                                                                                   |
| ---------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships | A     | `aria-current="step"` on the current step; each step has an `aria-label` describing its position and state (e.g., "Step 1: Complete") |
| 2.1.1 Keyboard               | A     | Arrow keys navigate between steps; Enter/Space activates a clickable step                                                             |
| 2.4.3 Focus Order            | A     | Steps follow sequential order matching the visual left-to-right (or top-to-bottom) layout                                             |
| 2.4.7 Focus Visible          | AA    | Gold focus ring (`--rialto-shadow-focus`) on the focused step indicator                                                               |
| 2.4.8 Location               | AAA   | Current step indicator and completed/upcoming states communicate progress through the sequence                                        |

### Common Mistakes {#steps-common-mistakes}

| Mistake                                                           | Impact                                                                | Fix                                                                                      |
| ----------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Not distinguishing completed vs upcoming steps for assistive tech | Screen reader users cannot tell which steps are done and which remain | Include state in each step's `aria-label` (e.g., "Step 1: Complete", "Step 3: Upcoming") |
| Making all steps clickable without indicating which are reachable | Users may attempt to jump to a future step that has no effect         | Disable unreachable steps with `aria-disabled="true"` and visually grey them out         |
| Missing `aria-current="step"` on the active step                  | Screen readers have no way to identify which step is in progress      | Add `aria-current="step"` to the current step element                                    |

### Visual Design {#steps-visual-design}

- **Circle**: 32px diameter
- **Line**: 2px, `--rialto-border`
- **Completed**: `--rialto-accent` fill
- **Current**: Gold ring, optional glow
- **Label**: Below circle

### Animation {#steps-animation}

- Completion: checkmark draws in
- Current: subtle pulse animation
- Respects `prefers-reduced-motion`

### Related {#steps-related}

- `Progress` — Continuous progress
- `Tabs` — Parallel content

### Example {#steps-example}

```tsx
<Steps
  steps={[
    { label: "Step 1", description: "Details" },
    { label: "Step 2", description: "Confirm" },
    { label: "Step 3", description: "Complete" },
  ]}
  currentStep={1}
/>
```

---

## Pagination {#pagination}

Page-by-page navigation.

### When to Use {#pagination-when-to-use}

- Large lists or tables
- Search results
- Any paginated content

### When NOT to Use {#pagination-when-not-to-use}

- Single page → Not needed
- Infinite scroll → Use `Spinner` at bottom

### Props {#pagination-props}

| Prop         | Type                     | Required | Default | Description  |
| ------------ | ------------------------ | -------- | ------- | ------------ |
| `page`       | `number`                 | Yes      | -       | Current page |
| `totalPages` | `number`                 | Yes      | -       | Total pages  |
| `onChange`   | `(page: number) => void` | Yes      | -       | Page change  |

### States {#pagination-states}

| State    | Description                     |
| -------- | ------------------------------- |
| Default  | Page number button              |
| Hover    | Background highlight            |
| Active   | Gold background                 |
| Disabled | First/last arrows at boundaries |
| Ellipsis | "...", non-clickable            |

### Accessibility {#pagination-accessibility}

- Arrow keys navigate
- Tab to pagination, arrows to change page
- `aria-label` for current page: "Page 3 of 10"

### WCAG Conformance {#pagination-wcag-conformance}

| Criterion                    | Level | How                                                                                                   |
| ---------------------------- | ----- | ----------------------------------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships | A     | `<nav aria-label="Pagination">` wrapping the control; `aria-current="page"` on the active page button |
| 2.1.1 Keyboard               | A     | Tab focuses the pagination region, arrow keys move between page buttons, Enter activates              |
| 2.4.3 Focus Order            | A     | Page buttons follow ascending numeric order; previous/next arrows bookend the sequence                |
| 2.4.7 Focus Visible          | AA    | Gold focus ring (`--rialto-shadow-focus`) on focused page button                                      |
| 2.4.8 Location               | AAA   | `aria-label="Page 3 of 10"` provides explicit position context                                        |

### Common Mistakes {#pagination-common-mistakes}

| Mistake                                                                   | Impact                                                                          | Fix                                                                                       |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Missing page context in labels (e.g., just "3" instead of "Page 3 of 10") | Screen reader users have no sense of where they are in the result set           | Add `aria-label="Page 3 of 10"` to the current page and descriptive labels to all buttons |
| No keyboard access to page buttons                                        | Keyboard-only users cannot paginate                                             | Ensure all page buttons are focusable and respond to Enter/Space                          |
| Ellipsis elements are focusable or announced                              | Screen readers announce non-interactive "..." as content, confusing users       | Add `aria-hidden="true"` to ellipsis elements and remove them from tab order              |
| Previous/Next buttons not disabled at boundaries                          | Users can activate previous on page 1 or next on the last page with no feedback | Set `aria-disabled="true"` and prevent action when at the first or last page              |

### Visual Design {#pagination-visual-design}

- **Button**: 36px × 36px, `--rialto-radius-default`
- **Active**: `--rialto-accent` background
- **Ellipsis**: "...", `--rialto-text-tertiary`

### Animation {#pagination-animation}

- Button hover: background transition

### Related {#pagination-related}

- `Table` — With paginated data
- `Stack` — Layout

### Example {#pagination-example}

```tsx
<Pagination page={3} totalPages={20} onChange={setPage} />
```

---

## SegmentedControl {#segmented-control}

Pill-style toggle for view/mode switching.

### When to Use {#segmented-control-when-to-use}

- 2-4 mutually exclusive options
- Toggle between views
- Visual prominence important

### When NOT to Use {#segmented-control-when-not-to-use}

- Binary toggle → Use `Toggle`
- Many options → Use `Select`

### Props {#segmented-control-props}

| Prop       | Type           | Required | Default | Description    |
| ---------- | -------------- | -------- | ------- | -------------- |
| `segments` | `Segment[]`    | Yes      | -       | Segment config |
| `value`    | `string`       | Yes      | -       | Selected ID    |
| `size`     | `'sm' \| 'md'` | No       | `'md'`  | Size           |

### States {#segmented-control-states}

- Default, hover, selected (sliding indicator), disabled

### Accessibility {#segmented-control-accessibility}

- Arrow keys navigate
- `aria-pressed` per segment

### WCAG Conformance {#segmented-control-wcag-conformance}

| Criterion                    | Level | How                                                                                                                                 |
| ---------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships | A     | `role="radiogroup"` on the container with `role="radio"` and `aria-checked` on each segment (or `aria-pressed` with button pattern) |
| 2.1.1 Keyboard               | A     | Arrow keys move selection between segments; focus follows selection                                                                 |
| 2.4.3 Focus Order            | A     | Segments follow their visual left-to-right order                                                                                    |
| 2.4.7 Focus Visible          | AA    | Gold focus ring (`--rialto-shadow-focus`) on the focused segment                                                                    |
| 2.4.8 Location               | AAA   | Sliding indicator and `aria-pressed`/`aria-checked` state communicate the active selection                                          |

### Common Mistakes {#segmented-control-common-mistakes}

| Mistake                                                    | Impact                                                                            | Fix                                                                          |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Using only visual styling to indicate the selected segment | Screen reader users cannot determine which option is active                       | Apply `aria-pressed="true"` or `aria-checked="true"` to the selected segment |
| Missing arrow key navigation between segments              | Keyboard users must Tab through each segment individually instead of using arrows | Implement roving tabindex with left/right arrow key handling                 |
| No group label for the control                             | Assistive tech cannot describe the purpose of the segment group                   | Add `aria-label` or `aria-labelledby` to the container element               |

### Related {#segmented-control-related}

- `Toggle` — Binary switch
- `Tabs` — Panel switching

### Example {#segmented-control-example}

```tsx
<SegmentedControl
  segments={[
    { id: "grid", label: "Grid" },
    { id: "list", label: "List" },
  ]}
  value={view}
  onChange={setView}
/>
```

---

## NavigationMenu {#navigation-menu}

Horizontal navigation with dropdown menus.

### When to Use {#navigation-menu-when-to-use}

- Site-wide navigation
- Categories with sub-items
- When space is limited

### When NOT to Use {#navigation-menu-when-not-to-use}

- App navigation → Use `Sidebar`
- Simple links → Use regular links

### Props {#navigation-menu-props}

| Prop    | Type        | Required | Default | Description      |
| ------- | ----------- | -------- | ------- | ---------------- |
| `items` | `NavItem[]` | Yes      | -       | Navigation items |

### Data Structure {#navigation-menu-data-structure}

```typescript
interface NavItem {
  label: string;
  href?: string;
  children?: NavItem[]; // Creates dropdown
}
```

### States {#navigation-menu-states}

| State                 | Description                |
| --------------------- | -------------------------- |
| Default               | Link text                  |
| Hover (link)          | Gold background hint       |
| Hover (with children) | Dropdown opens after delay |
| Focus                 | Gold focus ring            |
| Open                  | Dropdown visible           |

### Accessibility {#navigation-menu-accessibility}

- Keyboard: Arrow keys open/close dropdowns
- Escape closes open dropdown
- Tab to navigate
- `aria-haspopup`, `aria-expanded`

### WCAG Conformance {#navigation-menu-wcag-conformance}

| Criterion                    | Level | How                                                                                                                  |
| ---------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships | A     | `<nav>` landmark wrapping the menu; `aria-haspopup="true"` and `aria-expanded` on trigger buttons for dropdown items |
| 2.1.1 Keyboard               | A     | Tab moves between top-level items; arrow keys open/close/navigate dropdowns; Escape closes an open dropdown          |
| 2.4.3 Focus Order            | A     | Top-level items follow visual order; dropdown items follow top-to-bottom order within the panel                      |
| 2.4.7 Focus Visible          | AA    | Gold focus ring (`--rialto-shadow-focus`) on focused menu items and dropdown links                                   |
| 2.4.8 Location               | AAA   | `aria-current="page"` on the active navigation item indicates the user's current location                            |

### Common Mistakes {#navigation-menu-common-mistakes}

| Mistake                                  | Impact                                                                 | Fix                                                                                             |
| ---------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Dropdown not reachable via keyboard      | Keyboard users can see the trigger but cannot access sub-items         | Open dropdown on Enter/Space/ArrowDown and allow arrow key navigation within                    |
| Dropdown closes immediately on blur      | Focus moves to a dropdown item but the panel closes before interaction | Use a short close delay or track focus within the dropdown before dismissing                    |
| Missing `aria-expanded` state on trigger | Screen readers do not announce whether the dropdown is open or closed  | Toggle `aria-expanded="true"` / `"false"` on the trigger element when the dropdown opens/closes |

### Visual Design {#navigation-menu-visual-design}

- **Dropdown**: Glass effect, shadow, `--rialto-radius-soft`
- **Item**: `--rialto-space-xs` padding, `--rialto-radius-default`
- **Hover**: `--rialto-surface-recessed`

### Animation {#navigation-menu-animation}

- Open delay: 200ms
- Close delay: 150ms
- Dropdown: springGentle entrance/exit
- Respects `prefers-reduced-motion`

### Responsiveness {#navigation-menu-responsiveness}

- Consider collapsing to hamburger on mobile

### Related {#navigation-menu-related}

- `Sidebar` — Vertical app nav

### Example {#navigation-menu-example}

```tsx
<NavigationMenu
  items={[
    { label: "Home", href: "/" },
    {
      label: "Products",
      children: [{ label: "All Products" }, { label: "Categories" }],
    },
  ]}
/>
```

---

## Sidebar {#sidebar}

Vertical app navigation.

### When to Use {#sidebar-when-to-use}

- App navigation
- Dashboard layouts
- When users navigate frequently

### When NOT to Use {#sidebar-when-not-to-use}

- Marketing sites → Use `NavigationMenu`
- Simple sites → Not needed

### Props {#sidebar-props}

| Prop         | Type                           | Required | Default | Description      |
| ------------ | ------------------------------ | -------- | ------- | ---------------- |
| `items`      | `SidebarItem[]`                | Yes      | -       | Navigation items |
| `collapsed`  | `boolean`                      | No       | `false` | Collapsed state  |
| `onCollapse` | `(collapsed: boolean) => void` | No       | -       | Collapse toggle  |

### Data Structure {#sidebar-data-structure}

```typescript
interface SidebarItem {
  id: string;
  label: string;
  icon?: ReactNode;
  href?: string;
  active?: boolean;
  items?: SidebarItem[]; // Nested items
}
```

### States {#sidebar-states}

| State         | Description                |
| ------------- | -------------------------- |
| Default       | Full width, icons + labels |
| Collapsed     | Icons only (64px)          |
| Hover         | Background highlight       |
| Active        | Gold accent bar, bold text |
| Section label | Uppercase, muted           |

### Accessibility {#sidebar-accessibility}

- Keyboard navigable
- Tab into sidebar, arrows to navigate
- `aria-current` for active item

### WCAG Conformance {#sidebar-wcag-conformance}

| Criterion                    | Level | How                                                                                                             |
| ---------------------------- | ----- | --------------------------------------------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships | A     | `<nav aria-label="Sidebar">` landmark; nested lists for grouped items; `aria-current="page"` on the active item |
| 2.1.1 Keyboard               | A     | Tab focuses the sidebar; arrow keys navigate between items; Enter activates a link                              |
| 2.4.3 Focus Order            | A     | Items follow their visual top-to-bottom order; nested items appear after their parent                           |
| 2.4.7 Focus Visible          | AA    | Gold focus ring (`--rialto-shadow-focus`) on focused sidebar items                                              |
| 2.4.8 Location               | AAA   | Gold accent bar and `aria-current="page"` on the active item communicate the user's current location            |

### Common Mistakes {#sidebar-common-mistakes}

| Mistake                                                              | Impact                                                                             | Fix                                                                                          |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Collapsed state loses labels for screen readers                      | When icons-only mode is active, screen readers announce nothing or just "link"     | Add `aria-label` to each item that matches its full label, regardless of collapsed state     |
| Missing `aria-current="page"` on active item                         | Screen readers cannot identify which page the user is on                           | Apply `aria-current="page"` to the currently active sidebar link                             |
| Nested items not keyboard accessible                                 | Users cannot expand or navigate into sub-items with the keyboard                   | Support ArrowRight to expand a group, ArrowLeft to collapse, and ArrowDown/Up to move within |
| No landmark label distinguishing sidebar from other `<nav>` elements | Screen readers list multiple "navigation" landmarks with no way to tell them apart | Add `aria-label="Sidebar"` to differentiate from other navigation regions on the page        |

### Visual Design {#sidebar-visual-design}

- **Width**: 240px expanded, 64px collapsed
- **Background**: `--rialto-surface-elevated`
- **Active bar**: 3px gold left border
- **Icon**: 20px, `--rialto-text-secondary`

### Animation {#sidebar-animation}

- Width: spring transition
- Collapse/expand: smooth 300ms
- Respects `prefers-reduced-motion`

### Responsiveness {#sidebar-responsiveness}

- Collapsed by default on tablet
- Hidden on mobile (use Drawer instead)

### Related {#sidebar-related}

- `NavigationMenu` — Top navigation
- `Drawer` — Mobile navigation

### Example {#sidebar-example}

```tsx
<Sidebar
  items={[
    { label: "Dashboard", icon: <DashboardIcon />, active: true },
    { label: "Settings", icon: <SettingsIcon /> },
  ]}
  collapsed={collapsed}
  onCollapse={setCollapsed}
/>
```

---

## Tree {#tree}

Hierarchical data display with expand/collapse.

### When to Use {#tree-when-to-use}

- File system browsers
- Organizational charts
- Nested categories
- Configuration trees

### When NOT to Use {#tree-when-not-to-use}

- Flat lists → Use `Stack`
- Simple navigation → Use `Sidebar` or `Breadcrumb`

### Props {#tree-props}

| Prop              | Type                       | Required | Default | Description        |
| ----------------- | -------------------------- | -------- | ------- | ------------------ |
| `data`            | `TreeNode[]`               | Yes      | -       | Tree data          |
| `defaultExpanded` | `string[]`                 | No       | `[]`    | Initially expanded |
| `selectedId`      | `string`                   | No       | -       | Selected node      |
| `onSelect`        | `(node: TreeNode) => void` | No       | -       | Selection handler  |
| `indent`          | `number`                   | No       | `20`    | Pixels per level   |

### Data Structure {#tree-data-structure}

```typescript
interface TreeNode {
  id: string;
  label: string;
  children?: TreeNode[];
  disabled?: boolean;
  icon?: ReactNode;
}
```

### States {#tree-states}

| State    | Description                |
| -------- | -------------------------- |
| Default  | Collapsed, no indicator    |
| Expanded | Children visible           |
| Selected | Gold background accent     |
| Disabled | Greyed out, not selectable |
| Hover    | Background highlight       |

### Accessibility {#tree-accessibility}

- Arrow keys navigate between items (down/up)
- Arrow right expands, arrow left collapses
- Enter selects focused item
- `role="tree"`, `role="treeitem"`
- `aria-expanded`, `aria-selected`

### WCAG Conformance {#tree-wcag-conformance}

| Criterion                    | Level | How                                                                                                                                                                          |
| ---------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships | A     | `role="tree"` on the container; `role="treeitem"` on each node; `role="group"` on nested child lists; `aria-expanded` and `aria-selected` convey state                       |
| 2.1.1 Keyboard               | A     | ArrowUp/Down move between visible items; ArrowRight expands a collapsed node or moves to first child; ArrowLeft collapses an expanded node or moves to parent; Enter selects |
| 2.4.3 Focus Order            | A     | Focus follows the visual tree order top-to-bottom, skipping collapsed (hidden) children                                                                                      |
| 2.4.7 Focus Visible          | AA    | Gold focus ring (`--rialto-shadow-focus`) on the focused tree item                                                                                                           |
| 2.4.8 Location               | AAA   | `aria-selected`, `aria-expanded`, and nesting depth communicate the user's position within the hierarchy                                                                     |

### Common Mistakes {#tree-common-mistakes}

| Mistake                                     | Impact                                                                            | Fix                                                                                                           |
| ------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Missing arrow key navigation                | Keyboard users cannot traverse the tree; they must Tab through every visible node | Implement the full tree keyboard pattern: ArrowUp/Down, ArrowLeft/Right, Home, End                            |
| No keyboard expand/collapse support         | Keyboard users can focus nodes but cannot open or close branches                  | ArrowRight expands a collapsed node; ArrowLeft collapses an expanded node                                     |
| Missing `role="tree"` and `role="treeitem"` | Screen readers present the tree as a flat list with no hierarchy context          | Apply `role="tree"` to the root, `role="treeitem"` to each node, and `role="group"` to nested `<ul>` elements |
| `aria-expanded` not toggled on branch nodes | Screen readers do not announce whether a branch is open or closed                 | Set `aria-expanded="true"` when expanded and `aria-expanded="false"` when collapsed; omit it on leaf nodes    |

### Visual Design {#tree-visual-design}

- **Chevron**: 12px, `--rialto-text-tertiary`
- **Indent**: 20px per level (configurable)
- **Selected**: `--rialto-accent-muted` background
- **Hover**: `--rialto-surface-recessed`

### Animation {#tree-animation}

- Chevron: rotates 90° with springGentle
- Respects `prefers-reduced-motion`

### Related {#tree-related}

- `Sidebar` — Navigation
- `Accordion` — Content sections

### Example {#tree-example}

```tsx
<Tree
  data={[
    {
      id: "src",
      label: "src",
      children: [
        { id: "components", label: "components" },
        { id: "utils", label: "utils" },
      ],
    },
  ]}
  defaultExpanded={["src"]}
/>
```
