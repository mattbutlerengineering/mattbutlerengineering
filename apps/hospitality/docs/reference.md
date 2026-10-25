# Hospitality App Reference

Reference material moved out of [`../CLAUDE.md`](../CLAUDE.md), which keeps the rules an agent follows on every edit.

## Environment Variables

Build-time env vars (set in CI and `.env`):

- `VITE_AUTH_AUTHORITY` — Auth0 domain
- `VITE_AUTH_CLIENT_ID` — Auth0 client ID (separate from API client)
- `VITE_AUTH_AUDIENCE` — `https://api.mattbutlerengineering.com`
- `VITE_AUTH_REDIRECT_URI` — `https://mattbutlerengineering.com/hospitality/callback`
- `VITE_API_URL` — `https://mattbutlerengineering.com`

**E2E env vars** (separate from VITE\_\* build vars):

- `E2E_AUTH0_DOMAIN` — Auth0 tenant domain
- `E2E_AUTH0_CLIENT_ID` — Auth0 client ID (must have Password grant enabled)
- `E2E_AUTH0_AUDIENCE` — API audience identifier
- `E2E_AUTH_EMAIL` — Test user email (no MFA)
- `E2E_AUTH_PASSWORD` — Test user password

## Pages

| Page                  | Route                      | Description                                                |
| --------------------- | -------------------------- | ---------------------------------------------------------- |
| HomePage              | `/`                        | Dashboard landing; `NeonSign` header instrument            |
| TimelinePage          | `/timeline`                | Reservation timeline view (largest page, ~18KB)            |
| ReservationsPage      | `/reservations`            | Reservation list/management                                |
| GuestsPage            | `/guests`                  | Guest directory                                            |
| FloorPlansPage        | `/floor-plans`             | Floor plan list                                            |
| FloorPlanEditorPage   | `/floor-plans/:id`         | Interactive floor plan editor                              |
| MenusPage             | `/menus`, `/menus/:menuId` | Menu list; menu editor (sections, dishes, sold-out toggle) |
| BookingWidgetDemoPage | `/booking-widget`          | Embeddable booking widget preview                          |
| VenueOnboardingPage   | `/onboarding`              | Multi-step venue setup wizard                              |
| ProfilePage           | `/profile`                 | User profile                                               |
| SettingsPage          | `/settings`                | App settings                                               |
| AdminPage             | `/admin`                   | Admin panel                                                |

## Key Components

- `DashboardLayout` — Shell with sidebar nav (`GlobalNav` from Rialto)
- `venue-onboarding/` — 6-step wizard: WelcomeStep → LocationTimeStep → OperatingHoursStep → SettingsStep → FloorPlanStep → LaunchStep
- `booking-widget/` — Embeddable reservation widget components
- `floor-plan/` — Interactive drag-and-drop floor plan editor
- `timeline/` — Time-grid reservation visualization
- `crm/GuestLookup` — The guest-name field that is also a typeahead over returning guests (combobox → portaled listbox, name or phone, 2+ chars, 300 ms debounce via `hooks/useGuestLookup`); used by the New Reservation dialog, the walk-in dialog and the waitlist. A pick links the booking (`guestId`); no pick keeps today's payload
- `crm/GuestHistoryStrip` — What the Host sees once a returning guest is picked (linked) or recognised: segment, visits, no-shows with risk, dietary tags with allergies flagged, and a Clear button
- `TableStatusBadge` — Status indicator (AVAILABLE/OCCUPIED/DIRTY/READY)

## Harness Engineering Context

### User Personas

| Persona                | Primary Pages                               | Key Constraint                          |
| ---------------------- | ------------------------------------------- | --------------------------------------- |
| **Restaurant Manager** | Dashboard, Timeline, Reservations, Settings | Needs multi-venue support               |
| **Host / Hostess**     | Timeline, Guests                            | Needs fast walk-in creation (<5 clicks) |
| **Admin**              | Admin panel                                 | View-only currently (no user actions)   |

### Known Gaps (see backlog for full list)

- **P0:** `ErrorRetryBanner` retry is wired on 12 pages (AdminPage, BookingWidgetDemoPage, BriefingPage, FloorPlanEditorPage, FloorPlansPage, GuestsPage, HomePage, ProfilePage, ReservationsPage, SettingsPage, TimelinePage, WaitlistPage) — no per-request timeout or staleness warning yet (see `docs/IMPROVEMENT-BACKLOG.md` P0 #1)
- **P0:** Timeline unusable on mobile (grid + sidebar = no room)
- **P0:** Cross-page data divergence (no SSE on ReservationsPage)
- **P1:** Multi-venue filtering inconsistent (some pages have it, some don't)
- **P1:** Guest edit flow disabled
