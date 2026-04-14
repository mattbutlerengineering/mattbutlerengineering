# Hospitality App — Improvement Backlog

> Prioritized feature gaps and improvements from app audit.
> Each item has acceptance criteria and implementation hints for AI agents.
> Priority: P0 (critical UX) > P1 (feature gap) > P2 (polish) > P3 (nice-to-have)

## Completed Items

- [x] **#5** Timeline venue selector Rialto upgrade — replaced raw `<select>` with `<Select>`, added `<PageHeader>`
- [x] **#7** Reservation search — client-side guest name/email search on ReservationsPage
- [x] **#11** ARIA live regions — added to ActivityFeed, ReservationsPage, GuestsPage, AdminPage
- [x] **#4** VenueContext — created, wired into DashboardLayout, adopted by HomePage, ReservationsPage, GuestsPage, FloorPlansPage
- [x] **P0 #3** (partial) Cross-page sync — SSE added to ReservationsPage via `useReservationEvents`
- [x] **P0 #1** Error recovery — `useApiCall` hook + `ErrorRetryBanner` adopted on HomePage, FloorPlansPage, FloorPlanEditorPage, GuestsPage (20 unit tests)
- [x] **#8** Deep link support — Timeline and ReservationsPage read/write date+status to URL search params
- [x] **#9** Breadcrumb navigation — route-aware breadcrumbs in DashboardLayout
- [x] **#2** Timeline mobile — already handled (sidebar hides, Drawer opens, responsive CSS)
- [x] **#6** Guest edit flow — edit mode in GuestDetailDrawer with name/email/phone/notes editing
- [x] **#12** Unsaved changes warning — beforeunload + useBlocker + ConfirmDialog on FloorPlanEditorPage
- [x] All hardcoded CSS colors replaced with Rialto tokens (all pages + all components)

---

## P0 — Critical UX Issues

### 1. Error Recovery & Retry Pattern

**Problem:** Most pages show errors but offer no retry. Network timeouts leave buttons stuck in "Saving..." state.

**Acceptance Criteria:**
- [ ] All API calls have a 10-second timeout
- [ ] Error state includes a "Retry" button that re-fetches
- [ ] Buttons show "Saving..." for max 10 seconds, then revert with error
- [ ] Stale data (>60s since last successful fetch) shows a subtle "Data may be out of date" warning

**Implementation Hint:** Create a `useApiCall` hook that wraps fetch with timeout, retry, and loading/error states. Use AbortController for timeout.

**Files to modify:** All pages that call APIs (HomePage, TimelinePage, ReservationsPage, GuestsPage, FloorPlansPage, FloorPlanEditorPage, AdminPage, ProfilePage, SettingsPage)

---

### 2. Timeline Mobile Responsiveness

**Problem:** Timeline is unusable on mobile — grid requires horizontal scroll, sidebar takes 50% width, stats overflow.

**Acceptance Criteria:**
- [ ] On mobile (<768px), sidebar appears as a slide-up sheet (not side panel)
- [ ] Stats row wraps or collapses to essential items only
- [ ] Timeline grid allows horizontal swipe with momentum
- [ ] Touch targets are at least 44x44px
- [ ] Walk-in button is always accessible (floating action button?)

**Implementation Hint:** Use CSS container queries or media queries. Convert sidebar to a bottom sheet on mobile using Rialto `Drawer` with `position="bottom"`.

**Files to modify:** `TimelinePage.tsx`, `TimelinePage.module.css`

---

### 3. Cross-Page Data Consistency

**Problem:** Data diverges between pages. Edit on Timeline doesn't reflect on ReservationsPage without reload.

**Acceptance Criteria:**
- [ ] Reservation changes on any page reflect on all other pages within 2 seconds
- [ ] SSE events are consumed by all pages that display reservation data
- [ ] No duplicate entries after optimistic update + SSE confirmation

**Implementation Hint:** Either:
- (Simple) Add `useReservationEvents` to ReservationsPage and HomePage
- (Better) Use TanStack Query with SSE-driven cache invalidation
- (Best) Zustand store shared across pages with SSE subscription

**Files to modify:** ReservationsPage.tsx (add SSE), or create shared state layer

---

## P1 — Feature Gaps

### 4. Venue Selector Consistency

**Problem:** Some pages have venue selectors (Timeline, Guests), others don't (Home, Reservations, Floor Plans). Multi-venue operators see mixed data.

**Acceptance Criteria:**
- [ ] All data-displaying pages filter by venue
- [ ] Venue selection persists across page navigation (stored in URL param or context)
- [ ] If only one venue, selector is hidden

**Implementation Hint:** Create a `VenueContext` that provides `selectedVenueId` and `setVenueId`. Wrap in DashboardLayout. Each page reads from context instead of managing its own venue state.

**Files to create:** `src/contexts/VenueContext.tsx`
**Files to modify:** DashboardLayout.tsx, all data pages

---

### 5. Timeline Venue Selector Rialto Upgrade

**Problem:** Timeline still uses raw `<select>` instead of Rialto `<Select>`.

**Acceptance Criteria:**
- [ ] Venue selector uses `<Select>` from `@mattbutlerengineering/rialto`
- [ ] Matches the styling of venue selectors on other pages

**Files to modify:** `TimelinePage.tsx` (replace raw select, lines ~180-195)

---

### 6. Guest Edit Flow

**Problem:** Guest detail view is read-only. "Edit" button exists but is non-functional.

**Acceptance Criteria:**
- [ ] Clicking "Edit" on guest detail opens an edit form
- [ ] Can edit: name, email, phone, notes, tags
- [ ] Tags can be added/removed
- [ ] Save validates email format if provided
- [ ] Changes reflect in guest list immediately

**Files to modify:** GuestsPage.tsx (enable edit flow), create GuestEditDrawer component

---

### 7. Reservation Search on ReservationsPage

**Problem:** No way to search by guest name — must manually scan the table.

**Acceptance Criteria:**
- [ ] Search input filters table by guest name (client-side)
- [ ] Search is case-insensitive
- [ ] Results update immediately as user types
- [ ] Empty search shows all reservations

**Files to modify:** ReservationsPage.tsx (add search state + filter)

---

### 8. Deep Link Support

**Problem:** Can't share a link to a specific reservation, guest, or floor plan.

**Acceptance Criteria:**
- [ ] URLs encode query params: `/timeline?date=2026-04-15&reservationId=123`
- [ ] Opening a deep link scrolls to / highlights the referenced item
- [ ] Date picker syncs with URL param

**Implementation Hint:** Use `useSearchParams` from react-router.

**Files to modify:** TimelinePage, ReservationsPage, GuestsPage

---

## P2 — Polish

### 9. Breadcrumb Navigation

**Problem:** Users lose sense of location when navigating between pages.

**Acceptance Criteria:**
- [ ] Breadcrumb trail shows: Home > Floor Plans > "My Restaurant"
- [ ] Each breadcrumb is clickable
- [ ] Uses Rialto `<Breadcrumb>` component

**Files to modify:** DashboardLayout.tsx (add breadcrumb bar above Outlet)

---

### 10. Keyboard Accessibility for Timeline Grid

**Problem:** Timeline grid is mouse-only — can't navigate cells with keyboard.

**Acceptance Criteria:**
- [ ] Arrow keys move between table rows and time slots
- [ ] Enter/Space selects a reservation block
- [ ] Tab moves to the next interactive element
- [ ] Focus indicator is visible

**Files to modify:** TimelineGrid.tsx, ReservationBlock.tsx

---

### 11. Missing ARIA Live Regions

**Problem:** Screen readers miss dynamic content updates (SSE events, search results, pagination).

**Acceptance Criteria:**
- [ ] ActivityFeed has `aria-live="polite"` on the list container
- [ ] Search result counts announced with `aria-live="polite"`
- [ ] Stats updates after filter changes are announced
- [ ] Toast/alert messages use `role="status"` or `role="alert"`

**Files to modify:** dashboard/ActivityFeed.tsx, GuestsPage.tsx, ReservationsPage.tsx, AdminPage.tsx

---

### 12. Unsaved Changes Warning

**Problem:** FloorPlanEditorPage doesn't warn before navigating away with unsaved changes.

**Acceptance Criteria:**
- [ ] Browser beforeunload event fires when unsaved changes exist
- [ ] react-router navigation blocked with confirmation dialog
- [ ] "Save & Continue" option in confirmation

**Files to modify:** FloorPlanEditorPage.tsx (add useBlocker from react-router)

---

## P3 — Nice to Have

### 13. Floor Plan Templates

Preset layouts (restaurant, cafe, bar, patio) that users can start from instead of empty canvas.

### 14. Guest Reservation History

View all past reservations for a guest from their detail view.

### 15. Bulk Reservation Actions

Select multiple reservations → cancel batch, send confirmation emails.

### 16. Table Turn Time Tracking

Track how long each table is occupied → surface analytics.

### 17. Waitlist Management

When all tables are full, add guests to a waitlist with estimated wait time.

### 18. Server/Staff Assignment

Assign servers to sections/tables for shift management.

---

## Implementation Order

Recommended sequence for maximum impact with minimal risk:

```
Phase 1 (Quick wins):
  #5 Timeline venue selector upgrade (30 min)
  #7 Reservation search (1 hr)
  #11 ARIA live regions (1 hr)

Phase 2 (Core improvements):
  #1 Error recovery pattern (2 hr)
  #4 Venue selector consistency (2 hr)
  #6 Guest edit flow (3 hr)

Phase 3 (UX polish):
  #2 Timeline mobile (4 hr)
  #8 Deep links (2 hr)
  #9 Breadcrumbs (1 hr)

Phase 4 (Advanced):
  #3 Cross-page data consistency (4 hr)
  #10 Keyboard accessibility (3 hr)
  #12 Unsaved changes warning (1 hr)
```
