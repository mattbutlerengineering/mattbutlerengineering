# Multistep Wizard — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `/teams/new` demo page showing a 3-step team registration wizard using existing Rialto components.

**Architecture:** Single-page wizard with `useState` for step index and form data. Steps component at top, form sections swap below via `switch`. Per-step validation before advancing. Review step with edit-back links. Reuses DriverLayout and DriverForm.module.css patterns.

**Tech Stack:** React, react-router-dom, Rialto components (Steps, Card, Input, Select, NumberInput, Button, Alert, Toast)

**Design doc:** `docs/plans/2026-02-22-multistep-wizard-design.md`

---

### Task 1: Create TeamCreate page with Step 1 (Team Info)

**Files:**

- Create: `src/pages/teams/TeamCreate.tsx`
- Create: `src/pages/teams/TeamCreate.module.css`

**Step 1: Create the CSS module**

Create `src/pages/teams/TeamCreate.module.css`:

```css
/* ── Wizard layout ──────────────────────────── */
.wizardCard {
  max-width: 640px;
}

.steps {
  max-width: 640px;
  margin-bottom: var(--rialto-space-lg);
}

/* ── Form layout (mirrors DriverForm) ───────── */
.form {
  display: flex;
  flex-direction: column;
  gap: var(--rialto-space-md);
}

.fieldRow {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--rialto-space-md);
}

.formActions {
  display: flex;
  align-items: center;
  gap: var(--rialto-space-sm);
  padding-top: var(--rialto-space-sm);
  border-top: 1px solid var(--rialto-border);
}

.formActions > :last-child {
  margin-left: auto;
}

/* ── Review step ────────────────────────────── */
.reviewGroup {
  display: flex;
  flex-direction: column;
  gap: var(--rialto-space-xs);
}

.reviewHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.reviewTitle {
  font-size: var(--rialto-text-sm);
  font-weight: var(--rialto-weight-medium);
  color: var(--rialto-text-primary);
  letter-spacing: var(--rialto-tracking-wide);
}

.reviewRow {
  display: flex;
  justify-content: space-between;
  padding: var(--rialto-space-2xs) 0;
  border-bottom: 1px solid var(--rialto-border);
  font-size: var(--rialto-text-sm);
}

.reviewLabel {
  color: var(--rialto-text-tertiary);
}

.reviewValue {
  color: var(--rialto-text-primary);
  font-weight: var(--rialto-weight-medium);
}

/* ── Responsive ─────────────────────────────── */
@media (max-width: 640px) {
  .fieldRow {
    grid-template-columns: 1fr;
  }
}
```

**Step 2: Create the TeamCreate component with all 3 steps**

Create `src/pages/teams/TeamCreate.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { DriverLayout } from "../drivers/DriverLayout";
import { Card } from "../../components/Card/Card";
import { Input } from "../../components/Input/Input";
import { Select } from "../../components/Select/Select";
import { NumberInput } from "../../components/NumberInput/NumberInput";
import { Button } from "../../components/Button/Button";
import { Alert } from "../../components/Alert/Alert";
import { Steps } from "../../components/Steps/Steps";
import { Divider } from "../../components/Divider/Divider";
import { useToast } from "../../components/Toast/ToastContext";
import styles from "./TeamCreate.module.css";

const ENGINES = [
  { value: "", label: "Select engine..." },
  { value: "Ferrari", label: "Ferrari" },
  { value: "Mercedes", label: "Mercedes" },
  { value: "Honda RBPT", label: "Honda RBPT" },
  { value: "Renault", label: "Renault" },
];

const COLORS = [
  { value: "", label: "Select color..." },
  { value: "Red", label: "Red" },
  { value: "Silver", label: "Silver" },
  { value: "Orange", label: "Orange" },
  { value: "Blue", label: "Blue" },
  { value: "Green", label: "Green" },
  { value: "White", label: "White" },
  { value: "Black", label: "Black" },
];

interface TeamFormData {
  name: string;
  baseCity: string;
  principal: string;
  founded: number;
  chassis: string;
  engine: string;
  liveryColor: string;
}

const INITIAL_DATA: TeamFormData = {
  name: "",
  baseCity: "",
  principal: "",
  founded: 2024,
  chassis: "",
  engine: "",
  liveryColor: "",
};

const STEP_ITEMS = [
  { label: "Team Info", description: "Name & leadership" },
  { label: "Car Setup", description: "Chassis & livery" },
  { label: "Review", description: "Confirm & submit" },
];

function validateStep(step: number, data: TeamFormData): string[] {
  if (step === 0) {
    const errs: string[] = [];
    if (!data.name.trim()) errs.push("Team name is required.");
    if (!data.baseCity.trim()) errs.push("Base city is required.");
    if (!data.principal.trim()) errs.push("Team principal is required.");
    if (data.founded < 1950 || data.founded > 2026) errs.push("Founded year must be 1950–2026.");
    return errs;
  }
  if (step === 1) {
    const errs: string[] = [];
    if (!data.chassis.trim()) errs.push("Chassis designation is required.");
    if (!data.engine) errs.push("Engine supplier is required.");
    if (!data.liveryColor) errs.push("Livery color is required.");
    return errs;
  }
  return [];
}

export function TeamCreate() {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [currentStep, setCurrentStep] = useState(0);
  const [data, setData] = useState<TeamFormData>(INITIAL_DATA);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof TeamFormData>(key: K, value: TeamFormData[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  function handleNext(e: FormEvent) {
    e.preventDefault();
    const errs = validateStep(currentStep, data);
    if (errs.length > 0) {
      setErrors(errs);
      return;
    }
    setErrors([]);
    setCurrentStep((s) => s + 1);
  }

  function handleBack() {
    setErrors([]);
    setCurrentStep((s) => s - 1);
  }

  function handleStepClick(index: number) {
    if (index < currentStep) {
      setErrors([]);
      setCurrentStep(index);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setTimeout(() => {
      toast({ title: `${data.name} registered`, variant: "success" });
      navigate("/");
    }, 400);
  }

  return (
    <DriverLayout
      title="Register Team"
      breadcrumbs={[{ label: "Home", href: "/" }, { label: "Register Team" }]}
    >
      <Steps
        steps={STEP_ITEMS}
        currentStep={currentStep}
        onStepClick={handleStepClick}
        className={styles.steps}
      />

      <Card variant="elevated" className={styles.wizardCard}>
        {errors.length > 0 && (
          <Alert variant="error" title="Please fix the following:">
            <ul style={{ margin: 0, paddingLeft: "var(--rialto-space-md)" }}>
              {errors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          </Alert>
        )}

        {currentStep === 0 && (
          <form onSubmit={handleNext} className={styles.form}>
            <div className={styles.fieldRow}>
              <Input
                label="Team Name"
                value={data.name}
                onChange={(e) => update("name", e.target.value)}
                required
                placeholder="e.g. Scuderia Ferrari"
              />
              <Input
                label="Base City"
                value={data.baseCity}
                onChange={(e) => update("baseCity", e.target.value)}
                required
                placeholder="e.g. Maranello"
              />
            </div>
            <div className={styles.fieldRow}>
              <Input
                label="Team Principal"
                value={data.principal}
                onChange={(e) => update("principal", e.target.value)}
                required
                placeholder="e.g. Frédéric Vasseur"
              />
              <NumberInput
                label="Founded"
                value={data.founded}
                onChange={(v) => update("founded", v)}
                min={1950}
                max={2026}
              />
            </div>
            <div className={styles.formActions}>
              <Button variant="secondary" type="button" onClick={() => navigate("/")}>
                Cancel
              </Button>
              <Button variant="primary" type="submit">
                Next
              </Button>
            </div>
          </form>
        )}

        {currentStep === 1 && (
          <form onSubmit={handleNext} className={styles.form}>
            <Input
              label="Chassis Designation"
              value={data.chassis}
              onChange={(e) => update("chassis", e.target.value)}
              required
              placeholder="e.g. SF-24"
            />
            <div className={styles.fieldRow}>
              <Select
                label="Engine Supplier"
                value={data.engine}
                onChange={(v) => update("engine", v)}
                options={ENGINES}
              />
              <Select
                label="Primary Livery Color"
                value={data.liveryColor}
                onChange={(v) => update("liveryColor", v)}
                options={COLORS}
              />
            </div>
            <div className={styles.formActions}>
              <Button variant="secondary" type="button" onClick={handleBack}>
                Back
              </Button>
              <Button variant="primary" type="submit">
                Next
              </Button>
            </div>
          </form>
        )}

        {currentStep === 2 && (
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.reviewGroup}>
              <div className={styles.reviewHeader}>
                <span className={styles.reviewTitle}>Team Info</span>
                <Button variant="ghost" size="sm" onClick={() => setCurrentStep(0)}>
                  Edit
                </Button>
              </div>
              <div className={styles.reviewRow}>
                <span className={styles.reviewLabel}>Team Name</span>
                <span className={styles.reviewValue}>{data.name}</span>
              </div>
              <div className={styles.reviewRow}>
                <span className={styles.reviewLabel}>Base City</span>
                <span className={styles.reviewValue}>{data.baseCity}</span>
              </div>
              <div className={styles.reviewRow}>
                <span className={styles.reviewLabel}>Team Principal</span>
                <span className={styles.reviewValue}>{data.principal}</span>
              </div>
              <div className={styles.reviewRow}>
                <span className={styles.reviewLabel}>Founded</span>
                <span className={styles.reviewValue}>{data.founded}</span>
              </div>
            </div>

            <Divider />

            <div className={styles.reviewGroup}>
              <div className={styles.reviewHeader}>
                <span className={styles.reviewTitle}>Car Setup</span>
                <Button variant="ghost" size="sm" onClick={() => setCurrentStep(1)}>
                  Edit
                </Button>
              </div>
              <div className={styles.reviewRow}>
                <span className={styles.reviewLabel}>Chassis</span>
                <span className={styles.reviewValue}>{data.chassis}</span>
              </div>
              <div className={styles.reviewRow}>
                <span className={styles.reviewLabel}>Engine</span>
                <span className={styles.reviewValue}>{data.engine}</span>
              </div>
              <div className={styles.reviewRow}>
                <span className={styles.reviewLabel}>Livery Color</span>
                <span className={styles.reviewValue}>{data.liveryColor}</span>
              </div>
            </div>

            <div className={styles.formActions}>
              <Button variant="secondary" type="button" onClick={handleBack}>
                Back
              </Button>
              <Button variant="primary" type="submit" disabled={submitting}>
                {submitting ? "Registering..." : "Register Team"}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </DriverLayout>
  );
}
```

**Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: Clean (0 errors)

**Step 4: Commit**

```bash
git add src/pages/teams/TeamCreate.tsx src/pages/teams/TeamCreate.module.css
git commit -m "feat: add TeamCreate multi-step wizard page"
```

---

### Task 2: Add route and showcase link

**Files:**

- Modify: `src/main.tsx`
- Modify: `src/showcase/App.tsx`

**Step 1: Add lazy import and route in `src/main.tsx`**

After the `SchemaUI` lazy import (line 48-52), add:

```tsx
const TeamCreate = lazy(() =>
  import("./pages/teams/TeamCreate").then((m) => ({
    default: m.TeamCreate,
  }))
);
```

Inside the `<Routes>` block (after the Schema UI route at line 84), add:

```tsx
<Route path="/teams/new" element={<TeamCreate />} />
```

**Step 2: Add demo page link card in `src/showcase/App.tsx`**

In the demo pages section, find the last `<Link>` card (the Schema UI link around line 4377). After it, add a new link card for Team Registration:

```tsx
<Link to="/teams/new" className={styles.demoPageCard}>
  <div className={styles.demoPageIcon}>
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="3" width="20" height="18" rx="2" />
      <path d="M8 7h8M8 12h8M8 17h4" />
    </svg>
  </div>
  <span className={styles.demoPageTitle}>Wizard</span>
  <span className={styles.demoPageDescription}>
    Multi-step form with Steps navigation, per-step validation, and review summary
  </span>
</Link>
```

**Step 3: Run lint + typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: 0 errors

**Step 4: Commit**

```bash
git add src/main.tsx src/showcase/App.tsx
git commit -m "feat: add /teams/new route and showcase wizard link card"
```

---

### Task 3: Add tests and update TODO

**Files:**

- Modify: `src/components/components.test.tsx`
- Modify: `src/components/accessibility.test.tsx`
- Modify: `TODO.md`

**Step 1: Add smoke test**

In `src/components/components.test.tsx`, add the import at the top with other page imports (if any), or in the components section. Since this is a page not a component, add it at the end of the describe block.

First add the import near the top:

```tsx
import { TeamCreate } from "../pages/teams/TeamCreate";
```

The component uses `useNavigate` and `useToast`, so it needs router + toast context. Add a test:

```tsx
it("TeamCreate", () => {
  render(
    <MemoryRouter>
      <ToastProvider>
        <TeamCreate />
      </ToastProvider>
    </MemoryRouter>
  );
  expect(screen.getByText("Team Info")).toBeInTheDocument();
});
```

Also add the `MemoryRouter` import from `react-router-dom` if not already present.

**Step 2: Add accessibility test**

In `src/components/accessibility.test.tsx`, add import:

```tsx
import { TeamCreate } from "../pages/teams/TeamCreate";
```

Add test (also needs MemoryRouter + ToastProvider):

```tsx
it("TeamCreate has no violations", async () => {
  const { container } = render(
    <MemoryRouter>
      <ToastProvider>
        <TeamCreate />
      </ToastProvider>
    </MemoryRouter>
  );
  expect(await axe(container)).toHaveNoViolations();
});
```

Add `MemoryRouter` import if not already present.

**Step 3: Update TODO.md**

In `TODO.md`, find the "Priority 2" table, the "Multistep workflow pattern" row. Replace it with:

```
| ~~Multistep workflow pattern~~ | Low-Med | Medium | ✅ `/teams/new` — 3-step wizard with Steps, per-step validation, review summary |
```

**Step 4: Run full verification**

```bash
npm run lint && npx tsc --noEmit && npx vitest run && npm run build
```

Expected: All pass

**Step 5: Commit**

```bash
git add src/components/components.test.tsx src/components/accessibility.test.tsx TODO.md
git commit -m "test: add TeamCreate smoke and a11y tests, update TODO"
```
