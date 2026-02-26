# Overlay Components

Content that appears on top of the UI.

## Quick Reference {#quick-reference}

| Need               | Component        |
| ------------------ | ---------------- |
| Modal dialogs      | `Dialog`         |
| Confirmation       | `ConfirmDialog`  |
| Slide-out panels   | `Drawer`         |
| Positioned content | `Popover`        |
| Hover information  | `Tooltip`        |
| Rich hover cards   | `HoverCard`      |
| Command interface  | `CommandPalette` |
| Action menus       | `DropdownMenu`   |
| Right-click menus  | `ContextMenu`    |

---

## Dialog {#dialog}

Modal dialog for focused interactions.

### When to Use {#dialog-when-to-use}

- Forms requiring input
- Important confirmations
- Focused tasks

### When NOT to Use {#dialog-when-not-to-use}

- Simple confirmations → Use `ConfirmDialog`
- Settings panels → Use `Drawer`
- Tooltips → Use `Tooltip`

### Props {#dialog-props}

| Prop           | Type                      | Required | Default | Description   |
| -------------- | ------------------------- | -------- | ------- | ------------- |
| `open`         | `boolean`                 | Yes      | -       | Open state    |
| `onOpenChange` | `(open: boolean) => void` | Yes      | -       | State handler |
| `title`        | `string`                  | No       | -       | Dialog title  |
| `description`  | `string`                  | No       | -       | Help text     |

### Children {#dialog-children}

- `Dialog.Header` — Title and description
- `Dialog.Body` — Content
- `Dialog.Footer` — Actions

### States {#dialog-states}

- Opening (scale up), open, closing (scale down)

### Accessibility {#dialog-accessibility}

- Focus trap inside dialog
- Escape closes
- `role="dialog"`, `aria-modal`
- `aria-labelledby`, `aria-describedby`

### WCAG Conformance {#dialog-wcag-conformance}

| Criterion                    | Level | How                                                                                     |
| ---------------------------- | ----- | --------------------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships | A     | `role="dialog"` and `aria-modal="true"` convey modal semantics                          |
| 2.1.2 No Keyboard Trap       | A     | Escape closes the dialog; focus returns to the trigger element                          |
| 2.4.3 Focus Order            | A     | Focus moves into dialog on open, returns to trigger on close                            |
| 2.4.7 Focus Visible          | AA    | Gold focus ring (`--rialto-shadow-focus`) on all interactive elements inside the dialog |
| 2.4.11 Focus Not Obscured    | AA    | Dialog is centered and does not cover the previously focused trigger                    |
| 1.3.1 Info and Relationships | A     | `aria-labelledby` points to the title; `aria-describedby` points to the description     |

### Common Mistakes {#dialog-common-mistakes}

| Mistake                                          | Impact                                                      | Fix                                                                          |
| ------------------------------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Not returning focus to the trigger on close      | Keyboard users lose their place in the page                 | Store a ref to the trigger and call `.focus()` in the `onOpenChange` handler |
| Missing `aria-labelledby` on the dialog element  | Screen readers announce the dialog without a name           | Pass a `title` prop or manually set `aria-labelledby` to the heading id      |
| Allowing scroll on the body while dialog is open | Users can interact with obscured content behind the overlay | Apply `overflow: hidden` to `<body>` when the dialog is open                 |

### Visual Design {#dialog-visual-design}

- **Surface**: `glass` composition (translucent, blur backdrop)
- **Overlay**: `--rialto-overlay` backdrop scrim
- **Radius**: `--rialto-radius-soft`
- **Spacing**: `--rialto-space-lg` padding, `--rialto-space-md` header gap
- **Close button**: `--rialto-radius-default`, hover `--rialto-surface-recessed`
- **Z-index**: 100

### Animation {#dialog-animation}

- Panel: `springGentle` — `opacity: 0, y: 12, scale: 0.97` → `opacity: 1, y: 0, scale: 1`
- Overlay: `precision` fade
- Reduced motion: animations disabled (`duration: 0`)

### Related {#dialog-related}

- `ConfirmDialog` — Simple confirmations
- `Drawer` — Side panels

### Example {#dialog-example}

```tsx
<Dialog open={isOpen} onOpenChange={setOpen} title="Edit Profile">
  <Dialog.Body>
    <Input label="Name" />
  </Dialog.Body>
  <Dialog.Footer>
    <Button variant="secondary" onClick={() => setOpen(false)}>
      Cancel
    </Button>
    <Button variant="primary" onClick={save}>
      Save
    </Button>
  </Dialog.Footer>
</Dialog>
```

---

## ConfirmDialog {#confirm-dialog}

Simple confirmation dialog.

### When to Use {#confirm-dialog-when-to-use}

- Delete confirmations
- Action confirmations
- Quick yes/no decisions

### When NOT to Use {#confirm-dialog-when-not-to-use}

- Complex forms → Use `Dialog`
- Information display → Use `Alert`

### Props {#confirm-dialog-props}

| Prop           | Type                      | Required | Default     | Description    |
| -------------- | ------------------------- | -------- | ----------- | -------------- |
| `open`         | `boolean`                 | Yes      | -           | Open state     |
| `onOpenChange` | `(open: boolean) => void` | Yes      | -           | State handler  |
| `title`        | `string`                  | Yes      | -           | Confirm title  |
| `description`  | `string`                  | No       | -           | Help text      |
| `confirmLabel` | `string`                  | No       | `'Confirm'` | Confirm button |
| `variant`      | `'default' \| 'danger'`   | No       | `'default'` | Style          |

### Accessibility {#confirm-dialog-accessibility}

- Inherits Dialog focus trap and keyboard handling
- Escape closes
- `role="dialog"`, `aria-modal`
- `aria-labelledby` points to the title

### WCAG Conformance {#confirm-dialog-wcag-conformance}

| Criterion                    | Level | How                                                                  |
| ---------------------------- | ----- | -------------------------------------------------------------------- |
| 1.3.1 Info and Relationships | A     | `role="dialog"` and `aria-modal="true"` inherited from Dialog        |
| 2.1.2 No Keyboard Trap       | A     | Escape closes; focus returns to the trigger element                  |
| 2.4.3 Focus Order            | A     | Focus moves into dialog on open, returns to trigger on close         |
| 2.4.7 Focus Visible          | AA    | Gold focus ring on confirm and cancel buttons                        |
| 2.4.11 Focus Not Obscured    | AA    | Dialog is centered and does not cover the previously focused trigger |
| 1.3.1 Info and Relationships | A     | `aria-labelledby` points to the confirmation title                   |

### Common Mistakes {#confirm-dialog-common-mistakes}

| Mistake                                         | Impact                                              | Fix                                                                                              |
| ----------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Using ConfirmDialog for non-destructive actions | Causes modal fatigue; users dismiss without reading | Reserve for irreversible or destructive actions; use inline confirmation for low-risk operations |
| Not returning focus to the trigger on close     | Keyboard users lose their place in the page         | Inherits from Dialog; ensure `onOpenChange` does not interfere with focus restoration            |
| Omitting a descriptive `description` prop       | Users cannot assess the consequences of confirming  | Always provide a description that explains what will happen                                      |

### Visual Design {#confirm-dialog-visual-design}

- **Surface**: Inherits Dialog glass panel
- **Confirm button**: `--rialto-accent` (default), `--rialto-error` (danger variant)
- **Cancel button**: secondary style
- **Radius**: `--rialto-radius-default` buttons
- **Icon stroke**: `--rialto-accent` (default) or `--rialto-error` (danger)

### Animation {#confirm-dialog-animation}

- Inherits Dialog animation (springGentle panel + precision overlay)

### Related {#confirm-dialog-related}

- `Dialog` — Complex modals

### Example {#confirm-dialog-example}

```tsx
<ConfirmDialog
  open={isOpen}
  onOpenChange={setOpen}
  title="Delete item"
  description="Are you sure you want to delete this item?"
  confirmLabel="Delete"
  variant="danger"
/>
```

---

## Drawer {#drawer}

Slide-out panel from the edge.

### When to Use {#drawer-when-to-use}

- Settings panels
- Detail views
- Filters

### When NOT to Use {#drawer-when-not-to-use}

- Quick confirmations → Use `Dialog`
- Tooltips → Use `Tooltip`

### Props {#drawer-props}

| Prop           | Type                                     | Required | Default   | Description   |
| -------------- | ---------------------------------------- | -------- | --------- | ------------- |
| `open`         | `boolean`                                | Yes      | -         | Open state    |
| `onOpenChange` | `(open: boolean) => void`                | Yes      | -         | State handler |
| `placement`    | `'top' \| 'bottom' \| 'left' \| 'right'` | No       | `'right'` | Edge          |
| `title`        | `string`                                 | No       | -         | Drawer title  |

### Sizes {#drawer-sizes}

- Default (400px), can be customized

### Accessibility {#drawer-accessibility}

- Focus trap
- Escape closes
- `role="dialog"`

### WCAG Conformance {#drawer-wcag-conformance}

| Criterion                    | Level | How                                                                                    |
| ---------------------------- | ----- | -------------------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships | A     | `role="dialog"` and `aria-modal="true"` convey modal semantics                         |
| 2.1.2 No Keyboard Trap       | A     | Escape closes the drawer; focus returns to the trigger element                         |
| 2.4.3 Focus Order            | A     | Focus moves into drawer on open, returns to trigger on close                           |
| 2.4.7 Focus Visible          | AA    | Gold focus ring on the close button and all interactive elements inside the drawer     |
| 2.4.11 Focus Not Obscured    | AA    | Drawer slides in from the edge and does not cover the focused trigger behind the scrim |
| 1.3.1 Info and Relationships | A     | `aria-labelledby` points to the drawer title when provided                             |

### Common Mistakes {#drawer-common-mistakes}

| Mistake                                              | Impact                                                            | Fix                                                                |
| ---------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| No Escape key to close                               | Keyboard users are trapped in the drawer                          | Ensure the `onOpenChange` handler responds to the Escape key event |
| Content behind the drawer is still reachable via Tab | Focus escapes the drawer into the page behind it                  | Use a focus trap that confines Tab and Shift+Tab within the drawer |
| Missing `aria-modal="true"`                          | Screen readers may let users navigate to content behind the scrim | Add `aria-modal="true"` alongside `role="dialog"`                  |

### Visual Design {#drawer-visual-design}

- **Surface**: `glass` composition
- **Close button**: `aluminum` surface composition
- **Header**: `--rialto-text-primary` title, `--rialto-text-secondary` description
- **Border**: `--rialto-border` separator, `--rialto-radius-soft` panel
- **Sizes**: default (400px), wide, full
- **Z-index**: 9998–9999

### Animation {#drawer-animation}

- Panel: `spring` directional slide — e.g. `x: "100%"` → `x: 0` for right placement
- Overlay: 200ms fade
- Respects `prefers-reduced-motion` implicitly via spring physics

### Example {#drawer-example}

```tsx
<Drawer open={isOpen} onOpenChange={setOpen} title="Settings">
  <p>Settings content</p>
</Drawer>
```

---

## Popover {#popover}

Positioned floating content.

### When to Use {#popover-when-to-use}

- Form field tooltips
- Date pickers
- Custom dropdowns
- Rich content near triggers

### When NOT to Use {#popover-when-not-to-use}

- Simple hints → Use `Tooltip`
- Menus → Use `DropdownMenu`
- Navigation → Use `NavigationMenu`

### Props {#popover-props}

| Prop           | Type                      | Required | Default    | Description     |
| -------------- | ------------------------- | -------- | ---------- | --------------- |
| `open`         | `boolean`                 | Yes      | -          | Open state      |
| `onOpenChange` | `(open: boolean) => void` | Yes      | -          | State handler   |
| `content`      | `ReactNode`               | Yes      | -          | Popover content |
| `placement`    | `Placement`               | No       | `'bottom'` | Position        |

### Placement Options {#popover-placement-options}

- `top`, `top-start`, `top-end`
- `bottom`, `bottom-start`, `bottom-end`
- `left`, `left-start`, `left-end`
- `right`, `right-start`, `right-end`

### Accessibility {#popover-accessibility}

- Focus moves to content
- Escape closes

### WCAG Conformance {#popover-wcag-conformance}

| Criterion                    | Level | How                                                                                     |
| ---------------------------- | ----- | --------------------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships | A     | `aria-haspopup` and `aria-expanded` on the trigger element communicate the relationship |
| 2.1.2 No Keyboard Trap       | A     | Escape closes the popover; focus returns to the trigger                                 |
| 2.4.3 Focus Order            | A     | Focus moves into popover content on open, returns to trigger on close                   |
| 2.4.7 Focus Visible          | AA    | Gold focus ring on all interactive elements inside the popover                          |
| 2.4.11 Focus Not Obscured    | AA    | Popover is positioned adjacent to the trigger using Floating UI and does not cover it   |

### Common Mistakes {#popover-common-mistakes}

| Mistake                           | Impact                                                        | Fix                                                                         |
| --------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Not dismissible via Escape        | Keyboard users cannot close the popover without clicking away | Bind the Escape key to `onOpenChange(false)`                                |
| Missing focus management on open  | Keyboard users must Tab many times to reach popover content   | Move focus to the first interactive element inside the popover on open      |
| No `aria-expanded` on the trigger | Screen readers do not communicate whether the popover is open | Toggle `aria-expanded` on the trigger element in sync with the `open` state |

### Visual Design {#popover-visual-design}

- **Surface**: `glass` composition
- **Radius**: `--rialto-radius-soft`
- **Spacing**: `--rialto-space-md` padding, `--rialto-space-sm` header
- **Close button**: `--rialto-radius-sharp`
- **Z-index**: 100

### Animation {#popover-animation}

- `springGentle` with placement-aware offset — e.g. `opacity: 0, y: 6, scale: 0.96` for bottom
- Left/right placements use `x` offset instead
- Reduced motion: opacity-only with `duration: 0.1`

### Example {#popover-example}

```tsx
<Popover open={isOpen} onOpenChange={setOpen} content={<div>Popover content</div>}>
  <Button>Open</Button>
</Popover>
```

---

## Tooltip {#tooltip}

Short hover information.

### When to Use {#tooltip-when-to-use}

- Icon button labels
- Abbreviations
- Brief hints

### When NOT to Use {#tooltip-when-not-to-use}

- Rich content → Use `Popover` or `HoverCard`
- Interactive content → Use `Popover`
- Navigation → Use real links

### Props {#tooltip-props}

| Prop        | Type        | Required | Default | Description   |
| ----------- | ----------- | -------- | ------- | ------------- |
| `content`   | `string`    | Yes      | -       | Tooltip text  |
| `placement` | `Placement` | No       | `'top'` | Position      |
| `delay`     | `number`    | No       | `300`   | Show delay ms |

### States {#tooltip-states}

- Delayed show, visible, hidden

### Accessibility {#tooltip-accessibility}

- Keyboard accessible
- `role="tooltip"`
- `aria-describedby`

### WCAG Conformance {#tooltip-wcag-conformance}

| Criterion                    | Level | How                                                                               |
| ---------------------------- | ----- | --------------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships | A     | `role="tooltip"` identifies the element as supplementary description              |
| 2.1.2 No Keyboard Trap       | A     | Tooltip is non-modal; Escape dismisses it without trapping focus                  |
| 2.4.3 Focus Order            | A     | Tooltip appears on trigger focus and disappears on blur; no focus movement needed |
| 2.4.7 Focus Visible          | AA    | Gold focus ring on the trigger element when focused                               |
| 2.4.11 Focus Not Obscured    | AA    | Tooltip is positioned adjacent to the trigger and does not cover it               |
| 1.3.1 Info and Relationships | A     | `aria-describedby` on the trigger links to the tooltip content                    |

### Common Mistakes {#tooltip-common-mistakes}

| Mistake                                      | Impact                                               | Fix                                                                        |
| -------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------- |
| Hover-only activation (no keyboard support)  | Keyboard and touch users never see the tooltip       | Show tooltip on focus as well as hover; Rialto handles this automatically  |
| Putting interactive content inside a tooltip | Users cannot click links or buttons inside a tooltip | Use `Popover` or `HoverCard` for interactive or rich content               |
| Tooltip content is too long or complex       | Screen reader users hear excessive description text  | Keep content to a single short sentence; use `Popover` for anything longer |

### Visual Design {#tooltip-visual-design}

- **Surface**: `glass` composition
- **Radius**: `--rialto-radius-default`
- **Padding**: `--rialto-space-2xs` vertical, `--rialto-space-xs` horizontal
- **Typography**: `--rialto-text-xs`, `--rialto-weight-medium`
- **Z-index**: 50

### Animation {#tooltip-animation}

- `precision` easing with axis-aware 4px offset per placement
- Entry: `opacity: 0, scale: 0.95` → `opacity: 1, scale: 1`
- Reduced motion: opacity-only with `duration: 0`

### Example {#tooltip-example}

```tsx
<Tooltip content="Edit item">
  <IconButton icon={<EditIcon />} />
</Tooltip>
```

---

## HoverCard {#hover-card}

Rich preview on hover.

### When to Use {#hover-card-when-to-use}

- User previews
- Link previews
- Rich information

### When NOT to Use {#hover-card-when-not-to-use}

- Simple text → Use `Tooltip`
- Interactive content → Use `Popover`

### Props {#hover-card-props}

| Prop      | Type        | Required | Default | Description  |
| --------- | ----------- | -------- | ------- | ------------ |
| `content` | `ReactNode` | Yes      | -       | Card content |

### Accessibility {#hover-card-accessibility}

- Content accessible via focus (not hover-only)
- Escape dismisses

### WCAG Conformance {#hover-card-wcag-conformance}

| Criterion                    | Level | How                                                                                               |
| ---------------------------- | ----- | ------------------------------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships | A     | Card content is associated with the trigger via `aria-describedby` or equivalent                  |
| 2.1.1 Keyboard               | A     | HoverCard opens on focus, not only on hover, so keyboard users can access the content             |
| 2.1.2 No Keyboard Trap       | A     | Escape dismisses the card; focus remains on the trigger                                           |
| 2.4.3 Focus Order            | A     | Card appears adjacent to the trigger; focus can move into the card if it has interactive elements |
| 2.4.7 Focus Visible          | AA    | Gold focus ring on the trigger element when focused                                               |
| 2.4.11 Focus Not Obscured    | AA    | Card is positioned near the trigger and does not cover it                                         |

### Common Mistakes {#hover-card-common-mistakes}

| Mistake                                  | Impact                                                     | Fix                                                                                 |
| ---------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| No keyboard activation (hover-only)      | Keyboard and touch users cannot access the preview content | Ensure the card opens on focus as well as hover                                     |
| Card disappears too quickly on mouse-out | Users cannot reach interactive content inside the card     | Add an open delay or safe-zone polygon between trigger and card                     |
| Using HoverCard for critical information | The content is hidden by default and easily missed         | Display essential information inline; use HoverCard only for supplementary previews |

### Visual Design {#hover-card-visual-design}

- **Surface**: `glass` composition
- **Radius**: `--rialto-radius-soft`
- **Padding**: `--rialto-space-md`
- **Typography**: `--rialto-text-sm`, `--rialto-leading-relaxed`
- **Z-index**: 50

### Animation {#hover-card-animation}

- `springGentle` — `opacity: 0, y: 6, scale: 0.96` → `opacity: 1, y: 0, scale: 1`
- Placement-aware (top offsets reverse)
- Reduced motion: opacity-only with `duration: 0.1`

### Example {#hover-card-example}

```tsx
<HoverCard content={<UserCard user={user} />}>
  <Link to={`/user/${user.id}`}>{user.name}</Link>
</HoverCard>
```

---

## CommandPalette {#command-palette}

Keyboard-driven command interface.

### When to Use {#command-palette-when-to-use}

- Global actions (⌘K)
- Quick navigation
- Command execution

### When NOT to Use {#command-palette-when-not-to-use}

- Simple search → Use search input
- Navigation menus → Use `DropdownMenu`

### Props {#command-palette-props}

| Prop           | Type                      | Required | Default               | Description       |
| -------------- | ------------------------- | -------- | --------------------- | ----------------- |
| `open`         | `boolean`                 | Yes      | -                     | Open state        |
| `onOpenChange` | `(open: boolean) => void` | Yes      | -                     | State handler     |
| `items`        | `CommandItem[]`           | Yes      | -                     | Command items     |
| `placeholder`  | `string`                  | No       | `'Type a command...'` | Input placeholder |

### Data Structure {#command-palette-data-structure}

```typescript
interface CommandItem {
  id: string;
  label: string;
  group?: string;
  shortcut?: string[];
  onSelect?: () => void;
}
```

### States {#command-palette-states}

- Closed, open, searching, executing

### Accessibility {#command-palette-accessibility}

- Keyboard navigation (↑↓)
- Enter to execute
- Escape closes
- Type-ahead search

### WCAG Conformance {#command-palette-wcag-conformance}

| Criterion                    | Level | How                                                                                            |
| ---------------------------- | ----- | ---------------------------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships | A     | `role="dialog"` with `aria-modal="true"`; search input and listbox are semantically linked     |
| 2.1.2 No Keyboard Trap       | A     | Escape closes the palette; focus returns to the previously focused element                     |
| 2.4.3 Focus Order            | A     | Focus moves to the search input on open; arrow keys navigate the list                          |
| 2.4.7 Focus Visible          | AA    | Gold focus ring on the search input; active item has a visible highlight                       |
| 2.4.11 Focus Not Obscured    | AA    | Palette is centered on screen and does not cover previously focused content                    |
| 4.1.2 Name, Role, Value      | A     | `aria-activedescendant` tracks the highlighted item for virtual focus without moving DOM focus |

### Common Mistakes {#command-palette-common-mistakes}

| Mistake                                           | Impact                                          | Fix                                                                |
| ------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------ |
| No visible keyboard shortcuts in the item list    | Users do not discover available shortcuts       | Display shortcut badges using `CommandItem.shortcut` for each item |
| Missing type-ahead filtering                      | Users must scroll through all commands manually | Filter the `items` list as the user types in the search input      |
| Not closing the palette after executing a command | Palette stays open and blocks the UI            | Call `onOpenChange(false)` inside each item's `onSelect` handler   |
| No empty state when no results match              | Users see a blank list with no feedback         | Show a centered empty state message like "No results found"        |

### Visual Design {#command-palette-visual-design}

- **Surface**: `glass` composition
- **Search input**: `--rialto-border` separator, `--rialto-text-base`
- **Active item**: Subtle accent tint background
- **Group labels**: `--rialto-text-xs`, `--rialto-text-tertiary`
- **Shortcuts**: `--rialto-font-mono`, `--rialto-text-xs`
- **Empty state**: Centered icon + text
- **Radius**: `--rialto-radius-soft` panel, `--rialto-radius-default` items
- **Z-index**: 9999

### Animation {#command-palette-animation}

- Overlay: 150ms fade
- Panel: `spring` — `opacity: 0, scale: 0.95, y: -8` → `opacity: 1, scale: 1, y: 0`

### Example {#command-palette-example}

```tsx
<CommandPalette
  open={isOpen}
  onOpenChange={setOpen}
  items={[
    { id: "save", label: "Save", shortcut: ["⌘", "S"], onSelect: save },
    { id: "export", label: "Export", group: "Actions" },
  ]}
/>
```

---

## DropdownMenu {#dropdown-menu}

Menu of actions.

### When to Use {#dropdown-menu-when-to-use}

- Action menus
- Context actions
- Settings menus

### When NOT to Use {#dropdown-menu-when-not-to-use}

- Navigation → Use `NavigationMenu`
- Simple toggles → Use `Toggle`

### Props {#dropdown-menu-props}

| Prop      | Type                           | Required | Default   | Description     |
| --------- | ------------------------------ | -------- | --------- | --------------- |
| `trigger` | `ReactNode`                    | Yes      | -         | Trigger element |
| `items`   | `MenuItem[]`                   | Yes      | -         | Menu items      |
| `align`   | `'start' \| 'center' \| 'end'` | No       | `'start'` | Alignment       |

### Data Structure {#dropdown-menu-data-structure}

```typescript
interface MenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  shortcut?: string[];
  onSelect?: () => void;
  destructive?: boolean;
}
```

### Features {#dropdown-menu-features}

- Keyboard navigation
- Icons and shortcuts
- Destructive items

### Accessibility {#dropdown-menu-accessibility}

- Arrow keys navigate
- Enter selects
- Escape closes

### WCAG Conformance {#dropdown-menu-wcag-conformance}

| Criterion                    | Level | How                                                                        |
| ---------------------------- | ----- | -------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships | A     | `role="menu"` on the container; `role="menuitem"` on each item             |
| 2.1.2 No Keyboard Trap       | A     | Escape closes the menu; focus returns to the trigger button                |
| 2.4.3 Focus Order            | A     | Focus moves to the first menu item on open; arrow keys cycle through items |
| 2.4.7 Focus Visible          | AA    | Gold focus ring on the focused menu item                                   |
| 2.4.11 Focus Not Obscured    | AA    | Menu is positioned below (or above) the trigger and does not cover it      |
| 1.3.1 Info and Relationships | A     | `aria-haspopup="menu"` on the trigger communicates the menu relationship   |

### Common Mistakes {#dropdown-menu-common-mistakes}

| Mistake                                     | Impact                                                                  | Fix                                                                        |
| ------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Using DropdownMenu for navigation links     | Navigation should use `<a>` or `<Link>` elements, not `role="menuitem"` | Use `NavigationMenu` for navigation; reserve DropdownMenu for actions      |
| Missing `role="menu"` and `role="menuitem"` | Screen readers do not announce menu semantics                           | Ensure the container has `role="menu"` and each item has `role="menuitem"` |
| No arrow key support                        | Keyboard users cannot navigate between items                            | Implement Up/Down arrow key handlers that cycle through menu items         |

### Visual Design {#dropdown-menu-visual-design}

- **Surface**: `glass` composition
- **Radius**: `--rialto-radius-soft` menu, `--rialto-radius-default` items
- **Item hover**: `--rialto-surface-recessed`
- **Destructive items**: `--rialto-error` text
- **Shortcuts**: `--rialto-font-mono`, `--rialto-text-xs`
- **Divider**: `--rialto-border`
- **Z-index**: 100

### Animation {#dropdown-menu-animation}

- `springGentle` — `opacity: 0, scale: 0.95, y: -4` → `opacity: 1, scale: 1, y: 0`
- Reduced motion: opacity-only with `duration: 0.1`

### Example {#dropdown-menu-example}

```tsx
<DropdownMenu
  trigger={<Button>Actions</Button>}
  items={[
    { id: "edit", label: "Edit", icon: <EditIcon /> },
    { id: "delete", label: "Delete", destructive: true },
  ]}
/>
```

---

## ContextMenu {#context-menu}

Right-click menu.

### When to Use {#context-menu-when-to-use}

- Right-click actions
- Context-specific options
- Bulk actions

### When NOT to Use {#context-menu-when-not-to-use}

- Left-click actions → Use `DropdownMenu`

### Props {#context-menu-props}

| Prop    | Type         | Required | Default | Description |
| ------- | ------------ | -------- | ------- | ----------- |
| `items` | `MenuItem[]` | Yes      | -       | Menu items  |

### Accessibility {#context-menu-accessibility}

- Keyboard accessible
- Focus management

### WCAG Conformance {#context-menu-wcag-conformance}

| Criterion                    | Level | How                                                                                                          |
| ---------------------------- | ----- | ------------------------------------------------------------------------------------------------------------ |
| 1.3.1 Info and Relationships | A     | `role="menu"` on the container; `role="menuitem"` on each item                                               |
| 2.1.1 Keyboard               | A     | Menu is accessible via keyboard (e.g., Shift+F10 or application-specific shortcut), not only via right-click |
| 2.1.2 No Keyboard Trap       | A     | Escape closes the menu; focus returns to the element that triggered the context menu                         |
| 2.4.3 Focus Order            | A     | Focus moves to the first menu item on open; arrow keys cycle through items                                   |
| 2.4.7 Focus Visible          | AA    | Gold focus ring on the focused menu item                                                                     |
| 2.4.11 Focus Not Obscured    | AA    | Menu appears at the pointer position or near the focused element and does not cover it                       |

### Common Mistakes {#context-menu-common-mistakes}

| Mistake                                                   | Impact                                                                | Fix                                                                        |
| --------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| No alternative access method for touch and keyboard users | Touch devices and keyboard-only users cannot right-click              | Provide a visible trigger button or support Shift+F10 as an alternative    |
| Not returning focus to the trigger element on close       | Keyboard users lose their place in the page after dismissing the menu | Restore focus to the element that invoked the context menu                 |
| Missing `role="menu"` and `role="menuitem"`               | Screen readers do not announce menu semantics                         | Ensure the container has `role="menu"` and each item has `role="menuitem"` |

### Visual Design {#context-menu-visual-design}

- **Surface**: `glass` composition
- **Radius**: `--rialto-radius-soft` menu, `--rialto-radius-default` items
- **Item hover**: `--rialto-surface-recessed`
- **Destructive items**: `--rialto-error` text
- **Shortcuts**: `--rialto-font-mono`, `--rialto-text-xs`
- **Divider**: `--rialto-border`
- **Z-index**: 200

### Animation {#context-menu-animation}

- `springGentle` — `opacity: 0, scale: 0.95` → `opacity: 1, scale: 1`
- Reduced motion: opacity-only with `duration: 0.1`

### Example {#context-menu-example}

```tsx
<ContextMenu
  items={[
    { id: "copy", label: "Copy" },
    { id: "paste", label: "Paste" },
  ]}
/>
```
