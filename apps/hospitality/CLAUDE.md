# Hospitality App

React + Vite SPA for restaurant management. Port **3002**, path prefix `/hospitality`.

## Auth

Uses `@mbe/auth` (Auth0 OIDC). The root `<App>` component gates all routes behind authentication — unauthenticated users are redirected to Auth0 login. The OIDC callback route is `/hospitality/callback`.

The gate order is owned by `useAuthGate()` in `@mbe/auth/react` (see `packages/auth/CLAUDE.md`); `App.tsx` only maps its phase to a screen: `signing-out` → `SignOutPage`, `loading` → `LoadingPage`, `callback` → `CallbackPage`, `error` → `AuthFailurePage` (lane 1 on the callback path), `expired` → `SessionExpiredGate`, `signed-out` → `LoginGate` (`signedOut` after a sign-out round-trip lands on `/callback` with no OIDC params), `ready` → dashboard. `CallbackRedirect` navigates to `signinReturnTo()`. A silent token refresh never unmounts the dashboard (`useAuth().isLoading` masks navigator calls); a failed refresh surfaces as the `DashboardLayout` banner via `refreshError`. `LoginGate`, `CallbackPage`, `SessionExpiredGate`, `AuthFailurePage`, and `SignOutPage` all use rialto's `Handshake` instrument for the in-flight state.

Build-time env vars (set in CI and `.env`):

- `VITE_AUTH_AUTHORITY` — Auth0 domain
- `VITE_AUTH_CLIENT_ID` — Auth0 client ID (separate from API client)
- `VITE_AUTH_AUDIENCE` — `https://api.mattbutlerengineering.com`
- `VITE_AUTH_REDIRECT_URI` — `https://mattbutlerengineering.com/hospitality/callback`
- `VITE_API_URL` — `https://mattbutlerengineering.com`

## Pages

| Page                  | Route              | Description                                     |
| --------------------- | ------------------ | ----------------------------------------------- |
| HomePage              | `/`                | Dashboard landing; `NeonSign` header instrument |
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
- `venue-onboarding/` — 6-step wizard: WelcomeStep → LocationTimeStep → OperatingHoursStep → SettingsStep → FloorPlanStep → LaunchStep
- `booking-widget/` — Embeddable reservation widget components
- `floor-plan/` — Interactive drag-and-drop floor plan editor
- `timeline/` — Time-grid reservation visualization
- `crm/GuestLookup` — The guest-name field that is also a typeahead over returning guests (combobox → portaled listbox, name or phone, 2+ chars, 300 ms debounce via `hooks/useGuestLookup`); used by the New Reservation dialog, the walk-in dialog and the waitlist. A pick links the booking (`guestId`); no pick keeps today's payload
- `crm/GuestHistoryStrip` — What the Host sees once a returning guest is picked (linked) or recognised: segment, visits, no-shows with risk, dietary tags with allergies flagged, and a Clear button
- `TableStatusBadge` — Status indicator (AVAILABLE/OCCUPIED/DIRTY/READY)

## Patterns

- All API calls go through `@mbe/api-client` (typed fetch + auth token injection)
- Uses Rialto components exclusively — `import { ... } from "@mattbutlerengineering/rialto"`
- CSS Modules for page-specific styles (`.module.css` files)
- `useReservationEvents` hook for real-time reservation updates
- Vite base path: `base: "/hospitality/"` in `vite.config.ts`

## Localization

Staff and guest UI ships in en-US, en-GB, es-MX and fr-CA ([ADR-028](../../docs/adr/ADR-028-rialto-localization-through-context.md), feature docs in [`docs/features/localization/`](../../docs/features/localization/)).

- **Catalogs:** `src/i18n/catalogs/<tag>.json` (i18next JSON, nested keys, `_one`/`_other` plural suffixes, `{{name}}` placeholders). en-US is the source. es-MX and fr-CA must carry every key; en-GB holds only keys whose wording differs, because it falls back to en-US.
- **Parity check:** `pnpm check:i18n-catalogs` (repo root, `scripts/check-i18n-catalogs.mjs`) fails on a missing key, placeholder or plural form. Add every new en-US key with its es-MX and fr-CA values in the same PR.
- **Lint rule:** `mbe-local/no-literal-ui-strings` is an error across `src/**` (`LOCALIZED_FILES` in `eslint.config.js`). UI text goes through `useTranslation().t`; pure helpers called outside React use `defaultT` (`src/i18n/default-t.ts`).
- **Runtime:** `src/i18n/runtime.tsx` owns the dashboard locale (`localeRuntime`, persisted under `mbe-hospitality-locale`) and bridges it to rialto through `LocaleBridge`. Supported tags and the fallback rule live in `src/i18n/locales.ts`.
- **Guest surfaces** (booking widget, `book/:venueSlug`, `reservations/manage`) run their own locale inside `WidgetLocaleScope` (`src/components/booking-widget/`), independent of the dashboard. `ToastLocaleOverride` labels the root toast region in the guest locale while a guest scope is mounted.
- **Formatting:** dates, times, numbers and money go through `useVenueFormat` (`src/hooks/useVenueFormat.ts`). Currency and timezone always come from the venue; the locale only picks the format.
- **Persisted text stays en-US.** Anything written to a record (e.g. the cancellation audit note in `hooks/useCancellationQuote.ts`) is a record, not UI copy.
- **E2E:** `e2e/locale-sweep.spec.ts` walks the public and Auth0-gated routes in en-GB, es-MX and fr-CA, and fails on leftover en-US text or clipping that isn't marked `data-truncate`.

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

1. **All colors must use `var(--rialto-*)` tokens** — no hardcoded hex colors. The app is fully dark-mode compatible. **Exception: Konva canvas fills** (`floor-plan/TableShape.tsx`) — canvas `fillStyle`/`stroke` need a literal color string and can't resolve `var(--rialto-*)`. Resolve the token at render time via `getComputedStyle(document.documentElement).getPropertyValue("--rialto-*")` instead of mirroring a hex, so the color tracks whichever theme (`data-theme`) is active; re-resolve on a `MutationObserver` watching `data-theme` so runtime theme switches repaint without a reload. Only fall back to a hardcoded hex when the custom property resolves empty (unloaded stylesheet, non-browser test env) — and keep any such fallback theme-keyed (light + dark) and covered by a drift-guard test that reads `packages/rialto/src/tokens/colors.css` directly (see `TableShape.test.tsx`), so a token change that isn't mirrored fails a test instead of silently going stale.
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

- **P0:** `ErrorRetryBanner` retry is wired on 12 pages (AdminPage, BookingWidgetDemoPage, BriefingPage, FloorPlanEditorPage, FloorPlansPage, GuestsPage, HomePage, ProfilePage, ReservationsPage, SettingsPage, TimelinePage, WaitlistPage) — no per-request timeout or staleness warning yet (see `docs/IMPROVEMENT-BACKLOG.md` P0 #1)
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
