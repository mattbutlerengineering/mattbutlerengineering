# Select

**Import:** `import { Select } from "@mbe/rialto"`
**Category:** Form

## Anatomy

```
Select (div.wrapper)
+-- label (span)                  -- optional field label above trigger
+-- DisabledTooltip               -- wraps trigger when disabledReason is set
    +-- trigger (button[role="combobox"])
        +-- triggerText (span)    -- selected label or placeholder
        +-- lockIcon (Lock)       -- visible only when disabled with a reason
        +-- chevron (motion.svg)  -- animated 180° rotation on open
+-- dropdown (motion.div[role="listbox"]) -- AnimatePresence, z-index 50
    +-- option (div[role="option"])       -- repeated for each item
        +-- check (svg)           -- checkmark, visible only when selected
        +-- option label (text)
```

## When to Use

- Single-value selection from a list of 3+ options
- Situations where a native `<select>` lacks required keyboard behavior or visual design
- Use `RadioGroup` instead when fewer than 4 options should all be visible simultaneously

## States

| State | Description | Prop/Trigger |
|-------|-------------|--------------|
| Default (closed) | Trigger shows placeholder or selected label | Initial |
| Open | Dropdown panel visible, first or selected option focused | Click or keyboard |
| Option focused | Visual highlight on hovered or keyboard-navigated option | Arrow keys / hover |
| Selected | Checkmark shown, accent text on selected option | `value` match |
| Disabled | Trigger locked, no interactions, lock icon if reason provided | `disabled={true}` |
| Disabled option | Option is skipped in keyboard navigation | `option.disabled` |

## Design Tokens Used

| Token | Purpose |
|-------|---------|
| `--rialto-space-2xs` | Wrapper gap between label and trigger |
| `--rialto-space-xs` | Trigger and option vertical padding |
| `--rialto-space-sm` | Trigger horizontal padding, option horizontal padding |
| `--rialto-space-2xs` | Dropdown internal padding |
| `--rialto-radius-default` | Trigger and dropdown border radius |
| `--rialto-radius-sharp` | Option border radius |
| `--rialto-text-sm` | Trigger and option font size |
| `--rialto-text-primary` | Trigger and option text color |
| `--rialto-text-secondary` | Label text color |
| `--rialto-text-tertiary` | Placeholder and chevron color |
| `--rialto-accent` | Open trigger border, selected option color, checkmark |
| `--rialto-accent-muted` | Focused/hovered option background |
| `--rialto-shadow-focus` | Trigger focus ring when open |
| `--rialto-ease-precision` | Trigger transition easing |

## Props

> See `registry.json` for authoritative prop types.

| Prop | Type | Default | Required | Description |
|------|------|---------|----------|-------------|
| `options` | `SelectOption[]` | — | Yes | Array of `{ value, label, disabled? }` |
| `value` | `string` | `undefined` | No | Currently selected value (controlled) |
| `onChange` | `(value: string) => void` | `undefined` | No | Called when a selection is made |
| `placeholder` | `string` | `"Select…"` | No | Placeholder shown when no value is selected |
| `label` | `string` | `undefined` | No | Field label rendered above the trigger |
| `disabled` | `boolean` | `undefined` | No | Disables all interactions |
| `disabledReason` | `string` | `undefined` | No | Tooltip text explaining why disabled; requires `disabled` |

### SelectOption shape

```ts
interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}
```

## Accessibility

| Attribute | Value | Notes |
|-----------|-------|-------|
| `role="combobox"` | trigger | WAI-ARIA combobox pattern |
| `aria-expanded` | `"true" \| "false"` | Reflects open/closed state |
| `aria-haspopup="listbox"` | trigger | Announces presence of listbox |
| `aria-controls` | `{id}-listbox` | Links trigger to dropdown panel |
| `aria-activedescendant` | `{id}-option-{n}` | Points to focused option when open |
| `aria-label` | label prop value | Labels the combobox |
| `role="listbox"` | dropdown | Identifies the options container |
| `role="option"` | each option div | Identifies each selectable item |
| `aria-selected` | `"true" \| "false"` | Marks currently selected option |
| `aria-disabled` | `"true"` | Marks disabled options and trigger |

**Keyboard (closed):** `Enter`, `Space`, `ArrowDown`, `ArrowUp` open the dropdown. Printable characters trigger type-ahead (selects directly when closed).

**Keyboard (open):** `ArrowDown`/`ArrowUp` move focus. `Home` jumps to first enabled option. `End` jumps to last. `Enter`/`Space` select focused option. `Escape`/`Tab` close and return focus to trigger. Type-ahead jumps to matching option.

**Screen reader:** Combobox role announces expanded state. Active descendant tracks focus in the listbox without moving DOM focus out of the trigger.

## Composition Examples

```tsx
// Controlled select
const [country, setCountry] = useState("us");

<Select
  label="Country"
  options={[
    { value: "us", label: "United States" },
    { value: "ca", label: "Canada" },
    { value: "mx", label: "Mexico" },
  ]}
  value={country}
  onChange={setCountry}
/>

// Disabled with reason
<Select
  label="Region"
  options={regions}
  disabled
  disabledReason="Select a country first"
/>
```
