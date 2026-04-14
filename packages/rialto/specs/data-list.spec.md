# DataList

**Import:** `import { DataList } from "@mattbutlerengineering/rialto"`
**Category:** Data Display

## Anatomy

```
DataList (dl)
+-- row (div)           -- wrapper for one label/value pair
    +-- label (dt)      -- key name, uppercase, tertiary color
    +-- value (dd)      -- value content, supports ReactNode
```

## When to Use

- Spec sheets and metadata panels (e.g. entity detail sidebars)
- Structured label-value data where both key and value need to be scannable
- Situations where a table would be semantically wrong (single-column key/value data)

## States

| State | Description | Prop/Trigger |
|-------|-------------|--------------|
| Default | Horizontal layout, labels fixed at 140px | `orientation="horizontal"` |
| Vertical | Label stacked above value | `orientation="vertical"` |
| Striped | Alternating row backgrounds | `striped={true}` |

## Design Tokens Used

| Token | Purpose |
|-------|---------|
| `--rialto-border` | Row divider lines and outer border |
| `--rialto-radius-soft` | Container border radius |
| `--rialto-surface-recessed` | Odd row background when striped |
| `--rialto-space-xs` | Row vertical padding |
| `--rialto-space-md` | Row horizontal padding and label/value gap |
| `--rialto-space-2xs` | Vertical gap in vertical orientation |
| `--rialto-text-xs` | Label font size |
| `--rialto-text-sm` | Value font size |
| `--rialto-text-primary` | Value text color |
| `--rialto-text-tertiary` | Label text color |
| `--rialto-tracking-wide` | Label letter-spacing |

## Props

> See `registry.json` for authoritative prop types.

| Prop | Type | Default | Required | Description |
|------|------|---------|----------|-------------|
| `items` | `DataListItem[]` | — | Yes | Array of `{ label: string; value: ReactNode }` pairs |
| `orientation` | `"horizontal" \| "vertical"` | `"horizontal"` | No | Layout of label/value within each row |
| `striped` | `boolean` | `false` | No | Alternate odd row backgrounds |

### DataListItem shape

```ts
interface DataListItem {
  label: string;    // Key name rendered as <dt>
  value: ReactNode; // Value rendered as <dd> — can be a string, number, or element
}
```

## Accessibility

| Attribute | Value | Notes |
|-----------|-------|-------|
| element | `<dl>` | Native definition list — semantically correct for key/value data |
| `<dt>` | — | Definition term — announced as "term" by screen readers |
| `<dd>` | — | Definition description — associated with preceding `<dt>` |

**Keyboard:** Not applicable (non-interactive).
**Screen reader:** Screen readers announce `<dt>` as a term and `<dd>` as its definition, providing natural paired reading.

## Composition Examples

```tsx
// Basic spec sheet
<DataList
  items={[
    { label: "Status", value: "Active" },
    { label: "Created", value: "March 2026" },
    { label: "Owner", value: "Jane Doe" },
  ]}
/>

// Vertical with badge values
<DataList
  orientation="vertical"
  striped
  items={[
    { label: "Status", value: <Badge variant="success">Active</Badge> },
    { label: "Plan", value: "Pro" },
  ]}
/>
```
