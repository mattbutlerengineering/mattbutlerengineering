# Badge

**Import:** `import { Badge } from "@mbe/rialto"`
**Category:** Data Display

## Anatomy

```
Badge (span)
+-- span.dot (optional) -- colored 6px circle status indicator
+-- children (ReactNode) -- label text
```

## When to Use

- Status indicators (connected, error, pending)
- Count labels (notification counts, item counts)
- Category tags that are purely informational (not interactive — use `Tag` for interactive labels)
- Pairing with other components (e.g. beside a heading or inside a table cell)

## States

| State | Description |
|-------|-------------|
| Default (no dot) | Text label only |
| With dot | Status circle prepended to label |
| Small | Tighter padding, smaller font | `size="sm"` |

## Variants

| Variant | Use Case |
|---------|----------|
| `neutral` (default) | Neutral status, no semantic meaning |
| `accent` | Active, selected, or gold-highlighted state |
| `success` | Positive or confirmed state |
| `warning` | Caution or attention needed |
| `error` | Error or destructive state |

**Note:** There is NO `"info"` variant. Use `"neutral"` for informational or neutral-status items.

## Design Tokens Used

| Token | Purpose |
|-------|---------|
| `--rialto-radius-sharp` | Badge border radius (2px — small element) |
| `--rialto-shadow-xs` | Neutral variant shadow |
| `--rialto-border` | Neutral variant border |
| `--rialto-surface-elevated` | Neutral variant background |
| `--rialto-text-secondary` | Neutral variant text color |
| `--rialto-accent` | Accent variant text and dot color |
| `--rialto-success` | Success variant text and dot color |
| `--rialto-warning` | Warning variant text and dot color |
| `--rialto-error` | Error variant text and dot color |
| `--rialto-space-xs` | Badge horizontal padding |
| `--rialto-space-2xs` | Dot gap and small padding |
| `--rialto-text-xs` | Badge font size |
| `--rialto-weight-medium` | Badge font weight |
| `--rialto-tracking-wide` | Letter spacing |
| `--rialto-leading-tight` | Line height |
| `--rialto-radius-round` | Dot border radius |

## Props

> See `registry.json` for authoritative prop types.

| Prop | Type | Default | Required | Description |
|------|------|---------|----------|-------------|
| `children` | `ReactNode` | — | Yes | Label text |
| `variant` | `"neutral" \| "accent" \| "success" \| "warning" \| "error"` | `"neutral"` | No | Color variant — no "info" variant |
| `size` | `"sm" \| "md"` | `"md"` | No | Compact or default size |
| `dot` | `boolean` | `undefined` | No | Show a status dot before the label |

## Accessibility

**Keyboard:** Not interactive — no keyboard behavior.
**Screen reader:** Rendered as an inline `span`. Content is read as text inline with surrounding content. For status indicators in complex UI (e.g. tables), wrap in a visually-hidden `<span>` or use `aria-label` on the parent element to provide context (e.g. "Status: Connected").

## Composition Examples

```tsx
// Status indicators
<Badge variant="success" dot>Connected</Badge>
<Badge variant="error" dot>Disconnected</Badge>
<Badge variant="warning">Degraded</Badge>

// In a table cell
<td>
  <Badge variant={session.status === "active" ? "success" : "neutral"}>
    {session.status}
  </Badge>
</td>

// Notification count
<Badge variant="error" size="sm">3</Badge>

// Neutral (use instead of "info" which does not exist)
<Badge variant="neutral">Draft</Badge>
```
