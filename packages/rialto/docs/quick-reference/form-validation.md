# Form Validation — Quick Reference

Patterns for validating user input and communicating errors using Rialto components.

---

## Validation Strategy

```
When to validate?
├── On blur ────────── Default for most fields (validate when user leaves)
├── On change ─────── Real-time feedback for passwords, search, character limits
├── On submit ─────── Final catch-all before sending data
└── Debounced ──────── Async validation (username availability, API checks)
```

**Rule of thumb**: Validate on blur for individual fields, on submit for the full form.

---

## Error Display Components

| Scenario             | Component                    | Example                               |
| -------------------- | ---------------------------- | ------------------------------------- |
| Field-level error    | **Input** `error` prop       | "Name is required" below the field    |
| Multiple form errors | **Alert** `variant="error"`  | Summary at top of form                |
| Submission failure   | **Toast** `variant="error"`  | "Failed to save" notification         |
| Page-level issue     | **Banner** `variant="error"` | "Service unavailable" at page top     |
| Destructive action   | **ConfirmDialog**            | "Delete this item?" before proceeding |

---

## Field-Level Validation

### Input with error state

```tsx
<Input
  label="Email"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
  error={emailError} // Error message string
  required
/>
```

### NumberInput with range

```tsx
<NumberInput label="Car Number" value={number} onChange={setNumber} min={1} max={99} />
```

### Select with required

```tsx
<Select
  label="Team"
  value={team}
  onChange={setTeam}
  options={[{ value: "", label: "Select team..." }, ...teams]}
/>
```

---

## Form-Level Validation

### Validation function pattern

```tsx
function validate(): string[] {
  const errors: string[] = [];
  if (!name.trim()) errors.push("Name is required.");
  if (number < 1 || number > 99) errors.push("Number must be 1-99.");
  if (!team) errors.push("Team is required.");
  return errors;
}
```

### Error summary with Alert

```tsx
{
  errors.length > 0 && (
    <Alert variant="error" title="Please fix the following:">
      <ul style={{ margin: 0, paddingLeft: "var(--rialto-space-md)" }}>
        {errors.map((err) => (
          <li key={err}>{err}</li>
        ))}
      </ul>
    </Alert>
  );
}
```

### Submit handler pattern

```tsx
function handleSubmit(e: FormEvent) {
  e.preventDefault();
  const errs = validate();
  if (errs.length > 0) {
    setErrors(errs);
    return;
  }
  setErrors([]);
  // proceed with submission
}
```

---

## Success Feedback

| Scenario         | Component                     | Pattern                                           |
| ---------------- | ----------------------------- | ------------------------------------------------- |
| Save completed   | **Toast** `variant="success"` | `toast({ title: 'Saved!', variant: 'success' })`  |
| Create completed | **Toast** + navigate          | Toast then redirect to detail page                |
| Delete completed | **Toast**                     | `toast({ title: 'Removed', variant: 'default' })` |

---

## Dirty State Tracking

Track whether a form has unsaved changes to warn before navigation.

```tsx
const isDirty = useMemo(() => {
  return name !== original.name || team !== original.team || status !== original.status;
}, [name, team, status, original]);

// Warn on cancel with unsaved changes
const handleCancel = () => {
  if (isDirty) {
    setDiscardDialog(true);
  } else {
    navigate(-1);
  }
};
```

### Discard confirmation

```tsx
<ConfirmDialog
  open={discardDialog}
  onConfirm={() => navigate(-1)}
  onCancel={() => setDiscardDialog(false)}
  title="Discard changes?"
  description="You have unsaved changes that will be lost."
  confirmLabel="Discard"
  variant="destructive"
/>
```

---

## Accessibility

- Associate error messages with fields via `aria-describedby`
- Use `aria-invalid="true"` on fields with errors
- Error Alert should use `role="alert"` for screen reader announcement
- Focus the first error field or the error summary after failed submit
- Don't rely on color alone — include text or icons for error states
