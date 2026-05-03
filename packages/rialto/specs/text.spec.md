# Text

**Import:** `import { Text } from "@mattbutlerengineering/rialto"`
**Category:** Layout

## Anatomy

```
Text (element determined by variant default or `as` prop)
+-- children  -- text content or inline elements
```

Default elements per variant: `body` → `<p>`, `caption` → `<p>`, `detail` → `<span>`, `label` → `<span>`, `display` → `<p>`.

## When to Use

- All body copy, labels, captions, and display headings in the UI
- Overriding semantic element without losing token-mapped styles (use `as`)
- Displaying semantic color states (error, success, warning) on text

## States

| State     | Description                        | Prop/Trigger      |
| --------- | ---------------------------------- | ----------------- |
| Default   | variant="body", primary text color | No overrides      |
| Truncated | Single-line ellipsis clamp         | `truncate={true}` |
| Monospace | Switches to monospace font family  | `mono={true}`     |

## Design Tokens Used

| Token                     | Purpose                            |
| ------------------------- | ---------------------------------- |
| `--rialto-font-sans`      | Default font family (all variants) |
| `--rialto-font-display`   | Display variant font family        |
| `--rialto-font-mono`      | Monospace modifier                 |
| `--rialto-text-xs`        | detail, label variant size         |
| `--rialto-text-sm`        | caption variant size               |
| `--rialto-text-base`      | body variant size                  |
| `--rialto-text-xl`        | display variant size               |
| `--rialto-text-primary`   | body, display default color        |
| `--rialto-text-secondary` | caption default color              |
| `--rialto-text-tertiary`  | detail, label default color        |
| `--rialto-accent`         | color="accent" override            |
| `--rialto-error`          | color="error" override             |
| `--rialto-success`        | color="success" override           |
| `--rialto-warning`        | color="warning" override           |

## Props

> See `registry.json` for authoritative prop types.

| Prop       | Type                                                                                                     | Default         | Required | Description                                                |
| ---------- | -------------------------------------------------------------------------------------------------------- | --------------- | -------- | ---------------------------------------------------------- |
| `variant`  | `"body" \| "caption" \| "detail" \| "label" \| "display"`                                                | `"body"`        | No       | Typography preset — sets size, weight, color, and tracking |
| `color`    | `"primary" \| "secondary" \| "tertiary" \| "accent" \| "success" \| "warning" \| "error" \| "on-accent"` | `undefined`     | No       | Override the variant's default text color                  |
| `align`    | `"left" \| "center" \| "right"`                                                                          | `undefined`     | No       | Text alignment (maps to logical `start`/`end` in CSS)      |
| `as`       | `ElementType`                                                                                            | variant default | No       | Render as a different HTML element                         |
| `mono`     | `boolean`                                                                                                | `false`         | No       | Use monospace font family                                  |
| `truncate` | `boolean`                                                                                                | `false`         | No       | Truncate with ellipsis (single line)                       |

## Accessibility

| Attribute | Value | Notes                                                                  |
| --------- | ----- | ---------------------------------------------------------------------- |
| —         | —     | Text is semantic — use `as` to choose correct heading level or element |

**Keyboard:** Not applicable (non-interactive).
**Screen reader:** The rendered element determines semantic meaning — use `as="h2"` for headings, `as="time"` for timestamps, etc.

## Composition Examples

```tsx
// Page header
<Text variant="display" as="h1">Dashboard</Text>

// Supporting caption
<Text variant="caption" color="secondary">Last updated 3 min ago</Text>

// Error message
<Text variant="detail" color="error">This field is required</Text>

// Monospace data
<Text variant="body" mono>ABC-1234</Text>
```
