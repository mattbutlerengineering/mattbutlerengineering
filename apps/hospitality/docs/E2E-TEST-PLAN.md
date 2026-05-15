# Hospitality App — E2E Test Plan

> Harness context for AI agents writing tests. Maps critical user flows to
> Playwright test specs. Each test has prerequisites, steps, and assertions.
> Use `authPage` fixture from `e2e/fixtures.ts` for all authenticated tests.

---

## Test Infrastructure

```typescript
// All tests use this pattern:
import { test, expect } from "./fixtures.js";

test("description", async ({ authPage }) => {
  await authPage.goto("/page");
  // ... assertions
});
```

**Env vars required:** `E2E_AUTH0_DOMAIN`, `E2E_AUTH0_CLIENT_ID`, `E2E_AUTH0_AUDIENCE`, `E2E_AUTH_EMAIL`, `E2E_AUTH_PASSWORD`

---

## Critical Flow Tests

### CF-1: Dashboard loads with stats

**Flow:** User logs in → Dashboard shows KPIs

```
Prerequisites: At least one venue with reservations for today
Steps:
  1. Navigate to /
  2. Wait for stats row to be visible
Assertions:
  - PageHeader shows "Dashboard"
  - 4 Stat components are visible (reservations, covers, upcoming, cancellation rate)
  - Quick action buttons are visible (Walk-In, Floor Plan, Guest Lookup, Booking Widget)
  - ReservationList card is visible
  - ActivityFeed card is visible
```

---

### CF-2: Timeline loads and displays reservations

**Flow:** Dashboard → Timeline → see reservation grid

```
Prerequisites: Active venue with tables and reservations
Steps:
  1. Navigate to /timeline
  2. Wait for TimelineGrid to render
Assertions:
  - PageHeader shows "Timeline"
  - Venue selector visible (if multi-venue)
  - Date navigation shows today's date
  - "Live" indicator is green
  - Table rows are visible in the grid
  - Reservation blocks are color-coded by status
```

---

### CF-3: Walk-in creation

**Flow:** Timeline → Walk-In button → fill form → submit → verify

```
Prerequisites: Active venue with available tables
Steps:
  1. Navigate to /timeline
  2. Click "Walk-in" button
  3. Enter party size (e.g., 4)
  4. Select an available table
  5. Optionally enter guest name
  6. Click "Confirm" / submit
Assertions:
  - Walk-In dialog opens
  - Available tables are listed
  - After submit, dialog closes
  - New reservation appears on timeline
  - Table status changes to OCCUPIED
```

---

### CF-4: Reservation edit flow

**Flow:** Timeline → click reservation → edit → save → verify

```
Prerequisites: Existing reservation on today's timeline
Steps:
  1. Navigate to /timeline
  2. Click a reservation block
  3. Detail sidebar opens with reservation info
  4. Click "Edit"
  5. Change party size to a different value
  6. Click "Save"
Assertions:
  - EditReservationDrawer opens with current values
  - Party size field is editable
  - After save, drawer closes
  - Reservation block updates with new party size
  - Detail sidebar reflects the change
```

---

### CF-5: Reservation cancellation

**Flow:** Timeline → click reservation → cancel → confirm → verify

```
Prerequisites: Existing CONFIRMED or PENDING reservation
Steps:
  1. Navigate to /timeline
  2. Click a reservation block
  3. Click "Cancel"
  4. Select cancellation reason from dropdown
  5. Optionally add a note
  6. Click "Confirm Cancellation"
Assertions:
  - CancelReservationDialog opens
  - Reason dropdown has options
  - After confirm, dialog closes
  - Reservation block changes to CANCELLED styling
  - Stats row updates (cancelled count increments)
```

---

### CF-6: Reservations page with filtering

**Flow:** Reservations → date picker → status filter → search → verify

```
Prerequisites: Reservations exist for today with mixed statuses
Steps:
  1. Navigate to /reservations
  2. Verify stats row shows counts
  3. Click "Confirmed" status filter
  4. Verify table only shows confirmed reservations
  5. Type a guest name in search
  6. Verify table filters further
  7. Clear search
  8. Click "All" filter
Assertions:
  - Stats row shows total, confirmed, pending, cancelled
  - SegmentedControl filters the table
  - Search input filters by guest name
  - Empty state shows context-aware message
  - Result count announced (aria-live)
```

---

### CF-7: Guest directory and search

**Flow:** Guests → search → view detail → add guest

```
Prerequisites: Guests exist for the selected venue
Steps:
  1. Navigate to /guests
  2. Verify segment stats visible (VIP, Regular, etc.)
  3. Type a name in search
  4. Verify guest list filters
  5. Click a guest
  6. Verify detail drawer shows info
  7. Close drawer
  8. Click "Add Guest"
  9. Fill name + email
  10. Submit
Assertions:
  - Search filters guests
  - Detail shows: name, email, phone, visit count, tags
  - Add Guest dialog validates email
  - New guest appears in list after creation
```

---

### CF-8: Floor plan editor

**Flow:** Floor Plans → click plan → drag table → save

```
Prerequisites: Existing floor plan with tables
Steps:
  1. Navigate to /floor-plans
  2. Click a floor plan card
  3. FloorPlanEditorPage loads
  4. Click a table on canvas
  5. Verify detail sidebar shows table info
  6. Drag table to new position
  7. Click "Save"
Assertions:
  - Canvas renders with table shapes
  - Table selection shows detail sidebar
  - Drag updates position visually
  - "Unsaved changes" indicator appears
  - Save succeeds and indicator clears
```

---

### CF-9: Venue onboarding

**Flow:** New Venue → 5-step wizard → create

```
Prerequisites: None (should work from empty state)
Steps:
  1. Navigate to /onboarding
  2. Step 1: Enter venue name "Test Venue"
  3. Verify slug auto-generates
  4. Click Next
  5. Step 2: Select timezone, currency
  6. Click Next
  7. Step 3: Toggle operating hours
  8. Click Next
  9. Step 4: Set defaults
  10. Click Next
  11. Step 5: Review → Click "Create Venue"
Assertions:
  - Each step validates before advancing
  - "Back" preserves form data
  - Review step shows all entered data
  - Create succeeds
  - Success state shows venue ID
```

---

### CF-10: Settings persistence

**Flow:** Settings → change theme → verify persistence

```
Steps:
  1. Navigate to /settings
  2. Change theme to "Dark"
  3. Verify UI switches to dark mode
  4. Navigate to /
  5. Verify dark mode persists
  6. Navigate to /settings
  7. Verify theme selector shows "Dark"
Assertions:
  - Theme changes immediately on selection
  - Theme persists across navigation
  - Theme persists across page reload
```

---

### CF-11: Command palette navigation

**Flow:** ⌘K → search → select → navigate

```
Steps:
  1. Press ⌘K (or Ctrl+K)
  2. CommandPalette opens
  3. Type "guest"
  4. "Go to Guests" item is highlighted
  5. Press Enter
  6. Navigated to /guests
Assertions:
  - Palette opens on keyboard shortcut
  - Search filters commands
  - Enter selects and navigates
  - Palette closes after selection
```

---

### CF-12: Real-time sync between pages

**Flow:** Open Timeline + Reservations → create walk-in → verify both update

```
Prerequisites: Active venue with tables
Steps:
  1. Open /timeline in tab A
  2. Open /reservations in tab B (same browser)
  3. In tab A, create a walk-in
  4. Switch to tab B
Assertions:
  - Tab B shows the new reservation (via SSE)
  - Stats update on both pages
  - No duplicate entries
```

---

## Smoke Tests (run on every deploy)

| Test               | Page            | What to check                        |
| ------------------ | --------------- | ------------------------------------ |
| Dashboard loads    | `/`             | PageHeader visible, no error alerts  |
| Timeline loads     | `/timeline`     | TimelineGrid renders, Live indicator |
| Reservations loads | `/reservations` | Table or empty state visible         |
| Guests loads       | `/guests`       | Search input visible                 |
| Floor Plans loads  | `/floor-plans`  | Grid or empty state visible          |
| Settings loads     | `/settings`     | Theme selector visible               |
| Profile loads      | `/profile`      | Avatar visible                       |
| Admin loads        | `/admin`        | User list or error                   |

---

## Test Data Requirements

For full test coverage, the test environment needs:

- 1+ venue with settings configured
- 1+ active floor plan with 5+ tables
- 10+ reservations across statuses (PENDING, CONFIRMED, CANCELLED, COMPLETED)
- 5+ guests with visit history and tags
- 2+ user accounts (one admin, one regular)
