# Stack

**Import:** `import { Stack } from "@mattbutlerengineering/rialto"`
**Category:** Layout

## Anatomy

```
Stack (div or custom element via `as`)
+-- children  -- direct children spaced by the gap token
```

## When to Use

- Stacking a list of elements vertically with consistent spacing
- Arranging items in a row with alignment control
- Any layout that requires flex direction and gap — prefer Stack over inline flex styles

## States

| State   | Description                | Prop/Trigger      |
| ------- | -------------------------- | ----------------- |
| Default | Column layout, no gap      | No props          |
| Row     | Horizontal layout          | `direction="row"` |
| Wrapped | Children wrap to next line | `wrap={true}`     |

## Design Tokens Used

| Token                | Purpose   |
| -------------------- | --------- |
| `--rialto-space-2xs` | gap="2xs" |
| `--rialto-space-xs`  | gap="xs"  |
| `--rialto-space-sm`  | gap="sm"  |
| `--rialto-space-md`  | gap="md"  |
| `--rialto-space-lg`  | gap="lg"  |
| `--rialto-space-xl`  | gap="xl"  |
| `--rialto-space-2xl` | gap="2xl" |
| `--rialto-space-3xl` | gap="3xl" |

## Props

> See `registry.json` for authoritative prop types.

| Prop        | Type                                                              | Default     | Required | Description                                                                         |
| ----------- | ----------------------------------------------------------------- | ----------- | -------- | ----------------------------------------------------------------------------------- |
| `direction` | `"column" \| "row"`                                               | `"column"`  | No       | Flex direction                                                                      |
| `gap`       | `"2xs" \| "xs" \| "sm" \| "md" \| "lg" \| "xl" \| "2xl" \| "3xl"` | `undefined` | No       | Gap between children — maps to `--rialto-space-*` tokens                            |
| `align`     | `"start" \| "center" \| "end" \| "stretch" \| "baseline"`         | `undefined` | No       | Cross-axis alignment (`align-items`)                                                |
| `justify`   | `"start" \| "center" \| "end" \| "between"`                       | `undefined` | No       | Main-axis justification (`justify-content`) — use `"between"` not `"space-between"` |
| `wrap`      | `boolean`                                                         | `false`     | No       | Allow children to wrap                                                              |
| `as`        | `ElementType`                                                     | `"div"`     | No       | Render as a different HTML element (e.g. `"ul"`, `"section"`)                       |

## Accessibility

| Attribute | Value | Notes                                               |
| --------- | ----- | --------------------------------------------------- |
| —         | —     | Stack is purely presentational — no ARIA attributes |

**Keyboard:** Not applicable (non-interactive).
**Screen reader:** Transparent to assistive technology; DOM order determines reading order.

## Composition Examples

```tsx
// Vertical form layout
<Stack gap="md">
  <Input label="Name" />
  <Input label="Email" />
  <Button variant="primary">Submit</Button>
</Stack>

// Horizontal toolbar
<Stack direction="row" gap="sm" align="center" justify="between">
  <Text variant="label">Filters</Text>
  <Button variant="ghost" size="sm">Reset</Button>
</Stack>
```
