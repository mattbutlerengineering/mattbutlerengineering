# Hospitality Progressive Sidebar Design

> Reorganize the Hospitality app sidebar to support two distinct venue lifecycle phases — **setup** and **operations** — using progressive disclosure.

## Problem

The Hospitality sidebar presents all pages at the same level regardless of venue state. A brand-new venue with no floor plan sees the same nav as a fully configured venue running dinner service. This creates noise during setup (irrelevant operational pages) and clutter during operations (setup-oriented pages like "New Venue").

## Solution

A **stepper-gated sidebar** that transforms based on venue readiness. During setup, the sidebar shows a vertical stepper guiding the user through configuration. Once all gates pass, it switches to an operational nav focused on daily workflows.

## Venue Readiness Model

### Hook: `useVenueReadiness`

**File:** `apps/hospitality/src/hooks/useVenueReadiness.ts`

Derives readiness from the selected venue and its floor plans:

```typescript
type SetupStep = "onboarding" | "floor-plan" | "operating-hours";

interface VenueReadiness {
  status: "no-venue" | "setup" | "operational";
  completedSteps: readonly SetupStep[];
  nextStep: SetupStep | null;
  progress: number; // 0–100
}
```

### Gate Criteria

| Step | Gate | Data Source |
|------|------|-------------|
| `onboarding` | Venue exists with name, timezone, currency | `venue !== null` from `useVenue()` |
| `operating-hours` | `venue.operatingHours !== null` with at least one day having `open === true` | `venue.operatingHours` field |
| `floor-plan` | Venue has >= 1 floor plan with >= 1 table | `GET /api/v1/venues/:id/floor-plans` (already used by FloorPlansPage) |

When all three gates pass: `status = "operational"`.
When venue exists but not all gates pass: `status = "setup"`.
When no venue exists: `status = "no-venue"` (redirect to `/onboarding`).

### Floor Plan Data

The hook calls the floor plans API once on mount (and when venue changes). It caches the result in a ref to avoid re-fetching on every render. The check is lightweight: just needs `floorPlans.length > 0` and at least one plan with `tables.length > 0`.

## Sidebar States

### Setup Sidebar

Shown when `readiness.status === "setup"`:

```
━━ Get Started ━━━━━━━━━━━━━━━
  [checkmark] Venue Basics        → /onboarding (review)
  [arrow]     Set Operating Hours  → /setup/hours
  [lock]      Create Floor Plan    → /floor-plans (disabled)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Account
    Profile
    Settings
```

- Completed steps show a checkmark and link to their page for review
- The current step shows an arrow indicator and is the default navigation target
- Future steps show a lock icon and are visible but `disabled` (not clickable)
- Account section is always visible (user needs profile/settings access during setup)

### Operational Sidebar

Shown when `readiness.status === "operational"`:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Dashboard
  Timeline
  Reservations
  Guests
━━ Manage ━━━━━━━━━━━━━━━━━━━
  Floor Plans
  Booking Widget
  Settings
━━ Account ━━━━━━━━━━━━━━━━━━
  Profile
  Sign Out
```

Changes from current sidebar:

| Item | Current Location | New Location | Rationale |
|------|-----------------|--------------|-----------|
| New Venue | Primary nav | Removed (accessible via venue switcher or Settings) | Not a daily action |
| Floor Plans | Primary nav | Manage section | Admin/config task, not daily ops |
| Booking Widget | Developer section | Manage section | Venue management tool, not dev-only |
| Admin > Users | Admin section | Admin section (unchanged, role-gated) | Still admin-only |
| Developer section label | Visible | Removed | Misleading label for venue operators |

## Nav Section Generator

### Function: `buildNavSections`

**File:** `apps/hospitality/src/nav-sections.ts`

Replaces the static `NAV_SECTIONS` export with a function:

```typescript
export function buildNavSections(readiness: VenueReadiness): readonly NavSection[] {
  if (readiness.status !== "operational") {
    return buildSetupSections(readiness);
  }
  return buildOperationalSections();
}
```

The `DashboardSidebar` component interface stays unchanged — it receives `NavSection[]` and renders them. The intelligence lives in the data, not the component.

The static `NAV_SECTIONS` export is removed. All consumers switch to `buildNavSections()`.

## NavItem Extension

The `NavItem` interface gains two optional fields for setup step rendering:

```typescript
export interface NavItem {
  id: string;
  label: string;
  path: string;
  stepStatus?: "completed" | "current" | "locked";
  disabled?: boolean;
}
```

- `stepStatus` drives the icon rendered before the label (checkmark, arrow, or lock)
- `disabled` prevents click handling and applies a muted visual style
- Both fields are only set during setup mode; operational items omit them

### Sidebar Rendering Changes

In `DashboardSidebar.tsx`, the item rendering adds:

1. A status icon before the label when `stepStatus` is present
2. `pointer-events: none` + `opacity: 0.5` when `disabled` is true
3. `aria-disabled="true"` for accessibility on disabled items

These are small additions to the existing button rendering — no structural changes to the component.

## New Routes and Pages

### Route Changes in `main.tsx`

| Route | Component | Purpose |
|-------|-----------|---------|
| `/setup` | `SetupPage` | Setup landing — shows stepper progress, routes to next step |
| `/setup/hours` | `SetupHoursPage` | Standalone operating hours editor |

Both routes are inside the `DashboardLayout` (authenticated, sidebar visible).

### SetupPage (`/setup`)

**File:** `apps/hospitality/src/pages/SetupPage.tsx`

A landing page showing:
- A welcome message with venue name
- A vertical stepper matching the sidebar steps (larger, more descriptive)
- Each step shows: status icon, title, description, and a CTA button for the current step
- Auto-redirects to `/` (Dashboard) if `readiness.status === "operational"`

### SetupHoursPage (`/setup/hours`)

**File:** `apps/hospitality/src/pages/SetupHoursPage.tsx`

Extracts the `OperatingHoursStep` component from the onboarding wizard into a standalone page:
- Reuses the existing `OperatingHoursStep` component (currently in `apps/hospitality/src/components/venue-onboarding/`)
- Wraps it in a `PageHeader` + save button pattern consistent with other pages
- On save, updates the venue's operating hours via API and navigates to `/setup` (or the next incomplete step)

The existing onboarding wizard (`/onboarding`) continues to work as-is for initial venue creation. The standalone page is for editing hours post-onboarding.

## DashboardLayout Changes

**File:** `apps/hospitality/src/components/DashboardLayout.tsx`

1. Call `useVenueReadiness()` after VenueProvider is available
2. Call `buildNavSections(readiness)` instead of using static `NAV_SECTIONS`
3. Add redirect logic: if `readiness.status === "no-venue"`, redirect to `/onboarding`; if `readiness.status === "setup"` and the current path is an operational page (`/timeline`, `/reservations`, `/guests`), redirect to `/setup`

The redirect is a soft guard — it keeps new venues focused on setup without hard-blocking access. Operational pages check readiness on mount and redirect; they don't need to handle the "no floor plan" case in their own UI.

## Redirect Behavior

| Current Status | User navigates to | Result |
|----------------|-------------------|--------|
| `no-venue` | Any page | Redirect to `/onboarding` |
| `setup` | `/timeline`, `/reservations`, `/guests` | Redirect to `/setup` |
| `setup` | `/floor-plans`, `/setup/hours`, `/settings`, `/profile` | Allow (these are setup-relevant) |
| `operational` | `/setup` | Redirect to `/` (Dashboard) |
| `operational` | Any page | Allow |

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/hooks/useVenueReadiness.ts` | Create | Derive setup state from venue + floor plans |
| `src/nav-sections.ts` | Modify | Replace static `NAV_SECTIONS` with `buildNavSections(readiness)` |
| `src/components/DashboardLayout.tsx` | Modify | Use readiness hook, pass dynamic sections, add redirects |
| `src/components/DashboardSidebar.tsx` | Modify | Support `stepStatus` and `disabled` on nav items |
| `src/pages/SetupPage.tsx` | Create | Setup landing with stepper progress |
| `src/pages/SetupHoursPage.tsx` | Create | Standalone operating hours editor |
| `src/main.tsx` | Modify | Add `/setup` and `/setup/hours` routes |

## Testing Strategy

### Unit Tests
- `useVenueReadiness` hook: test all gate combinations (no venue, partial setup, fully operational)
- `buildNavSections`: test setup sections vs operational sections output
- `DashboardSidebar`: test disabled items are not clickable, step status icons render

### Integration Tests
- DashboardLayout with mocked venue context: verify correct sidebar sections render for each readiness state
- Redirect behavior: verify operational pages redirect during setup, and vice versa

### E2E Tests
- Full setup flow: create venue via onboarding → configure hours → create floor plan → verify sidebar transitions to operational
- Verify operational pages (Timeline, Reservations) are accessible after setup completes
- Verify operational pages redirect to `/setup` before setup completes
