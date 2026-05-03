# DisabledTooltip — Quick Reference

Pattern for explaining _why_ a field is disabled without hiding the disabled state itself.

---

## What it does

`DisabledTooltip` wraps a form component. When both `disabled` and `disabledReason` are set, it renders the wrapped control inside a `Tooltip` showing the reason. When either is absent, it is a transparent pass-through — no wrapper in the DOM.

```tsx
<DisabledTooltip disabled={isLocked} disabledReason="Username cannot be changed after registration">
  <Input label="Username" value="jdoe" disabled />
</DisabledTooltip>
```

---

## Components using this wrapper

All form components in Rialto route their disabled state through `DisabledTooltip`:

| Component       | Source                                       | Spec                                             |
| --------------- | -------------------------------------------- | ------------------------------------------------ |
| **Checkbox**    | `src/components/Checkbox/Checkbox.tsx`       | [checkbox.spec.md](../../specs/checkbox.spec.md) |
| **Input**       | `src/components/Input/Input.tsx`             | [input.spec.md](../../specs/input.spec.md)       |
| **NumberInput** | `src/components/NumberInput/NumberInput.tsx` | _(no spec file)_                                 |
| **PinInput**    | `src/components/PinInput/PinInput.tsx`       | _(no spec file)_                                 |
| **Select**      | `src/components/Select/Select.tsx`           | [select.spec.md](../../specs/select.spec.md)     |
| **Slider**      | `src/components/Slider/Slider.tsx`           | _(no spec file)_                                 |
| **TextArea**    | `src/components/TextArea/TextArea.tsx`       | _(no spec file)_                                 |
| **Toggle**      | `src/components/Toggle/Toggle.tsx`           | [toggle.spec.md](../../specs/toggle.spec.md)     |

`src/components/accessibility.test.tsx` runs axe-core across all of them with the disabled state set, so any regression to the pattern trips the accessibility suite.

---

## Props contract

| Prop             | Type        | Required | Description                             |
| ---------------- | ----------- | -------- | --------------------------------------- |
| `disabled`       | `boolean`   | No       | Whether the wrapped control is disabled |
| `disabledReason` | `string`    | No       | Tooltip content shown when disabled     |
| `children`       | `ReactNode` | Yes      | The wrapped form control                |

Tooltip renders **only** when both `disabled && disabledReason` are truthy. Otherwise the component returns its children unchanged.

---

## Known a11y limitation

`DisabledTooltip` passes `showOnFocus={false}` to its inner `Tooltip`. Keyboard-only users — the population most likely to need to know _why_ an action is unavailable — cannot see the reason. Flagged in [`docs/ui-audit.md`](../ui-audit.md) at `src/components/DisabledTooltip/DisabledTooltip.tsx:13`. When authoring a new form component, route through `DisabledTooltip` rather than duplicating its limitation in a custom wrapper.

---

## When NOT to use

- Disabled state is obvious from context (e.g. a primary button greyed out during an in-flight submit) — a tooltip is noise.
- The reason is long or needs formatting — use a dedicated hint or helper text field on the component instead.
- No `disabledReason` is available — the wrapper is a pass-through, so it's harmless, but also pointless.

---

## Related

- [Form Validation — Quick Reference](./form-validation.md) — field-level error display
- [Selection Components — Quick Reference](./selection-components.md) — when to use Checkbox / Radio / Toggle / Switch
- [`Tooltip` spec](../../specs/tooltip.spec.md) — the underlying tooltip used by this wrapper
