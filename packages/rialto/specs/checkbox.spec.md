# Checkbox

**Import:** `import { Checkbox, Radio, RadioGroup } from "@mattbutlerengineering/rialto"`
**Category:** Form

## Anatomy

```
Checkbox (div.checkboxItem)
+-- DisabledTooltip             -- wraps when disabledReason is set
    +-- label (label)
        +-- input (input[type="checkbox"])  -- visually hidden, real checkbox
        +-- box (motion.span)              -- animated visual checkbox
            +-- check (motion.span)        -- animated checkmark or dash SVG
        +-- checkboxText (span)
            +-- label text
            +-- description (span)         -- optional secondary text
        +-- lockIcon (Lock)                -- visible only when disabled with reason
```

This file also exports `Radio` and `RadioGroup` from the same module.

## When to Use

- Multi-select from a list of independent options
- Boolean on/off preferences (single standalone checkbox)
- "Select all" with partial selection — use `indeterminate` state
- Use `RadioGroup` + `Radio` when only one option from a group is allowed

## States

| State                | Description                         | Prop/Trigger                  |
| -------------------- | ----------------------------------- | ----------------------------- |
| Unchecked            | Default empty box                   | `checked={false}`             |
| Checked              | Animated checkmark appears (spring) | `checked={true}`              |
| Indeterminate        | Dash SVG replaces checkmark         | `indeterminate={true}`        |
| Hover                | Box scales up slightly (boop)       | Mouse hover (not disabled)    |
| Disabled             | Desaturated, cursor not-allowed     | `disabled={true}`             |
| Disabled with reason | Lock icon shown, tooltip on hover   | `disabled` + `disabledReason` |

## Design Tokens Used

| Token                     | Purpose                              |
| ------------------------- | ------------------------------------ |
| `--rialto-accent`         | Checked box fill and checkmark color |
| `--rialto-border`         | Unchecked box border                 |
| `--rialto-surface`        | Unchecked box background             |
| `--rialto-radius-sharp`   | Visual box border radius             |
| `--rialto-text-primary`   | Label text color                     |
| `--rialto-text-secondary` | Description text color               |
| `--rialto-text-sm`        | Label font size                      |
| `--rialto-text-xs`        | Description font size                |

## Props

> See `registry.json` for authoritative prop types.

| Prop              | Type                         | Default     | Required | Description                                               |
| ----------------- | ---------------------------- | ----------- | -------- | --------------------------------------------------------- |
| `label`           | `string`                     | —           | Yes      | Visible label text                                        |
| `checked`         | `boolean`                    | `false`     | No       | Checked state (controlled)                                |
| `indeterminate`   | `boolean`                    | `false`     | No       | Shows a dash — for "select all" with partial selection    |
| `onCheckedChange` | `(checked: boolean) => void` | `undefined` | No       | Called when the checkbox is toggled                       |
| `disabled`        | `boolean`                    | `false`     | No       | Disables the checkbox                                     |
| `disabledReason`  | `string`                     | `undefined` | No       | Tooltip text explaining why disabled; requires `disabled` |
| `description`     | `string`                     | `undefined` | No       | Secondary text below the label                            |

## Accessibility

| Attribute        | Value                    | Notes                                              |
| ---------------- | ------------------------ | -------------------------------------------------- |
| element          | `input[type="checkbox"]` | Native checkbox — keyboard accessible by default   |
| `id` / `htmlFor` | auto-generated           | Label is programmatically associated via `htmlFor` |
| `indeterminate`  | DOM property             | Set via `ref` callback — not an HTML attribute     |
| `aria-disabled`  | `"true"`                 | Applied to wrapper div when disabled               |

**Keyboard:** `Tab` to focus, `Space` to toggle.
**Screen reader:** Announces "checkbox, [label], checked/unchecked". Indeterminate state announced as "mixed" by most screen readers.

## Composition Examples

```tsx
// Controlled checkbox
<Checkbox
  label="Accept terms and conditions"
  checked={accepted}
  onCheckedChange={setAccepted}
/>

// Indeterminate "select all"
<Checkbox
  label="Select all"
  checked={allSelected}
  indeterminate={someSelected && !allSelected}
  onCheckedChange={handleSelectAll}
  description={`${selectedCount} of ${totalCount} selected`}
/>

// Disabled with reason
<Checkbox
  label="Email notifications"
  disabled
  disabledReason="Verify your email to enable notifications"
/>

// RadioGroup usage
<RadioGroup label="Size" name="size" value={size} onChange={setSize}>
  <Radio label="Small" value="sm" />
  <Radio label="Medium" value="md" />
  <Radio label="Large" value="lg" description="Best for readability" />
</RadioGroup>
```
