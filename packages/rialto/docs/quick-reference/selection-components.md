# Selection Components — Quick Reference

Choosing the right component when the user needs to select or toggle values.

---

## Decision Tree

```
How many options?
├── On/Off (boolean) ──────────────────── Toggle or Checkbox
│   ├── Immediate effect (settings) ──── Toggle
│   └── Part of a form (submit later) ── Checkbox
│
├── One of few (2-5) ──────────────────── Radio, SegmentedControl, or Select
│   ├── Always visible, horizontal ───── SegmentedControl
│   ├── Always visible, vertical ─────── RadioGroup
│   └── Space-constrained ────────────── Select
│
├── One of many (6+) ──────────────────── Select or CommandPalette
│   ├── Flat list ────────────────────── Select
│   └── Searchable / grouped ─────────── CommandPalette
│
├── Multiple of few ───────────────────── Checkbox group
│
└── Numeric value ─────────────────────── NumberInput or Slider
    ├── Exact value needed ────────────── NumberInput
    └── Approximate / range ──────────── Slider
```

---

## Comparison Table

| Component            | Selection        | Count | Visibility     | Best for                       |
| -------------------- | ---------------- | ----- | -------------- | ------------------------------ |
| **Toggle**           | Boolean          | 1     | Always visible | Settings with immediate effect |
| **Checkbox**         | Boolean or multi | 1+    | Always visible | Form fields, bulk selection    |
| **Radio**            | Single           | 2-5   | Always visible | Mutually exclusive choices     |
| **SegmentedControl** | Single           | 2-4   | Always visible | View/mode switching            |
| **Select**           | Single           | Any   | Collapsed      | Space-efficient single choice  |
| **Slider**           | Numeric range    | 1     | Always visible | Approximate values, ranges     |
| **NumberInput**      | Numeric exact    | 1     | Always visible | Precise numeric entry          |
| **PinInput**         | Code entry       | 4-8   | Always visible | Verification codes, OTPs       |
| **CommandPalette**   | Single           | Many  | On demand      | Searchable, keyboard-driven    |

---

## Common Mistakes

| Mistake                                 | Better approach                                        |
| --------------------------------------- | ------------------------------------------------------ |
| Select with 2-3 options                 | Radio or SegmentedControl — options are always visible |
| Checkbox for mutually exclusive choices | Radio — enforces single selection                      |
| Toggle in a form that needs submit      | Checkbox — form semantics, submitted with form         |
| Slider for exact values                 | NumberInput — precise entry without guessing           |
| Radio for 10+ options                   | Select — saves space, scrollable                       |

---

## Accessibility Notes

- **Toggle**: Announce state change immediately (`aria-checked`)
- **Checkbox/Radio**: Group with `RadioGroup` or fieldset for screen readers
- **Select**: Native keyboard navigation (arrow keys, type-ahead)
- **Slider**: `aria-valuemin`, `aria-valuemax`, `aria-valuenow`
- All selection components use the gold focus ring (`--rialto-shadow-focus`)
