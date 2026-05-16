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

| Page                  | Route              | Description                                     |
| --------------------- | ------------------ | ----------------------------------------------- |
| HomePage              | `/`                | Dashboard landing                               |
| TimelinePage          | `/timeline`        | Reservation timeline view (largest page, ~18KB) |
| ReservationsPage      | `/reservations`    | Reservation list/management                     |
| GuestsPage            | `/guests`          | Guest directory                                 |
| FloorPlansPage        | `/floor-plans`     | Floor plan list                                 |
| FloorPlanEditorPage   | `/floor-plans/:id` | Interactive floor plan editor                   |
| BookingWidgetDemoPage | `/booking-widget`  | Embeddable booking widget preview               |
| VenueOnboardingPage   | `/onboarding`      | Multi-step venue setup wizard                   |
| ProfilePage           | `/profile`         | User profile                                    |
| SettingsPage          | `/settings`        | App settings                                    |
| AdminPage             | `/admin`           | Admin panel                                     |

## Key Components

- `DashboardLayout` — Shell with sidebar nav (`GlobalNav` from Rialto)
- `venue-onboarding/` — 5-step wizard: BasicInfo → Location → OperatingHours → Settings → Confirmation
- `booking-widget/` — Embeddable reservation widget components
- `floor-plan/` — Interactive drag-and-drop floor plan editor
- `timeline/` — Time-grid reservation visualization
- `TableStatusBadge` — Status indicator (AVAILABLE/OCCUPIED/DIRTY/READY)

## Patterns

- All API calls go through `@mbe/api-client` (typed fetch + auth token injection)
- Uses Rialto components exclusively — `import { ... } from "@mattbutlerengineering/rialto"`
- CSS Modules for page-specific styles (`.module.css` files)
- `useReservationEvents` hook for real-time reservation updates
- Vite base path: `base: "/hospitality/"` in `vite.config.ts`

## E2E Testing

Uses Playwright with programmatic Auth0 login (Resource Owner Password Grant). No browser login flow needed.

```bash
pnpm test:e2e     # Requires E2E_AUTH* env vars (see .env.example)
```

**E2E env vars** (separate from VITE\_\* build vars):

- `E2E_AUTH0_DOMAIN` — Auth0 tenant domain
- `E2E_AUTH0_CLIENT_ID` — Auth0 client ID (must have Password grant enabled)
- `E2E_AUTH0_AUDIENCE` — API audience identifier
- `E2E_AUTH_EMAIL` — Test user email (no MFA)
- `E2E_AUTH_PASSWORD` — Test user password

**Writing authenticated tests**: use the `authPage` fixture from `e2e/fixtures.ts`:

```typescript
import { test, expect } from "./fixtures.js";

test("page loads authenticated", async ({ authPage }) => {
  await authPage.goto("/reservations");
  await expect(authPage.getByTestId("dashboard-layout")).toBeVisible();
});
```

## Harness Engineering Context

Extended documentation for AI agents working on this app:

| Document                                                     | Purpose                                                                    |
| ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| [`docs/USER-FLOWS.md`](docs/USER-FLOWS.md)                   | 10 critical user flows with acceptance criteria and "done" definitions     |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)               | Data flow, API surface, SSE patterns, component architecture               |
| [`docs/IMPROVEMENT-BACKLOG.md`](docs/IMPROVEMENT-BACKLOG.md) | Prioritized feature gaps (P0-P3) with implementation hints                 |
| [`docs/E2E-TEST-PLAN.md`](docs/E2E-TEST-PLAN.md)             | 12 Playwright test specs + smoke tests for CI                              |
| [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md)                 | 10 code patterns extracted from codebase — copy-paste templates for agents |

### User Personas

| Persona                | Primary Pages                               | Key Constraint                          |
| ---------------------- | ------------------------------------------- | --------------------------------------- |
| **Restaurant Manager** | Dashboard, Timeline, Reservations, Settings | Needs multi-venue support               |
| **Host / Hostess**     | Timeline, Guests                            | Needs fast walk-in creation (<5 clicks) |
| **Admin**              | Admin panel                                 | View-only currently (no user actions)   |

### Critical Constraints for Agents

1. **All colors must use `var(--rialto-*)` tokens** — no hardcoded hex colors. The app is fully dark-mode compatible.
2. **All UI elements must use Rialto components** — no raw `<button>`, `<input>`, `<select>` in pages.
3. **All API calls must use `@mbe/api-client`** with `getAccessToken` — never raw `fetch` with manual auth.
4. **SSE callbacks must use refs** — inline callbacks cause reconnection on every render.
5. **State must be immutable** — always spread/map/filter, never mutate.
6. **Imports need `.js` extension** — ES modules require explicit file extensions.

### Evaluation Criteria

When implementing features, evaluate against (from `docs/USER-FLOWS.md`):

| Criterion        | Weight | What to Check                                   |
| ---------------- | ------ | ----------------------------------------------- |
| Functionality    | 30%    | Flow completes end-to-end without errors        |
| Data Consistency | 25%    | State correct across pages, SSE, and API        |
| Error Recovery   | 20%    | Failures handled gracefully with retry          |
| Accessibility    | 15%    | Keyboard-only completion, screen reader support |
| Mobile UX        | 10%    | Works on 375px width                            |

### Known Gaps (see backlog for full list)

- **P0:** Error recovery missing on most pages (no retry, no timeout handling)
- **P0:** Timeline unusable on mobile (grid + sidebar = no room)
- **P0:** Cross-page data divergence (no SSE on ReservationsPage)
- **P1:** Multi-venue filtering inconsistent (some pages have it, some don't)
- **P1:** Guest edit flow disabled

## Commands

```bash
pnpm dev          # Dev server on :3002
pnpm build        # Production build (needs VITE_* env vars)
pnpm lint         # ESLint
pnpm typecheck    # TypeScript
pnpm test:e2e     # Playwright E2E tests (needs E2E_AUTH* env vars)
```
