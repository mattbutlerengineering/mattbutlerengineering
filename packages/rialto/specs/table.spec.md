# Table

**Import:** `import { Table } from "@mattbutlerengineering/rialto"`
**Category:** Data Display

## Anatomy

```
Table (div, scroll wrapper)
+-- table (table element)
    +-- thead (thead)
    |   +-- tr (tr)
    |       +-- th (th, role="columnheader" when sortable)
    |           +-- column header text
    |           +-- SortArrow (svg, aria-hidden) -- sort direction indicator
    +-- tbody (tbody)
        +-- tr (tr, per data row) -- keyed by rowKey()
        |   +-- td (td, per column)
        +-- tr (empty state row) -- shown when data.length === 0
            +-- td (colspan=columns.length) -- emptyMessage text
```

## When to Use

- Displaying structured datasets where rows represent records
- Leaderboards, session logs, or any tabular comparison data
- When sortable columns aid user data exploration

## States

| State | Description | Prop/Trigger |
|-------|-------------|--------------|
| Populated | Normal row rendering | `data.length > 0` |
| Empty | Single-cell row with `emptyMessage` | `data.length === 0` |
| Sorted ascending | Column highlighted gold, up arrow | Click sortable column header |
| Sorted descending | Column highlighted gold, down arrow | Click again |
| Compact | Tighter cell padding, smaller text | `density="compact"` |
| Spacious | More generous cell padding | `density="spacious"` |
| Striped | Alternating row background tints | `striped={true}` |

## Design Tokens Used

| Token | Purpose |
|-------|---------|
| `--rialto-radius-soft` | Wrapper border radius |
| `--rialto-border` | Wrapper border and cell bottom borders |
| `--rialto-text-sm` | Cell font size |
| `--rialto-text-xs` | Header font size |
| `--rialto-weight-medium` | Header font weight |
| `--rialto-text-tertiary` | Header text color |
| `--rialto-text-primary` | Cell text color |
| `--rialto-space-sm` | Cell vertical padding |
| `--rialto-space-md` | Cell horizontal padding |
| `--rialto-space-2xs` | Sort icon margin |
| `--rialto-space-xl` | Empty state vertical padding |
| `--rialto-surface-elevated` | Header background gradient start |
| `--rialto-surface` | Header background gradient end |
| `--rialto-surface-recessed` | Striped even-row background |
| `--rialto-accent` | Active sort column header color |
| `--rialto-ease-precision` | Row hover and sort transitions |

## Column Type

The `Column<T>` interface defines each column's behavior:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | `string` | Yes | Unique column key; also used as property accessor if `render` is omitted |
| `header` | `string` | Yes | Column header label |
| `sortable` | `boolean` | No | Enables click-to-sort on this column |
| `align` | `"left" \| "center" \| "right"` | No | Cell text alignment |
| `render` | `(row: T) => ReactNode` | No | Custom cell renderer — receives the full row object |
| `width` | `string` | No | CSS width hint (e.g. `"120px"`) |

## Props

> See `registry.json` for authoritative prop types.

| Prop | Type | Default | Required | Description |
|------|------|---------|----------|-------------|
| `columns` | `Column<T>[]` | — | Yes | Column definitions array |
| `data` | `T[]` | — | Yes | Array of row data objects |
| `rowKey` | `(row: T) => string \| number` | — | Yes | Unique key extractor per row — NOT optional |
| `density` | `"compact" \| "default" \| "spacious"` | `"default"` | No | Row padding density |
| `striped` | `boolean` | `false` | No | Alternating row tints |
| `emptyMessage` | `string` | `"No data"` | No | Text shown when data array is empty |

## Accessibility

| Attribute | Value | Notes |
|-----------|-------|-------|
| `aria-sort` | `"ascending" \| "descending" \| "none"` | Set on sortable `th` elements |
| `role` | `"columnheader"` | Set on sortable `th` elements |
| `tabIndex` | `0` | Sortable headers are keyboard focusable |

**Keyboard:** Sortable column headers accept `Enter` and `Space` to trigger sort. Tab navigates between sortable headers.
**Screen reader:** Column sort state announced via `aria-sort`. Active sort column highlighted visually (gold) and via attribute.

## Composition Examples

```tsx
// Basic table
<Table
  columns={[
    { key: "driver", header: "Driver" },
    { key: "time", header: "Lap Time" },
  ]}
  data={laps}
  rowKey={(row) => row.driver}
/>

// Sortable with custom renderer
<Table<{ name: string; position: number; status: string }>
  columns={[
    { key: "position", header: "#", sortable: true, align: "right", width: "48px" },
    { key: "name", header: "Driver", sortable: true },
    {
      key: "status",
      header: "Status",
      render: (row) => <Badge variant={row.status === "DNF" ? "error" : "success"}>{row.status}</Badge>,
    },
  ]}
  data={results}
  rowKey={(row) => row.name}
  striped
/>
```
