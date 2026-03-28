# Hospitality App

React + Vite SPA for restaurant management. Port **3002**, path prefix `/hospitality`.

## Auth

Uses `@mbe/auth` (Auth0 OIDC). The root `<App>` component gates all routes behind authentication — unauthenticated users are redirected to Auth0 login. The OIDC callback route is `/hospitality/callback`.

Build-time env vars (set in CI and `.env`):
- `VITE_AUTH_AUTHORITY` — Auth0 domain
- `VITE_AUTH_CLIENT_ID` — Auth0 client ID (separate from API client)
- `VITE_AUTH_AUDIENCE` — `https://api.mattbutlerengineering.com`
- `VITE_AUTH_REDIRECT_URI` — `https://mattbutlerengineering.com/hospitality/callback`
- `VITE_API_URL` — `https://mattbutlerengineering.com`

## Pages

| Page | Route | Description |
|------|-------|-------------|
| HomePage | `/` | Dashboard landing |
| TimelinePage | `/timeline` | Reservation timeline view (largest page, ~18KB) |
| ReservationsPage | `/reservations` | Reservation list/management |
| GuestsPage | `/guests` | Guest directory |
| FloorPlansPage | `/floor-plans` | Floor plan list |
| FloorPlanEditorPage | `/floor-plans/:id` | Interactive floor plan editor |
| BookingWidgetDemoPage | `/booking-widget` | Embeddable booking widget preview |
| VenueOnboardingPage | `/onboarding` | Multi-step venue setup wizard |
| ProfilePage | `/profile` | User profile |
| SettingsPage | `/settings` | App settings |
| AdminPage | `/admin` | Admin panel |

## Key Components

- `DashboardLayout` — Shell with sidebar nav (`GlobalNav` from Rialto)
- `venue-onboarding/` — 5-step wizard: BasicInfo → Location → OperatingHours → Settings → Confirmation
- `booking-widget/` — Embeddable reservation widget components
- `floor-plan/` — Interactive drag-and-drop floor plan editor
- `timeline/` — Time-grid reservation visualization
- `TableStatusBadge` — Status indicator (AVAILABLE/OCCUPIED/DIRTY/READY)

## Patterns

- All API calls go through `@mbe/api-client` (typed fetch + auth token injection)
- Uses Rialto components exclusively — `import { ... } from "@mbe/rialto"`
- CSS Modules for page-specific styles (`.module.css` files)
- `useReservationEvents` hook for real-time reservation updates
- Vite base path: `base: "/hospitality/"` in `vite.config.ts`

## Commands

```bash
pnpm dev          # Dev server on :3002
pnpm build        # Production build (needs VITE_* env vars)
pnpm lint         # ESLint
pnpm typecheck    # TypeScript
```
