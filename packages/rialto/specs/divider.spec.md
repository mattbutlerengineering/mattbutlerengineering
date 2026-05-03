# Divider

**Import:** `import { Divider } from "@mattbutlerengineering/rialto"`
**Category:** Layout

## Anatomy

```
Divider (div[role="separator"])
+-- ::before pseudo  -- first rule segment
+-- label (span)     -- optional centered text (only when label prop set)
+-- ::after pseudo   -- second rule segment (hidden when no label)
```

The rule is drawn using `::before`/`::after` pseudo-elements with gradient backgrounds for a subtle fade-to-edge effect.

## When to Use

- Separating logical sections within a page or panel
- Separating form sections
- "Or" / "And" labels between form submission alternatives (e.g. email login vs SSO)
- Vertical separation between inline items (set `orientation="vertical"`)

## States

| State    | Description                                       | Prop/Trigger             |
| -------- | ------------------------------------------------- | ------------------------ |
| Default  | Neutral gradient rule                             | No extra props           |
| Labeled  | Centered label text splits the rule               | `label` prop set         |
| Accent   | Gold gradient rule and accent-colored label       | `accent={true}`          |
| Vertical | Column-direction rule, stretches to parent height | `orientation="vertical"` |
| Compact  | Reduced vertical margin                           | `spacing="compact"`      |
| Spacious | Increased vertical margin                         | `spacing="spacious"`     |

## Design Tokens Used

| Token                    | Purpose                                        |
| ------------------------ | ---------------------------------------------- |
| `--rialto-border`        | Rule gradient edge color                       |
| `--rialto-border-strong` | Rule gradient center color                     |
| `--rialto-space-md`      | Horizontal gap between label and rule segments |
| `--rialto-space-sm`      | Vertical gap in vertical orientation           |
| `--rialto-space-xs`      | Compact spacing margin                         |
| `--rialto-space-lg`      | Spacious spacing margin                        |
| `--rialto-text-xs`       | Label font size                                |
| `--rialto-weight-medium` | Label font weight                              |
| `--rialto-text-tertiary` | Label default color                            |
| `--rialto-accent`        | Label color in accent variant                  |

## Props

> See `registry.json` for authoritative prop types.

| Prop          | Type                                   | Default        | Required | Description                                  |
| ------------- | -------------------------------------- | -------------- | -------- | -------------------------------------------- |
| `orientation` | `"horizontal" \| "vertical"`           | `"horizontal"` | No       | Rule direction                               |
| `label`       | `string`                               | `undefined`    | No       | Centered text label — splits the rule line   |
| `accent`      | `boolean`                              | `false`        | No       | Gold gradient rule with accent-colored label |
| `spacing`     | `"compact" \| "default" \| "spacious"` | `"default"`    | No       | Vertical margin scale                        |

## Accessibility

| Attribute          | Value                        | Notes                     |
| ------------------ | ---------------------------- | ------------------------- |
| `role="separator"` | root div                     | Semantic separator role   |
| `aria-orientation` | `"horizontal" \| "vertical"` | Reflects orientation prop |

**Keyboard:** Not applicable (non-interactive).
**Screen reader:** `role="separator"` is typically not announced unless focus lands on it. Labels are decorative text within the separator element.

## Composition Examples

```tsx
// Simple section break
<Divider />

// "Or" between login options
<Divider label="Or" />

// Accented section heading divider
<Divider label="Advanced settings" accent spacing="spacious" />

// Vertical between inline items
<Stack direction="row" gap="md" align="center">
  <Text>Home</Text>
  <Divider orientation="vertical" />
  <Text>About</Text>
</Stack>
```
