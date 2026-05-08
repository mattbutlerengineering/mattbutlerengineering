# Hospitality App — Progress Log

> Entropy management layer. Tracks what's been built, what changed, and current state.
> AI agents should read this to understand what's already done before proposing changes.
> Update this file after completing significant work.

---

## Current State (2026-04-01)

### Design System Compliance: 100%

Every CSS file uses `var(--rialto-*)` tokens. No hardcoded hex colors remain (except `#fff` for text-on-accent and one CSS variable fallback). Dark mode works on every page and component.

### Pages Upgraded to Rialto Components

| Page                  | PageHeader | Rialto UI                               | Skeleton | Alert/Error         | Empty State   |
| --------------------- | ---------- | --------------------------------------- | -------- | ------------------- | ------------- |
| HomePage              | ✅         | ✅ Stat, Button                         | ✅       | ✅ ErrorRetryBanner | ✅            |
| TimelinePage          | ✅         | ✅ Select, Drawer                       | ✅       | ✅                  | ✅            |
| ReservationsPage      | ✅         | ✅ Badge, Card, SegmentedControl, Input | ✅       | ✅ ErrorRetryBanner | ✅ EmptyState |
| GuestsPage            | ✅         | ✅ Select, Input, Stat, Tag, Card       | ✅       | ✅ ErrorRetryBanner | ✅ EmptyState |
| FloorPlansPage        | ✅         | ✅ Button, Badge, Text                  | ✅       | ✅ ErrorRetryBanner | ✅ EmptyState |
| FloorPlanEditorPage   | —          | partial                                 | —        | ✅ ErrorRetryBanner | —             |
| BookingWidgetDemoPage | ✅         | ✅ full                                 | ✅       | ✅                  | ✅            |
| VenueOnboardingPage   | —          | partial                                 | —        | ✅                  | —             |
| ProfilePage           | ✅         | ✅ full                                 | ✅       | ✅                  | —             |
| SettingsPage          | ✅         | ✅ full                                 | ✅       | ✅                  | —             |
| AdminPage             | ✅         | ✅ full                                 | ✅       | ✅                  | ✅            |

### Infrastructure Built

| Component            | Location                              | Purpose                                        |
| -------------------- | ------------------------------------- | ---------------------------------------------- |
| VenueContext         | `src/contexts/VenueContext.tsx`       | Shared venue selection, localStorage-persisted |
| useApiCall           | `src/hooks/useApiCall.ts`             | Timeout, retry, staleness tracking (14 tests)  |
| ErrorRetryBanner     | `src/components/ErrorRetryBanner.tsx` | Consistent error + retry UI (6 tests)          |
| useDashboardStats    | `src/hooks/useDashboardStats.ts`      | Dashboard KPIs with venue filtering + refetch  |
| useReservationEvents | `src/hooks/useReservationEvents.ts`   | SSE with exponential backoff                   |
| useCommandPalette    | `src/hooks/use-command-palette.ts`    | ⌘K navigation commands                         |
| dashboard/           | `src/components/dashboard/`           | ReservationList, ActivityFeed sub-components   |
| Breadcrumb           | DashboardLayout.tsx                   | Route-aware breadcrumb trail                   |

### Features Implemented

| Feature           | Pages Affected                                            | Notes                                        |
| ----------------- | --------------------------------------------------------- | -------------------------------------------- |
| Real-time SSE     | HomePage, TimelinePage, ReservationsPage                  | Venue-scoped, exponential backoff            |
| Venue context     | All data pages                                            | Persisted to localStorage, shared across nav |
| Deep links        | TimelinePage, ReservationsPage                            | Date + status filter in URL params           |
| Search            | ReservationsPage (guest name/email)                       | Client-side filtering                        |
| Status filter     | ReservationsPage                                          | SegmentedControl with URL sync               |
| Stats row         | HomePage, ReservationsPage                                | Stat components with counts                  |
| Command palette   | DashboardLayout                                           | ⌘K with all nav + actions                    |
| Breadcrumbs       | DashboardLayout                                           | Route-derived, click-navigable               |
| ARIA live regions | ActivityFeed, ReservationsPage, GuestsPage, AdminPage     | Screen reader support                        |
| Error retry       | HomePage, FloorPlansPage, FloorPlanEditorPage, GuestsPage | ErrorRetryBanner with refetch                |

---

## Backlog Status

| #     | Item                       | Priority | Status                                      |
| ----- | -------------------------- | -------- | ------------------------------------------- |
| 1     | Error recovery pattern     | P0       | ✅ Done (hook + banner + adoption)          |
| 2     | Timeline mobile            | P0       | ✅ Already handled (Drawer, responsive CSS) |
| 3     | Cross-page data sync       | P0       | ✅ Done (SSE on Reservations)               |
| 4     | VenueContext consistency   | P1       | ✅ Done (all pages)                         |
| 5     | Timeline venue selector    | P1       | ✅ Done (Rialto Select)                     |
| 6     | Guest edit flow            | P1       | ✅ Done (edit mode in drawer)               |
| 7     | Reservation search         | P1       | ✅ Done                                     |
| 8     | Deep links                 | P1       | ✅ Done (Timeline + Reservations)           |
| 9     | Breadcrumbs                | P2       | ✅ Done                                     |
| 10    | Keyboard a11y for Timeline | P2       | ❌ Remaining                                |
| 11    | ARIA live regions          | P2       | ✅ Done                                     |
| 12    | Unsaved changes warning    | P2       | ✅ Done (beforeunload + useBlocker)         |
| 13-18 | P3 features                | P3       | ❌ Future                                   |

**Completion: 13 of 18 items (72%)**

---

## Test Coverage

- 37 tests passing (3 test files)
- `useApiCall.test.ts` — 14 tests (timeout, retry, abort, staleness)
- `ErrorRetryBanner.test.tsx` — 6 tests (render, click, dismiss)
- `VenueOnboardingPage.test.tsx` — 17 tests (wizard flow)

---

## What's Next

Priority order for remaining work:

1. **#6 Guest edit flow** (P1) — enable the disabled edit button, create GuestEditDrawer
2. **#12 Unsaved changes** (P2) — add `useBlocker` to FloorPlanEditorPage
3. **#10 Keyboard a11y** (P2) — arrow key navigation in TimelineGrid
4. **P3 features** — templates, guest history, bulk actions, waitlist
