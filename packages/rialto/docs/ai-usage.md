# AI Agent Guide to Rialto

How to use Rialto when building interfaces with AI assistance.

---

## Finding Components

Rialto has ~50 components organized by category. The fastest way to find what you need:

| Category       | Components                                                                                            | When to use                |
| -------------- | ----------------------------------------------------------------------------------------------------- | -------------------------- |
| **Forms**      | Input, NumberInput, Select, Checkbox, Radio, PinInput, Slider, Toggle, TextArea                       | Collecting user input      |
| **Buttons**    | Button, SegmentedControl                                                                              | Triggering actions         |
| **Feedback**   | Toast, Alert, Banner, Progress, Meter, Skeleton, EmptyState                                           | Communicating status       |
| **Overlays**   | Dialog, ConfirmDialog, Drawer, Popover, Tooltip, HoverCard, CommandPalette, DropdownMenu, ContextMenu | Layered content            |
| **Navigation** | Tabs, Breadcrumb, Pagination, NavigationMenu, Sidebar, Navbar, Steps                                  | Moving between views       |
| **Data**       | Table, DataList, Tree, Badge, Tag, Stat, Timeline                                                     | Displaying structured data |
| **Layout**     | Card, Stack, Divider, Collapsible, Accordion, AspectRatio, ScrollArea                                 | Structuring content        |
| **Typography** | Text, Kbd                                                                                             | Styled text                |
| **Identity**   | Avatar                                                                                                | User representation        |

## Token Rules

**Always use tokens.** Never hardcode colors, spacing, radii, or shadows.

```css
/* Correct */
background: var(--rialto-surface-elevated);
padding: var(--rialto-space-md);
border-radius: var(--rialto-radius-default);

/* Wrong */
background: #fdfcfa;
padding: 16px;
border-radius: 6px;
```

### Token prefix

All tokens use the `--rialto-*` prefix.

### Color tokens

| Token                       | Use for                                          |
| --------------------------- | ------------------------------------------------ |
| `--rialto-surface`          | Page background                                  |
| `--rialto-surface-elevated` | Cards, popovers                                  |
| `--rialto-surface-recessed` | Inputs, tracks                                   |
| `--rialto-text-primary`     | Headings, body                                   |
| `--rialto-text-secondary`   | Descriptions, labels                             |
| `--rialto-text-tertiary`    | Placeholders, timestamps                         |
| `--rialto-border`           | Default borders                                  |
| `--rialto-accent`           | Focus rings, active states, primary buttons ONLY |

### Spacing tokens

4px base unit: `--rialto-space-2xs` (4px) through `--rialto-space-4xl` (96px).

### Radius tokens (hierarchy-based)

| Token                     | Value  | Use for         |
| ------------------------- | ------ | --------------- |
| `--rialto-radius-sharp`   | 2px    | Badges, chips   |
| `--rialto-radius-default` | 6px    | Buttons, inputs |
| `--rialto-radius-soft`    | 10px   | Cards, dialogs  |
| `--rialto-radius-round`   | 9999px | Pills, avatars  |

## Common Patterns

### Component file structure

```
src/components/ComponentName/
├── ComponentName.tsx
└── ComponentName.module.css
```

### Props conventions

- `variant` — visual style (`"primary"`, `"secondary"`, `"ghost"`, `"destructive"`)
- `size` — dimensions (`"sm"`, `"md"`, `"lg"`)
- `disabled` — boolean for disabled state
- All components use `forwardRef`

### Styling

- CSS Modules (`.module.css` files)
- Surface compositions from `src/styles/surfaces.module.css`
- Use `composes` to share surface patterns

### Animation

- Framer Motion for interactive animations
- CSS transitions for simple hover color changes
- Always check `useReducedMotion()` from Framer Motion
- Motion tokens: `precision` (0.15s crisp), `spring` (detent), `springGentle` (dialogs)

### Accessibility

- All interactive elements keyboard accessible
- Focus states use `--rialto-shadow-focus` (gold glow ring)
- ARIA attributes where semantics aren't implicit
- WCAG AA contrast (4.5:1 for normal text)
- Minimum 24x24px target size for interactive elements

## Component token overrides

Component-scoped tokens live in `src/tokens/component-tokens.css`. These allow theming individual components without touching the component CSS:

```css
/* Override button primary color */
:root {
  --rialto-button-primary-bg: var(--rialto-accent);
}
```

Available component token groups: Button, Input, Toggle, Checkbox, Radio, Card, Dialog, Badge, Toast, Tabs, SegmentedControl, Avatar, Link, Focus Ring.

## Reference files

| File                             | Purpose                                    |
| -------------------------------- | ------------------------------------------ |
| `CLAUDE.md`                      | Authoring rules, token usage, motion rules |
| `llms.txt`                       | Component API reference for consumers      |
| `src/tokens/`                    | All design tokens (CSS + DTCG JSON)        |
| `src/styles/surfaces.module.css` | Surface material compositions              |
| `src/showcase/App.tsx`           | Showcase application                       |
