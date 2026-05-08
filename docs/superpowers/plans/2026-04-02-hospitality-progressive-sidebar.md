# Hospitality Progressive Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the Hospitality sidebar into setup and operational modes using progressive disclosure based on venue readiness.

**Architecture:** A `useVenueReadiness` hook derives venue lifecycle status from existing data (venue object + floor plans API). A `buildNavSections(readiness)` function replaces the static `NAV_SECTIONS`, transforming the sidebar between a setup stepper and an operational nav. A `VenueSwitcher` component in the sidebar header replaces per-page venue selectors. Timeline becomes the default landing page.

**Tech Stack:** React 18, React Router v7, TypeScript, Vitest, @mattbutlerengineering/rialto, @mbe/api-client, @mbe/types

**Spec:** `docs/superpowers/specs/2026-04-02-hospitality-progressive-sidebar-design.md`

---

## File Structure

| File                                         | Action | Responsibility                                                          |
| -------------------------------------------- | ------ | ----------------------------------------------------------------------- |
| `src/hooks/useVenueReadiness.ts`             | Create | Derive `VenueReadiness` from venue + floor plans                        |
| `src/hooks/useVenueReadiness.test.ts`        | Create | Unit tests for all gate combinations                                    |
| `src/nav-sections.ts`                        | Modify | Replace static `NAV_SECTIONS` with `buildNavSections(readiness)`        |
| `src/nav-sections.test.ts`                   | Create | Unit tests for setup vs operational section generation                  |
| `src/components/VenueSwitcher.tsx`           | Create | Sidebar venue dropdown                                                  |
| `src/components/VenueSwitcher.module.css`    | Create | Styles for venue switcher                                               |
| `src/components/VenueSwitcher.test.tsx`      | Create | Unit tests for venue switching                                          |
| `src/components/DashboardSidebar.tsx`        | Modify | Add `stepStatus`/`disabled` support, VenueSwitcher slot                 |
| `src/components/DashboardSidebar.module.css` | Modify | Styles for step icons and disabled state                                |
| `src/components/DashboardLayout.tsx`         | Modify | Use readiness hook, dynamic sections, redirects                         |
| `src/hooks/use-command-palette.ts`           | Modify | Accept sections as parameter instead of importing static `NAV_SECTIONS` |
| `src/pages/SetupPage.tsx`                    | Create | Setup landing with stepper progress                                     |
| `src/pages/SetupPage.module.css`             | Create | Styles for setup page                                                   |
| `src/pages/SetupHoursPage.tsx`               | Create | Standalone operating hours editor                                       |
| `src/pages/SetupHoursPage.module.css`        | Create | Styles for hours page                                                   |
| `src/main.tsx`                               | Modify | Add new routes, change default landing                                  |
| `src/pages/TimelinePage.tsx`                 | Modify | Remove per-page venue selector                                          |

All paths are relative to `apps/hospitality/`.

---

### Task 1: useVenueReadiness Hook

**Files:**

- Create: `apps/hospitality/src/hooks/useVenueReadiness.ts`
- Create: `apps/hospitality/src/hooks/useVenueReadiness.test.ts`

- [ ] **Step 1: Write the test file with all gate combinations**

```typescript
// apps/hospitality/src/hooks/useVenueReadiness.test.ts
import { describe, it, expect } from "vitest";
import { computeReadiness } from "./useVenueReadiness.js";
import type { Venue, FloorPlan } from "@mbe/types";

const BASE_VENUE: Venue = {
  id: "v1",
  venueGroupId: null,
  name: "Test Venue",
  slug: "test-venue",
  ianaTimezone: "America/New_York",
  currencyCode: "USD",
  operatingHours: null,
  settings: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const HOURS_CONFIGURED: Venue = {
  ...BASE_VENUE,
  operatingHours: {
    monday: { open: "09:00", close: "22:00" },
  },
};

const FLOOR_PLAN_WITH_TABLES: FloorPlan = {
  id: "fp1",
  venueId: "v1",
  name: "Main Floor",
  isActive: true,
  layoutJson: { width: 800, height: 600 },
  tables: [
    {
      id: "t1",
      venueId: "v1",
      name: "Table 1",
      capacity: 4,
      status: "AVAILABLE",
      floorPlanId: "fp1",
      position: { x: 100, y: 100, width: 60, height: 60 },
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
  ],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const FLOOR_PLAN_NO_TABLES: FloorPlan = {
  ...FLOOR_PLAN_WITH_TABLES,
  tables: [],
};

describe("computeReadiness", () => {
  it("returns no-venue when venue is null", () => {
    const result = computeReadiness(null, []);
    expect(result.status).toBe("no-venue");
    expect(result.completedSteps).toEqual([]);
    expect(result.nextStep).toBeNull();
    expect(result.progress).toBe(0);
  });

  it("returns setup with onboarding complete when venue exists but no hours or floor plan", () => {
    const result = computeReadiness(BASE_VENUE, []);
    expect(result.status).toBe("setup");
    expect(result.completedSteps).toEqual(["onboarding"]);
    expect(result.nextStep).toBe("operating-hours");
    expect(result.progress).toBeCloseTo(33.3, 0);
  });

  it("returns setup with onboarding + hours when venue has operating hours but no floor plan", () => {
    const result = computeReadiness(HOURS_CONFIGURED, []);
    expect(result.status).toBe("setup");
    expect(result.completedSteps).toEqual(["onboarding", "operating-hours"]);
    expect(result.nextStep).toBe("floor-plan");
    expect(result.progress).toBeCloseTo(66.7, 0);
  });

  it("returns setup when floor plan exists but has no tables", () => {
    const result = computeReadiness(HOURS_CONFIGURED, [FLOOR_PLAN_NO_TABLES]);
    expect(result.status).toBe("setup");
    expect(result.completedSteps).toEqual(["onboarding", "operating-hours"]);
    expect(result.nextStep).toBe("floor-plan");
  });

  it("returns operational when all gates pass", () => {
    const result = computeReadiness(HOURS_CONFIGURED, [FLOOR_PLAN_WITH_TABLES]);
    expect(result.status).toBe("operational");
    expect(result.completedSteps).toEqual(["onboarding", "operating-hours", "floor-plan"]);
    expect(result.nextStep).toBeNull();
    expect(result.progress).toBe(100);
  });

  it("returns setup when venue has floor plan but no operating hours", () => {
    const result = computeReadiness(BASE_VENUE, [FLOOR_PLAN_WITH_TABLES]);
    expect(result.status).toBe("setup");
    expect(result.completedSteps).toEqual(["onboarding", "floor-plan"]);
    expect(result.nextStep).toBe("operating-hours");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/hospitality && npx vitest run src/hooks/useVenueReadiness.test.ts`
Expected: FAIL — `computeReadiness` is not exported

- [ ] **Step 3: Implement the hook and pure function**

```typescript
// apps/hospitality/src/hooks/useVenueReadiness.ts
import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@mbe/auth/react";
import { createApiClient } from "@mbe/api-client";
import { useVenue } from "../contexts/VenueContext.js";
import type { Venue, FloorPlan } from "@mbe/types";

/* ── Types ──────────────────────────────────── */

export type SetupStep = "onboarding" | "operating-hours" | "floor-plan";

export interface VenueReadiness {
  readonly status: "no-venue" | "setup" | "operational";
  readonly completedSteps: readonly SetupStep[];
  readonly nextStep: SetupStep | null;
  readonly progress: number;
}

/* ── Step order (determines nextStep priority) ─ */

const STEP_ORDER: readonly SetupStep[] = ["onboarding", "operating-hours", "floor-plan"];

/* ── Pure computation (exported for testing) ── */

export function computeReadiness(
  venue: Venue | null,
  floorPlans: readonly FloorPlan[]
): VenueReadiness {
  if (!venue) {
    return { status: "no-venue", completedSteps: [], nextStep: null, progress: 0 };
  }

  const completed: SetupStep[] = [];

  // Gate 1: Onboarding — venue exists with name, timezone, currency
  if (venue.name && venue.ianaTimezone && venue.currencyCode) {
    completed.push("onboarding");
  }

  // Gate 2: Operating hours — at least one day configured
  if (venue.operatingHours) {
    const days = Object.values(venue.operatingHours);
    const hasOpenDay = days.some((day) => day !== undefined && day.closed !== true);
    if (hasOpenDay) {
      completed.push("operating-hours");
    }
  }

  // Gate 3: Floor plan with tables
  const hasFloorPlanWithTables = floorPlans.some((fp) => fp.tables && fp.tables.length > 0);
  if (hasFloorPlanWithTables) {
    completed.push("floor-plan");
  }

  const progress = (completed.length / STEP_ORDER.length) * 100;

  if (completed.length === STEP_ORDER.length) {
    return { status: "operational", completedSteps: completed, nextStep: null, progress };
  }

  const nextStep = STEP_ORDER.find((step) => !completed.includes(step)) ?? null;

  return { status: "setup", completedSteps: completed, nextStep, progress };
}

/* ── React hook ────────────────────────────── */

export function useVenueReadiness(): VenueReadiness & { isLoading: boolean } {
  const { selectedVenue, isLoading: venueLoading } = useVenue();
  const { accessToken } = useAuth();

  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: import.meta.env.VITE_API_URL ?? "",
        getAccessToken: () => accessToken,
      }),
    [accessToken]
  );

  const [floorPlans, setFloorPlans] = useState<readonly FloorPlan[]>([]);
  const [floorPlansLoading, setFloorPlansLoading] = useState(false);

  useEffect(() => {
    if (!selectedVenue) {
      setFloorPlans([]);
      return;
    }

    let cancelled = false;
    setFloorPlansLoading(true);

    api.floorPlans
      .list({ venueId: selectedVenue.id, limit: 100 })
      .then((response) => {
        if (!cancelled) {
          setFloorPlans(response.data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFloorPlans([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setFloorPlansLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [api, selectedVenue?.id]);

  const readiness = useMemo(
    () => computeReadiness(selectedVenue, floorPlans),
    [selectedVenue, floorPlans]
  );

  return { ...readiness, isLoading: venueLoading || floorPlansLoading };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/hospitality && npx vitest run src/hooks/useVenueReadiness.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
cd apps/hospitality && git add src/hooks/useVenueReadiness.ts src/hooks/useVenueReadiness.test.ts
git commit -m "feat(hospitality): add useVenueReadiness hook with setup gate logic"
```

---

### Task 2: Nav Section Generator

**Files:**

- Modify: `apps/hospitality/src/nav-sections.ts`
- Create: `apps/hospitality/src/nav-sections.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
// apps/hospitality/src/nav-sections.test.ts
import { describe, it, expect } from "vitest";
import { buildNavSections } from "./nav-sections.js";
import type { VenueReadiness } from "./hooks/useVenueReadiness.js";

describe("buildNavSections", () => {
  it("returns setup sections with step statuses when status is setup", () => {
    const readiness: VenueReadiness = {
      status: "setup",
      completedSteps: ["onboarding"],
      nextStep: "operating-hours",
      progress: 33,
    };
    const sections = buildNavSections(readiness);

    // First section should be "Get Started" with step items
    const getStarted = sections[0];
    expect(getStarted?.label).toBe("Get Started");
    expect(getStarted?.items).toHaveLength(3);

    // Onboarding completed
    expect(getStarted?.items[0]?.stepStatus).toBe("completed");
    expect(getStarted?.items[0]?.disabled).toBeUndefined();

    // Operating hours is current
    expect(getStarted?.items[1]?.stepStatus).toBe("current");
    expect(getStarted?.items[1]?.disabled).toBeUndefined();

    // Floor plan is locked
    expect(getStarted?.items[2]?.stepStatus).toBe("locked");
    expect(getStarted?.items[2]?.disabled).toBe(true);

    // Account section always present
    const account = sections.find((s) => s.label === "Account");
    expect(account).toBeDefined();
    expect(account?.items.some((i) => i.id === "profile")).toBe(true);
  });

  it("returns operational sections when status is operational", () => {
    const readiness: VenueReadiness = {
      status: "operational",
      completedSteps: ["onboarding", "operating-hours", "floor-plan"],
      nextStep: null,
      progress: 100,
    };
    const sections = buildNavSections(readiness);

    // Primary nav — Timeline first
    const primary = sections[0];
    expect(primary?.label).toBeUndefined();
    expect(primary?.items[0]?.id).toBe("timeline");
    expect(primary?.items[1]?.id).toBe("reservations");
    expect(primary?.items[2]?.id).toBe("guests");
    expect(primary?.items[3]?.id).toBe("dashboard");

    // Manage section
    const manage = sections.find((s) => s.label === "Manage");
    expect(manage).toBeDefined();
    expect(manage?.items.some((i) => i.id === "floor-plans")).toBe(true);
    expect(manage?.items.some((i) => i.id === "booking-widget")).toBe(true);
    expect(manage?.items.some((i) => i.id === "settings")).toBe(true);

    // Account section
    const account = sections.find((s) => s.label === "Account");
    expect(account).toBeDefined();

    // No step statuses on operational items
    const allItems = sections.flatMap((s) => s.items);
    expect(allItems.every((i) => i.stepStatus === undefined)).toBe(true);
  });

  it("returns setup sections for no-venue status", () => {
    const readiness: VenueReadiness = {
      status: "no-venue",
      completedSteps: [],
      nextStep: null,
      progress: 0,
    };
    const sections = buildNavSections(readiness);
    const getStarted = sections[0];
    expect(getStarted?.label).toBe("Get Started");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/hospitality && npx vitest run src/nav-sections.test.ts`
Expected: FAIL — `buildNavSections` not exported

- [ ] **Step 3: Rewrite nav-sections.ts with buildNavSections**

```typescript
// apps/hospitality/src/nav-sections.ts
import type { VenueReadiness, SetupStep } from "./hooks/useVenueReadiness.js";

/* ── Types ──────────────────────────────────── */

export interface NavItem {
  id: string;
  label: string;
  path: string;
  stepStatus?: "completed" | "current" | "locked";
  disabled?: boolean;
}

export interface NavSection {
  label?: string;
  items: NavItem[];
}

/* ── Setup step definitions ─────────────────── */

interface SetupStepDef {
  step: SetupStep;
  id: string;
  label: string;
  path: string;
}

const SETUP_STEPS: readonly SetupStepDef[] = [
  { step: "onboarding", id: "onboarding", label: "Venue Basics", path: "/onboarding" },
  {
    step: "operating-hours",
    id: "setup-hours",
    label: "Set Operating Hours",
    path: "/setup/hours",
  },
  { step: "floor-plan", id: "floor-plans", label: "Create Floor Plan", path: "/floor-plans" },
];

/* ── Setup sections ─────────────────────────── */

function buildSetupSections(readiness: VenueReadiness): readonly NavSection[] {
  const items: NavItem[] = SETUP_STEPS.map((def) => {
    const isCompleted = readiness.completedSteps.includes(def.step);
    const isCurrent = readiness.nextStep === def.step;

    let stepStatus: NavItem["stepStatus"];
    let disabled: boolean | undefined;

    if (isCompleted) {
      stepStatus = "completed";
    } else if (isCurrent) {
      stepStatus = "current";
    } else {
      stepStatus = "locked";
      disabled = true;
    }

    return { id: def.id, label: def.label, path: def.path, stepStatus, disabled };
  });

  return [
    { label: "Get Started", items },
    {
      label: "Account",
      items: [
        { id: "profile", label: "Profile", path: "/profile" },
        { id: "settings", label: "Settings", path: "/settings" },
      ],
    },
  ];
}

/* ── Operational sections ───────────────────── */

function buildOperationalSections(): readonly NavSection[] {
  return [
    {
      items: [
        { id: "timeline", label: "Timeline", path: "/timeline" },
        { id: "reservations", label: "Reservations", path: "/reservations" },
        { id: "guests", label: "Guests", path: "/guests" },
        { id: "dashboard", label: "Dashboard", path: "/dashboard" },
      ],
    },
    {
      label: "Manage",
      items: [
        { id: "floor-plans", label: "Floor Plans", path: "/floor-plans" },
        { id: "booking-widget", label: "Booking Widget", path: "/booking-widget" },
        { id: "settings", label: "Settings", path: "/settings" },
      ],
    },
    {
      label: "Account",
      items: [{ id: "profile", label: "Profile", path: "/profile" }],
    },
  ];
}

/* ── Public API ─────────────────────────────── */

export function buildNavSections(readiness: VenueReadiness): readonly NavSection[] {
  if (readiness.status !== "operational") {
    return buildSetupSections(readiness);
  }
  return buildOperationalSections();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/hospitality && npx vitest run src/nav-sections.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
cd apps/hospitality && git add src/nav-sections.ts src/nav-sections.test.ts
git commit -m "feat(hospitality): replace static NAV_SECTIONS with buildNavSections"
```

---

### Task 3: Update DashboardSidebar for Step Status and Disabled Items

**Files:**

- Modify: `apps/hospitality/src/components/DashboardSidebar.tsx`
- Modify: `apps/hospitality/src/components/DashboardSidebar.module.css`

- [ ] **Step 1: Add step status icon components and disabled support to DashboardSidebar.tsx**

In `DashboardSidebar.tsx`, add a `StepIcon` component after the existing `ChevronIcon`:

```typescript
function StepIcon({ status }: { status: "completed" | "current" | "locked" }) {
  if (status === "completed") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--rialto-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.stepIcon}>
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }
  if (status === "current") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.stepIcon}>
        <polyline points="9 18 15 12 9 6" />
      </svg>
    );
  }
  // locked
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.stepIcon}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
```

Then update the nav item button rendering (both flat and collapsible sections) to include the step icon and disabled state. In the existing button element, add:

- Before `{item.label}`: `{item.stepStatus && <StepIcon status={item.stepStatus} />}`
- On the button: `disabled={item.disabled}` and `aria-disabled={item.disabled ? "true" : undefined}`
- Add disabled class: ``className={`${styles.navLink} ${active ? styles.navLinkActive : ""} ${item.disabled ? styles.navLinkDisabled : ""}`}``

Also update the `NavItem` import to include `stepStatus` and `disabled` fields (already added to the type in Task 2).

- [ ] **Step 2: Add a `children` prop for the VenueSwitcher slot**

Add to `DashboardSidebarProps`:

```typescript
/** Rendered above the navigation sections (e.g. VenueSwitcher) */
header?: React.ReactNode;
```

In the JSX, render it above `<div className={styles.sections}>`:

```tsx
{
  header;
}
<div className={styles.sections}>{/* existing section rendering */}</div>;
```

- [ ] **Step 3: Add CSS for step icons and disabled state**

In `DashboardSidebar.module.css`, add:

```css
.stepIcon {
  flex-shrink: 0;
  margin-right: var(--rialto-space-xs);
}

.navLinkDisabled {
  opacity: 0.4;
  pointer-events: none;
  cursor: default;
}
```

- [ ] **Step 4: Run typecheck and lint**

Run: `cd apps/hospitality && npx tsc --noEmit && npx eslint src/components/DashboardSidebar.tsx`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
cd apps/hospitality && git add src/components/DashboardSidebar.tsx src/components/DashboardSidebar.module.css
git commit -m "feat(hospitality): add step status icons and disabled state to sidebar"
```

---

### Task 4: VenueSwitcher Component

**Files:**

- Create: `apps/hospitality/src/components/VenueSwitcher.tsx`
- Create: `apps/hospitality/src/components/VenueSwitcher.module.css`
- Create: `apps/hospitality/src/components/VenueSwitcher.test.tsx`

- [ ] **Step 1: Write the test file**

```typescript
// apps/hospitality/src/components/VenueSwitcher.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VenueSwitcher } from "./VenueSwitcher.js";
import type { Venue } from "@mbe/types";

const VENUE_A: Venue = {
  id: "v1",
  venueGroupId: null,
  name: "The Rustic Table",
  slug: "rustic-table",
  ianaTimezone: "America/New_York",
  currencyCode: "USD",
  operatingHours: null,
  settings: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const VENUE_B: Venue = {
  ...VENUE_A,
  id: "v2",
  name: "The Rooftop Bar",
  slug: "rooftop-bar",
};

describe("VenueSwitcher", () => {
  it("shows venue name without dropdown for single venue", () => {
    render(
      <VenueSwitcher
        venues={[VENUE_A]}
        selectedVenueId="v1"
        onVenueChange={vi.fn()}
        onAddVenue={vi.fn()}
      />
    );
    expect(screen.getByText("The Rustic Table")).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("shows dropdown with all venues for multi-venue", async () => {
    const user = userEvent.setup();
    const onVenueChange = vi.fn();

    render(
      <VenueSwitcher
        venues={[VENUE_A, VENUE_B]}
        selectedVenueId="v1"
        onVenueChange={onVenueChange}
        onAddVenue={vi.fn()}
      />
    );

    // Click to open dropdown
    await user.click(screen.getByRole("button", { name: /the rustic table/i }));
    expect(screen.getByText("The Rooftop Bar")).toBeInTheDocument();

    // Select other venue
    await user.click(screen.getByText("The Rooftop Bar"));
    expect(onVenueChange).toHaveBeenCalledWith("v2");
  });

  it("shows Add Venue action in multi-venue dropdown", async () => {
    const user = userEvent.setup();
    const onAddVenue = vi.fn();

    render(
      <VenueSwitcher
        venues={[VENUE_A, VENUE_B]}
        selectedVenueId="v1"
        onVenueChange={vi.fn()}
        onAddVenue={onAddVenue}
      />
    );

    await user.click(screen.getByRole("button", { name: /the rustic table/i }));
    await user.click(screen.getByText("+ Add Venue"));
    expect(onAddVenue).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/hospitality && npx vitest run src/components/VenueSwitcher.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement VenueSwitcher component**

```typescript
// apps/hospitality/src/components/VenueSwitcher.tsx
import { useState, useCallback, useRef, useEffect } from "react";
import type { Venue } from "@mbe/types";
import { Text } from "@mattbutlerengineering/rialto";
import styles from "./VenueSwitcher.module.css";

interface VenueSwitcherProps {
  readonly venues: readonly Venue[];
  readonly selectedVenueId: string | null;
  readonly onVenueChange: (venueId: string) => void;
  readonly onAddVenue: () => void;
}

export function VenueSwitcher({
  venues,
  selectedVenueId,
  onVenueChange,
  onAddVenue,
}: VenueSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedVenue = venues.find((v) => v.id === selectedVenueId);
  const isMultiVenue = venues.length > 1;

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen]);

  const handleSelect = useCallback(
    (venueId: string) => {
      onVenueChange(venueId);
      setIsOpen(false);
    },
    [onVenueChange]
  );

  const handleAddVenue = useCallback(() => {
    onAddVenue();
    setIsOpen(false);
  }, [onAddVenue]);

  if (!selectedVenue) return null;

  // Single venue — just show name, no dropdown
  if (!isMultiVenue) {
    return (
      <div className={styles.root}>
        <Text variant="label" className={styles.venueName}>
          {selectedVenue.name}
        </Text>
      </div>
    );
  }

  return (
    <div className={styles.root} ref={containerRef}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-label={selectedVenue.name}
      >
        <Text variant="label" className={styles.venueName}>
          {selectedVenue.name}
        </Text>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen && (
        <div className={styles.dropdown} role="listbox">
          {venues.map((venue) => (
            <button
              key={venue.id}
              type="button"
              role="option"
              aria-selected={venue.id === selectedVenueId}
              className={`${styles.option} ${venue.id === selectedVenueId ? styles.optionActive : ""}`}
              onClick={() => handleSelect(venue.id)}
            >
              {venue.name}
            </button>
          ))}
          <div className={styles.divider} />
          <button
            type="button"
            className={styles.addVenue}
            onClick={handleAddVenue}
          >
            + Add Venue
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create VenueSwitcher.module.css**

```css
/* apps/hospitality/src/components/VenueSwitcher.module.css */
.root {
  padding: var(--rialto-space-sm) var(--rialto-space-md);
  border-bottom: 1px solid var(--rialto-border);
  position: relative;
}

.trigger {
  display: flex;
  align-items: center;
  gap: var(--rialto-space-xs);
  width: 100%;
  background: none;
  border: none;
  cursor: pointer;
  padding: var(--rialto-space-xs) var(--rialto-space-sm);
  border-radius: var(--rialto-radius-default);
  color: var(--rialto-text-primary);
  transition: background-color 150ms ease;
}

.trigger:hover {
  background-color: var(--rialto-surface-hover);
}

.venueName {
  flex: 1;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chevron {
  flex-shrink: 0;
  transition: transform 150ms ease;
}

.chevronOpen {
  transform: rotate(180deg);
}

.dropdown {
  position: absolute;
  top: 100%;
  left: var(--rialto-space-sm);
  right: var(--rialto-space-sm);
  background: var(--rialto-surface-elevated);
  border: 1px solid var(--rialto-border);
  border-radius: var(--rialto-radius-default);
  box-shadow: var(--rialto-shadow-md);
  z-index: 50;
  padding: var(--rialto-space-xs) 0;
}

.option {
  display: block;
  width: 100%;
  padding: var(--rialto-space-xs) var(--rialto-space-md);
  background: none;
  border: none;
  text-align: left;
  cursor: pointer;
  color: var(--rialto-text-primary);
  font-size: var(--rialto-font-size-sm);
}

.option:hover {
  background-color: var(--rialto-surface-hover);
}

.optionActive {
  font-weight: 600;
  color: var(--rialto-accent);
}

.divider {
  height: 1px;
  background: var(--rialto-border);
  margin: var(--rialto-space-xs) 0;
}

.addVenue {
  display: block;
  width: 100%;
  padding: var(--rialto-space-xs) var(--rialto-space-md);
  background: none;
  border: none;
  text-align: left;
  cursor: pointer;
  color: var(--rialto-accent);
  font-size: var(--rialto-font-size-sm);
  font-weight: 500;
}

.addVenue:hover {
  background-color: var(--rialto-surface-hover);
}
```

- [ ] **Step 5: Run tests**

Run: `cd apps/hospitality && npx vitest run src/components/VenueSwitcher.test.tsx`
Expected: All 3 tests PASS

- [ ] **Step 6: Commit**

```bash
cd apps/hospitality && git add src/components/VenueSwitcher.tsx src/components/VenueSwitcher.module.css src/components/VenueSwitcher.test.tsx
git commit -m "feat(hospitality): add VenueSwitcher component for sidebar"
```

---

### Task 5: Update Command Palette to Accept Dynamic Sections

**Files:**

- Modify: `apps/hospitality/src/hooks/use-command-palette.ts`

- [ ] **Step 1: Update useCommandPalette to accept sections as a parameter**

In `apps/hospitality/src/hooks/use-command-palette.ts`:

1. Remove the import of `NAV_SECTIONS`
2. Add `sections: readonly NavSection[]` to `UseCommandPaletteOptions`
3. Replace `NAV_SECTIONS` with `sections` in `items` and `groups` memos
4. Add `sections` to the dependency arrays of both `useMemo` calls

Updated hook signature and body:

```typescript
interface UseCommandPaletteOptions {
  sections: readonly NavSection[];
  navigate: (path: string) => void;
  toggleTheme: () => void;
  signOut: () => void;
}

export function useCommandPalette({
  sections,
  navigate,
  toggleTheme,
  signOut,
}: UseCommandPaletteOptions): UseCommandPaletteResult {
  const [open, setOpen] = useState(false);

  const items = useMemo(
    () => [
      ...buildNavItems(sections, navigate),
      ...buildActionItems(navigate, toggleTheme, signOut),
    ],
    [sections, navigate, toggleTheme, signOut]
  );

  const groups = useMemo(() => buildGroups(sections), [sections]);

  const stableSetOpen = useCallback((next: boolean) => {
    setOpen(next);
  }, []);

  return { open, setOpen: stableSetOpen, items, groups };
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd apps/hospitality && npx tsc --noEmit`
Expected: Errors in DashboardLayout.tsx where `useCommandPalette` is called without `sections` — this will be fixed in Task 6

- [ ] **Step 3: Commit**

```bash
cd apps/hospitality && git add src/hooks/use-command-palette.ts
git commit -m "refactor(hospitality): make command palette accept dynamic nav sections"
```

---

### Task 6: Wire Up DashboardLayout

**Files:**

- Modify: `apps/hospitality/src/components/DashboardLayout.tsx`

- [ ] **Step 1: Update DashboardLayout to use dynamic sections and readiness**

Key changes to `DashboardLayout.tsx`:

1. Remove import of `NAV_SECTIONS`
2. Add imports:

   ```typescript
   import { useVenueReadiness } from "../hooks/useVenueReadiness.js";
   import { buildNavSections } from "../nav-sections.js";
   import { VenueSwitcher } from "./VenueSwitcher.js";
   ```

3. Move `VenueProvider` to wrap the entire layout (it currently wraps only the `<Outlet>`). The readiness hook needs venue context. Move `<VenueProvider>` to wrap the entire return JSX (inside the root div).

4. Create an inner component `DashboardLayoutInner` that has access to VenueProvider context:

```typescript
function DashboardLayoutInner() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut, accessToken } = useAuth();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const { venues, selectedVenueId, setVenueId } = useVenue();
  const readiness = useVenueReadiness();

  // Build dynamic sections
  const navSections = useMemo(() => buildNavSections(readiness), [readiness]);

  // ... rest of existing layout logic, but using navSections instead of NAV_SECTIONS
  // ... pass sections to useCommandPalette
  const { open: paletteOpen, setOpen: setPaletteOpen, items: paletteItems, groups: paletteGroups } =
    useCommandPalette({ sections: navSections, navigate, toggleTheme, signOut });

  // ... existing copilot logic, adding copilot/signout to sections
  const sectionsWithExtras = useMemo(() => [
    ...navSections,
    { label: "Tools" as const, items: [{ id: "copilot", label: "Copilot", path: "/__copilot__" }] },
  ], [navSections]);

  // Redirect logic
  useEffect(() => {
    if (readiness.isLoading) return;

    const path = location.pathname.replace(/^\/hospitality/, "").replace(/^\//, "");

    if (readiness.status === "no-venue" && path !== "onboarding") {
      navigate("/onboarding", { replace: true });
      return;
    }

    if (readiness.status === "setup") {
      const operationalPaths = ["timeline", "reservations", "guests", "dashboard"];
      if (operationalPaths.some((p) => path === p || path.startsWith(p + "/"))) {
        navigate("/setup", { replace: true });
      }
    }

    if (readiness.status === "operational") {
      if (path === "setup" || path.startsWith("setup/")) {
        navigate("/timeline", { replace: true });
      }
      // Redirect root to timeline
      if (path === "") {
        navigate("/timeline", { replace: true });
      }
    }
  }, [readiness.status, readiness.isLoading, location.pathname, navigate]);

  // VenueSwitcher header for sidebar
  const sidebarHeader = useMemo(
    () => (
      <VenueSwitcher
        venues={[...venues]}
        selectedVenueId={selectedVenueId}
        onVenueChange={setVenueId}
        onAddVenue={() => navigate("/onboarding")}
      />
    ),
    [venues, selectedVenueId, setVenueId, navigate]
  );

  // Pass header to DashboardSidebar
  // <DashboardSidebar header={sidebarHeader} sections={sectionsWithExtras} ... />
}
```

5. Update `ROUTE_LABELS` to include new routes:

```typescript
const ROUTE_LABELS: Record<string, string> = {
  "": "Home",
  timeline: "Timeline",
  dashboard: "Dashboard",
  reservations: "Reservations",
  guests: "Guests",
  "floor-plans": "Floor Plans",
  "booking-widget": "Booking Widget",
  onboarding: "New Venue",
  setup: "Setup",
  profile: "Profile",
  settings: "Settings",
  admin: "Admin",
};
```

6. The outer `DashboardLayout` export wraps `DashboardLayoutInner` in `VenueProvider`:

```typescript
export function DashboardLayout() {
  return (
    <VenueProvider>
      <DashboardLayoutInner />
    </VenueProvider>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd apps/hospitality && npx tsc --noEmit`
Expected: PASS (or errors related to routes not yet added — fixed in Task 9)

- [ ] **Step 3: Commit**

```bash
cd apps/hospitality && git add src/components/DashboardLayout.tsx
git commit -m "feat(hospitality): wire readiness-driven sidebar and redirects into layout"
```

---

### Task 7: SetupPage

**Files:**

- Create: `apps/hospitality/src/pages/SetupPage.tsx`
- Create: `apps/hospitality/src/pages/SetupPage.module.css`

- [ ] **Step 1: Create SetupPage component**

```typescript
// apps/hospitality/src/pages/SetupPage.tsx
import { useNavigate } from "react-router-dom";
import { Button, Card, Text, Stack } from "@mattbutlerengineering/rialto";
import { useVenue } from "../contexts/VenueContext.js";
import { useVenueReadiness } from "../hooks/useVenueReadiness.js";
import type { SetupStep } from "../hooks/useVenueReadiness.js";
import { PageHeader } from "../components/PageHeader.js";
import styles from "./SetupPage.module.css";

interface StepDef {
  step: SetupStep;
  title: string;
  description: string;
  path: string;
  cta: string;
}

const STEPS: readonly StepDef[] = [
  {
    step: "onboarding",
    title: "Venue Basics",
    description: "Set your venue name, timezone, and currency.",
    path: "/onboarding",
    cta: "Review Venue Info",
  },
  {
    step: "operating-hours",
    title: "Operating Hours",
    description: "Configure which days you're open and your hours of operation.",
    path: "/setup/hours",
    cta: "Set Hours",
  },
  {
    step: "floor-plan",
    title: "Floor Plan",
    description: "Create a floor plan and add your tables so you can start seating guests.",
    path: "/floor-plans",
    cta: "Create Floor Plan",
  },
];

export function SetupPage() {
  const navigate = useNavigate();
  const { selectedVenue } = useVenue();
  const readiness = useVenueReadiness();

  return (
    <div className={styles.container}>
      <PageHeader
        title={selectedVenue ? `Set up ${selectedVenue.name}` : "Set Up Your Venue"}
        description="Complete these steps to start accepting reservations."
      />

      <div className={styles.progress}>
        <Text variant="caption" color="secondary">
          {readiness.completedSteps.length} of {STEPS.length} steps complete
        </Text>
        <div className={styles.progressBar}>
          <div
            className={styles.progressFill}
            style={{ width: `${String(readiness.progress)}%` }}
          />
        </div>
      </div>

      <Stack gap="md">
        {STEPS.map((def) => {
          const isCompleted = readiness.completedSteps.includes(def.step);
          const isCurrent = readiness.nextStep === def.step;
          const isLocked = !isCompleted && !isCurrent;

          return (
            <Card key={def.step} className={styles.stepCard}>
              <div className={styles.stepContent}>
                <div className={styles.stepIndicator}>
                  {isCompleted && <span className={styles.checkmark}>&#10003;</span>}
                  {isCurrent && <span className={styles.arrow}>&#9654;</span>}
                  {isLocked && <span className={styles.lock}>&#128274;</span>}
                </div>
                <div className={styles.stepText}>
                  <Text variant="label">{def.title}</Text>
                  <Text variant="caption" color="secondary">
                    {def.description}
                  </Text>
                </div>
                {(isCompleted || isCurrent) && (
                  <Button
                    variant={isCurrent ? "solid" : "ghost"}
                    size="sm"
                    onClick={() => navigate(def.path)}
                  >
                    {isCompleted ? "Review" : def.cta}
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </Stack>
    </div>
  );
}
```

- [ ] **Step 2: Create SetupPage.module.css**

```css
/* apps/hospitality/src/pages/SetupPage.module.css */
.container {
  max-width: 640px;
  margin: 0 auto;
  padding: var(--rialto-space-lg);
}

.progress {
  margin-bottom: var(--rialto-space-lg);
}

.progressBar {
  height: 4px;
  background: var(--rialto-surface-hover);
  border-radius: var(--rialto-radius-round);
  margin-top: var(--rialto-space-xs);
  overflow: hidden;
}

.progressFill {
  height: 100%;
  background: var(--rialto-accent);
  border-radius: var(--rialto-radius-round);
  transition: width 300ms ease;
}

.stepCard {
  padding: var(--rialto-space-md);
}

.stepContent {
  display: flex;
  align-items: center;
  gap: var(--rialto-space-md);
}

.stepIndicator {
  flex-shrink: 0;
  width: 24px;
  text-align: center;
  font-size: 16px;
}

.checkmark {
  color: var(--rialto-accent);
}

.arrow {
  color: var(--rialto-text-primary);
  font-size: 12px;
}

.lock {
  opacity: 0.4;
  font-size: 14px;
}

.stepText {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--rialto-space-2xs);
}
```

- [ ] **Step 3: Run typecheck**

Run: `cd apps/hospitality && npx tsc --noEmit`
Expected: PASS (or import errors resolved when routes are added)

- [ ] **Step 4: Commit**

```bash
cd apps/hospitality && git add src/pages/SetupPage.tsx src/pages/SetupPage.module.css
git commit -m "feat(hospitality): add SetupPage with stepper progress"
```

---

### Task 8: SetupHoursPage

**Files:**

- Create: `apps/hospitality/src/pages/SetupHoursPage.tsx`
- Create: `apps/hospitality/src/pages/SetupHoursPage.module.css`

- [ ] **Step 1: Create SetupHoursPage component**

```typescript
// apps/hospitality/src/pages/SetupHoursPage.tsx
import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@mbe/auth/react";
import { createApiClient } from "@mbe/api-client";
import { Button, Alert } from "@mattbutlerengineering/rialto";
import type { OperatingHours } from "@mbe/types";
import { useVenue } from "../contexts/VenueContext.js";
import { OperatingHoursStep } from "../components/venue-onboarding/OperatingHoursStep.js";
import { PageHeader } from "../components/PageHeader.js";
import styles from "./SetupHoursPage.module.css";

export function SetupHoursPage() {
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const { selectedVenue } = useVenue();

  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: import.meta.env.VITE_API_URL ?? "",
        getAccessToken: () => accessToken,
      }),
    [accessToken]
  );

  const [hours, setHours] = useState<OperatingHours>(
    selectedVenue?.operatingHours ?? {}
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    if (!selectedVenue) return;
    setSaving(true);
    setError(null);
    try {
      await api.venues.update(selectedVenue.id, { operatingHours: hours });
      navigate("/setup");
    } catch {
      setError("Failed to save operating hours. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [api, selectedVenue, hours, navigate]);

  return (
    <div className={styles.container}>
      <PageHeader
        title="Operating Hours"
        description="Set which days your venue is open and your hours of operation."
      />

      {error && (
        <Alert variant="error" className={styles.alert}>
          {error}
        </Alert>
      )}

      <OperatingHoursStep data={hours} onChange={setHours} />

      <div className={styles.actions}>
        <Button variant="ghost" onClick={() => navigate("/setup")}>
          Back
        </Button>
        <Button variant="solid" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Hours"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create SetupHoursPage.module.css**

```css
/* apps/hospitality/src/pages/SetupHoursPage.module.css */
.container {
  max-width: 640px;
  margin: 0 auto;
  padding: var(--rialto-space-lg);
}

.alert {
  margin-bottom: var(--rialto-space-md);
}

.actions {
  display: flex;
  justify-content: space-between;
  margin-top: var(--rialto-space-lg);
  gap: var(--rialto-space-md);
}
```

- [ ] **Step 3: Run typecheck**

Run: `cd apps/hospitality && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
cd apps/hospitality && git add src/pages/SetupHoursPage.tsx src/pages/SetupHoursPage.module.css
git commit -m "feat(hospitality): add standalone SetupHoursPage"
```

---

### Task 9: Update Routes and Default Landing

**Files:**

- Modify: `apps/hospitality/src/main.tsx`
- Modify: `apps/hospitality/src/pages/TimelinePage.tsx`

- [ ] **Step 1: Add lazy imports for new pages and update routes in main.tsx**

Add lazy imports after the existing ones:

```typescript
const SetupPage = lazy(() =>
  import("./pages/SetupPage.js").then((m) => ({ default: m.SetupPage }))
);
const SetupHoursPage = lazy(() =>
  import("./pages/SetupHoursPage.js").then((m) => ({ default: m.SetupHoursPage }))
);
```

Update the route tree inside the DashboardLayout children array:

1. Change the index route from `HomePage` to `TimelinePage`:

```typescript
{
  index: true,
  element: (
    <Suspense fallback={<LoadingPage />}>
      <TimelinePage />
    </Suspense>
  ),
},
```

2. Add a `/dashboard` route for the old HomePage:

```typescript
{
  path: "dashboard",
  element: (
    <Suspense fallback={<LoadingPage />}>
      <HomePage />
    </Suspense>
  ),
},
```

3. Add setup routes:

```typescript
{
  path: "setup",
  element: (
    <Suspense fallback={<LoadingPage />}>
      <SetupPage />
    </Suspense>
  ),
},
{
  path: "setup/hours",
  element: (
    <Suspense fallback={<LoadingPage />}>
      <SetupHoursPage />
    </Suspense>
  ),
},
```

4. Keep the existing `/timeline` route (it handles direct navigation; the index route handles `/`).

- [ ] **Step 2: Remove per-page venue selector from TimelinePage**

In `apps/hospitality/src/pages/TimelinePage.tsx`, the venue selector is rendered in the header area. Find the `<Select>` component used for venue selection and the associated state/logic (`selectedVenueId` local state, venue list fetching). Replace the local `selectedVenueId` state with `useVenue()` from context:

1. Add import: `import { useVenue } from "../contexts/VenueContext.js";`
2. Replace `const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null)` with:
   ```typescript
   const { selectedVenueId } = useVenue();
   ```
3. Remove the venue `<Select>` dropdown from the header JSX
4. Remove any venue list fetching logic that was only used for the dropdown (the VenueContext already handles this)

- [ ] **Step 3: Run typecheck and build**

Run: `cd apps/hospitality && npx tsc --noEmit`
Expected: PASS

Run: `cd apps/hospitality && npx vitest run`
Expected: All existing tests pass

- [ ] **Step 4: Commit**

```bash
cd apps/hospitality && git add src/main.tsx src/pages/TimelinePage.tsx
git commit -m "feat(hospitality): add setup routes, make Timeline default landing"
```

---

### Task 10: Integration Verification

**Files:** None new — verification only

- [ ] **Step 1: Run full test suite**

Run: `cd apps/hospitality && npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Run typecheck**

Run: `cd apps/hospitality && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run lint**

Run: `cd apps/hospitality && npx eslint src/`
Expected: No errors

- [ ] **Step 4: Run dev server and smoke test**

Run: `cd apps/hospitality && pnpm dev`

Manual verification:

1. Navigate to `http://localhost:3002/hospitality` — should show setup stepper (if no floor plan exists) or redirect to Timeline (if fully set up)
2. If in setup mode: sidebar shows "Get Started" stepper with correct step statuses
3. If in operational mode: sidebar shows Timeline first, Manage section, venue switcher at top
4. Clicking venue switcher changes data on current page
5. Navigating to `/hospitality/timeline` during setup redirects to `/hospitality/setup`
6. Navigating to `/hospitality/setup` during operational mode redirects to `/hospitality/timeline`
7. Command palette (Cmd+K) shows correct items based on current sidebar state

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A && git commit -m "fix(hospitality): address integration issues from progressive sidebar"
```
