# Toggle

**Import:** `import { Toggle } from "@mbe/rialto"`
**Category:** Form

## Anatomy

```
DisabledTooltip (wrapper — only active when disabled + disabledReason provided)
+-- wrapper div (aria-disabled when disabled)
    +-- input (type="checkbox", role="switch") -- hidden, real interactive element
    +-- label.track (aria-hidden="true") -- visual track container
    |   +-- motion.div.knob -- spring-animated sliding knob
    +-- label.label -- text label linked to input via htmlFor
    +-- Lock icon (optional) -- shown when disabled + disabledReason provided
```

The hidden checkbox with `role="switch"` is the true interactive element. The visual track is `aria-hidden` to prevent double-announcement. Labels link to the input via `htmlFor`.

## When to Use

- Binary on/off settings (e.g. "Dark mode", "Notifications", "Auto-save")
- Preference toggles where state change has immediate effect
- Form fields requiring an enabled/disabled choice

## States

| State | Description | Prop/Trigger |
|-------|-------------|--------------|
| Off | Knob at start position, track in default style | `checked={false}` |
| On | Knob slides to end (spring animation), track in active style | `checked={true}` |
| Disabled | Reduced opacity, not interactive | `disabled={true}` |
| Disabled with reason | Lock icon shown; reason in tooltip on hover/focus | `disabled={true}` + `disabledReason="..."` |
| Reduced motion | Knob snaps without spring animation | `prefers-reduced-motion: reduce` |

## Design Tokens Used

| Token | Purpose |
|-------|---------|
| `--rialto-accent` | Track background when checked |
| `--rialto-border` | Track border color (unchecked) |
| `--rialto-surface-elevated` | Knob background |
| `--rialto-shadow-sm` | Knob shadow |
| `--rialto-shadow-focus` | Focus ring on the hidden input |
| `--rialto-text-primary` | Label text color |
| `--rialto-text-tertiary` | Disabled label color |
| `--rialto-space-sm` | Gap between track and label |

## Props

> See `registry.json` for authoritative prop types.

| Prop | Type | Default | Required | Description |
|------|------|---------|----------|-------------|
| `label` | `string` | `undefined` | No | Text label rendered beside the track |
| `checked` | `boolean` | `false` | No | Controlled checked state |
| `onCheckedChange` | `(checked: boolean) => void` | `undefined` | No | Change callback — use this, NOT `onChange` |
| `disabled` | `boolean` | `undefined` | No | Disables interaction |
| `disabledReason` | `string` | `undefined` | No | Tooltip text explaining why disabled; requires `disabled={true}` |

**Important:** Use `onCheckedChange` for state updates, not the native `onChange`. The component adapts the native checkbox `onChange` event internally and calls `onCheckedChange(e.target.checked)`.

## Accessibility

| Attribute | Value | Notes |
|-----------|-------|-------|
| `role` | `"switch"` | On the hidden input — overrides default checkbox role |
| `aria-checked` | `true \| false` | On the hidden input — explicit state for screen readers |
| `aria-hidden` | `"true"` | On the visual track label — prevents double-announcement |
| `aria-disabled` | `true` | On the wrapper div when disabled |

**Keyboard:** `Space` toggles the switch. `Tab` moves focus to/from the toggle.
**Screen reader:** Announced as a switch, e.g. "Dark mode, switch, off". Toggling announces the new state automatically via `aria-checked`. The `role="switch"` tells screen readers this is a binary on/off control, not a checkbox.

## Composition Examples

```tsx
// Uncontrolled
<Toggle label="Dark mode" />

// Controlled
const [enabled, setEnabled] = useState(false);
<Toggle
  label="Notifications"
  checked={enabled}
  onCheckedChange={setEnabled}
/>

// Disabled with reason
<Toggle
  label="Maintenance mode"
  disabled
  disabledReason="Only administrators can change this setting."
/>

// Settings panel row
<Stack direction="row" align="center" justify="between">
  <Text>Auto-save drafts</Text>
  <Toggle checked={autoSave} onCheckedChange={setAutoSave} />
</Stack>
```
