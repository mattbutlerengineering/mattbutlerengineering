# Input

**Import:** `import { Input } from "@mattbutlerengineering/rialto"`
**Category:** Form

## Anatomy

```
Input (div.wrapper)
+-- DisabledTooltip                -- wraps when disabledReason is set
    +-- label (label)              -- optional, linked via htmlFor
        +-- required indicator (*) -- rendered when required={true}
        +-- optional indicator     -- rendered when showOptional={true} and not required
    +-- inputContainer (div)       -- position: relative wrapper for icons
        +-- startIcon (span)       -- optional inline-start icon, aria-hidden
        +-- input (input)          -- native text input, recessed surface
        +-- endIcon (span)         -- optional inline-end icon, aria-hidden
        +-- lockIcon (Lock)        -- visible only when disabled with reason
    +-- hint (span)                -- optional helper or error text
```

## When to Use

- Single-line text entry (names, email, search, codes)
- Form fields with validation feedback via `error` + `hint`
- Search fields with a leading icon via `startIcon`

## States

| State         | Description                                           | Prop/Trigger           |
| ------------- | ----------------------------------------------------- | ---------------------- |
| Default       | Recessed surface, tertiary placeholder                | No interaction         |
| Hover         | Border strengthens                                    | Mouse hover            |
| Focused       | Gold border and focus ring                            | `:focus-visible`       |
| Error         | Red border, red hint text                             | `error={true}`         |
| Error focused | Red focus ring                                        | `error={true}` + focus |
| Disabled      | Desaturated, readOnly, cursor not-allowed             | `disabled={true}`      |
| Read-only     | Same as disabled appearance; also set when `disabled` | `readOnly={true}`      |

## Design Tokens Used

| Token                     | Purpose                                           |
| ------------------------- | ------------------------------------------------- |
| `--rialto-space-2xs`      | Wrapper gap                                       |
| `--rialto-space-xs`       | Input vertical padding                            |
| `--rialto-space-sm`       | Input horizontal padding                          |
| `--rialto-radius-default` | Input border radius                               |
| `--rialto-font-sans`      | Input font family                                 |
| `--rialto-text-base`      | Input font size                                   |
| `--rialto-text-sm`        | Label font size                                   |
| `--rialto-text-xs`        | Hint font size                                    |
| `--rialto-weight-medium`  | Label font weight                                 |
| `--rialto-weight-regular` | Input font weight                                 |
| `--rialto-tracking-wide`  | Label letter-spacing                              |
| `--rialto-text-primary`   | Input text color                                  |
| `--rialto-text-secondary` | Label text color                                  |
| `--rialto-text-tertiary`  | Placeholder and hint color                        |
| `--rialto-border-strong`  | Hover border color                                |
| `--rialto-accent`         | Focus border color                                |
| `--rialto-error`          | Error border, error hint color, required asterisk |
| `--rialto-ease-precision` | Transition easing                                 |

## Props

> See `registry.json` for authoritative prop types.

| Prop             | Type        | Default     | Required | Description                                                     |
| ---------------- | ----------- | ----------- | -------- | --------------------------------------------------------------- |
| `label`          | `string`    | `undefined` | No       | Field label rendered as `<label>`                               |
| `hint`           | `string`    | `undefined` | No       | Helper text below the input; red when `error` is true           |
| `error`          | `boolean`   | `undefined` | No       | Applies error styling and sets `aria-invalid`                   |
| `disabled`       | `boolean`   | `undefined` | No       | Disables the field and makes it readOnly                        |
| `disabledReason` | `string`    | `undefined` | No       | Tooltip text explaining why disabled; requires `disabled`       |
| `startIcon`      | `ReactNode` | `undefined` | No       | Icon at inline-start of the input (e.g. `<Search size={16} />`) |
| `endIcon`        | `ReactNode` | `undefined` | No       | Icon at inline-end of the input                                 |
| `showOptional`   | `boolean`   | `undefined` | No       | Shows "(optional)" after label when field is not required       |
| `required`       | `boolean`   | `undefined` | No       | Shows `*` after label and sets native required attribute        |

All other standard `InputHTMLAttributes` are forwarded (e.g. `placeholder`, `type`, `value`, `onChange`, `autoComplete`).

## Accessibility

| Attribute             | Value          | Notes                                                 |
| --------------------- | -------------- | ----------------------------------------------------- |
| `htmlFor` / `id`      | auto-generated | Label is always programmatically associated           |
| `aria-invalid`        | `"true"`       | Set when `error={true}`                               |
| `aria-describedby`    | `{id}-hint`    | Links hint text when provided                         |
| `aria-disabled`       | `"true"`       | Set on the native input when disabled                 |
| `startIcon`/`endIcon` | `aria-hidden`  | Decorative icons are hidden from assistive technology |

**Keyboard:** `Tab` to focus, type to enter text. Disabled inputs are excluded from tab order.
**Screen reader:** Announces label, then reads value. Error state announced via `aria-invalid`. Hint text associated via `aria-describedby` is read after the label.

## Composition Examples

```tsx
// Basic text input
<Input label="Full name" placeholder="Jane Doe" />

// With validation error
<Input
  label="Email"
  type="email"
  error
  hint="Enter a valid email address"
  value={email}
  onChange={e => setEmail(e.target.value)}
/>

// Search with icon
import { Search } from "lucide-react";
<Input
  placeholder="Search..."
  startIcon={<Search size={16} />}
  value={query}
  onChange={e => setQuery(e.target.value)}
/>

// Optional field
<Input label="Company" showOptional placeholder="Acme Corp" />

// Disabled with reason
<Input
  label="Username"
  value="jdoe"
  disabled
  disabledReason="Username cannot be changed after registration"
/>
```
