# Multistep Wizard — Team Registration

## Summary

Add a `/teams/new` demo page demonstrating a multi-step form wizard using existing Rialto components. Three steps (Team Info → Car Setup → Review & Confirm) composed from Steps, Card, Input, Select, NumberInput, Button, Alert, and Toast. No new components — pure composition pattern.

## Decisions

- **Deliverable:** Demo page (like existing CRUDL pages), not a new component
- **Domain:** F1 team registration (fits the motorsport theme)
- **Steps:** 3 — Team Info, Car Setup, Review & Confirm
- **Layout:** Reuses `DriverLayout` (breadcrumbs, heading, footer)
- **Styling:** Reuses `DriverForm.module.css` patterns (fieldRow, formActions)
- **Navigation:** Steps header with `onStepClick` for completed steps, Back/Next buttons

## Architecture

### Page: `src/pages/teams/TeamCreate.tsx`

Single component with `useState` for step index and form data. No context provider needed (single page, no child routes).

**State shape:**

```ts
interface TeamFormData {
  // Step 1: Team Info
  name: string;
  baseCity: string;
  principal: string;
  founded: number;
  // Step 2: Car Setup
  chassis: string;
  engine: string;
  liveryColor: string;
}
```

**Step rendering:** A `switch` on `currentStep` renders the active step's fields inside a shared `<Card>` + `<form>` wrapper. Steps component sits above the card.

### Step 1 — Team Info

| Field          | Component   | Validation                  |
| -------------- | ----------- | --------------------------- |
| Team Name      | Input       | Required                    |
| Base City      | Input       | Required (e.g. "Maranello") |
| Team Principal | Input       | Required                    |
| Founded        | NumberInput | min 1950, max 2026          |

### Step 2 — Car Setup

| Field                | Component | Validation                                                |
| -------------------- | --------- | --------------------------------------------------------- |
| Chassis Designation  | Input     | Required (e.g. "SF-24")                                   |
| Engine Supplier      | Select    | Required (Ferrari, Mercedes, Honda RBPT, Renault)         |
| Primary Livery Color | Select    | Required (Red, Silver, Orange, Blue, Green, White, Black) |

### Step 3 — Review & Confirm

Summary of all fields grouped by step. Each group has an "Edit" button that sets `currentStep` back to that step. Submit button triggers simulated save → toast → navigate to showcase.

### Navigation rules

- **Next:** validates current step fields. If errors, shows Alert and blocks advance.
- **Back:** always works, no validation.
- **Steps header click:** `onStepClick` allows jumping back to any completed step (index < currentStep). Cannot click ahead to unvisited steps.
- **Submit:** only available on step 3. Simulates 400ms delay, shows success toast, navigates to `/`.

### Validation

Per-step validation function. Returns `string[]` of error messages. Errors shown in `<Alert variant="error">` at top of form (same pattern as DriverCreate).

```ts
function validateStep(step: number, data: TeamFormData): string[] {
  if (step === 0) {
    const errs: string[] = [];
    if (!data.name.trim()) errs.push('Team name is required.');
    if (!data.baseCity.trim()) errs.push('Base city is required.');
    if (!data.principal.trim()) errs.push('Team principal is required.');
    if (data.founded < 1950 || data.founded > 2026)
      errs.push('Founded year must be 1950–2026.');
    return errs;
  }
  if (step === 1) {
    const errs: string[] = [];
    if (!data.chassis.trim()) errs.push('Chassis designation is required.');
    if (!data.engine) errs.push('Engine supplier is required.');
    if (!data.liveryColor) errs.push('Livery color is required.');
    return errs;
  }
  return [];
}
```

## Files

| File                                    | Action                                   |
| --------------------------------------- | ---------------------------------------- |
| `src/pages/teams/TeamCreate.tsx`        | CREATE                                   |
| `src/pages/teams/TeamCreate.module.css` | CREATE (minimal — review summary styles) |
| `src/showcase/App.tsx`                  | MODIFY (add route + demo card link)      |
| `src/components/components.test.tsx`    | MODIFY (smoke test)                      |
| `src/components/accessibility.test.tsx` | MODIFY (axe test)                        |
| `TODO.md`                               | MODIFY (mark complete)                   |

## Testing

- Smoke test: TeamCreate renders step 1 without crashing
- Accessibility: TeamCreate passes axe-core
- Showcase: Link card in demo pages section with clipboard icon
