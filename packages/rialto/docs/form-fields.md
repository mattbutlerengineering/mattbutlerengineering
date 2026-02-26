# Form Field Components

User inputs and selections.

## Quick Reference {#quick-reference}

| Use Case                               | Component                                  |
| -------------------------------------- | ------------------------------------------ |
| Enter a single value                   | `Input`                                    |
| Enter multiple values                  | `TextArea`, `NumberInput`, `PinInput`      |
| Choose ONE option from a list          | `RadioGroup`, `SegmentedControl`, `Select` |
| Choose MULTIPLE options from a list    | `Checkbox`, `Toggle`, `Tag`                |
| Binary on/off state                    | `Toggle`                                   |
| Choose from a long list (10+ options)  | `Select`                                   |
| Choose from a short list (2-5 options) | `RadioGroup`, `SegmentedControl`           |

---

## Input {#input}

Freeform single-line text entry.

### When to Use {#input-when-to-use}

- Names, emails, URLs, or any single-line text
- Text that doesn't wrap

### When NOT to Use {#input-when-not-to-use}

- Yes/no questions → Use `Toggle`
- Multiple choices → Use `RadioGroup` or `Select`

### Props {#input-props}

| Prop          | Type                                       | Required | Default  | Description      |
| ------------- | ------------------------------------------ | -------- | -------- | ---------------- |
| `label`       | `string`                                   | Yes      | -        | Label text       |
| `placeholder` | `string`                                   | No       | -        | Placeholder text |
| `type`        | `'text' \| 'email' \| 'password' \| 'url'` | No       | `'text'` | Input type       |
| `error`       | `boolean`                                  | No       | `false`  | Error state      |
| `disabled`    | `boolean`                                  | No       | `false`  | Disabled state   |
| `hint`        | `string`                                   | No       | -        | Helper text      |

### States {#input-states}

| State    | Description                                        |
| -------- | -------------------------------------------------- |
| Default  | Recessed input field                               |
| Hover    | Border brightens to `--rialto-border-strong`       |
| Focus    | Gold border + focus ring (`--rialto-shadow-focus`) |
| Error    | Red border (`--rialto-error`) + error message      |
| Disabled | 45% opacity, not editable                          |

### Accessibility {#input-accessibility}

- Uses `<input>` element with associated `<label>`
- `aria-invalid` when error state
- Keyboard navigable with Tab
- Minimum touch target: 44x44px

### WCAG Conformance {#input-wcag-conformance}

| Criterion                         | Level | How                                                                                                |
| --------------------------------- | ----- | -------------------------------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships (A)  | A     | `<label>` element programmatically associated with `<input>` via `htmlFor`/`id` pairing            |
| 1.3.5 Identify Input Purpose (AA) | AA    | Supports `type` prop (`email`, `password`, `url`) and native `autocomplete` attribute pass-through |
| 2.4.7 Focus Visible (AA)          | AA    | Gold focus ring via `--rialto-shadow-focus` on `:focus-visible`                                    |
| 2.5.8 Target Size Minimum (AA)    | AA    | Input height is 44px, exceeding the 24x24px minimum                                                |
| 3.3.1 Error Identification (A)    | A     | `aria-invalid="true"` set when `error` prop is true; `hint` text linked via `aria-describedby`     |
| 3.3.2 Labels or Instructions (A)  | A     | `label` prop is required; rendered as visible `<label>` element                                    |
| 4.1.2 Name, Role, Value (A)       | A     | Native `<input>` provides role and value; `aria-invalid` communicates error state                  |

### Common Mistakes {#input-common-mistakes}

| Mistake                                                       | Impact                                                                               | Fix                                                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Omitting the `label` prop and relying on `placeholder` alone  | Placeholder disappears on input, leaving no persistent label for screen readers      | Always provide the `label` prop; use `placeholder` only as supplementary hint text               |
| Not setting `error` and `hint` together on validation failure | Users see a red border but receive no explanation of what went wrong                 | Set `error={true}` and provide a descriptive `hint` string explaining the validation requirement |
| Using `type="text"` for email or URL fields                   | Mobile keyboards do not optimize layout; autocomplete and validation are not engaged | Use the appropriate `type` value (`email`, `url`, `password`) to enable native browser behavior  |

### Visual Design {#input-visual-design}

- **Token**: `--rialto-surface-recessed` for background
- **Border**: `--rialto-border`, radius `--rialto-radius-default`
- **Padding**: `--rialto-space-xs` vertical, `--rialto-space-sm` horizontal
- **Focus**: Gold ring via `--rialto-shadow-focus`

### Animation {#input-animation}

- Border color transitions: 150ms ease
- No Framer Motion (static input)

### Responsiveness {#input-responsiveness}

- Full width on mobile
- Font size scales: `--rialto-text-base`

### Related {#input-related}

- `TextArea` — Multi-line text
- `NumberInput` — Numbers with stepper

### Example {#input-example}

```tsx
<Input label="Full name" placeholder="Enter your name" />
<Input label="Email" type="email" error hint="Valid email required" />
```

---

## TextArea {#text-area}

Multi-line text entry.

### When to Use {#text-area-when-to-use}

- Comments, descriptions, notes
- Text that may wrap to multiple lines
- Any input where length is unpredictable

### When NOT to Use {#text-area-when-not-to-use}

- Single-line text → Use `Input`
- Structured key-value data → Use `DataList`

### Props {#text-area-props}

| Prop         | Type      | Required | Default | Description      |
| ------------ | --------- | -------- | ------- | ---------------- |
| `label`      | `string`  | Yes      | -       | Label text       |
| `rows`       | `number`  | No       | `3`     | Visible rows     |
| `autoResize` | `boolean` | No       | `false` | Auto-grow height |
| `maxLength`  | `number`  | No       | -       | Character limit  |

### States {#text-area-states}

| State      | Description              |
| ---------- | ------------------------ |
| Default    | Recessed textarea        |
| Hover      | Border brightens         |
| Focus      | Gold border + focus ring |
| Error      | Red border + message     |
| Disabled   | 45% opacity              |
| Max length | Character counter shown  |

### Accessibility {#text-area-accessibility}

- Associated `<label>` element
- `aria-invalid` on error
- Tab navigable
- Character count announced if using `maxLength`

### WCAG Conformance {#text-area-wcag-conformance}

| Criterion                        | Level | How                                                                                          |
| -------------------------------- | ----- | -------------------------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships (A) | A     | `<label>` element programmatically associated with `<textarea>` via `htmlFor`/`id` pairing   |
| 2.4.7 Focus Visible (AA)         | AA    | Gold focus ring via `--rialto-shadow-focus` on `:focus-visible`                              |
| 2.5.8 Target Size Minimum (AA)   | AA    | Textarea height exceeds 44px minimum; width is full-width                                    |
| 3.3.1 Error Identification (A)   | A     | `aria-invalid="true"` on error state; character count live-announced when `maxLength` is set |
| 3.3.2 Labels or Instructions (A) | A     | `label` prop is required; rendered as visible `<label>` element                              |
| 4.1.2 Name, Role, Value (A)      | A     | Native `<textarea>` provides role and value; `aria-invalid` communicates error state         |

### Common Mistakes {#text-area-common-mistakes}

| Mistake                                                                  | Impact                                                                              | Fix                                                                                      |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Not providing `maxLength` when content length is constrained server-side | Users can type beyond the limit and lose data on submit                             | Set `maxLength` to match backend constraints so the character counter appears            |
| Using TextArea for single-line input to get a larger hit area            | Unexpected multiline behavior and Enter key submitting newlines instead of the form | Use `Input` for single-line values; increase hit area with padding if needed             |
| Omitting the `label` prop                                                | Screen readers cannot identify the field purpose                                    | Always provide the `label` prop; do not rely on surrounding headings or placeholder text |

### Visual Design {#text-area-visual-design}

- **Token**: `--rialto-surface-recessed` for background
- **Border**: `--rialto-border`, radius `--rialto-radius-default`
- **Padding**: `--rialto-space-xs` horizontal
- **Font**: Monospace for character counter

### Animation {#text-area-animation}

- Auto-resize: smooth height transition 200ms
- Respects `prefers-reduced-motion`

### Related {#text-area-related}

- `Input` — Single-line text

### Example {#text-area-example}

```tsx
<TextArea label="Feedback" placeholder="Tell us what you think..." rows={4} />
<TextArea label="Bio" autoResize maxLength={500} />
```

---

## NumberInput {#number-input}

Numeric values with increment/decrement controls.

### When to Use {#number-input-when-to-use}

- Quantities, ages, percentages
- Bounded numeric values
- When users need precise control

### When NOT to Use {#number-input-when-not-to-use}

- Freeform numbers → Use `Input` with `type="number"`
- Currency values → Use `Input` with formatting

### Props {#number-input-props}

| Prop    | Type                   | Required | Default | Description     |
| ------- | ---------------------- | -------- | ------- | --------------- |
| `label` | `string`               | Yes      | -       | Label text      |
| `min`   | `number`               | No       | -       | Minimum value   |
| `max`   | `number`               | No       | -       | Maximum value   |
| `step`  | `number`               | No       | `1`     | Increment value |
| `size`  | `'sm' \| 'md' \| 'lg'` | No       | `'md'`  | Input size      |

### States {#number-input-states}

| State    | Description                         |
| -------- | ----------------------------------- |
| Default  | Recessed input + stepper buttons    |
| Hover    | Border brightens, stepper highlight |
| Focus    | Gold border + focus ring            |
| Disabled | 45% opacity, steppers disabled      |
| Error    | Out of range value                  |

### Accessibility {#number-input-accessibility}

- Keyboard: Arrow Up/Down adjusts value by step
- Hold to repeat with acceleration
- Tab to navigate, Enter to open stepper

### WCAG Conformance {#number-input-wcag-conformance}

| Criterion                        | Level | How                                                                                             |
| -------------------------------- | ----- | ----------------------------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships (A) | A     | `<label>` associated with the input; stepper buttons are grouped with the field                 |
| 2.4.7 Focus Visible (AA)         | AA    | Gold focus ring via `--rialto-shadow-focus` on the input and stepper buttons                    |
| 2.5.8 Target Size Minimum (AA)   | AA    | Stepper buttons meet 44px target in `md` and `lg` sizes; `sm` (32px) still exceeds 24px minimum |
| 3.3.1 Error Identification (A)   | A     | Out-of-range values trigger `aria-invalid`; error message describes the valid range             |
| 3.3.2 Labels or Instructions (A) | A     | `label` prop is required; rendered as visible `<label>` element                                 |
| 4.1.2 Name, Role, Value (A)      | A     | Uses `role="spinbutton"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax`                 |

### Common Mistakes {#number-input-common-mistakes}

| Mistake                                                         | Impact                                                                            | Fix                                                                                 |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Not setting `min` and `max` when the domain is bounded          | Users can enter out-of-range values that fail on submit                           | Always set `min` and `max` to reflect valid boundaries                              |
| Using NumberInput for phone numbers, zip codes, or credit cards | Stepper arrows are meaningless for identifiers; Arrow keys interfere with editing | Use `Input` with `type="tel"` or `inputMode="numeric"` for non-mathematical numbers |
| Setting a `step` that does not evenly divide the range          | Keyboard users cannot reach the max value via Arrow keys                          | Choose a `step` value that divides evenly into `max - min`                          |

### Visual Design {#number-input-visual-design}

- **Token**: `--rialto-surface-recessed` for input
- **Stepper**: Machined +/- buttons, `--rialto-radius-sharp`
- **Size variants**: sm (32px), md (40px), lg (48px)
- **Monospace digits** for alignment

### Animation {#number-input-animation}

- Stepper press: subtle scale on active
- Respects `prefers-reduced-motion`

### Related {#number-input-related}

- `Input` — General text input
- `Slider` — Continuous range selection

### Example {#number-input-example}

```tsx
<NumberInput label="Quantity" min={1} max={100} />
<NumberInput label="Temperature" step={0.5} />
```

---

## Select {#select}

Dropdown selection for one option from a list.

### When to Use {#select-when-to-use}

- 5+ options
- Limited screen space
- Options may change dynamically

### When NOT to Use {#select-when-not-to-use}

- 2-5 options → Use `RadioGroup` or `SegmentedControl`
- Binary yes/no → Use `Toggle`

### Props {#select-props}

| Prop          | Type             | Required | Default | Description    |
| ------------- | ---------------- | -------- | ------- | -------------- |
| `label`       | `string`         | Yes      | -       | Label text     |
| `options`     | `SelectOption[]` | Yes      | -       | Options array  |
| `placeholder` | `string`         | No       | -       | Placeholder    |
| `disabled`    | `boolean`        | No       | `false` | Disabled state |

### States {#select-states}

| State           | Description                            |
| --------------- | -------------------------------------- |
| Default         | Trigger button with chevron            |
| Hover (trigger) | Background highlight                   |
| Focus           | Gold focus ring on trigger             |
| Open            | Frosted glass dropdown, gold checkmark |
| Disabled        | 45% opacity                            |

### Accessibility {#select-accessibility}

- Keyboard: Arrow keys navigate options
- Enter to select, Escape to close
- Type-ahead searches options
- `aria-expanded`, `aria-haspopup`, `aria-activedescendant`

### WCAG Conformance {#select-wcag-conformance}

| Criterion                        | Level | How                                                                                                                                                   |
| -------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships (A) | A     | `<label>` associated with trigger button; listbox role conveys option structure                                                                       |
| 2.4.7 Focus Visible (AA)         | AA    | Gold focus ring via `--rialto-shadow-focus` on the trigger button                                                                                     |
| 2.5.8 Target Size Minimum (AA)   | AA    | Trigger button height is 44px; each option row meets 44px minimum                                                                                     |
| 3.3.2 Labels or Instructions (A) | A     | `label` prop is required; rendered as visible `<label>` element                                                                                       |
| 4.1.2 Name, Role, Value (A)      | A     | Trigger uses `aria-haspopup="listbox"`, `aria-expanded`; active option tracked via `aria-activedescendant`; selected option reflected in trigger text |

### Common Mistakes {#select-common-mistakes}

| Mistake                                                              | Impact                                                                        | Fix                                                                                   |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Using Select for 2-3 options when all fit on screen                  | Adds an unnecessary click to reveal options; slower for users                 | Use `RadioGroup` or `SegmentedControl` when options are few and space permits         |
| Not providing a `placeholder` or default selection                   | Trigger shows empty text; screen readers announce no value                    | Set a `placeholder` like "Choose..." or provide an initial selected value             |
| Placing Select inside a scrollable container with `overflow: hidden` | Dropdown is clipped and options are unreachable                               | Ensure the dropdown can escape its container or use a portal-based rendering strategy |
| Omitting the `label` prop and using a nearby heading instead         | Programmatic association is missing; screen readers cannot identify the field | Always provide the `label` prop for a proper `<label>` association                    |

### Visual Design {#select-visual-design}

- **Trigger**: `--rialto-surface`, radius `--rialto-radius-default`
- **Dropdown**: Glass effect (`backdrop-filter: blur`), shadow
- **Option hover**: `--rialto-surface-recessed`
- **Selected**: Gold checkmark

### Animation {#select-animation}

- Dropdown entrance: spring animation via Framer Motion
- Chevron rotation: springGentle
- Respects `prefers-reduced-motion`

### Related {#select-related}

- `RadioGroup` — Few visible options
- `SegmentedControl` — Visual pill toggle

### Example {#select-example}

```tsx
<Select
  label="Country"
  placeholder="Choose..."
  options={[
    { value: "us", label: "United States" },
    { value: "uk", label: "United Kingdom" },
  ]}
/>
```

---

## RadioGroup {#radio-group}

Single selection from a visible list of options.

### When to Use {#radio-group-when-to-use}

- 2-5 options
- When seeing all options improves UX
- When labels need descriptions

### When NOT to Use {#radio-group-when-not-to-use}

- Binary yes/no → Use `Toggle`
- Many options → Use `Select`

### Props {#radio-group-props}

| Prop       | Type                      | Required | Default | Description    |
| ---------- | ------------------------- | -------- | ------- | -------------- |
| `label`    | `string`                  | Yes      | -       | Group label    |
| `value`    | `string`                  | No       | -       | Selected value |
| `onChange` | `(value: string) => void` | No       | -       | Change handler |

### States {#radio-group-states}

| State    | Description            |
| -------- | ---------------------- |
| Default  | Unchecked radio circle |
| Hover    | Subtle background      |
| Focus    | Gold focus ring        |
| Selected | Filled gold circle     |
| Disabled | 45% opacity            |

### Accessibility {#radio-group-accessibility}

- Uses `<fieldset>` with `<legend>` for label
- Arrow keys navigate between radios
- `aria-checked` for selected state
- Tab into group, arrow to navigate

### WCAG Conformance {#radio-group-wcag-conformance}

| Criterion                        | Level | How                                                                                                                       |
| -------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships (A) | A     | `<fieldset>` with `<legend>` groups radios programmatically; each `<input type="radio">` is associated with its `<label>` |
| 2.4.7 Focus Visible (AA)         | AA    | Gold focus ring via `--rialto-shadow-focus` on the focused radio button                                                   |
| 2.5.8 Target Size Minimum (AA)   | AA    | Each radio option row is 44px tall; clickable area spans the full label width                                             |
| 3.3.2 Labels or Instructions (A) | A     | Group `label` prop renders as `<legend>`; each radio has an individual label                                              |
| 4.1.2 Name, Role, Value (A)      | A     | Native `<input type="radio">` provides role; `aria-checked` reflects selected state                                       |

### Common Mistakes {#radio-group-common-mistakes}

| Mistake                                                     | Impact                                                                           | Fix                                                                                      |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Using RadioGroup for 10+ options                            | Long lists overwhelm the UI and slow scanning                                    | Use `Select` for long option lists (5+ is a good threshold)                              |
| Not wrapping radios in a `RadioGroup` parent with a `label` | Screen readers cannot identify the group purpose or relationship between options | Always use `RadioGroup` with its `label` prop; do not render standalone `Radio` elements |
| Defaulting to no selection when one option is required      | Users can submit the form without choosing, bypassing required validation        | Pre-select a sensible default or validate that a selection has been made before submit   |

### Visual Design {#radio-group-visual-design}

- **Radio**: 18px circle, 2px border
- **Selected**: 10px gold fill
- **Focus ring**: `--rialto-shadow-focus`
- **Radius**: `--rialto-radius-default`

### Animation {#radio-group-animation}

- Check fill: spring animation (like Toggle)
- Respects `prefers-reduced-motion`

### Related {#radio-group-related}

- `Select` — Many options
- `Checkbox` — Multiple selection

### Example {#radio-group-example}

```tsx
<RadioGroup label="Delivery method" name="delivery">
  <Radio value="standard" label="Standard (5-7 days)" />
  <Radio value="express" label="Express (2 days)" />
  <Radio value="overnight" label="Overnight" />
</RadioGroup>
```

---

## SegmentedControl {#segmented-control}

Pill-style toggle for mutually exclusive options.

### When to Use {#segmented-control-when-to-use}

- 2-4 options
- Visual prominence matters
- Toggle between views or modes

### When NOT to Use {#segmented-control-when-not-to-use}

- Binary toggle → Use `Toggle`
- Many options → Use `Select`
- Need descriptions → Use `RadioGroup`

### Props {#segmented-control-props}

| Prop       | Type                      | Required | Default | Description    |
| ---------- | ------------------------- | -------- | ------- | -------------- |
| `segments` | `Segment[]`               | Yes      | -       | Segment config |
| `value`    | `string`                  | Yes      | -       | Selected value |
| `onChange` | `(value: string) => void` | Yes      | -       | Change handler |
| `size`     | `'sm' \| 'md'`            | No       | `'md'`  | Control size   |

### States {#segmented-control-states}

| State    | Description                         |
| -------- | ----------------------------------- |
| Default  | Pill container, unselected segments |
| Hover    | Subtle background on segment        |
| Focus    | Gold focus ring                     |
| Selected | Sliding gold indicator              |
| Disabled | 45% opacity                         |

### Accessibility {#segmented-control-accessibility}

- Arrow keys navigate between segments
- Tab into control, arrows to navigate
- `aria-pressed` for each segment

### WCAG Conformance {#segmented-control-wcag-conformance}

| Criterion                        | Level | How                                                                                                                  |
| -------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships (A) | A     | Container uses `role="radiogroup"` or equivalent grouping; each segment conveys its pressed state                    |
| 2.4.7 Focus Visible (AA)         | AA    | Gold focus ring via `--rialto-shadow-focus` on the focused segment                                                   |
| 2.5.8 Target Size Minimum (AA)   | AA    | Each segment meets 44px width minimum; `md` height is 40px, `sm` is 32px (exceeds 24px minimum)                      |
| 4.1.2 Name, Role, Value (A)      | A     | Each segment uses `aria-pressed` to communicate selected state; group label via `aria-label` or associated `<label>` |

### Common Mistakes {#segmented-control-common-mistakes}

| Mistake                                                            | Impact                                                                                                           | Fix                                                                                |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Using SegmentedControl for 5+ options                              | Segments become too narrow to read; touch targets shrink below usable size                                       | Use `Select` or `RadioGroup` for more than 4 options                               |
| Not providing an accessible group label                            | Screen readers announce individual segments but not the group purpose                                            | Add an `aria-label` on the container or associate a visible label via `label` prop |
| Using SegmentedControl for form data that requires explicit submit | Users expect immediate effect (like tab switching) but the value is not submitted until later, causing confusion | Use `RadioGroup` for form fields that require a submit action                      |

### Visual Design {#segmented-control-visual-design}

- **Container**: Pill shape, `--rialto-radius-round`
- **Indicator**: Gold fill (`--rialto-accent`), springs between positions
- **Size**: sm (32px), md (40px) height
- **Animation**: Spring physics on indicator movement

### Animation {#segmented-control-animation}

- Indicator: `spring` from `src/tokens/motion.ts`
- Overshoots and settles like a physical detent
- Respects `prefers-reduced-motion`

### Related {#segmented-control-related}

- `Toggle` — Binary switch
- `RadioGroup` — Traditional radios

### Example {#segmented-control-example}

```tsx
<SegmentedControl
  segments={[
    { id: "day", label: "Day" },
    { id: "week", label: "Week" },
    { id: "month", label: "Month" },
  ]}
  value={view}
  onChange={setView}
/>
```

---

## Checkbox {#checkbox}

Multiple selection or confirmation.

### When to Use {#checkbox-when-to-use}

- Multiple selections from a list
- Terms acceptance
- Optional features

### When NOT to Use {#checkbox-when-not-to-use}

- Binary on/off → Use `Toggle`
- Single choice → Use `Radio` or `Select`

### Props {#checkbox-props}

| Prop            | Type      | Required | Default | Description       |
| --------------- | --------- | -------- | ------- | ----------------- |
| `label`         | `string`  | Yes      | -       | Label text        |
| `checked`       | `boolean` | No       | -       | Checked state     |
| `indeterminate` | `boolean` | No       | `false` | Partial selection |
| `description`   | `string`  | No       | -       | Help text         |

### States {#checkbox-states}

| State         | Description                      |
| ------------- | -------------------------------- |
| Default       | Empty square box                 |
| Hover         | Border brightens                 |
| Focus         | Gold focus ring                  |
| Checked       | Gold checkmark, spring animation |
| Indeterminate | Dash, spring animation           |
| Disabled      | 45% opacity                      |

### Accessibility {#checkbox-accessibility}

- Space key toggles
- `aria-checked` for state (true, false, mixed)
- Tab into, Space to toggle
- Description read by screen readers

### WCAG Conformance {#checkbox-wcag-conformance}

| Criterion                        | Level | How                                                                                                        |
| -------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships (A) | A     | `<label>` programmatically associated with the checkbox input; `description` linked via `aria-describedby` |
| 2.4.7 Focus Visible (AA)         | AA    | Gold focus ring via `--rialto-shadow-focus` on `:focus-visible`                                            |
| 2.5.8 Target Size Minimum (AA)   | AA    | Clickable area includes the label text, well exceeding 24x24px minimum                                     |
| 3.3.2 Labels or Instructions (A) | A     | `label` prop is required; rendered as visible `<label>` element                                            |
| 4.1.2 Name, Role, Value (A)      | A     | Native checkbox role; `aria-checked` set to `true`, `false`, or `mixed` for indeterminate state            |

### Common Mistakes {#checkbox-common-mistakes}

| Mistake                                                               | Impact                                                                                      | Fix                                                                                          |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Using Checkbox as a binary on/off toggle for settings                 | Users expect immediate effect from toggles but Checkbox implies form submission             | Use `Toggle` for immediate state changes; use Checkbox for form fields that submit           |
| Not handling the `indeterminate` state in parent-child checkbox trees | Parent checkbox shows as unchecked even when some children are checked, which is misleading | Set `indeterminate={true}` on the parent when the child selection is partial                 |
| Making the click target only the 18px checkbox box                    | Touch users cannot reliably tap the small target                                            | Ensure the `<label>` wraps or is associated so clicking label text also toggles the checkbox |

### Visual Design {#checkbox-visual-design}

- **Box**: 18px square, `--rialto-radius-sharp` (2px)
- **Check**: Gold checkmark, animated draw
- **Indeterminate**: Horizontal dash
- **Focus ring**: `--rialto-shadow-focus`

### Animation {#checkbox-animation}

- Check mark: spring animation
- Indeterminate dash: spring animation
- Respects `prefers-reduced-motion`

### Related {#checkbox-related}

- `Toggle` — Binary state
- `RadioGroup` — Single choice

### Example {#checkbox-example}

```tsx
<Checkbox label="I agree to terms" />
<Checkbox
  label="Subscribe"
  description="Get updates weekly"
  checked={subscribed}
  onCheckedChange={setSubscribed}
/>
```

---

## Toggle {#toggle}

Binary on/off switch.

### When to Use {#toggle-when-to-use}

- Settings, preferences
- Feature flags
- Immediate state changes

### When NOT to Use {#toggle-when-not-to-use}

- Confirming terms → Use `Checkbox`
- Choosing from options → Use `Radio` or `Select`

### Props {#toggle-props}

| Prop       | Type      | Required | Default | Description    |
| ---------- | --------- | -------- | ------- | -------------- |
| `label`    | `string`  | Yes      | -       | Label text     |
| `checked`  | `boolean` | No       | -       | On state       |
| `disabled` | `boolean` | No       | `false` | Disabled state |

### States {#toggle-states}

| State         | Description                  |
| ------------- | ---------------------------- |
| Default (off) | Grey track, white knob left  |
| Hover         | Track brightens              |
| Focus         | Gold focus ring              |
| On            | Gold track, white knob right |
| Disabled      | 45% opacity                  |

### Accessibility {#toggle-accessibility}

- Space key toggles
- `aria-pressed` for state
- Tab into, Space to toggle
- Label is part of accessible name

### WCAG Conformance {#toggle-wcag-conformance}

| Criterion                        | Level | How                                                                                     |
| -------------------------------- | ----- | --------------------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships (A) | A     | Label is programmatically associated with the toggle via `aria-labelledby` or `<label>` |
| 2.4.7 Focus Visible (AA)         | AA    | Gold focus ring via `--rialto-shadow-focus` on `:focus-visible`                         |
| 2.5.8 Target Size Minimum (AA)   | AA    | Track is 44x24px; clickable area includes the label, well exceeding 24x24px minimum     |
| 3.3.2 Labels or Instructions (A) | A     | `label` prop is required; rendered as visible label text                                |
| 4.1.2 Name, Role, Value (A)      | A     | Uses `role="switch"` with `aria-checked` to communicate on/off state                    |

### Common Mistakes {#toggle-common-mistakes}

| Mistake                                                        | Impact                                                                                | Fix                                                                                                                            |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Using Toggle in a form that requires an explicit submit action | Users expect Toggle to take immediate effect, but the state is not saved until submit | Use `Checkbox` for form fields that require submit; reserve Toggle for instant-apply settings                                  |
| Not communicating the on/off state beyond color alone          | Color-blind users cannot distinguish gold (on) from grey (off)                        | The knob position (left/right) provides a non-color indicator; ensure the label or nearby text also reflects state if critical |
| Using Toggle for multi-option choices                          | Toggle is strictly binary; forcing multiple toggles for a single choice is confusing  | Use `RadioGroup`, `SegmentedControl`, or `Select` for mutually exclusive multi-option choices                                  |

### Visual Design {#toggle-visual-design}

- **Track**: 44px × 24px, rounded pill
- **Knob**: 20px circle, raised appearance
- **On color**: `--rialto-accent` (gold)
- **Off color**: `--rialto-surface-recessed`
- **Focus**: `--rialto-shadow-focus`

### Animation {#toggle-animation}

- Knob: spring animation sliding left/right
- Detent feel: high stiffness, controlled damping
- Respects `prefers-reduced-motion`

### Related {#toggle-related}

- `Checkbox` — Multi-select
- `SegmentedControl` — Multiple choices

### Example {#toggle-example}

```tsx
<Toggle label="Dark mode" checked={darkMode} onCheckedChange={setDarkMode} />
```

---

## Tag {#tag}

Selectable label for filtering.

### When to Use {#tag-when-to-use}

- Multi-select filters
- Selected items that can be removed
- Categories/tags

### When NOT to Use {#tag-when-not-to-use}

- Binary state → Use `Toggle`
- Single selection → Use `Radio` or `Select`

### Props {#tag-props}

| Prop          | Type                                            | Required | Default     | Description        |
| ------------- | ----------------------------------------------- | -------- | ----------- | ------------------ |
| `variant`     | `'default' \| 'accent' \| 'success' \| 'error'` | No       | `'default'` | Color variant      |
| `selected`    | `boolean`                                       | No       | `false`     | Selected state     |
| `dismissible` | `boolean`                                       | No       | `false`     | Show remove button |

### States {#tag-states}

| State       | Description                     |
| ----------- | ------------------------------- |
| Default     | Neutral background              |
| Hover       | Slight darken                   |
| Selected    | Variant background, gold border |
| Dismissible | Shows X button on hover         |

### Accessibility {#tag-accessibility}

- `role="button"` when interactive
- `aria-pressed` when selectable
- Keyboard: Enter/Space to toggle selected

### WCAG Conformance {#tag-wcag-conformance}

| Criterion                        | Level | How                                                                                                                          |
| -------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships (A) | A     | `role="button"` with `aria-pressed` conveys toggle semantics; dismiss button is a separate focusable element                 |
| 2.4.7 Focus Visible (AA)         | AA    | Gold focus ring via `--rialto-shadow-focus` on `:focus-visible`                                                              |
| 2.5.8 Target Size Minimum (AA)   | AA    | Tag height meets 24px minimum; dismiss X button has a 24px touch target with padding                                         |
| 4.1.2 Name, Role, Value (A)      | A     | Text content provides accessible name; `aria-pressed` communicates selected state; dismiss button uses `aria-label="Remove"` |

### Common Mistakes {#tag-common-mistakes}

| Mistake                                                                       | Impact                                                                           | Fix                                                                                                                                  |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Using Tag without `role="button"` or click handler when it looks interactive  | Users see a styled element that appears clickable but is not keyboard accessible | If the Tag is purely decorative/informational, use `Badge` instead; if interactive, ensure `onClick` and `role="button"` are present |
| Dismiss X button has no accessible label                                      | Screen readers announce only "button" with no context about what will be removed | Ensure the dismiss button has `aria-label="Remove [tag text]"`                                                                       |
| Using color variant alone to communicate meaning (e.g., error Tag for status) | Color-blind users cannot distinguish variant semantics                           | Include text or an icon that conveys the meaning independently of color                                                              |

### Visual Design {#tag-visual-design}

- **Radius**: `--rialto-radius-sharp` (2px)
- **Padding**: `--rialto-space-xs` horizontal, `--rialto-space-2xs` vertical
- **Variant colors**:
  - Default: `--rialto-surface-elevated`
  - Accent: gold background
  - Success: green background
  - Error: red background
- **Dismiss**: 12px X icon

### Animation {#tag-animation}

- Select: spring background transition
- Dismiss: spring animation on X, tag removal
- Respects `prefers-reduced-motion`

### Related {#tag-related}

- `Badge` — Status indicators (not interactive)
- `Checkbox` — Multi-select

### Example {#tag-example}

```tsx
<Tag selected onClick={() => removeTag("option1")}>Option 1</Tag>
<Tag variant="accent" dismissible onDismiss={() => removeTag("option2")}>
  Removable
</Tag>
```

---

## PinInput {#pin-input}

Fixed-length code entry.

### When to Use {#pin-input-when-to-use}

- Verification codes (OTP)
- PINs, license keys
- When length is known

### When NOT to Use {#pin-input-when-not-to-use}

- Variable length → Use `Input`
- Numbers with math → Use `NumberInput`

### Props {#pin-input-props}

| Prop     | Type                          | Required | Default     | Description      |
| -------- | ----------------------------- | -------- | ----------- | ---------------- |
| `label`  | `string`                      | Yes      | -           | Label text       |
| `length` | `number`                      | No       | `4`         | Number of digits |
| `mask`   | `boolean`                     | No       | `false`     | Hide input       |
| `type`   | `'numeric' \| 'alphanumeric'` | No       | `'numeric'` | Input type       |
| `size`   | `'sm' \| 'md' \| 'lg'`        | No       | `'md'`      | Cell size        |

### States {#pin-input-states}

| State   | Description                      |
| ------- | -------------------------------- |
| Default | Empty cells, recessed appearance |
| Focus   | Gold border + focus ring on cell |
| Filled  | Character/number in cell         |
| Error   | Red border, error message        |

### Accessibility {#pin-input-accessibility}

- Auto-advance to next cell on input
- Paste support: paste full code at once
- Backspace returns to previous cell
- Keyboard navigation between cells
- `aria-label` per cell: "Digit 1", "Digit 2", etc.

### WCAG Conformance {#pin-input-wcag-conformance}

| Criterion                        | Level | How                                                                                                                        |
| -------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships (A) | A     | Group of inputs wrapped with a group role; each cell has `aria-label` ("Digit 1", "Digit 2", etc.) describing its position |
| 2.4.7 Focus Visible (AA)         | AA    | Gold focus ring via `--rialto-shadow-focus` on the currently active cell                                                   |
| 2.5.8 Target Size Minimum (AA)   | AA    | Each cell is 48x56px (md), well exceeding the 24x24px minimum                                                              |
| 3.3.1 Error Identification (A)   | A     | `aria-invalid` set on the group when the entered code is incorrect; error message displayed below                          |
| 3.3.2 Labels or Instructions (A) | A     | `label` prop is required; rendered as visible label above the cells                                                        |
| 4.1.2 Name, Role, Value (A)      | A     | Each cell is a native `<input>` with `aria-label`; group label conveys overall purpose                                     |

### Common Mistakes {#pin-input-common-mistakes}

| Mistake                                                    | Impact                                                                                      | Fix                                                                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Not supporting paste of a full code                        | Users copying a code from SMS or email must type each digit individually                    | Implement paste handling that distributes characters across all cells                |
| Using PinInput for variable-length input                   | Cell count is fixed but the expected input length varies, leaving empty cells or truncating | Use `Input` when the length is not predetermined                                     |
| Not setting `type="numeric"` when only digits are expected | Mobile keyboards show the full alpha keyboard, slowing entry                                | Set `type="numeric"` and use `inputMode="numeric"` on each cell for a numeric keypad |
| Missing the `mask` prop for sensitive codes like PINs      | Entered digits are visible on screen, risking shoulder surfing                              | Set `mask={true}` for security-sensitive codes                                       |

### Visual Design {#pin-input-visual-design}

- **Cells**: 48px × 56px (md), recessed background
- **Border**: `--rialto-border`, radius `--rialto-radius-default`
- **Font**: Monospace for digit alignment
- **Spacing**: `--rialto-space-sm` between cells
- **Mask**: Bullet character (●)

### Animation {#pin-input-animation}

- Cell entry: spring animation
- Respects `prefers-reduced-motion`

### Related {#pin-input-related}

- `Input` — Variable length input
- `NumberInput` — Numeric values

### Example {#pin-input-example}

```tsx
<PinInput label="Verification code" length={6} />
<PinInput label="PIN" mask length={4} />
```

---

## Slider {#slider}

Continuous range selection with spring-animated knob.

### When to Use {#slider-when-to-use}

- Volume, brightness, opacity controls
- Bounded numeric ranges
- When visual feedback of position matters

### When NOT to Use {#slider-when-not-to-use}

- Precise numeric entry → Use `NumberInput`
- Discrete choices → Use `SegmentedControl` or `RadioGroup`
- Unbounded values → Use `Input`

### Props {#slider-props}

| Prop           | Type                      | Required | Default  | Description          |
| -------------- | ------------------------- | -------- | -------- | -------------------- |
| `min`          | `number`                  | No       | `0`      | Minimum value        |
| `max`          | `number`                  | No       | `100`    | Maximum value        |
| `step`         | `number`                  | No       | `1`      | Increment value      |
| `value`        | `number`                  | No       | -        | Controlled value     |
| `defaultValue` | `number`                  | No       | -        | Initial value        |
| `onChange`     | `(value: number) => void` | No       | -        | Value change handler |
| `label`        | `string`                  | No       | -        | Label text           |
| `showValue`    | `boolean`                 | No       | `false`  | Display value        |
| `formatValue`  | `(v: number) => string`   | No       | `String` | Value formatter      |
| `disabled`     | `boolean`                 | No       | `false`  | Disabled state       |

### States {#slider-states}

| State    | Description                               |
| -------- | ----------------------------------------- |
| Default  | Track with positioned knob                |
| Hover    | Knob border becomes `--rialto-accent`     |
| Focus    | Gold focus ring (`--rialto-shadow-focus`) |
| Dragging | Grabbing cursor, immediate response       |
| Disabled | 45% opacity, not interactive              |

### Accessibility {#slider-accessibility}

- Hidden `<input type="range">` for native semantics
- Arrow keys adjust value by step
- Keyboard focus triggers `focus-visible` ring on knob
- `touch-action: none` on track for smooth pointer drag
- `aria-valuenow`, `aria-valuemin`, `aria-valuemax`

### WCAG Conformance {#slider-wcag-conformance}

| Criterion                        | Level | How                                                                                                                                     |
| -------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships (A) | A     | Hidden `<input type="range">` provides native slider semantics; `label` prop is associated via `htmlFor`/`id`                           |
| 2.4.7 Focus Visible (AA)         | AA    | Gold focus ring via `--rialto-shadow-focus` on the knob when `:focus-visible`                                                           |
| 2.5.8 Target Size Minimum (AA)   | AA    | Knob is 18px visually but the draggable hit area extends to 44px via padding; track click also sets position                            |
| 3.3.2 Labels or Instructions (A) | A     | `label` prop renders a visible label; `showValue` displays the current numeric value                                                    |
| 4.1.2 Name, Role, Value (A)      | A     | `aria-valuenow`, `aria-valuemin`, `aria-valuemax` on the range input; `formatValue` can supply `aria-valuetext` for non-numeric meaning |

### Common Mistakes {#slider-common-mistakes}

| Mistake                                                                                          | Impact                                                                                         | Fix                                                                                                                      |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Not providing `aria-valuetext` via `formatValue` when the value represents a non-numeric concept | Screen readers announce "50" instead of "50%" or "Medium"                                      | Use the `formatValue` prop to return a human-readable string (e.g., `v => \`${v}%\``) which is used for `aria-valuetext` |
| Using Slider for precise numeric entry where exact values matter                                 | Users struggle to land on an exact value with drag interaction                                 | Use `NumberInput` for precise values; Slider is best for approximate or relative adjustments                             |
| Not setting a visible label via the `label` prop                                                 | Screen readers cannot identify the slider purpose; sighted users lack context                  | Always provide the `label` prop; do not rely on surrounding text                                                         |
| Setting `step` to a very small value on a short track                                            | The knob moves imperceptibly per arrow press; keyboard users cannot tell the value is changing | Use a `step` that produces noticeable visual movement, or combine with `showValue` so the number change is visible       |

### Visual Design {#slider-visual-design}

- **Track**: `recessed` surface composition, 6px height, `--rialto-radius-round`
- **Fill**: Gold gradient (90°) from `--rialto-accent` to `--rialto-accent-hover`
- **Knob**: 18px circle, gradient `--rialto-surface-elevated`, 2px `--rialto-border-strong`
- **Knob hover**: `--rialto-accent` border, `--rialto-accent-muted` glow
- **Value display**: `--rialto-font-mono`, `--rialto-text-xs`
- **Label**: `--rialto-text-secondary`, `--rialto-text-xs`, `--rialto-tracking-wide`

### Animation {#slider-animation}

- Knob position: `spring` physics via `useMotionValue`
- During drag: immediate response (`duration: 0`)
- On release/keyboard: spring settles into position
- Reduced motion: `duration: 0` on all transitions

### Related {#slider-related}

- `NumberInput` — Precise values
- `Progress` — Read-only progress
- `Meter` — Bounded gauge

### Example {#slider-example}

```tsx
<Slider label="Volume" min={0} max={100} value={vol} onChange={setVol} showValue />
<Slider label="Opacity" defaultValue={50} formatValue={(v) => `${v}%`} />
```

---

## Comparison Guide {#comparison-guide}

### Select vs RadioGroup {#select-vs-radio-group}

- **Select**: 5+ options, limited space, dynamic options
- **RadioGroup**: 2-5 options, visible choices improve UX

### Checkbox vs Toggle {#checkbox-vs-toggle}

- **Checkbox**: Confirming something, optional multi-select
- **Toggle**: Enabling/disabling features, immediate state

### SegmentedControl vs RadioGroup {#segmented-control-vs-radio-group}

- **SegmentedControl**: Visual toggle, views/modes, pill aesthetic
- **RadioGroup**: Traditional selection, need descriptions

### Toggle vs SegmentedControl {#toggle-vs-segmented-control}

- **Toggle**: Binary (on/off, yes/no)
- **SegmentedControl**: Multiple distinct choices
