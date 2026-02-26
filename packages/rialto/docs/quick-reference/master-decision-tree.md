# Master Component Decision Tree

Unified guide for choosing any Rialto component by use case. Covers all components across 7 categories, plus cross-cutting patterns.

For detailed docs, see the category files in `docs/`.

---

## 1. Form Inputs

> Full guide: [selection-components.md](selection-components.md) | [form-fields.md](../form-fields.md)

```
What kind of input?
├── Text ─────────────────────────────────────
│   ├── Single line ──────────────── Input
│   ├── Multi-line ───────────────── TextArea
│   └── Fixed-length code ────────── PinInput
│
├── Number ───────────────────────────────────
│   ├── Exact value ──────────────── NumberInput
│   └── Approximate / range ──────── Slider
│
├── Choice ───────────────────────────────────
│   ├── On/off
│   │   ├── Immediate effect ─────── Toggle
│   │   └── Form submission ──────── Checkbox
│   ├── One of few (2-5)
│   │   ├── Horizontal, compact ──── SegmentedControl
│   │   ├── Vertical, descriptive ── RadioGroup
│   │   └── Space-constrained ────── Select
│   ├── One of many (6+) ────────── Select
│   ├── One of many + search ─────── CommandPalette
│   └── Multiple choices ─────────── Checkbox group or Tag
```

---

## 2. Buttons & Actions

> Full guide: [navigation.md](../navigation.md) | [overlays.md](../overlays.md)

```
What kind of action?
├── Primary page action ──────────── Button variant="primary"
├── Secondary / cancel ───────────── Button variant="secondary"
├── Subtle / inline ──────────────── Button variant="ghost"
├── Dangerous ────────────────────── Button variant="ghost" + ConfirmDialog
├── Menu of actions (click) ──────── DropdownMenu
├── Menu of actions (right-click) ── ContextMenu
└── Global commands (⌘K) ─────────── CommandPalette
```

---

## 3. Feedback

> Full guide: [feedback-routing.md](feedback-routing.md) | [feedback.md](../feedback.md)

```
How urgent is the feedback?
├── Critical / destructive ───────── P1: ConfirmDialog
├── Must act before continuing ───── P2: Dialog or Drawer
├── Page-wide notice ─────────────── P3: Banner
├── Near a specific element ──────── P4: Alert
├── Brief notification ───────────── P5: Toast
└── Supplemental hover info ──────── P6: Tooltip or HoverCard
```

Loading states:

```
Is progress measurable?
├── Yes, percentage known ────────── Progress
├── No, unknown duration ─────────── Spinner
├── Content layout is known ──────── Skeleton / SkeletonGroup
└── No content exists ────────────── EmptyState
```

---

## 4. Overlays

> Full guide: [overlays.md](../overlays.md)

| Need                        | Component      | Don't Use For                         |
| --------------------------- | -------------- | ------------------------------------- |
| Form/task in a modal        | Dialog         | Simple yes/no (use ConfirmDialog)     |
| Yes/no confirmation         | ConfirmDialog  | Complex forms (use Dialog)            |
| Settings/detail side panel  | Drawer         | Quick info (use Popover)              |
| Positioned floating content | Popover        | Simple text hints (use Tooltip)       |
| Short help text on hover    | Tooltip        | Rich content (use HoverCard)          |
| Rich preview on hover       | HoverCard      | Interactive content (use Popover)     |
| Keyboard command interface  | CommandPalette | Simple dropdowns (use DropdownMenu)   |
| Click-triggered action menu | DropdownMenu   | Navigation links (use NavigationMenu) |
| Right-click context menu    | ContextMenu    | Primary actions (use Button)          |

---

## 5. Navigation

> Full guide: [navigation-components.md](navigation-components.md) | [navigation.md](../navigation.md)

```
What navigation pattern?
├── Switch panels in same context ── Tabs
├── Show path / location ─────────── Breadcrumb
├── Sequential wizard / steps ────── Steps
├── Paginated list / table ───────── Pagination
├── Toggle between views ─────────── SegmentedControl
├── Top bar with dropdowns ───────── NavigationMenu
├── Vertical app sidebar ─────────── Sidebar
└── Top nav with logo/user ───────── Navbar
```

---

## 6. Data Display

> Full guide: [data-display.md](../data-display.md) | [data-structure.md](../data-structure.md)

```
What kind of data?
├── Tabular (rows × columns) ──────────────────── Table
├── Key-value pairs (single record) ───────────── DataList
├── Single metric with trend ──────────────────── Stat
├── Bounded measurement (fuel, temp) ──────────── Meter
├── Chronological events ──────────────────────── Timeline
├── Hierarchical / nested tree ────────────────── Tree
│
├── Content container
│   ├── Grouped related content ───────────────── Card
│   └── No content to show ───────────────────── EmptyState
│
├── Labels & indicators
│   ├── Status (non-interactive) ──────────────── Badge
│   ├── Selectable / dismissible label ────────── Tag / AnimatedTag
│   └── Group of tags ─────────────────────────── TagGroup
│
└── People
    ├── Single user image / initials ──────────── Avatar
    └── Stacked user group ────────────────────── AvatarGroup
```

---

## 7. Layout & Typography

> Full guide: [layout.md](../layout.md)

```
What structural need?
├── Arrange items in a row or column ── Stack
├── Styled text with semantic variant ── Text
├── Visual line between sections ────── Divider
├── Single expand/collapse section ──── Collapsible
├── Multiple expand/collapse sections ── Accordion
├── Maintain aspect ratio (images) ──── AspectRatio
├── Custom scrollbar container ──────── ScrollArea
└── Display keyboard shortcut ────────── Kbd
```

---

## Cross-Cutting Patterns

### Loading States

| Scenario              | Pattern                          |
| --------------------- | -------------------------------- |
| Page loading          | `Skeleton` matching final layout |
| Button action pending | `Button` with `loading` prop     |
| Data fetch in flight  | `Spinner` inside content area    |
| Upload/download       | `Progress` with percentage       |
| Empty result set      | `EmptyState` with CTA            |

### Error Handling

| Scenario            | Pattern                                        |
| ------------------- | ---------------------------------------------- |
| Field validation    | `Input` with `error` + `Alert` variant="error" |
| Form-level error    | `Alert` variant="error" above form             |
| Failed async action | `Toast` variant="error"                        |
| System outage       | `Banner` variant="error" at page top           |
| Destructive undo    | `ConfirmDialog` variant="danger" before action |

### Search & Selection Flows

| Scenario                        | Pattern                                  |
| ------------------------------- | ---------------------------------------- |
| Filter a flat list              | `Input` + `Tag` group for active filters |
| Search with keyboard shortcuts  | `CommandPalette`                         |
| Select from long list           | `Select` with options                    |
| Multi-select with visual tokens | `Tag` group with `dismissible`           |
| Hierarchical selection          | `Tree` with `selectedId`                 |
