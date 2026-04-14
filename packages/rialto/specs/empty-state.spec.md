# EmptyState

**Import:** `import { EmptyState } from "@mattbutlerengineering/rialto"`
**Category:** Feedback

## Anatomy

```
EmptyState (div)
+-- icon slot (div, optional) -- custom icon or default open-box SVG
+-- heading (p, optional) -- primary message text
+-- description (p, optional) -- secondary explanatory text
+-- action slot (div, optional) -- typically a Button
```

If no `icon` is provided, a default open-box line-art illustration renders automatically.

## When to Use

- When a list, table, or content area has zero items to display
- After a search or filter returns no results
- When a feature has no data yet (first-use empty state)

## States

| State | Description | Prop/Trigger |
|-------|-------------|--------------|
| Flat (default) | No surface elevation | `variant="flat"` |
| Elevated | Card-like elevated surface | `variant="elevated"` |
| Medium (default) | Standard icon + spacing | `size="md"` |
| Small | Reduced icon size and spacing | `size="sm"` |

## Design Tokens Used

| Token | Purpose |
|-------|---------|
| `--rialto-surface-elevated` | Elevated variant background |
| `--rialto-border` | Elevated variant border |
| `--rialto-radius-soft` | Elevated variant border radius |
| `--rialto-shadow-sm` | Elevated variant box shadow |
| `--rialto-text-primary` | Heading text color |
| `--rialto-text-secondary` | Description text color |
| `--rialto-text-tertiary` | Icon color |
| `--rialto-space-lg` | Component padding |
| `--rialto-space-sm` | Gap between elements |
| `--rialto-text-sm` | Heading font size |
| `--rialto-text-xs` | Description font size |

## Props

> See `registry.json` for authoritative prop types.

| Prop | Type | Default | Required | Description |
|------|------|---------|----------|-------------|
| `heading` | `string` | `undefined` | No | Primary message text (use `heading`, NOT `title`) |
| `description` | `string` | `undefined` | No | Secondary explanatory text |
| `icon` | `ReactNode` | Default open-box SVG | No | Custom icon rendered above the heading |
| `action` | `ReactNode` | `undefined` | No | Action slot — typically a `Button` |
| `variant` | `"flat" \| "elevated"` | `"flat"` | No | Surface variant |
| `size` | `"sm" \| "md"` | `"md"` | No | Controls icon size, spacing, and typography |

## Accessibility

**Keyboard:** Not interactive by itself. Action slot content (e.g. Button) handles its own keyboard interaction.
**Screen reader:** Rendered as a plain `div`. Heading and description are read as standard paragraph text. Icon is purely decorative (no alt text needed — render with `aria-hidden` on any SVG icons).

## Composition Examples

```tsx
// Basic no-results state
<EmptyState
  heading="No results found"
  description="Try adjusting your filters."
/>

// With action
<EmptyState
  heading="No sessions yet"
  description="Run your first agent session to see results here."
  action={<Button onClick={startSession}>Start a session</Button>}
/>

// Elevated, small, custom icon
<EmptyState
  variant="elevated"
  size="sm"
  icon={<SearchIcon aria-hidden />}
  heading="Nothing matched"
/>
```
