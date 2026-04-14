# Hospitality

Restaurant management SPA for reservations, table management, floor plans, and guest tracking. Served at `/hospitality` on mattbutlerengineering.com.

## Tech Stack

- React 19 + Vite (port 3002)
- Rialto design system (`@mattbutlerengineering/rialto`)
- Auth0 authentication (`@mbe/auth`)
- Typed API client (`@mbe/api-client`)
- Playwright for E2E tests

## Key Features

- Reservation timeline and list views
- Interactive floor plan editor (drag-and-drop)
- Guest directory
- Multi-step venue onboarding wizard
- Embeddable booking widget
- Real-time reservation updates

## Commands

```bash
pnpm dev          # Dev server on :3002
pnpm build        # Production build (needs VITE_* env vars)
pnpm test         # Unit tests
pnpm lint         # ESLint
pnpm typecheck    # TypeScript check
pnpm test:e2e     # Playwright E2E tests (needs E2E_AUTH* env vars)
```

See [CLAUDE.md](CLAUDE.md) for detailed page routes, auth configuration, and E2E testing setup.
