# Rialto Component Documentation

**[Live Showcase](https://mattbutlerengineering.github.io/rialto/)** — Interactive demos of every component.

This documentation helps you choose the right component and use it correctly.

## Component Categories

### Form Components

User inputs and selections.

- [Input](form-fields.md) — Single-line text
- [TextArea](form-fields.md) — Multi-line text
- [NumberInput](form-fields.md) — Numeric values with stepper
- [Checkbox](form-fields.md) — Multi-select
- [RadioGroup](form-fields.md) — Single select from visible options
- [Toggle](form-fields.md) — Binary on/off
- [Select](form-fields.md) — Single select from dropdown
- [SegmentedControl](form-fields.md) — Pill-style option toggle
- [Slider](form-fields.md) — Continuous value range
- [PinInput](form-fields.md) — Fixed-length codes

### Navigation

Moving between views and locations.

- [Tabs](navigation.md) — Switch between panels
- [Breadcrumb](navigation.md) — Navigation trail
- [Steps](navigation.md) — Multi-step progress
- [Pagination](navigation.md) — Page navigation
- [SegmentedControl](navigation.md) — View toggles
- [NavigationMenu](navigation.md) — Dropdown navigation
- [Sidebar](navigation.md) — Vertical navigation

### Data Display

Presenting information.

- [Card](data-display.md) — Content containers
- [Table](data-display.md) — Structured data
- [Badge](data-display.md) — Status indicators
- [Tag](data-display.md) — Selectable labels
- [Avatar](data-display.md) — User images
- [Stat](data-display.md) — Metric display
- [DataList](data-display.md) — Key-value pairs
- [Meter](data-display.md) — Gauge display
- [Timeline](data-display.md) — Event sequence

### Feedback

Communicating status to users.

- [Toast](feedback.md) — Transient notifications
- [Alert](feedback.md) — Inline messages
- [Banner](feedback.md) — Page-level messages
- [Progress](feedback.md) — Completion tracking
- [Skeleton](feedback.md) — Loading placeholders
- [EmptyState](feedback.md) — No content display

### Overlays

Content that appears on top of the UI.

- [Dialog](overlays.md) — Modal dialogs
- [ConfirmDialog](overlays.md) — Confirmation dialogs
- [Drawer](overlays.md) — Slide-out panels
- [Popover](overlays.md) — Positioned content
- [Tooltip](overlays.md) — Hover information
- [HoverCard](overlays.md) — Rich hover content
- [CommandPalette](overlays.md) — Command interface
- [DropdownMenu](overlays.md) — Action menus
- [ContextMenu](overlays.md) — Right-click menus

### Layout

Structuring page content.

- [Stack](layout.md) — Flexbox layout
- [Divider](layout.md) — Visual separation
- [Collapsible](layout.md) — Expand/collapse content
- [Accordion](layout.md) — Grouped collapsible panels
- [AspectRatio](layout.md) — Responsive proportions
- [ScrollArea](layout.md) — Custom scroll container

### Data Structure

Hierarchical and complex data.

- [Tree](data-structure.md) — Expandable hierarchy

### System

- [Vibes](vibes.md) — Design language presets (default, transacting, presenting)

---

## Quick Reference

### Decision Guides

- [Master Decision Tree](quick-reference/master-decision-tree.md) — Unified guide for choosing any component
- [Selection Components](quick-reference/selection-components.md) — Form input selection logic
- [Navigation Components](quick-reference/navigation-components.md) — Navigation pattern selection
- [Feedback Routing](quick-reference/feedback-routing.md) — P1–P6 feedback priority routing
- [Form Validation](quick-reference/form-validation.md) — Validation patterns and error display

### Choosing Form Components

| Need                     | Use                            |
| ------------------------ | ------------------------------ |
| Single text value        | Input                          |
| Multi-line text          | TextArea                       |
| Number with controls     | NumberInput                    |
| One choice (2-5 options) | RadioGroup or SegmentedControl |
| One choice (5+ options)  | Select                         |
| Multiple choices         | Checkbox                       |
| On/off toggle            | Toggle                         |
| Code entry               | PinInput                       |

### Choosing Navigation

| Need            | Use              |
| --------------- | ---------------- |
| Switch panels   | Tabs             |
| Path trail      | Breadcrumb       |
| Multi-step flow | Steps            |
| Page navigation | Pagination       |
| View toggles    | SegmentedControl |
| Dropdown links  | NavigationMenu   |
| App sidebar     | Sidebar          |

### Choosing Overlays

| Need               | Use            |
| ------------------ | -------------- |
| Modal with actions | Dialog         |
| Confirm action     | ConfirmDialog  |
| Settings panel     | Drawer         |
| Contextual info    | Popover        |
| Help text          | Tooltip        |
| Rich preview       | HoverCard      |
| Quick actions      | CommandPalette |
| Menu items         | DropdownMenu   |

---

## Component Standards

All Rialto components follow these standards:

- **Accessibility**: WCAG AA compliant, full keyboard navigation, ARIA attributes
- **Responsiveness**: Works on all screen sizes, 44px minimum touch targets
- **States**: Default, hover, focus-visible, active, disabled, loading, error, empty
- **Tokens**: All colors, spacing, and radius use design tokens
- **Focus**: Gold focus ring with `--rialto-shadow-focus`
- **Motion**: Framer Motion animations, respects `prefers-reduced-motion`
