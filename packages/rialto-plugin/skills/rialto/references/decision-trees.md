# Component Decision Trees

Unified guide for choosing any Rialto component by use case.

---

## Form Inputs

```
What kind of input?
├── Text
│   ├── Single line ──────────────── Input
│   ├── Multi-line ───────────────── TextArea
│   └── Fixed-length code ────────── PinInput
│
├── Number
│   ├── Exact value ──────────────── NumberInput
│   └── Approximate / range ──────── Slider
│
├── Choice
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

### Quick lookup

| Need                             | Component                             |
| -------------------------------- | ------------------------------------- |
| Single text value                | Input                                 |
| Multi-line text                  | TextArea                              |
| Number with +/- controls         | NumberInput                           |
| One choice (2-5 visible options) | RadioGroup or SegmentedControl        |
| One choice (5+ options)          | Select                                |
| Multiple choices                 | Checkbox group                        |
| On/off toggle                    | Toggle (immediate) or Checkbox (form) |
| Fixed-length code entry          | PinInput                              |
| Continuous range                 | Slider                                |

---

## Buttons & Actions

```
What kind of action?
├── Primary page action ──────────── Button variant="primary"
├── Secondary / cancel ───────────── Button variant="secondary"
├── Subtle / inline ──────────────── Button variant="ghost"
├── Dangerous ────────────────────── Button variant="ghost" + ConfirmDialog
├── Menu of actions (click) ──────── DropdownMenu
├── Menu of actions (right-click) ── ContextMenu
└── Global commands (Cmd+K) ──────── CommandPalette
```

---

## Overlays

| Need                        | Use            | Don't Use For                         |
| --------------------------- | -------------- | ------------------------------------- |
| Form/task in a modal        | Dialog         | Simple yes/no (use ConfirmDialog)     |
| Yes/no confirmation         | ConfirmDialog  | Complex forms (use Dialog)            |
| Settings/detail panel       | Drawer         | Quick info (use Popover)              |
| Positioned floating content | Popover        | Simple text hints (use Tooltip)       |
| Short help text on hover    | Tooltip        | Rich content (use HoverCard)          |
| Rich preview on hover       | HoverCard      | Interactive content (use Popover)     |
| Keyboard command interface  | CommandPalette | Simple dropdowns (use DropdownMenu)   |
| Click-triggered menu        | DropdownMenu   | Navigation links (use NavigationMenu) |
| Right-click menu            | ContextMenu    | Primary actions (use Button)          |

---

## Feedback — Priority Routing

Route by urgency. Stop at the first match:

| Priority | Condition                  | Component           |
| -------- | -------------------------- | ------------------- |
| P1       | Destructive / irreversible | ConfirmDialog       |
| P2       | Must act before continuing | Dialog / Drawer     |
| P3       | Page-wide notice           | Banner              |
| P4       | Tied to a specific element | Alert               |
| P5       | Brief notification         | Toast               |
| P6       | Supplemental hover info    | Tooltip / HoverCard |

### Comparison

| Attribute       | ConfirmDialog  | Dialog/Drawer | Banner       | Alert    | Toast      | Tooltip    |
| --------------- | -------------- | ------------- | ------------ | -------- | ---------- | ---------- |
| Blocks workflow | Yes            | Yes           | No           | No       | No         | No         |
| User must act   | Yes            | Yes           | Optional     | Optional | No         | No         |
| Scope           | Action         | Task          | Page         | Element  | Global     | Element    |
| Persistence     | Until resolved | Until closed  | Until closed | Inline   | ~4 seconds | Hover only |
| Focus trapped   | Yes            | Yes           | No           | No       | No         | No         |

### Loading States

| Scenario              | Component                      |
| --------------------- | ------------------------------ |
| Page loading          | Skeleton matching final layout |
| Button action pending | Button with `loading` prop     |
| Data fetch in flight  | Spinner inside content area    |
| Upload/download       | Progress with percentage       |
| Empty result set      | EmptyState with CTA            |

---

## Navigation

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

### App Shell Patterns

| Pattern         | Components                                                  |
| --------------- | ----------------------------------------------------------- |
| App shell       | Navbar (top) + Sidebar (left) + Breadcrumb (content header) |
| Content page    | Breadcrumb (top) + Tabs (sections) + Pagination (bottom)    |
| Multi-step form | Steps (top) + form content + Button (next/back)             |
| Data explorer   | Sidebar or Tree (left) + Table + Pagination (bottom)        |

### Common Mistakes

| Mistake                   | Better Approach                  |
| ------------------------- | -------------------------------- |
| Tabs for sequential flow  | Steps — shows progress and order |
| Breadcrumb as primary nav | Navbar or Sidebar                |
| Sidebar with only 3 items | Tabs or NavigationMenu           |
| Pagination for <20 items  | Show all items                   |

---

## Data Display

```
What kind of data?
├── Tabular (rows x columns) ──────── Table
├── Key-value pairs ───────────────── DataList
├── Single metric with trend ──────── Stat
├── Bounded measurement ───────────── Meter
├── Chronological events ──────────── Timeline
├── Hierarchical / nested ─────────── Tree
├── Content container ─────────────── Card (or EmptyState if empty)
├── Labels & indicators
│   ├── Status (non-interactive) ──── Badge
│   ├── Selectable / dismissible ──── Tag / AnimatedTag
│   └── Group of tags ─────────────── TagGroup
└── People
    ├── Single user ───────────────── Avatar
    └── Stacked group ─────────────── AvatarGroup
```

---

## Layout & Typography

```
What structural need?
├── Arrange items in a row/column ── Stack
├── Styled text with variant ──────── Text
├── Visual separator ──────────────── Divider
├── Single expand/collapse ────────── Collapsible
├── Multiple expand/collapse ──────── Accordion
├── Maintain aspect ratio ─────────── AspectRatio
├── Custom scrollbar ──────────────── ScrollArea
└── Keyboard shortcut display ─────── Kbd
```

---

## Error Handling Patterns

| Scenario            | Component Pattern                  |
| ------------------- | ---------------------------------- |
| Field validation    | Input with `error` prop            |
| Form-level error    | Alert variant="error" above form   |
| Failed async action | Toast variant="error"              |
| System outage       | Banner variant="error" at page top |
| Destructive undo    | ConfirmDialog variant="danger"     |

## Search & Selection Flows

| Scenario                        | Pattern                              |
| ------------------------------- | ------------------------------------ |
| Filter a flat list              | Input + Tag group for active filters |
| Search with keyboard shortcuts  | CommandPalette                       |
| Select from long list           | Select with options                  |
| Multi-select with visual tokens | Tag group with `dismissible`         |
| Hierarchical selection          | Tree with `selectedId`               |
