# Card

**Import:** `import { Card } from "@mattbutlerengineering/rialto"`
**Category:** Data Display

## Anatomy

```
Card (motion.div)
+-- header (div)            -- optional; rendered when title or subtitle is provided
    +-- title (h3)          -- primary heading
    +-- subtitle (p)        -- supporting description
+-- children                -- arbitrary content slot
```

Card uses Framer Motion to enable optional cursor-tracking 3D tilt (`tilt` prop).

## When to Use

- Grouping related content into a visually distinct panel
- Dashboard widgets, metric panels, info cards
- Product listings or media items that benefit from surface elevation

## States

| State | Description | Prop/Trigger |
|-------|-------------|--------------|
| Default (elevated) | Aluminum-polished surface with `--rialto-shadow-sm` | `variant="elevated"` |
| Hover (elevated) | Lifts 3px, luminous shadow | Mouse hover |
| Tilt | 3D perspective tilt tracking cursor | `tilt={true}` — not available on glass variant |
| Glass | Frosted glass surface with blur | `variant="glass"` |
| Flat | Elevated surface color, border, no shadow | `variant="flat"` |

## Design Tokens Used

| Token | Purpose |
|-------|---------|
| `--rialto-radius-soft` | Container border radius |
| `--rialto-space-lg` | Internal padding |
| `--rialto-space-md` | Header bottom margin |
| `--rialto-space-2xs` | Subtitle top margin |
| `--rialto-shadow-sm` | Elevated variant resting shadow |
| `--rialto-shadow-luminous` | Elevated variant hover shadow |
| `--rialto-surface-elevated` | Flat variant background |
| `--rialto-border` | Flat variant border |
| `--rialto-text-md` | Title font size |
| `--rialto-text-sm` | Subtitle font size |
| `--rialto-text-primary` | Title text color |
| `--rialto-text-secondary` | Subtitle text color |
| `--rialto-weight-medium` | Title font weight |
| `--rialto-tracking-tight` | Title letter-spacing |
| `--rialto-ease-precision` | Hover transition easing |

## Props

> See `registry.json` for authoritative prop types.

| Prop | Type | Default | Required | Description |
|------|------|---------|----------|-------------|
| `variant` | `"elevated" \| "glass" \| "flat"` | `"elevated"` | No | Surface treatment |
| `tilt` | `boolean` | `false` | No | Enable 3D cursor-tracking tilt — ignored for glass variant |
| `title` | `string` | `undefined` | No | Card heading rendered as `<h3>` |
| `subtitle` | `string` | `undefined` | No | Supporting text below title |
| `children` | `ReactNode` | `undefined` | No | Card body content |

## Accessibility

| Attribute | Value | Notes |
|-----------|-------|-------|
| — | — | Card is a container — no intrinsic ARIA role |

**Keyboard:** Not applicable unless card contains interactive elements.
**Screen reader:** `title` renders as `<h3>` — ensure heading hierarchy is appropriate for the page. Tilt animation is purely visual and does not emit accessibility events.

## Composition Examples

```tsx
// Elevated card with header
<Card variant="elevated" title="Session Stats" subtitle="Last 30 days">
  <DataList items={stats} />
</Card>

// Glass card in a hero section
<Card variant="glass">
  <Text variant="display">Welcome back</Text>
</Card>

// Interactive tilt card
<Card tilt title="Interactive Panel">
  <Text variant="caption">Hover to see tilt effect</Text>
</Card>

// Flat card in a list
<Stack gap="sm">
  {items.map(item => (
    <Card key={item.id} variant="flat" title={item.name}>
      <Text variant="caption" color="secondary">{item.description}</Text>
    </Card>
  ))}
</Stack>
```
